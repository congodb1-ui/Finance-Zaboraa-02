import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// --- Inlined Cors & Auth Helpers ---
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://placeholder-project.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = (req.headers.origin as string) || '';
  res.setHeader('Vary', 'Origin');

  const ALLOWED_CORS_ORIGINS = new Set<string>([
    'https://finance.zaboraa.com',
    'https://finance-zaboraa-02.vercel.app',
  ]);

  if (process.env.NODE_ENV !== 'production') {
    ALLOWED_CORS_ORIGINS.add('http://localhost:3000');
  }

  if (origin) {
    let isAllowed = ALLOWED_CORS_ORIGINS.has(origin);
    if (!isAllowed) {
      try {
        const originHost = new URL(origin).host;
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
        const requestHost = hostHeader.split(',')[0].trim();
        if (requestHost && originHost === requestHost) {
          isAllowed = true;
        }
      } catch {
        isAllowed = false;
      }
    }

    if (!isAllowed) {
      res.status(403).json({ error: 'CORS origin not allowed.' });
      return false;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  return true;
}

async function authenticateRequest(
  req: VercelRequest & { user?: any; supabase?: any },
  res: VercelResponse
): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
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
      res.status(401).json({ error: 'Unauthorized' });
      return false;
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
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }

    req.user = user;
    req.supabase = reqSupabase;
    return true;
  } catch (err) {
    console.error('[api/[...all]] Auth verification error:', err);
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
}

// --- Shared Helpers ---
function getUrlPath(req: VercelRequest): string {
  const url = req.url || '';
  const pathname = url.split('?')[0] || '';
  return pathname;
}

// --- Handler Implementations ---

// 1. GET /api/export
async function handleExport(req: any, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const supabase = req.supabase;
    const user = req.user;

    const [txRes, accRes, catRes, budRes, recRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('recurring_transactions').select('*').eq('user_id', user.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email,
      accounts: accRes.data || [],
      categories: catRes.data || [],
      transactions: txRes.data || [],
      budgets: budRes.data || [],
      recurring_transactions: recRes.data || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zaboraa-finance-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Export failed' });
  }
}

// 2. GET /api/backup
async function handleBackup(req: any, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const supabase = req.supabase;
    const user = req.user;

    const [txRes, accRes, catRes, budRes, recRes, profRes, piRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('recurring_transactions').select('*').eq('user_id', user.id),
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('payment_instructions').select('*').eq('user_id', user.id),
    ]);

    const backupPayload = {
      version: '1.0',
      backed_up_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      profiles: profRes.data || [],
      accounts: accRes.data || [],
      categories: catRes.data || [],
      transactions: txRes.data || [],
      budgets: budRes.data || [],
      recurring_transactions: recRes.data || [],
      payment_instructions: piRes.data || [],
    };

    const jsonStr = JSON.stringify(backupPayload);
    const encKey = process.env.ENCRYPTION_KEY || 'default-backup-secret-key-32chars!';
    const cipherKey = crypto.createHash('sha256').update(encKey).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const finalBackup = {
      encrypted_data: encrypted,
      iv: iv.toString('hex'),
      created_at: new Date().toISOString(),
      checksum: crypto.createHash('sha256').update(jsonStr).digest('hex'),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zaboraa-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return res.status(200).json(finalBackup);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Backup failed' });
  }
}

