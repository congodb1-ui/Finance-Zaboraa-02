import 'dotenv/config';
import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

import { testGeminiConnection } from './lib/ai/gemini-client';
import { detectAnomaliesWithAI, getCachedAnomalies } from './lib/ai/anomalies';
import { askYourDataChat } from './lib/ai/chat';
import { generateMonthlyReportWithAI } from './lib/ai/monthly-report';
import { categorizeTransactionsWithAI } from './lib/ai/categorize';
import {
  getTransactions,
  applyAICategorizations,
  getAllTransactions,
  getITRSummaryData,
  commitUploadTransactions,
  updateTransaction,
} from './lib/actions/transactions';
import { getCategories } from './lib/actions/categories';
import { getAccounts } from './lib/actions/accounts';
import { getWorkspaces } from './lib/actions/workspaces';
import { getRules } from './lib/actions/rules';
import { getRecurringTransactions } from './lib/actions/recurring';
import { getBudgets } from './lib/actions/budgets';
import { getUploads, checkReconciliation, normalizeDate, parseAmount } from './lib/actions/upload';
import { parseStatementCSV, parseStatementPDF } from './lib/parsers';
import { parseXLSX } from './lib/parsers/xlsx';
import { extractCrossSourceRefs } from './lib/parsers/utils';
import { getCurrentFY, getFYBounds } from './lib/fy-utils';
import { writeAuditLog } from './lib/audit';
import { verifyGoogleIdToken } from './lib/google-auth-server';
import { encryptValue } from './lib/crypto';
import { ensureBatch2bBootstrap } from './lib/batch2b-seed';
import { getPaymentInstruction } from './lib/actions/paymentInstructions';
import {
  createPaymentInstructionServer,
  updatePaymentInstructionServer,
  decryptPaymentInstructionServer,
} from './lib/actions/paymentInstructionsServer';
import {
  deleteGmailTokenFromVault,
  saveGmailTokenToVault,
} from './lib/gmail-vault';
import { runGmailSyncForUser } from './lib/gmail-sync-service';
import { generateAnalyticsReport, listAnalyticsReports } from './lib/analytics/generate';
import type { Transaction } from './types/transactions';
import type { ColumnMapping, ParseResult } from './types/uploads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface AuthenticatedRequest extends Request {
  user?: User;
  supabase?: any;
}

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://placeholder-project.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('[audit] SUPABASE_SERVICE_ROLE_KEY is not configured; audit log writes skipped.');
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reqSupabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error,
    } = await reqSupabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allowedRaw = process.env.ALLOWED_EMAILS || '';
    const allowedEmails = allowedRaw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowedEmails.length > 0 &&
      (!user.email || !allowedEmails.includes(user.email.toLowerCase()))
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Allow action helpers calling supabase.auth.getUser() with no args to resolve this verified user
    const originalGetUser = reqSupabase.auth.getUser.bind(reqSupabase.auth);
    reqSupabase.auth.getUser = (async (jwt?: string) => {
      if (jwt) {
        return originalGetUser(jwt);
      }
      return { data: { user }, error: null };
    }) as any;

    req.user = user;
    req.supabase = reqSupabase;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max
  },
});

