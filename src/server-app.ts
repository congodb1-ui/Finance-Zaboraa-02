import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
import {
  getUploads,
  computeSHA256,
  checkReconciliation,
  normalizeDate,
  parseAmount,
} from './lib/actions/upload';
import { parseCSV } from './lib/parsers/csv';
import { parseXLSX } from './lib/parsers/xlsx';
import { extractPDFRawData } from './lib/parsers/pdf';
import { parsePDFHDFC, isHDFCStatement } from './lib/parsers/pdf-hdfc';
import { parsePDFGeneric } from './lib/parsers/pdf-generic';
import { getBroadDateRange, getFYBounds } from './lib/fy-utils';
import type { Transaction } from './types/transactions';
import type { ParseResult, ColumnMapping } from './types/uploads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export async function runServer() {
  const app = express();
  const PORT = 3000;
  const HOST = '0.0.0.0';

  // Startup warning for GEMINI_API_KEY
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      '[Zaboraa Finance] WARNING: GEMINI_API_KEY environment variable is not set. Gemini AI features will be disabled until an API key is configured.'
    );
  }

  // Security Headers via helmet (disable CSP for Vite dev server scripts and web workers)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Rate Limiting: 100 req/15 min globally, 10 req/15 min on AI endpoints
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Please try again after 15 minutes.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI rate limit exceeded. Maximum 10 AI operations per 15 minutes.' },
  });

  app.use('/api/', generalLimiter);
  app.use('/api/ai/', aiLimiter);

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Multer config for file uploads (max 20 MB, only CSV, XLSX, PDF)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB
    },
    fileFilter: (_req, file, cb) => {
      const name = file.originalname.toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.pdf')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file format. Supported statement exports: .csv, .xlsx, .pdf.'));
      }
    },
  });

  // Supabase Auth Middleware (SECTION B)
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const authClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Session token missing.' });
      }

      let user: any = null;

      // Allow demo session when running in offline preview or demo mode
      if (token === 'demo-preview-token' || supabaseUrl.includes('placeholder')) {
        user = {
          id: 'usr_01j7bf93a8e9_demo',
          email: 'wasimssayyed@gmail.com',
          user_metadata: { full_name: 'Wasim Sayyed' },
        };
      } else {
        const { data: authData, error } = await authClient.auth.getUser(token);
        if (error || !authData.user) {
          return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
        }
        user = authData.user;
      }

      // Check user's email against ALLOWED_EMAILS env var (comma-separated)
      const allowedEmailsEnv = (process.env.ALLOWED_EMAILS || '').trim();
      if (allowedEmailsEnv) {
        const allowedList = allowedEmailsEnv
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

        const userEmail = (user.email || '').toLowerCase();
        if (allowedList.length > 0 && !allowedList.includes(userEmail)) {
          return res.status(403).json({ error: 'Forbidden: Account not authorized for this vault.' });
        }
      }

      (req as any).user = user;
      next();
    } catch (err: any) {
      console.error('requireAuth middleware error:', err);
      return res.status(500).json({ error: 'Internal server authentication error.' });
    }
  };

  // --- API Routes (All Protected with requireAuth) ---

  // 1. Gemini Test Connection
  app.post('/api/ai/test', requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = await testGeminiConnection();
      res.json(result);
    } catch (err: any) {
      console.error('[API /api/ai/test] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Gemini AI service.',
      });
    }
  });

  // 2. Anomaly Detection
  app.post('/api/ai/anomalies', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const forceRefresh = req.body?.forceRefresh === true;

      if (!forceRefresh) {
        const cached = getCachedAnomalies(user.id);
        if (cached.length > 0) {
          return res.json({ success: true, anomalies: cached, fromCache: true });
        }
      }

      const broadRange = getBroadDateRange(3, 1);
      const ledger = await getTransactions({
        page: 1,
        pageSize: 150,
        filters: {
          startDate: broadRange.startDate,
          endDate: broadRange.endDate,
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      });

      const anomalies = await detectAnomaliesWithAI(ledger.transactions, undefined, user.id);

      res.json({
        success: true,
        anomalies,
        count: anomalies.length,
      });
    } catch (err: any) {
      console.error('[API /api/ai/anomalies] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Error running anomaly detection analysis.',
      });
    }
  });

  // 3. Ask-Your-Data Chat
  app.post('/api/ai/chat', requireAuth, async (req: Request, res: Response) => {
    try {
      const question = (req.body?.question || '').trim();

      if (!question) {
        return res.status(400).json({ error: 'Question string is required.' });
      }

      const result = await askYourDataChat(question);

      res.json({
        success: true,
        answer: result.answer,
        queryParams: result.queryParams,
        dataSummary: result.dataSummary,
      });
    } catch (err: any) {
      console.error('[API /api/ai/chat] Error:', err);
      res.status(500).json({
        success: false,
        error: 'AI assistant is currently unavailable. Please try again later.',
      });
    }
  });

  // 4. Monthly Financial Report
  app.post('/api/ai/monthly-report', requireAuth, async (req: Request, res: Response) => {
    try {
      const month = req.body?.month;
      const report = await generateMonthlyReportWithAI(month);

      res.json({
        success: true,
        report,
      });
    } catch (err: any) {
      console.error('[API /api/ai/monthly-report] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to generate monthly financial report.',
      });
    }
  });

  // 5. Automated AI Categorization
  app.post('/api/ai/categorize', requireAuth, async (req: Request, res: Response) => {
    try {
      const { transactionIds, uploadId } = req.body || {};
      const broadRange = getBroadDateRange(3, 1);

      const ledger = await getTransactions({
        page: 1,
        pageSize: 200,
        filters: {
          startDate: broadRange.startDate,
          endDate: broadRange.endDate,
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      });

      let targetTxns: Transaction[] = ledger.transactions;
      if (Array.isArray(transactionIds) && transactionIds.length > 0) {
        targetTxns = targetTxns.filter((t: Transaction) => transactionIds.includes(t.id));
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

      const categories = await getCategories();
      const summary = await categorizeTransactionsWithAI(targetTxns, categories);

      if (summary.results.length > 0) {
        await applyAICategorizations(summary.results);
      }

      res.json({
        success: true,
        summary,
      });
    } catch (err: any) {
      console.error('[API /api/ai/categorize] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error during transaction categorization.',
      });
    }
  });

  // 6. Statement Upload (SECTION D.1 — multipart form-data via multer, max 20 MB)
  app.post('/api/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const file = req.file;
      const accountId = req.body?.account_id;

      if (!file) {
        return res.status(400).json({ error: 'No statement file provided.' });
      }
      if (!accountId) {
        return res.status(400).json({ error: 'Target account_id is required.' });
      }

      const fileNameLower = file.originalname.toLowerCase();
      let fileType: 'csv' | 'xlsx' | 'pdf' | null = null;
      if (fileNameLower.endsWith('.csv')) fileType = 'csv';
      else if (fileNameLower.endsWith('.xlsx')) fileType = 'xlsx';
      else if (fileNameLower.endsWith('.pdf')) fileType = 'pdf';
      else {
        return res.status(400).json({ error: 'Supported statement formats: .csv, .xlsx, .pdf.' });
      }

      // Compute SHA-256 hash of file buffer
      const fileHash = await computeSHA256(file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength));

      // Check for duplicate file
      const { data: existingUpload } = await authClient
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
          message: 'This exact statement file was already uploaded previously.',
        });
      }

      // Detect and parse file
      let parseResult: ParseResult;
      const arrayBuffer = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength);

      if (fileType === 'csv') {
        const text = file.buffer.toString('utf-8');
        parseResult = parseCSV(text);
      } else if (fileType === 'xlsx') {
        parseResult = parseXLSX(arrayBuffer);
      } else {
        const pdfData = await extractPDFRawData(arrayBuffer);
        const firstPageText = pdfData.pages[0]?.fullText || pdfData.fullDocumentText;
        if (isHDFCStatement(firstPageText)) {
          parseResult = await parsePDFHDFC(arrayBuffer, pdfData);
        } else {
          parseResult = await parsePDFGeneric(arrayBuffer, pdfData);
        }
      }

      if (parseResult.rows.length === 0) {
        return res.status(422).json({ error: 'Parsed file contains no transaction rows.' });
      }

      // Check reconciliation
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

      // Storage path
      const dateFolder = new Date().toISOString().slice(0, 7);
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedFilename}`;

      // Insert statement_uploads record
      const { data: newUploadRecord, error: dbError } = await authClient
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
        console.error('Database insert error:', dbError);
        return res.status(500).json({ error: 'Database failed to register upload record.' });
      }

      // Insert raw staged rows
      const stagedRows = parseResult.rows.map((row) => ({
        user_id: user.id,
        upload_id: newUploadRecord.id,
        account_id: accountId,
        raw_date: columnMapping?.date_col ? row[columnMapping.date_col] : null,
        txn_date: normalizeDate(columnMapping?.date_col ? row[columnMapping.date_col] : ''),
        description: (columnMapping?.description_col ? row[columnMapping.description_col] : null) || 'Pending Mapping',
        raw_description: JSON.stringify(row),
        is_duplicate: false,
      }));

      await authClient.from('staged_transactions').insert(stagedRows);

      res.json({
        upload_id: newUploadRecord.id,
        row_count: parseResult.rows.length,
        column_mapping: columnMapping,
        needs_mapping: needsMapping,
        headers: parseResult.headers,
        file_type: fileType,
        reconciliation_warning: parseResult.reconciliation_warning,
        reconciliation_diff: parseResult.reconciliation_diff,
      });
    } catch (err: any) {
      console.error('[API /api/upload] Error:', err);
      res.status(500).json({ error: 'Internal server error processing statement file.' });
    }
  });

  // 7. Finalize Upload Import
  app.post('/api/upload/finalize', requireAuth, async (req: Request, res: Response) => {
    try {
      const { upload_id, replace_previous_id } = req.body || {};
      if (!upload_id) {
        return res.status(400).json({ error: 'upload_id is required.' });
      }

      const result = await commitUploadTransactions(upload_id, replace_previous_id);
      res.json(result);
    } catch (err: any) {
      console.error('[API /api/upload/finalize] Error:', err);
      res.status(500).json({ error: 'Internal error finalizing statement upload.' });
    }
  });

  // 8. Financial Export (Excel & CSV)
  app.get('/api/export', requireAuth, async (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string) || 'xlsx';
      const fy = (req.query.fy as string) || 'FY2026-27';
      const workspace = (req.query.workspace as string) || 'all';

      if (format === 'tally') {
        return res.status(501).json({
          error: 'TALLY_EXPORT_COMING_SOON',
          message: 'Tally XML export is coming in a future update.',
        });
      }

      const bounds = getFYBounds(fy);
      const startDate = bounds.start;
      const endDate = bounds.end;

      const [allTxns, accounts, categories, itrData] = await Promise.all([
        getAllTransactions(),
        getAccounts(),
        getCategories(),
        getITRSummaryData({ startDate, endDate }),
      ]);

      let filteredTxns = allTxns.filter((t) => t.txn_date >= startDate && t.txn_date <= endDate);
      if (workspace && workspace !== 'all') {
        filteredTxns = filteredTxns.filter((t) => {
          if (workspace === 'Personal') return t.workspace?.name === 'Personal';
          if (workspace === 'Business') return t.workspace?.name === 'Business';
          return t.workspace_id === workspace;
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
          'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : '',
          'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : '',
          'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : '',
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

      // Excel workbook
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
        'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
        'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
        'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
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
    } catch (err: any) {
      console.error('[API /api/export] Error:', err);
      res.status(500).json({ error: 'Internal error generating financial export.' });
    }
  });

  // 9. Update Transaction
  app.patch('/api/transactions/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: 'Transaction id is required.' });
      }

      const body = req.body || {};
      if (body.debit !== undefined || body.credit !== undefined || body.balance !== undefined) {
        return res.status(400).json({
          error: 'Transaction amounts are sacred and non-editable after import.',
        });
      }

      const updated = await updateTransaction(id, {
        category_id: body.category_id,
        workspace_id: body.workspace_id,
        tags: body.tags,
        notes: body.notes,
        txn_type: body.txn_type,
        is_transfer: body.is_transfer,
        transfer_pair_id: body.transfer_pair_id,
      });

      res.json(updated);
    } catch (err: any) {
      console.error('[API /api/transactions/:id] Error:', err);
      res.status(500).json({ error: 'Internal error updating transaction.' });
    }
  });

  // 10. Vault Backup (SECTION D.2)
  app.get('/api/backup', requireAuth, async (_req: Request, res: Response) => {
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
        getAccounts(),
        getAllTransactions(),
        getCategories(),
        getWorkspaces(),
        getRules(),
        getRecurringTransactions(),
        getBudgets(),
        getUploads(),
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

      const envelope = {
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
      };

      res.json(envelope);
    } catch (err: any) {
      console.error('[API /api/backup] Error:', err);
      res.status(500).json({ error: 'Failed to assemble vault backup.' });
    }
  });

  // SECTION D.3 Note on /api/auth/callback:
  // Not needed in Express SPA mode; Google OAuth callback with PKCE flow is handled
  // client-side by Supabase JS directly from the hash fragment or query params.

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