// 3. POST /api/upload & POST /api/upload/finalize
async function handleUpload(req: any, res: VercelResponse, path: string) {
  if (path.endsWith('/finalize')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const targetUploadId = req.body?.uploadId || req.body?.upload_id;
    if (!targetUploadId) return res.status(400).json({ error: 'Missing uploadId' });
    const supabase = req.supabase;
    const user = req.user;

    try {
      const { data: staged, error: stagedErr } = await supabase
        .from('staged_transactions')
        .select('*')
        .eq('upload_id', targetUploadId)
        .eq('user_id', user.id);

      if (stagedErr) {
        await supabase
          .from('statement_uploads')
          .update({ status: 'failed', error_message: stagedErr.message, updated_at: new Date().toISOString() })
          .eq('id', targetUploadId)
          .eq('user_id', user.id);
        return res.status(500).json({ error: stagedErr.message });
      }

      if (staged && staged.length > 0) {
        const txsToInsert = staged.map((s: any) => {
          const debitVal = s.debit !== null && s.debit !== undefined ? Number(s.debit) : null;
          const creditVal = s.credit !== null && s.credit !== undefined ? Number(s.credit) : null;
          const txnType = debitVal ? 'expense' : creditVal ? 'income' : 'expense';

          return {
            user_id: s.user_id,
            account_id: s.account_id,
            upload_id: targetUploadId,
            txn_date: s.txn_date,
            description: s.description,
            raw_description: s.raw_description || s.description,
            debit: debitVal,
            credit: creditVal,
            balance: s.balance !== null && s.balance !== undefined ? Number(s.balance) : null,
            category_id: s.category_id || s.suggested_category_id || null,
            workspace_id: s.workspace_id || null,
            txn_type: txnType,
            reference_number: s.reference_number || null,
            notes: s.notes || null,
            source_staged_id: s.id,
          };
        });

        const { error: insertErr } = await supabase.from('transactions').insert(txsToInsert);
        if (insertErr) {
          await supabase
            .from('statement_uploads')
            .update({ status: 'failed', error_message: insertErr.message, updated_at: new Date().toISOString() })
            .eq('id', targetUploadId)
            .eq('user_id', user.id);
          return res.status(500).json({ error: insertErr.message });
        }

        await supabase.from('staged_transactions').delete().eq('upload_id', targetUploadId).eq('user_id', user.id);
      }

      await supabase
        .from('statement_uploads')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', targetUploadId)
        .eq('user_id', user.id);

      return res.status(200).json({ success: true, count: staged?.length || 0 });
    } catch (err: any) {
      const errMsg = err?.message || 'Finalize failed';
      await supabase
        .from('statement_uploads')
        .update({ status: 'failed', error_message: errMsg, updated_at: new Date().toISOString() })
        .eq('id', targetUploadId)
        .eq('user_id', user.id);
      return res.status(500).json({ error: errMsg });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  return res.status(400).json({ error: 'File upload via direct JSON API is not supported. Use client parser.' });
}

// 4. PATCH /api/transactions/:id
async function handleTransactions(req: any, res: VercelResponse, path: string) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method Not Allowed' });
  const parts = path.split('/');
  const id = parts[parts.length - 1];
  if (!id || id === 'transactions') return res.status(400).json({ error: 'Missing transaction ID' });

  try {
    const supabase = req.supabase;
    const user = req.user;
    const updates = req.body || {};

    const allowedFields = ['category_id', 'workspace_id', 'description', 'notes', 'tags', 'tax_deductible', 'is_split', 'txn_date', 'debit', 'credit', 'balance', 'txn_type', 'reference_number', 'is_transfer', 'is_self_transfer', 'transfer_pair_id', 'status'];
    const filteredUpdates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) filteredUpdates[field] = updates[field];
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Update failed' });
  }
}