const ALLOWED_UPLOAD_MIMETYPES: Record<'csv' | 'xlsx' | 'pdf', string[]> = {
  csv: [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  pdf: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
};

export async function runServer() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      '[Zaboraa Finance] Startup warning: GEMINI_API_KEY is not set. AI features will run in fallback mode.'
    );
  }

  const app = express();
  const PORT = 3000;
  const HOST = '0.0.0.0';

  app.set('trust proxy', 1);

  // Security headers (CSP/frameguard/CORP relaxed for Vite SPA dev & iframe preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );

  // CORS restriction on /api: allow https://finance.zaboraa.com, same-origin host (including preview proxy),
  // and http://localhost:3000 in non-production dev
  const ALLOWED_CORS_ORIGINS = new Set<string>(['https://finance.zaboraa.com']);
  if (process.env.NODE_ENV !== 'production') {
    ALLOWED_CORS_ORIGINS.add('http://localhost:3000');
  }

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    if (origin) {
      let isSameOrigin = false;
      try {
        const originHost = new URL(origin).host;
        const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
        const requestHost = forwardedHost || String(req.headers.host || '').trim();
        isSameOrigin = Boolean(requestHost && originHost === requestHost);
      } catch {
        isSameOrigin = false;
      }

      if (!ALLOWED_CORS_ORIGINS.has(origin) && !isSameOrigin) {
        return res.status(403).json({ error: 'CORS origin not allowed.' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  });

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Rate limiting: 100 req / 15 min per IP for API routes; 10 req / 15 min on /api/ai/*;
  // tighter limits on /api/auth/google (15 / 15 min) and /api/payment-instructions/:id/reveal (20 / 15 min)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI rate limit exceeded. Please try again in 15 minutes.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  });

  const revealLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reveal requests. Please try again in 15 minutes.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/ai', aiLimiter);

  // --- Direct Google Identity Services Auth Endpoint (finance.zaboraa.com) ---
  // Flow: Browser GIS ID token -> Express verifies token + ALLOWED_EMAILS -> creates Supabase session
  app.post('/api/auth/google', authLimiter, async (req: Request, res: Response) => {
    try {
      const credential =
        typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';

      if (!credential) {
        return res.status(400).json({ error: 'Missing Google ID token credential.' });
      }

      const googleClientId = (
        process.env.GOOGLE_CLIENT_ID ||
        process.env.VITE_GOOGLE_CLIENT_ID ||
        ''
      ).trim();

      if (!googleClientId) {
        return res.status(500).json({
          error: 'Google Client ID (VITE_GOOGLE_CLIENT_ID) is not configured on the server.',
        });
      }

      if (
        !SUPABASE_URL ||
        SUPABASE_URL.includes('placeholder') ||
        !SUPABASE_ANON_KEY ||
        SUPABASE_ANON_KEY.includes('placeholder')
      ) {
        return res.status(500).json({
          error: 'Supabase URL and anon key are not configured on the server.',
        });
      }

      let verifiedUser;
      try {
        verifiedUser = await verifyGoogleIdToken(credential, googleClientId);
      } catch (verifyErr: any) {
        console.warn('Google ID token verification failed:', verifyErr?.message);
        return res.status(401).json({
          error: 'Invalid or expired Google sign-in token. Please try again.',
        });
      }

      const allowedRaw = process.env.ALLOWED_EMAILS || '';
      const allowedEmails = allowedRaw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (allowedEmails.length > 0 && !allowedEmails.includes(verifiedUser.email)) {
        return res.status(403).json({
          error: 'Your Google account is not on the allow list for this app.',
        });
      }

      const serviceSupabase = getServiceSupabase();
      if (!serviceSupabase) {
        return res.status(500).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to issue sessions.',
        });
      }

      const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email: verifiedUser.email,
        options: {
          data: {
            full_name: verifiedUser.fullName || undefined,
            avatar_url: verifiedUser.avatarUrl || undefined,
            name: verifiedUser.fullName || undefined,
            picture: verifiedUser.avatarUrl || undefined,
          },
        },
      });

      if (linkError || !linkData?.properties?.hashed_token) {
        console.error('Supabase generateLink failed:', linkError?.message);
        return res.status(500).json({ error: 'Failed to create Supabase user session.' });
      }

      if (linkData.user?.id && (verifiedUser.fullName || verifiedUser.avatarUrl)) {
        const existingMeta = (linkData.user.user_metadata || {}) as Record<string, any>;
        const needsUpdate =
          (verifiedUser.fullName && existingMeta.full_name !== verifiedUser.fullName) ||
          (verifiedUser.avatarUrl && existingMeta.avatar_url !== verifiedUser.avatarUrl);

        if (needsUpdate) {
          await serviceSupabase.auth.admin
            .updateUserById(linkData.user.id, {
              user_metadata: {
                ...existingMeta,
                full_name: verifiedUser.fullName || existingMeta.full_name,
                avatar_url: verifiedUser.avatarUrl || existingMeta.avatar_url,
                name: verifiedUser.fullName || existingMeta.name,
                picture: verifiedUser.avatarUrl || existingMeta.picture,
              },
            })
            .catch(() => {});
        }
      }

      const anonClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: otpData, error: otpError } = await anonClient.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      });

      if (otpError || !otpData?.session) {
        console.error('Supabase verifyOtp failed:', otpError?.message);
        return res.status(500).json({ error: 'Failed to exchange token for Supabase session.' });
      }

      const authedUser = otpData.user || linkData.user;
      if (authedUser?.id) {
        try {
          await ensureBatch2bBootstrap(serviceSupabase, authedUser);
        } catch (seedErr: any) {
          console.error('[Batch 2b] Bootstrap warning:', seedErr?.message);
        }
      }

      return res.json({
        session: {
          access_token: otpData.session.access_token,
          refresh_token: otpData.session.refresh_token,
          expires_in: otpData.session.expires_in,
          expires_at: otpData.session.expires_at,
          token_type: otpData.session.token_type,
        },
        user: otpData.user,
      });
    } catch (err) {
      console.error('Google auth route error:', err);
      return res.status(500).json({ error: 'Authentication failed. Please try again.' });
    }
  });

  // --- Protected API Routes ---

  // 1. Gemini Test Connection
  app.post('/api/ai/test', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await testGeminiConnection();
      res.json(result);
    } catch (err) {
      console.error('Gemini test connection error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to test AI connection.',
      });
    }
  });

  // 2. Anomaly Detection
  app.post(
    '/api/ai/anomalies',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const forceRefresh = req.body?.forceRefresh === true;

        if (!forceRefresh) {
          const cached = getCachedAnomalies(userId);
          if (cached.length > 0) {
            return res.json({ success: true, anomalies: cached, fromCache: true });
          }
        }

        const ledger = await getTransactions(
          {
            page: 1,
            pageSize: 150,
            filters: {
              startDate: '2024-04-01',
              endDate: '2028-03-31',
              accountIds: [],
              categoryIds: [],
              workspaceId: 'all',
              txnType: 'all',
              search: '',
            },
          },
          req.supabase
        );

        const anomalies = await detectAnomaliesWithAI(
          ledger.transactions,
          undefined,
          userId
        );

        res.json({
          success: true,
          anomalies,
          count: anomalies.length,
        });
      } catch (err) {
        console.error('Anomalies API error:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to run anomaly detection.',
        });
      }
    }
  );

  // 3. Ask-Your-Data Chat
  app.post(
    '/api/ai/chat',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const question = (req.body?.question || '').trim();

        if (!question) {
          return res.status(400).json({ error: 'Question string is required.' });
        }

        const result = await askYourDataChat(question, undefined, req.supabase);

        res.json({
          success: true,
          answer: result.answer,
          queryParams: result.queryParams,
          dataSummary: result.dataSummary,
        });
      } catch (err) {
        console.error('Chat API error:', err);
        res.status(500).json({
          success: false,
          error: 'AI is currently unavailable. Try again later.',
        });
      }
    }
  );

  // 4. Monthly Financial Report
  app.post(
    '/api/ai/monthly-report',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const month = req.body?.month;
        const report = await generateMonthlyReportWithAI(month, undefined, req.supabase);

        res.json({
          success: true,
          report,
        });
      } catch (err) {
        console.error('Monthly report API route error:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to generate monthly AI report.',
        });
      }
    }
  );

  // 5. Automated AI Categorization
  app.post(
    '/api/ai/categorize',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { transactionIds, uploadId } = req.body || {};

        const ledger = await getTransactions(
          {
            page: 1,
            pageSize: 200,
            filters: {
              startDate: '2024-04-01',
              endDate: '2028-03-31',
              accountIds: [],
              categoryIds: [],
              workspaceId: 'all',
              txnType: 'all',
              search: '',
            },
          },
          req.supabase
        );

        let targetTxns: Transaction[] = ledger.transactions;
        if (Array.isArray(transactionIds) && transactionIds.length > 0) {
          targetTxns = targetTxns.filter((t: Transaction) =>
            transactionIds.includes(t.id)
          );
        } else if (uploadId) {
          targetTxns = targetTxns.filter((t: Transaction) => t.upload_id === uploadId);
        } else {
          targetTxns = targetTxns.filter((t: Transaction) => !t.category_id);
        }

        if (targetTxns.length === 0) {
          return res.json({
            success: true,
            message: 'No eligible uncategorized transactions found.',
            summary: {
              totalProcessed: 0,
              autoAppliedHigh: 0,
              autoAppliedMedium: 0,
              needsReviewLow: 0,
            },
          });
        }

        const categories = await getCategories(req.supabase);
        const summary = await categorizeTransactionsWithAI(targetTxns, categories);

        if (summary.results.length > 0) {
          const applyRes = await applyAICategorizations(summary.results, req.supabase);
          const serviceSupabase = getServiceSupabase();
          for (const item of applyRes.applied) {
            await writeAuditLog(serviceSupabase, {
              user_id: req.user!.id,
              action: 'update',
              entity: 'transactions',
              entity_id: item.id,
              before_json: { category_id: item.old_category_id },
              after_json: {
                category_id: item.new_category_id,
                confidence: item.confidence,
                score: item.score,
              },
            });
          }
        }

        res.json({
          success: true,
          summary,
        });
      } catch (err) {
        console.error('Categorize API Route error:', err);
        res.status(500).json({
          success: false,
          error: 'Internal server error during AI categorization.',
        });
      }
    }
  );

  // 6. Financial Export (Excel & CSV)
  app.get('/api/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const format = (req.query.format as string) || 'xlsx';
      const fy = (req.query.fy as string) || getCurrentFY().shortLabel;
      const workspace = (req.query.workspace as string) || 'all';

      if (format === 'tally') {
        return res.status(501).json({
          error: 'TALLY_EXPORT_COMING_SOON',
          message: 'Tally XML export is coming in a future update.',
        });
      }

      const { start: startDate, end: endDate } = getFYBounds(fy);

      const [allTxns, accounts, workspaces, itrData] = await Promise.all([
        getAllTransactions(req.supabase),
        getAccounts(req.supabase),
        getWorkspaces(req.supabase),
        getITRSummaryData({ startDate, endDate }, req.supabase),
      ]);

      let filteredTxns = allTxns.filter(
        (t) => t.txn_date >= startDate && t.txn_date <= endDate
      );
      if (workspace && workspace !== 'all') {
        const matchedWs = workspaces.find(
          (w) =>
            w.id === workspace || w.name.toLowerCase() === workspace.toLowerCase()
        );
        const wsLower = workspace.toLowerCase();
        filteredTxns = filteredTxns.filter((t) => {
          if (matchedWs && t.workspace_id === matchedWs.id) return true;
          if (t.workspace_id === workspace) return true;
          return (t.workspace?.name || '').toLowerCase() === wsLower;
        });
      }

      const todayStr = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        const csvRows = filteredTxns.map((t) => ({
          'Transaction ID': t.id,
          Date: t.txn_date,
          Description: t.description,
          'Raw Description': t.raw_description || '',
          Account: t.account?.name || '',
          'Bank Name': t.account?.bank_name || '',
          Category: t.category?.name || 'Uncategorized',
          Workspace: t.workspace?.name || 'Personal',
          'Debit Amount':
            t.debit !== null && t.debit !== undefined ? Number(t.debit) : '',
          'Credit Amount':
            t.credit !== null && t.credit !== undefined ? Number(t.credit) : '',
          'Account Balance':
            t.balance !== null && t.balance !== undefined ? Number(t.balance) : '',
          'Reference / UTR': t.reference_number || '',
          'Is Transfer': t.is_transfer ? 'YES' : 'NO',
          'Transfer Pair ID': t.transfer_pair_id || '',
          'Transaction Type': t.txn_type || '',
          Tags: (t.tags || []).join('; '),
          Notes: t.notes || '',
          'Is Manual': t.is_manual ? 'YES' : 'NO',
        }));

        const worksheet = XLSX.utils.json_to_sheet(csvRows);
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="zaboraa-transactions-${fy}-${todayStr}.csv"`
        );
        return res.send(csvContent);
      }

      const workbook = XLSX.utils.book_new();

      const txnSheetRows = filteredTxns.map((t) => ({
        'Transaction ID': t.id,
        Date: t.txn_date,
        Description: t.description,
        'Raw Description': t.raw_description || '',
        Account: t.account?.name || '',
        'Bank Name': t.account?.bank_name || '',
        Category: t.category?.name || 'Uncategorized',
        Workspace: t.workspace?.name || 'Personal',
        'Debit Amount':
          t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
        'Credit Amount':
          t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
        'Account Balance':
          t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
        'Reference / UTR': t.reference_number || '',
        'Is Transfer': t.is_transfer ? 'YES' : 'NO',
        'Transfer Pair ID': t.transfer_pair_id || '',
        'Transaction Type': t.txn_type || '',
        Tags: (t.tags || []).join('; '),
        Notes: t.notes || '',
        'Is Manual': t.is_manual ? 'YES' : 'NO',
      }));
      const sheet1 = XLSX.utils.json_to_sheet(txnSheetRows);
      sheet1['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Transactions');

      const itrRows = itrData.lineItems.map((item) => ({
        Section: item.section,
        'Line Item': item.lineItem,
        'Amount (INR)': Number(item.amount),
      }));
      const sheet2 = XLSX.utils.json_to_sheet(itrRows);
      sheet2['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet2, 'ITR Summary');

      const catMap = new Map<
        string,
        { debits: number; credits: number; count: number }
      >();
      for (const t of filteredTxns) {
        const cName = t.category?.name || 'Uncategorized';
        const cur = catMap.get(cName) || { debits: 0, credits: 0, count: 0 };
        cur.debits += t.debit ?? 0;
        cur.credits += t.credit ?? 0;
        cur.count += 1;
        catMap.set(cName, cur);
      }
      const catRows = Array.from(catMap.entries()).map(([cName, data]) => ({
        Category: cName,
        'Total Debit Outflows (INR)': Math.round(data.debits * 100) / 100,
        'Total Credit Inflows (INR)': Math.round(data.credits * 100) / 100,
        'Transaction Count': data.count,
      }));
      const sheet3 = XLSX.utils.json_to_sheet(catRows);
      sheet3['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Category Breakdown');

      const accSummaryRows = accounts.map((acc) => {
        const accTxns = filteredTxns.filter((t) => t.account_id === acc.id);
        let totalC = 0;
        let totalD = 0;
        for (const tx of accTxns) {
          totalC += tx.credit ?? 0;
          totalD += tx.debit ?? 0;
        }
        const openBal = acc.opening_balance ?? 0;
        const closing = openBal + totalC - totalD;

        return {
          'Account Nickname': acc.name,
          'Bank Name': acc.bank_name,
          'Account Type': acc.account_type,
          'Opening Balance (INR)': Number(openBal),
          'Total Credits (INR)': Math.round(totalC * 100) / 100,
          'Total Debits (INR)': Math.round(totalD * 100) / 100,
          'Closing Balance (INR)': Math.round(closing * 100) / 100,
        };
      });
      const sheet4 = XLSX.utils.json_to_sheet(accSummaryRows);
      sheet4['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet4, 'Account Summary');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="zaboraa-export-${fy}-${todayStr}.xlsx"`
      );
      res.send(buffer);
    } catch (err) {
      console.error('Export route error:', err);
      res.status(500).json({ error: 'Internal error generating financial export.' });
    }
  });

  // 7. Statement Upload (Multipart CSV / XLSX / PDF, max 20 MB)
  app.post(
    '/api/upload',
    requireAuth,
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      uploadMiddleware.single('file')(req, res, (err: any) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size exceeds 20 MB limit.' });
          }
          return res.status(400).json({ error: 'Invalid multipart file upload.' });
        }
        return next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const supabase = req.supabase;
        const file = req.file;
        const accountId = req.body?.account_id as string | undefined;
        const password = req.body?.password as string | undefined;

        if (!file) {
          return res.status(400).json({ error: 'No file uploaded.' });
        }
        if (!accountId) {
          return res.status(400).json({ error: 'Target account_id is required.' });
        }

        const fileNameLower = file.originalname.toLowerCase();
        let fileType: 'csv' | 'xlsx' | 'pdf' | null = null;
        if (fileNameLower.endsWith('.csv')) fileType = 'csv';
        else if (fileNameLower.endsWith('.xlsx')) fileType = 'xlsx';
        else if (fileNameLower.endsWith('.pdf')) fileType = 'pdf';

        if (!fileType) {
          return res.status(400).json({
            error: 'Invalid file type. Supported formats: .csv, .xlsx, .pdf.',
          });
        }

        const mime = (file.mimetype || '').toLowerCase();
        if (mime && !ALLOWED_UPLOAD_MIMETYPES[fileType].includes(mime)) {
          return res.status(400).json({
            error: 'File MIME type does not match supported statement format.',
          });
        }

        // Compute SHA-256 hash
        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

        // Check duplicate file hash for this user
        const { data: existingUpload } = await supabase
          .from('statement_uploads')
          .select('id')
          .eq('user_id', user.id)
          .eq('file_hash', fileHash)
          .neq('status', 'failed')
          .maybeSingle();

        if (existingUpload) {
          return res.status(409).json({
            error: 'DUPLICATE_FILE',
            existing_upload_id: existingUpload.id,
            message: 'This exact file has already been uploaded previously.',
          });
        }

        // Upload raw file to Supabase Storage
        const dateFolder = new Date().toISOString().slice(0, 7);
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedFilename}`;

        const { error: storageError } = await supabase.storage
          .from('statements')
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (storageError) {
          console.warn('Storage upload notice:', storageError.message);
        }

        // Run parser matching fileType
        const arrayBuffer = file.buffer.buffer.slice(
          file.buffer.byteOffset,
          file.buffer.byteOffset + file.buffer.byteLength
        ) as ArrayBuffer;

        let parseResult: ParseResult;
        try {
          if (fileType === 'csv') {
            const text = file.buffer.toString('utf-8');
            parseResult = await parseStatementCSV(text);
          } else if (fileType === 'xlsx') {
            parseResult = parseXLSX(arrayBuffer);
          } else {
            parseResult = await parseStatementPDF(arrayBuffer, { password });
          }
        } catch (parseErr: any) {
          if (
            parseErr?.code === 'PASSWORD_REQUIRED' ||
            parseErr?.code === 'INCORRECT_PASSWORD' ||
            parseErr?.name === 'PdfPasswordError' ||
            parseErr?.name === 'PasswordException' ||
            parseErr?.message?.includes('password')
          ) {
            return res.status(401).json({
              error: parseErr.code || (password ? 'INCORRECT_PASSWORD' : 'PASSWORD_REQUIRED'),
              message: parseErr.message || 'PDF password required.',
            });
          }
          throw parseErr;
        }

        if (parseResult.rows.length === 0) {
          return res.status(422).json({
            error: parseResult.parseError || 'Parsed file contains no transaction rows.',
          });
        }

        // Balance reconciliation check
        const recon = checkReconciliation(
          parseResult.rows,
          parseResult.suggested_mapping,
          parseResult.opening_balance,
          parseResult.closing_balance
        );
        if (recon.warning) {
          parseResult.reconciliation_warning = true;
          parseResult.reconciliation_diff = recon.diff;
        }

        const columnMapping: ColumnMapping | null = parseResult.suggested_mapping || null;
        const needsMapping = parseResult.confidence !== 'high';

        // Insert statement_uploads record
        const { data: newUploadRecord, error: dbError } = await supabase
          .from('statement_uploads')
          .insert({
            user_id: user.id,
            account_id: accountId,
            file_name: file.originalname,
            file_hash: fileHash,
            file_type: fileType,
            file_size_bytes: file.size,
            storage_path: storagePath,
            parser_version: parseResult.parser_version,
            status: 'pending',
            row_count: parseResult.rows.length,
          })
          .select()
          .single();

        if (dbError || !newUploadRecord) {
          console.error('Upload DB insert error:', dbError?.message);
          return res.status(500).json({ error: 'Failed to save upload record.' });
        }

        // Stage parsed rows into staged_transactions
        const stagedRows = parseResult.rows.map((row) => {
          const rawDate = columnMapping?.date_col ? row[columnMapping.date_col] : null;
          let debit: number | null = null;
          let credit: number | null = null;

          if (columnMapping?.is_single_amount_col && columnMapping.amount_col) {
            const amt = parseAmount(row[columnMapping.amount_col]);
            if (amt !== null) {
              if (amt < 0) debit = Math.abs(amt);
              else credit = amt;
            }
          } else {
            if (columnMapping?.debit_col) debit = parseAmount(row[columnMapping.debit_col]);
            if (columnMapping?.credit_col) credit = parseAmount(row[columnMapping.credit_col]);
          }

          const desc =
            (columnMapping?.description_col ? row[columnMapping.description_col] : null) ||
            'Pending Mapping';
          const refNo = columnMapping?.reference_col
            ? row[columnMapping.reference_col]?.trim() || null
            : null;
          const rawJson = JSON.stringify(row);
          const { upi_ref_no, imps_ref_no } = extractCrossSourceRefs({
            parserVersion: parseResult.parser_version,
            description: desc,
            rawDescription: rawJson,
            referenceNumber: refNo,
          });

          return {
            user_id: user.id,
            upload_id: newUploadRecord.id,
            account_id: accountId,
            raw_date: rawDate,
            txn_date: normalizeDate(rawDate || ''),
            description: desc,
            raw_description: rawJson,
            debit,
            credit,
            balance: columnMapping?.balance_col
              ? parseAmount(row[columnMapping.balance_col])
              : null,
            reference_number: refNo,
            upi_ref_no,
            imps_ref_no,
            source: 'statement_import' as const,
            is_duplicate: false,
          };
        });

        const CHUNK_SIZE = 500;
        for (let i = 0; i < stagedRows.length; i += CHUNK_SIZE) {
          const chunk = stagedRows.slice(i, i + CHUNK_SIZE);
          const { error: stageError } = await supabase
            .from('staged_transactions')
            .insert(chunk);
          if (stageError) {
            console.error('Staged transactions insert error:', stageError.message);
            return res.status(500).json({ error: 'Failed to stage parsed rows.' });
          }
        }

        await writeAuditLog(getServiceSupabase(), {
          user_id: user.id,
          action: 'insert',
          entity: 'statement_upload',
          entity_id: newUploadRecord.id,
          after_json: {
            account_id: accountId,
            file_name: file.originalname,
            file_type: fileType,
            row_count: parseResult.rows.length,
          },
        });

        res.json({
          upload_id: newUploadRecord.id,
          row_count: parseResult.rows.length,
          column_mapping: columnMapping,
          needs_mapping: needsMapping,
          headers: parseResult.headers,
          detected_bank: parseResult.detected_bank,
          sample_rows: parseResult.rows.slice(0, 5),
          file_type: fileType,
          reconciliation_warning: parseResult.reconciliation_warning,
          reconciliation_diff: parseResult.reconciliation_diff,
        });
      } catch (err) {
        console.error('Upload API route error:', err);
        res.status(500).json({ error: 'Internal server error during upload.' });
      }
    }
  );

  // 8. Finalize Upload Import
  app.post(
    '/api/upload/finalize',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { upload_id, replace_previous_id } = req.body || {};
        if (!upload_id) {
          return res.status(400).json({ error: 'upload_id is required.' });
        }

        const result = await commitUploadTransactions(
          upload_id,
          replace_previous_id,
          req.supabase
        );

        await writeAuditLog(getServiceSupabase(), {
          user_id: req.user!.id,
          action: 'import',
          entity: 'statement_upload',
          entity_id: upload_id,
          after_json: {
            imported: result.imported,
            duplicates_skipped: result.duplicates_skipped,
            replaced: result.replaced,
            transfer_pairs_found: result.transfer_pairs_found,
          },
        });

        res.json(result);
      } catch (err) {
        console.error('Finalize upload error:', err);
        res.status(500).json({ error: 'Internal error finalizing statement upload.' });
      }
    }
  );

  // 9. Update Transaction
  app.patch(
    '/api/transactions/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          return res.status(400).json({ error: 'Transaction id is required.' });
        }

        const body = req.body || {};
        if (
          body.debit !== undefined ||
          body.credit !== undefined ||
          body.balance !== undefined
        ) {
          return res.status(400).json({
            error: 'Transaction amounts are sacred and non-editable after import.',
          });
        }

        const { data: beforeTx } = await req.supabase
          .from('transactions')
          .select(
            'category_id, workspace_id, tags, notes, txn_type, is_transfer, transfer_pair_id'
          )
          .eq('id', id)
          .eq('user_id', req.user!.id)
          .maybeSingle();

        const updated = await updateTransaction(
          id,
          {
            category_id: body.category_id,
            workspace_id: body.workspace_id,
            tags: body.tags,
            notes: body.notes,
            txn_type: body.txn_type,
            is_transfer: body.is_transfer,
            is_self_transfer: body.is_self_transfer,
            status: body.status,
            transfer_pair_id: body.transfer_pair_id,
            transfer_target_account_id: body.transfer_target_account_id,
          },
          req.supabase
        );

        await writeAuditLog(getServiceSupabase(), {
          user_id: req.user!.id,
          action: 'update',
          entity: 'transaction',
          entity_id: id,
          before_json: beforeTx || null,
          after_json: {
            category_id: updated.category_id,
            workspace_id: updated.workspace_id,
            tags: updated.tags,
            notes: updated.notes,
            txn_type: updated.txn_type,
            is_transfer: updated.is_transfer,
            transfer_pair_id: updated.transfer_pair_id,
          },
        });

        res.json(updated);
      } catch (err) {
        console.error('Update transaction error:', err);
        res.status(500).json({ error: 'Internal error updating transaction.' });
      }
    }
  );

  // 10. Full Data Backup Export (JSON)
  app.get('/api/backup', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [
        accounts,
        transactions,
        categories,
        workspaces,
        rules,
        recurring,
        budgetData,
        uploads,
      ] = await Promise.all([
        getAccounts(req.supabase),
        getAllTransactions(req.supabase),
        getCategories(req.supabase),
        getWorkspaces(req.supabase),
        getRules(req.supabase),
        getRecurringTransactions(req.supabase),
        getBudgets('', undefined, req.supabase),
        getUploads(req.supabase),
      ]);

      const sanitizedUploads = uploads.map((u) => ({
        id: u.id,
        account_id: u.account_id,
        file_name: u.file_name,
        file_hash: u.file_hash,
        file_type: u.file_type,
        file_size_bytes: u.file_size_bytes,
        status: u.status,
        row_count: u.row_count,
        statement_period_start: u.statement_period_start,
        statement_period_end: u.statement_period_end,
        imported_at: u.imported_at,
        created_at: u.created_at,
      }));

      res.json({
        backup_version: '1',
        app: 'Zaboraa Finance',
        exported_at: new Date().toISOString(),
        user_id: '[REDACTED]',
        tables: {
          accounts,
          transactions,
          categories,
          workspaces,
          transaction_rules: rules,
          recurring_transactions: recurring,
          budgets: budgetData.budgets,
          statement_uploads: sanitizedUploads,
        },
      });
    } catch (err) {
      console.error('Backup export API route error:', err);
      res.status(500).json({ error: 'Failed to assemble backup data.' });
    }
  });

  // 11. Bank & Payment Instructions (Server-Side AES-256-GCM Encryption via ENCRYPTION_KEY)
  app.post(
    '/api/payment-instructions',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const created = await createPaymentInstructionServer(
          req.supabase,
          req.user!.id,
          req.body || {}
        );
        return res.json(created);
      } catch (err: any) {
        const message = err?.message || 'Failed to create payment instruction.';
        const isValidation =
          message.includes('required') || message.includes('3-letter ISO code');
        console.error('Create payment instruction error:', message);
        return res.status(isValidation ? 400 : 500).json({ error: message });
      }
    }
  );

  app.patch(
    '/api/payment-instructions/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          return res.status(400).json({ error: 'Payment instruction id is required.' });
        }
        const updated = await updatePaymentInstructionServer(
          req.supabase,
          req.user!.id,
          id,
          req.body || {}
        );
        return res.json(updated);
      } catch (err: any) {
        const message = err?.message || 'Failed to update payment instruction.';
        const status = message.includes('not found')
          ? 404
          : message.includes('required') || message.includes('3-letter ISO code')
          ? 400
          : 500;
        console.error('Update payment instruction error:', message);
        return res.status(status).json({ error: message });
      }
    }
  );

  app.post(
    '/api/payment-instructions/:id/reveal',
    revealLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          return res.status(400).json({ error: 'Payment instruction id is required.' });
        }
        const instruction = await getPaymentInstruction(req.supabase, id);
        if (!instruction) {
          return res.status(404).json({ error: 'Payment instruction not found.' });
        }
        const decrypted = await decryptPaymentInstructionServer(instruction);
        return res.json(decrypted);
      } catch (err: any) {
        const message = err?.message || 'Failed to decrypt payment instruction.';
        console.error('Reveal payment instruction error:', message);
        return res.status(500).json({ error: message });
      }
    }
  );

  // 12. Profile & PAN Encryption (Server-Side AES-256-GCM Encryption via ENCRYPTION_KEY)
  app.post(
    '/api/profile/pan',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = req.body || {};
        const payload: Record<string, any> = {
          user_id: req.user!.id,
        };

        if (body.full_name !== undefined) {
          payload.full_name = typeof body.full_name === 'string' ? body.full_name.trim() || null : null;
        }
        if (body.email !== undefined) {
          payload.email = typeof body.email === 'string' ? body.email.trim() || null : null;
        }
        if (body.phone !== undefined) {
          payload.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
        }
        if (body.address !== undefined) {
          payload.address = typeof body.address === 'string' ? body.address.trim() || null : null;
        }
        if (body.default_fy !== undefined) {
          payload.default_fy = body.default_fy || '2026-27';
        }
        if (body.dark_mode !== undefined) {
          payload.dark_mode = Boolean(body.dark_mode);
        }
        if (body.last_backup_at !== undefined) {
          payload.last_backup_at = body.last_backup_at;
        }

        if (body.skip_pan === true) {
          return res.status(200).json({ success: true });
        }

        if (body.remove_pan === true || (body.pan === '' && (body.remove_pan || !body.pan_number))) {
          payload.pan_encrypted = null;
          const { data: updated, error } = await req.supabase
            .from('profiles')
            .upsert(payload, { onConflict: 'user_id' })
            .select('*')
            .single();

          if (error || !updated) {
            return res.status(500).json({
              error: error?.message || 'Failed to remove PAN.',
            });
          }
          return res.status(200).json({ success: true, profile: updated, ...updated });
        }

        const incomingPan = body.pan_number ?? body.pan ?? body.encryptedPan ?? body.encrypted_pan;
        const rawPan = typeof incomingPan === 'string' ? incomingPan.trim().toUpperCase() : '';
        if (!rawPan) {
          return res.status(400).json({ error: 'PAN is required.' });
        }
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan)) {
          return res.status(400).json({
            error: 'PAN format is invalid. Use 10 characters: 5 letters, 4 digits, 1 letter.',
          });
        }

        payload.pan_encrypted = await encryptValue(rawPan);

        const { data: updated, error } = await req.supabase
          .from('profiles')
          .upsert(payload, { onConflict: 'user_id' })
          .select('*')
          .single();

        if (error || !updated) {
          return res.status(500).json({
            error: error?.message || 'Failed to save encrypted PAN profile.',
          });
        }

        return res.status(200).json({ success: true, profile: updated, ...updated });
      } catch (err: any) {
        const message = err?.message || 'Failed to encrypt and save PAN.';
        console.error('Save encrypted PAN error:', message);
        return res.status(500).json({ error: message });
      }
    }
  );

  // 13. Gmail Auto-Import Integration (Batch 5b — Tokens in Vault only, never returned)
  const gmailManualSyncLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 1,
    keyGenerator: (req: Request) =>
      (req as AuthenticatedRequest).user?.id || req.ip || 'anonymous',
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Manual Gmail sync can only be triggered once every 5 minutes. Please wait before syncing again.',
    },
  });

  app.get(
    '/api/gmail/status',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const [{ data: profileRow }, { data: latestLog }] = await Promise.all([
          req.supabase
            .from('profiles')
            .select('gmail_connected, gmail_email, gmail_last_synced, gmail_sync_enabled')
            .eq('user_id', userId)
            .maybeSingle(),
          req.supabase
            .from('gmail_sync_log')
            .select('last_synced_at, emails_processed, transactions_added, errors_count')
            .eq('user_id', userId)
            .order('last_synced_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        return res.json({
          gmail_connected: Boolean(profileRow?.gmail_connected),
          gmail_email: profileRow?.gmail_email || null,
          gmail_last_synced: profileRow?.gmail_last_synced || latestLog?.last_synced_at || null,
          gmail_sync_enabled: profileRow?.gmail_sync_enabled ?? true,
          last_sync_summary: latestLog || null,
          has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        });
      } catch (err: any) {
        console.error('Gmail status error:', err?.message);
        return res.status(500).json({ error: 'Failed to load Gmail integration status.' });
      }
    }
  );

  app.post(
    '/api/gmail/connect',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const serviceSupabase = getServiceSupabase();
        if (!serviceSupabase) {
          return res.status(500).json({
            error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to store Gmail tokens securely in Vault.',
          });
        }

        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        let accessToken =
          typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : '';
        let refreshToken: string | null = null;
        let expiresInSec = Number(req.body?.expires_in || 3600);

        if (code) {
          const clientId = (
            process.env.GOOGLE_CLIENT_ID ||
            process.env.VITE_GOOGLE_CLIENT_ID ||
            ''
          ).trim();
          const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
          if (!clientId || !clientSecret) {
            return res.status(400).json({
              error: 'GOOGLE_CLIENT_SECRET is required on the server to exchange authorization codes.',
            });
          }

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: 'postmessage',
              grant_type: 'authorization_code',
            }).toString(),
          });

          const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error_description?: string;
            error?: string;
          };

          if (!tokenRes.ok || !tokenJson.access_token) {
            return res.status(400).json({
              error:
                tokenJson.error_description ||
                tokenJson.error ||
                'Failed to exchange Google authorization code for Gmail access.',
            });
          }

          accessToken = tokenJson.access_token;
          refreshToken = tokenJson.refresh_token || null;
          expiresInSec = Number(tokenJson.expires_in || 3600);
        }

        if (!accessToken) {
          return res.status(400).json({ error: 'Missing Gmail OAuth access token or authorization code.' });
        }

        // Fetch userinfo from Google OAuth endpoint using the consented access token
        let consentedEmail: string | null = null;

        try {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (userinfoRes.ok) {
            const userInfo = (await userinfoRes.json().catch(() => ({}))) as { email?: string };
            if (userInfo?.email && typeof userInfo.email === 'string') {
              consentedEmail = userInfo.email.trim().toLowerCase();
            }
          }
        } catch (err: any) {
          console.warn('[server-app/gmail/connect] userinfo fetch error:', err?.message);
        }

        // Fallback/Verify with Gmail profile API if userinfo didn't return an email
        if (!consentedEmail) {
          const gmailProfileRes = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (!gmailProfileRes.ok) {
            return res.status(400).json({
              error: 'Google token lacks Gmail read-only permission. Please grant Gmail access.',
            });
          }

          const gmailProfile = (await gmailProfileRes.json().catch(() => ({}))) as {
            emailAddress?: string;
          };
          if (gmailProfile?.emailAddress && typeof gmailProfile.emailAddress === 'string') {
            consentedEmail = gmailProfile.emailAddress.trim().toLowerCase();
          }
        }

        if (!consentedEmail) {
          return res.status(400).json({
            error: 'Unable to verify the consented Gmail account from Google. Please try again.',
          });
        }

        await saveGmailTokenToVault(serviceSupabase, userId, {
          access_token: accessToken,
          refresh_token: refreshToken,
          expiry: Date.now() + expiresInSec * 1000,
        });

        await serviceSupabase
          .from('profiles')
          .update({
            gmail_connected: true,
            gmail_email: consentedEmail,
            gmail_sync_enabled: true,
          })
          .eq('user_id', userId);

        // Never return tokens in API response
        return res.json({
          gmail_connected: true,
          gmail_email: consentedEmail,
          has_refresh_token: Boolean(refreshToken),
        });
      } catch (err: any) {
        console.error('Gmail connect error:', err?.message);
        return res.status(500).json({ error: err?.message || 'Failed to connect Gmail.' });
      }
    }
  );

  app.post(
    '/api/gmail/disconnect',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const serviceSupabase = getServiceSupabase();
        if (serviceSupabase) {
          await deleteGmailTokenFromVault(serviceSupabase, userId);
          await serviceSupabase
            .from('profiles')
            .update({
              gmail_connected: false,
              gmail_email: null,
            })
            .eq('user_id', userId);
        } else {
          await req.supabase
            .from('profiles')
            .update({
              gmail_connected: false,
              gmail_email: null,
            })
            .eq('user_id', userId);
        }

        return res.json({ gmail_connected: false });
      } catch (err: any) {
        console.error('Gmail disconnect error:', err?.message);
        return res.status(500).json({ error: err?.message || 'Failed to disconnect Gmail.' });
      }
    }
  );

  app.patch(
    '/api/gmail/settings',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const enabled = Boolean(req.body?.gmail_sync_enabled);

        const { data: updated, error } = await req.supabase
          .from('profiles')
          .update({ gmail_sync_enabled: enabled })
          .eq('user_id', userId)
          .select('gmail_sync_enabled')
          .single();

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.json({ gmail_sync_enabled: Boolean(updated?.gmail_sync_enabled) });
      } catch (err: any) {
        console.error('Gmail settings update error:', err?.message);
        return res.status(500).json({ error: 'Failed to update Gmail auto-sync setting.' });
      }
    }
  );

  app.post(
    '/api/gmail/sync',
    requireAuth,
    gmailManualSyncLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const serviceSupabase = getServiceSupabase();
        if (!serviceSupabase) {
          return res.status(500).json({
            error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to run Gmail sync.',
          });
        }

        // Enforce DB-backed 5-minute cooldown across restarts as well
        const { data: latestLog } = await serviceSupabase
          .from('gmail_sync_log')
          .select('last_synced_at')
          .eq('user_id', userId)
          .order('last_synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestLog?.last_synced_at) {
          const elapsedMs = Date.now() - new Date(latestLog.last_synced_at).getTime();
          const cooldownMs = 5 * 60 * 1000;
          if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
            const retryAfterSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
              error: `Gmail was synced recently. Please wait ${Math.ceil(retryAfterSec / 60)} minute(s) before syncing again.`,
              retry_after_seconds: retryAfterSec,
            });
          }
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const canCallEdgeFunction =
          SUPABASE_URL &&
          !SUPABASE_URL.includes('placeholder') &&
          Boolean(serviceRoleKey) &&
          process.env.USE_SUPABASE_EDGE_GMAIL_SYNC === 'true';

        if (canCallEdgeFunction) {
          try {
            const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ user_id: userId }),
            });
            if (fnRes.ok) {
              const fnJson = await fnRes.json();
              if (typeof fnJson?.emails_processed === 'number') {
                return res.json(fnJson);
              }
            }
          } catch {
            // Fall back cleanly to Express server sync pipeline if Edge Function is not deployed yet
          }
        }

        const result = await runGmailSyncForUser(serviceSupabase, userId);
        return res.json(result);
      } catch (err: any) {
        const message = err?.message || 'Failed to sync Gmail alerts.';
        console.error('Gmail sync route error:', message);
        const isClientErr =
          message.includes('not connected') ||
          message.includes('expired') ||
          message.includes('reconnect');
        return res.status(isClientErr ? 400 : 500).json({ error: message });
      }
    }
  );

  // 14. AI Analytics & Consolidated Report (Batch 6b — Read-Only, max 1/hour per user)
  const analyticsLastGeneratedAt = new Map<string, number>();
  const analyticsInFlight = new Set<string>();
  const ANALYTICS_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

  app.get(
    '/api/analytics/reports',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const reports = await listAnalyticsReports(req.supabase, req.user!.id);
        return res.json({ reports });
      } catch (err: any) {
        console.error('Analytics list reports error:', err?.message);
        return res.status(500).json({
          error: err?.message || 'Failed to load analytics reports.',
        });
      }
    }
  );

  app.post(
    '/api/analytics/generate',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.id;

      if (analyticsInFlight.has(userId)) {
        return res.status(429).json({
          error: 'An analytics report is already being generated. Please wait a moment.',
          retry_after_seconds: 30,
          retry_after_minutes: 1,
        });
      }

      try {
        // Check in-memory cooldown first
        const memTs = analyticsLastGeneratedAt.get(userId);
        if (memTs) {
          const elapsed = Date.now() - memTs;
          if (elapsed >= 0 && elapsed < ANALYTICS_COOLDOWN_MS) {
            const retryAfterSec = Math.ceil((ANALYTICS_COOLDOWN_MS - elapsed) / 1000);
            const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
              error: `Analytics report can only be generated once per hour. Please try again in ${retryAfterMin} minute${retryAfterMin === 1 ? '' : 's'}.`,
              retry_after_seconds: retryAfterSec,
              retry_after_minutes: retryAfterMin,
            });
          }
        }

        // Also enforce DB-backed 1-hour cooldown across server restarts
        const { data: latestReport } = await req.supabase
          .from('analytics_reports')
          .select('generated_at')
          .eq('user_id', userId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestReport?.generated_at) {
          const dbTs = new Date(latestReport.generated_at).getTime();
          if (Number.isFinite(dbTs)) {
            const elapsed = Date.now() - dbTs;
            if (elapsed >= 0 && elapsed < ANALYTICS_COOLDOWN_MS) {
              analyticsLastGeneratedAt.set(userId, dbTs);
              const retryAfterSec = Math.ceil((ANALYTICS_COOLDOWN_MS - elapsed) / 1000);
              const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
              res.setHeader('Retry-After', String(retryAfterSec));
              return res.status(429).json({
                error: `Analytics report can only be generated once per hour. Please try again in ${retryAfterMin} minute${retryAfterMin === 1 ? '' : 's'}.`,
                retry_after_seconds: retryAfterSec,
                retry_after_minutes: retryAfterMin,
              });
            }
          }
        }

        analyticsInFlight.add(userId);

        const { data: profileRow } = await req.supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', userId)
          .maybeSingle();

        const { report } = await generateAnalyticsReport({
          supabase: req.supabase,
          userId,
          profileName: profileRow?.full_name || undefined,
        });

        analyticsLastGeneratedAt.set(userId, Date.now());
        return res.json({ report });
      } catch (err: any) {
        const status = Number(err?.statusCode) || 500;
        const message = err?.message || 'Failed to generate AI analytics report.';
        console.error('Analytics generate error:', message);
        return res.status(status).json({ error: message });
      } finally {
        analyticsInFlight.delete(userId);
      }
    }
  );

  // --- Frontend Serving (Vite dev middleware or Static dist) ---
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(ROOT_DIR, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(ROOT_DIR, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      root: ROOT_DIR,
      server: {
        middlewareMode: true,
        host: HOST,
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Zaboraa Finance server running on http://${HOST}:${PORT}`);
  });
}