// 5. Payment Instructions
async function handlePaymentInstructions(req: any, res: VercelResponse, path: string) {
  const supabase = req.supabase;
  const user = req.user;

  if (path.endsWith('/reveal')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const parts = path.split('/');
    const id = parts[parts.length - 2];
    try {
      const { data, error } = await supabase
        .from('payment_instructions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (error) return res.status(404).json({ error: 'Payment instruction not found' });
      return res.status(200).json({
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        upi_id: data.upi_id,
        pan_number: data.pan_number,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Reveal failed' });
    }
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('payment_instructions')
      .select('*')
      .eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { data, error } = await supabase
      .from('payment_instructions')
      .insert({ ...req.body, user_id: user.id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    const { data, error } = await supabase
      .from('payment_instructions')
      .update(req.body)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

// 6. POST /api/profile/pan
async function handleProfilePan(req: any, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const supabase = req.supabase;
    const user = req.user;
    const { pan_number } = req.body || {};
    if (!pan_number) return res.status(400).json({ error: 'Missing pan_number' });

    const { data, error } = await supabase
      .from('profiles')
      .update({ pan_number: pan_number.trim().toUpperCase() })
      .eq('id', user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'PAN update failed' });
  }
}

// 7. Gmail Routes
async function handleGmail(req: any, res: VercelResponse, path: string) {
  const supabase = req.supabase;
  const user = req.user;

  if (path.endsWith('/status')) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    const { data } = await supabase
      .from('profiles')
      .select('gmail_connected, gmail_last_sync')
      .eq('id', user.id)
      .single();
    return res.status(200).json({
      connected: Boolean(data?.gmail_connected),
      last_sync: data?.gmail_last_sync || null,
    });
  }

  if (path.endsWith('/connect')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    return res.status(200).json({ message: 'Gmail connect flow initiated' });
  }

  if (path.endsWith('/disconnect')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    await supabase
      .from('profiles')
      .update({ gmail_connected: false, gmail_last_sync: null })
      .eq('id', user.id);
    return res.status(200).json({ success: true });
  }

  if (path.endsWith('/settings') || path.endsWith('/sync-settings')) {
    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method Not Allowed' });
    return res.status(200).json({ success: true, settings: req.body });
  }

  if (path.endsWith('/sync')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    return res.status(200).json({ success: true, message: 'Sync triggered' });
  }

  return res.status(404).json({ error: 'Gmail route not found' });
}

// 8. Analytics Routes
async function handleAnalytics(req: any, res: VercelResponse, path: string) {
  const supabase = req.supabase;
  const user = req.user;

  if (path.endsWith('/generate') || path.endsWith('/reports/generate')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    return res.status(200).json({ success: true, report: { generated_at: new Date().toISOString() } });
  }

  if (req.method === 'GET') {
    const { data: txs } = await supabase.from('transactions').select('*').eq('user_id', user.id);
    return res.status(200).json({ reports: [], transaction_count: txs?.length || 0 });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

// 9. AI Routes
async function handleAI(req: any, res: VercelResponse, path: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (path.endsWith('/test')) {
    return res.status(200).json({ status: 'ok', message: 'AI service operational' });
  }

  if (path.endsWith('/anomalies')) {
    return res.status(200).json({ anomalies: [] });
  }

  if (path.endsWith('/chat')) {
    return res.status(200).json({ response: 'AI response ready.' });
  }

  if (path.endsWith('/monthly-report')) {
    return res.status(200).json({ summary: 'Monthly report generated.' });
  }

  if (path.endsWith('/categorize')) {
    return res.status(200).json({ suggested_category_id: null });
  }

  return res.status(404).json({ error: 'AI endpoint not found' });
}

// --- Main Dispatcher ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;

  const authenticated = await authenticateRequest(req as any, res);
  if (!authenticated) return;

  const path = getUrlPath(req);

  if (path === '/api/export') return handleExport(req, res);
  if (path === '/api/backup') return handleBackup(req, res);
  if (path.startsWith('/api/upload')) return handleUpload(req, res, path);
  if (path.startsWith('/api/transactions')) return handleTransactions(req, res, path);
  if (path.startsWith('/api/payment-instructions')) return handlePaymentInstructions(req, res, path);
  if (path === '/api/profile/pan') return handleProfilePan(req, res);
  if (path.startsWith('/api/gmail')) return handleGmail(req, res, path);
  if (path.startsWith('/api/analytics')) return handleAnalytics(req, res, path);
  if (path.startsWith('/api/ai')) return handleAI(req, res, path);

  return res.status(404).json({ error: `API route not found: ${path}` });
}
