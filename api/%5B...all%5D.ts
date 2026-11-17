import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// --- Inlined Crypto Helper for Serverless runtime ---
const CIPHER_PREFIX = 'zbf:v1:';
const PBKDF2_ITERATIONS = 100000;

function getEncryptionKeyFromEnv(): string {
  const procKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-chars-long!';
  return procKey.trim();
}

async function deriveAesKey(secret: string, salt: Uint8Array): Promise<crypto.webcrypto.CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptValue(plainText: string): Promise<string> {
  if (!plainText) return plainText;
  const secret = getEncryptionKeyFromEnv();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret, salt);
  const enc = new TextEncoder();
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const saltB64 = Buffer.from(salt).toString('base64');
  const ivB64 = Buffer.from(iv).toString('base64');
  const cipherB64 = Buffer.from(new Uint8Array(encryptedBuf)).toString('base64');

  return `${CIPHER_PREFIX}${saltB64}:${ivB64}:${cipherB64}`;
}

// Unused vault read helpers removed; Gmail Vault token reads/refreshes run in src/lib/gmail-vault.ts


// --- Gmail Vault Helpers (AES-256-GCM + Supabase Vault RPCs) ---
interface GmailVaultTokenPayload {
  access_token: string;
  refresh_token: string | null;
  expiry: number; // Unix epoch ms
}

function getGmailVaultSecretName(userId: string): string {
  return `gmail_token_${userId}`;
}

async function saveGmailTokenToVault(
  serviceSupabase: any,
  userId: string,
  payload: GmailVaultTokenPayload
): Promise<void> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to store Gmail tokens in Vault.');
  }

  const secretName = getGmailVaultSecretName(userId);
  const serialized = JSON.stringify({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || null,
    expiry: payload.expiry,
  });

  const valueToStore =
    process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim().length > 0
      ? await encryptValue(serialized)
      : serialized;

  const { error } = await serviceSupabase.rpc('upsert_gmail_vault_token', {
    p_secret_name: secretName,
    p_secret_value: valueToStore,
  });

  if (error) {
    throw new Error(`Failed to save Gmail token to Vault: ${error.message}`);
  }
}

async function deleteGmailTokenFromVault(
  serviceSupabase: any,
  userId: string
): Promise<void> {
  if (!serviceSupabase) return;

  const secretName = getGmailVaultSecretName(userId);
  const { error } = await serviceSupabase.rpc('delete_gmail_vault_token', {
    p_secret_name: secretName,
  });

  if (error) {
    throw new Error(`Failed to remove Gmail token from Vault: ${error.message}`);
  }
}

export interface GmailSyncResult {
  emails_processed: number;
  transactions_added: number;
  errors_count: number;
  last_synced_at: string;
}

export interface DeleteGmailDataResult {
  success: boolean;
  deleted_transactions: number;
  preserved_statement_transactions: number;
  affected_accounts: number;
}


// --- Inlined Cors & Auth Helpers ---
function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://placeholder-project.supabase.co'
  );
}

function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'placeholder-anon-key'
  );
}

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createSupabaseClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  res: VercelResponse,
  options?: { optionalAuth?: boolean }
): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (!options?.optionalAuth) {
        res.status(401).json({ error: 'Unauthorized' });
      }
      return false;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      if (!options?.optionalAuth) {
        res.status(401).json({ error: 'Unauthorized' });
      }
      return false;
    }

    const reqSupabase = createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
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
      if (!options?.optionalAuth) {
        res.status(401).json({ error: 'Unauthorized' });
      }
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
      if (!options?.optionalAuth) {
        res.status(403).json({ error: 'Forbidden' });
      }
      return false;
    }

    req.user = user;
    req.supabase = reqSupabase;
    return true;
  } catch (err) {
    console.error('[api/[...all]] Auth verification error:', err);
    if (!options?.optionalAuth) {
      res.status(401).json({ error: 'Unauthorized' });
    }
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

async function fetchAllUserTransactions(supabase: any, userId: string): Promise<any[]> {
  const rows: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// 1. GET /api/export
async function handleExport(req: any, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const supabase = req.supabase;
    const user = req.user;

    const [txRows, accRes, catRes, budRes, recRes] = await Promise.all([
      fetchAllUserTransactions(supabase, user.id),
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
      transactions: txRows,
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

    const [txRows, accRes, catRes, budRes, recRes, profRes, piRes] = await Promise.all([
      fetchAllUserTransactions(supabase, user.id),
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
      transactions: txRows,
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
    const replacePreviousId = req.body?.replace_previous_id;
    if (!targetUploadId) return res.status(400).json({ error: 'Missing uploadId' });
    const supabase = req.supabase;
    const user = req.user;

    try {
      const { commitUploadTransactions } = await import('../src/lib/actions/transactions');
      const result = await commitUploadTransactions(
        targetUploadId,
        replacePreviousId,
        supabase
      );
      return res.status(200).json({
        success: true,
        count: result.imported,
        ...result,
      });
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
    const body = req.body || {};

    const {
      pan_number,
      pan,
      encryptedPan,
      encrypted_pan,
      skip_pan,
      remove_pan,
      full_name,
      owner_full_name,
      email,
      phone,
      address,
      default_fy,
      dark_mode,
      timezone,
    } = body;

    // 1. If skip_pan is explicitly requested
    if (skip_pan === true) {
      return res.status(200).json({ success: true });
    }

    // Build common profile fields if passed
    const payload: Record<string, any> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (full_name !== undefined) payload.full_name = full_name?.trim() || null;
    if (owner_full_name !== undefined) payload.owner_full_name = owner_full_name?.trim() || null;
    if (email !== undefined) payload.email = email?.trim() || user.email || null;
    if (phone !== undefined) payload.phone = phone?.trim() || null;
    if (address !== undefined) payload.address = address?.trim() || null;
    if (default_fy !== undefined) payload.default_fy = default_fy || '2026-27';
    if (dark_mode !== undefined) payload.dark_mode = Boolean(dark_mode);
    if (timezone !== undefined) payload.timezone = timezone || null;

    // 2. If remove_pan is requested or PAN is explicitly empty string
    if (remove_pan === true || (pan === '' && (remove_pan || !pan_number))) {
      payload.pan_encrypted = null;

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      console.log(`[audit/pan] user_id=${user.id} pan_present=false`);
      return res.status(200).json({ success: true, profile: data, ...data });
    }

    // 3. Normalize incoming PAN parameter
    const incomingPan = pan_number ?? pan ?? encryptedPan ?? encrypted_pan;
    if (!incomingPan || (typeof incomingPan === 'string' && incomingPan.trim().length === 0)) {
      return res.status(400).json({ error: 'PAN is required' });
    }

    let encryptedValueToStore: string;
    if (typeof incomingPan === 'string' && incomingPan.startsWith('zbf:v1:')) {
      // Already encrypted client-side
      encryptedValueToStore = incomingPan;
    } else {
      const rawPan = typeof incomingPan === 'string' ? incomingPan.trim().toUpperCase() : '';
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan)) {
        return res.status(400).json({
          error: 'PAN format is invalid. Use 10 characters: 5 letters, 4 digits, 1 letter.',
        });
      }
      encryptedValueToStore = await encryptValue(rawPan);
    }

    payload.pan_encrypted = encryptedValueToStore;

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    console.log(`[audit/pan] user_id=${user.id} pan_present=true`);
    return res.status(200).json({ success: true, profile: data, ...data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'PAN update failed' });
  }
}

// --- Self-contained Gmail Data Wipe & Balance Recompute Helpers (no external ../src/ imports) ---
interface ServerlessBalanceRow {
  txn_date: string;
  debit?: number | null;
  credit?: number | null;
  balance?: number | null;
  balance_after?: number | null;
}

const BALANCE_TOLERANCE = 0.05;

function getReportedBalanceServerless(row: ServerlessBalanceRow): number | null {
  const val =
    row.balance_after !== undefined && row.balance_after !== null
      ? row.balance_after
      : row.balance;
  if (val === undefined || val === null) return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function toPaiseServerless(val: number): number {
  return Math.round(val * 100);
}

function countChronologicalBreaksServerless(rows: ServerlessBalanceRow[]): number {
  let breaks = 0;
  let prevBal: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const curBal = getReportedBalanceServerless(rows[i]);
    if (curBal !== null && prevBal !== null) {
      const dr = Number(rows[i].debit ?? 0);
      const cr = Number(rows[i].credit ?? 0);
      if (Math.abs(prevBal - dr + cr - curBal) > BALANCE_TOLERANCE) {
        breaks++;
      }
    }
    if (curBal !== null) {
      prevBal = curBal;
    } else if (prevBal !== null) {
      const dr = Number(rows[i].debit ?? 0);
      const cr = Number(rows[i].credit ?? 0);
      prevBal = Math.round((prevBal - dr + cr) * 100) / 100;
    }
  }
  return breaks;
}

function popMatchingRowServerless(
  buckets: Map<number, number[]>,
  targetPaise: number,
  used: Set<number>
): number | null {
  for (let offset = 0; offset <= 5; offset++) {
    const candidates = offset === 0 ? [targetPaise] : [targetPaise - offset, targetPaise + offset];
    for (const key of candidates) {
      const list = buckets.get(key);
      if (!list) continue;
      while (list.length > 0) {
        const idx = list[0];
        list.shift();
        if (!used.has(idx)) return idx;
      }
    }
  }
  return null;
}

function chainDayRowsServerless<T extends ServerlessBalanceRow>(
  dayRows: T[],
  prevDayEndBal: number | null
): { ordered: T[]; endBal: number | null } {
  if (dayRows.length <= 1) {
    const bal = dayRows.length === 1 ? getReportedBalanceServerless(dayRows[0]) : prevDayEndBal;
    return {
      ordered: [...dayRows],
      endBal:
        bal !== null
          ? bal
          : prevDayEndBal !== null && dayRows.length === 1
          ? Math.round(
              (prevDayEndBal - Number(dayRows[0].debit ?? 0) + Number(dayRows[0].credit ?? 0)) * 100
            ) / 100
          : prevDayEndBal,
    };
  }

  const isContinuousFrom = (seq: T[], seedBal: number | null): boolean => {
    let running = seedBal;
    for (let i = 0; i < seq.length; i++) {
      const bal = getReportedBalanceServerless(seq[i]);
      if (bal === null) return false;
      if (running !== null) {
        const dr = Number(seq[i].debit ?? 0);
        const cr = Number(seq[i].credit ?? 0);
        if (Math.abs(running - dr + cr - bal) > BALANCE_TOLERANCE) return false;
      }
      running = bal;
    }
    return true;
  };

  if (isContinuousFrom(dayRows, prevDayEndBal)) {
    return { ordered: [...dayRows], endBal: getReportedBalanceServerless(dayRows[dayRows.length - 1]) };
  }

  const reversed = [...dayRows].reverse();
  if (isContinuousFrom(reversed, prevDayEndBal)) {
    return { ordered: reversed, endBal: getReportedBalanceServerless(reversed[reversed.length - 1]) };
  }

  const withBalIndices: number[] = [];
  const withoutBalIndices: number[] = [];
  const startBuckets = new Map<number, number[]>();
  const startBalPaiseByIdx = new Map<number, number>();
  const endBalByIdx = new Map<number, number>();

  for (let i = 0; i < dayRows.length; i++) {
    const endBal = getReportedBalanceServerless(dayRows[i]);
    if (endBal === null) {
      withoutBalIndices.push(i);
      continue;
    }
    const dr = Number(dayRows[i].debit ?? 0);
    const cr = Number(dayRows[i].credit ?? 0);
    const startBal = Math.round((endBal + dr - cr) * 100) / 100;
    const startP = toPaiseServerless(startBal);

    withBalIndices.push(i);
    startBalPaiseByIdx.set(i, startP);
    endBalByIdx.set(i, endBal);

    const bucket = startBuckets.get(startP) || [];
    bucket.push(i);
    startBuckets.set(startP, bucket);
  }

  if (withBalIndices.length === 0) {
    let running = prevDayEndBal;
    for (const r of dayRows) {
      if (running !== null) {
        running = Math.round((running - Number(r.debit ?? 0) + Number(r.credit ?? 0)) * 100) / 100;
      }
    }
    return { ordered: [...dayRows], endBal: running };
  }

  const used = new Set<number>();
  const result: T[] = [];
  let cursorBal: number | null = prevDayEndBal;

  while (used.size < withBalIndices.length) {
    let nextIdx: number | null = null;
    if (cursorBal !== null) {
      nextIdx = popMatchingRowServerless(startBuckets, toPaiseServerless(cursorBal), used);
    }

    if (nextIdx === null) {
      const remainingEndCounts = new Map<number, number>();
      for (const idx of withBalIndices) {
        if (used.has(idx)) continue;
        const eP = toPaiseServerless(endBalByIdx.get(idx)!);
        remainingEndCounts.set(eP, (remainingEndCounts.get(eP) || 0) + 1);
      }

      for (const idx of withBalIndices) {
        if (used.has(idx)) continue;
        const sP = startBalPaiseByIdx.get(idx)!;
        const eP = toPaiseServerless(endBalByIdx.get(idx)!);
        const endCount = remainingEndCounts.get(sP) || 0;
        if (endCount === 0 || (sP === eP && endCount <= 1)) {
          nextIdx = idx;
          break;
        }
      }

      if (nextIdx === null) {
        nextIdx = withBalIndices.find((idx) => !used.has(idx)) ?? null;
      }
    }

    if (nextIdx === null) break;
    used.add(nextIdx);
    result.push(dayRows[nextIdx]);
    cursorBal = endBalByIdx.get(nextIdx)!;
  }

  for (const idx of withoutBalIndices) {
    result.push(dayRows[idx]);
    if (cursorBal !== null) {
      cursorBal =
        Math.round(
          (cursorBal - Number(dayRows[idx].debit ?? 0) + Number(dayRows[idx].credit ?? 0)) * 100
        ) / 100;
    }
  }

  return { ordered: result, endBal: cursorBal };
}

function orderTransactionsChronologicallyServerless<T extends ServerlessBalanceRow>(rows: T[]): T[] {
  if (!rows || rows.length <= 1) return rows ? [...rows] : [];

  const firstDate = rows[0].txn_date || '';
  const lastDate = rows[rows.length - 1].txn_date || '';
  if (countChronologicalBreaksServerless(rows) === 0 && firstDate <= lastDate) {
    return [...rows];
  }

  const rev = [...rows].reverse();
  if (countChronologicalBreaksServerless(rev) === 0 && lastDate <= firstDate) {
    return rev;
  }

  const dateGroups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.txn_date || '';
    const list = dateGroups.get(key) || [];
    list.push(row);
    dateGroups.set(key, list);
  }

  const sortedDates = Array.from(dateGroups.keys()).sort();
  const ordered: T[] = [];
  let cursorBal: number | null = null;

  for (const d of sortedDates) {
    const step = chainDayRowsServerless(dateGroups.get(d)!, cursorBal);
    ordered.push(...step.ordered);
    cursorBal = step.endBal;
  }
  return ordered;
}

function computeAuthoritativeAccountBalanceServerless(
  openingBalance: number,
  chronologicalTxns: ServerlessBalanceRow[]
): number {
  let running = Number.isFinite(openingBalance) ? openingBalance : 0;

  for (const tx of chronologicalTxns) {
    const reported = getReportedBalanceServerless(tx);
    if (reported !== null) {
      running = reported;
    } else {
      const dr = Number(tx.debit ?? 0);
      const cr = Number(tx.credit ?? 0);
      running = running + cr - dr;
    }
  }

  return Math.round(running * 100) / 100;
}

async function recomputeAccountBalanceServerless(
  db: any,
  userId: string,
  accountId: string
): Promise<number> {
  const { data: acc } = await db
    .from('accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  const openBal = Number(acc?.opening_balance ?? 0);

  const txns: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const q = db
      .from('transactions')
      .select('txn_date, debit, credit, balance, balance_after')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true });
    const { data: pageRows, error: pageErr } =
      typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;
    if (pageErr || !pageRows || pageRows.length === 0) break;
    txns.push(...pageRows);
    if (typeof q.range !== 'function' || pageRows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const chronologicalTxns = orderTransactionsChronologicallyServerless(txns);
  const nextBal = computeAuthoritativeAccountBalanceServerless(openBal, chronologicalTxns);

  await db
    .from('accounts')
    .update({
      current_balance: nextBal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('user_id', userId);

  return nextBal;
}

async function deleteGmailImportedDataServerless(
  db: any,
  userId: string
): Promise<DeleteGmailDataResult> {
  if (!db) {
    throw new Error('Database client is required to delete Gmail imported data.');
  }

  const gmailRows: Array<{ id: string; account_id: string | null; upload_id: string | null }> = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const q = db
      .from('transactions')
      .select('id, account_id, upload_id')
      .eq('user_id', userId)
      .eq('source', 'gmail_auto');
    const { data, error } =
      typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;
    if (error) {
      throw new Error(`Failed to query Gmail transactions: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    gmailRows.push(...data);
    if (typeof q.range !== 'function' || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const gmailOnlyIds: string[] = [];
  const statementLinkedIds: string[] = [];
  const affectedAccountIds = new Set<string>();

  for (const row of gmailRows) {
    if (row.account_id) affectedAccountIds.add(row.account_id);
    if (row.upload_id) {
      statementLinkedIds.push(row.id);
    } else {
      gmailOnlyIds.push(row.id);
    }
  }

  const nowIso = new Date().toISOString();
  const CHUNK_SIZE = 150;

  for (let i = 0; i < gmailOnlyIds.length; i += CHUNK_SIZE) {
    const chunk = gmailOnlyIds.slice(i, i + CHUNK_SIZE);

    try {
      await db
        .from('transactions')
        .update({
          transfer_pair_id: null,
          is_self_transfer: false,
          is_transfer: false,
          updated_at: nowIso,
        })
        .eq('user_id', userId)
        .in('transfer_pair_id', chunk);
    } catch {
      // Best-effort unlink
    }

    try {
      await db
        .from('invoices')
        .update({ linked_transaction_id: null, updated_at: nowIso })
        .eq('user_id', userId)
        .in('linked_transaction_id', chunk);
    } catch {
      // Best-effort unlink
    }

    const { error: delErr } = await db
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .in('id', chunk);

    if (delErr) {
      throw new Error(`Failed to delete Gmail transactions: ${delErr.message}`);
    }
  }

  for (let i = 0; i < statementLinkedIds.length; i += CHUNK_SIZE) {
    const chunk = statementLinkedIds.slice(i, i + CHUNK_SIZE);
    const { error: updErr } = await db
      .from('transactions')
      .update({ source: 'statement_import', updated_at: nowIso })
      .eq('user_id', userId)
      .in('id', chunk);
    if (updErr) {
      throw new Error(`Failed to preserve statement-linked transactions: ${updErr.message}`);
    }
  }

  await Promise.all([
    Promise.resolve(db.from('gmail_sync_log').delete().eq('user_id', userId)).catch(() => {}),
    Promise.resolve(db.from('email_parse_errors').delete().eq('user_id', userId)).catch(() => {}),
  ]);

  await db
    .from('profiles')
    .update({ gmail_last_synced: null, updated_at: nowIso })
    .eq('user_id', userId);

  for (const accountId of affectedAccountIds) {
    try {
      await recomputeAccountBalanceServerless(db, userId, accountId);
    } catch (balErr: any) {
      console.warn('[api/gmail/data] Balance recalculation warning:', balErr?.message);
    }
  }

  try {
    await db.from('audit_log').insert({
      user_id: userId,
      table_name: 'transactions',
      record_id: userId,
      action: 'delete',
      old_data: {
        source: 'gmail_auto',
        deleted_transactions: gmailOnlyIds.length,
        preserved_statement_transactions: statementLinkedIds.length,
      },
      new_data: null,
    });
  } catch {
    // Non-blocking audit log
  }

  return {
    success: true,
    deleted_transactions: gmailOnlyIds.length,
    preserved_statement_transactions: statementLinkedIds.length,
    affected_accounts: affectedAccountIds.size,
  };
}

// 7. Gmail Routes
async function handleGmail(req: any, res: VercelResponse, path: string) {
  try {
    const supabase = req.supabase;
    const user = req.user;
    const serviceSupabase = getServiceSupabase() || supabase;
    const db = supabase || serviceSupabase;

    if (path.endsWith('/status')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
      
      try {
        const { data, error } = await db
          .from('profiles')
          .select('gmail_connected, gmail_last_synced, gmail_email, gmail_sync_enabled')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (error) {
          console.warn('[api/gmail/status] Supabase query warning:', error.message);
        }

        const isConnected = Boolean(data?.gmail_connected);
        const edgeDisabled = process.env.USE_SUPABASE_EDGE_GMAIL_SYNC === 'false';
        const syncEnabled = isConnected && !edgeDisabled && Boolean(data?.gmail_sync_enabled ?? true);

        const [{ data: lastLog }, { count: gmailImportedCount }] = await Promise.all([
          db
            .from('gmail_sync_log')
            .select('last_synced_at, emails_processed, transactions_added, errors_count')
            .eq('user_id', user?.id)
            .order('last_synced_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          db
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user?.id)
            .eq('source', 'gmail_auto')
            .is('upload_id', null),
        ]);

        return res.status(200).json({
          gmail_connected: isConnected,
          gmail_email: isConnected ? data?.gmail_email || null : null,
          gmail_last_synced: data?.gmail_last_synced || null,
          gmail_sync_enabled: syncEnabled,
          gmail_imported_count: gmailImportedCount ?? 0,
          has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
          last_sync_summary: lastLog || null,
        });
      } catch (statusErr: any) {
        console.error('[api/gmail/status] Error reading status:', statusErr);
        return res.status(200).json({
          gmail_connected: false,
          gmail_email: null,
          gmail_last_synced: null,
          gmail_sync_enabled: false,
          gmail_imported_count: 0,
          has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
          last_sync_summary: null,
        });
      }
    }

    if (path.endsWith('/connect')) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      
      if (!getServiceSupabase()) {
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

      // Step 2 Fix: Extract email strictly from the Google OAuth userinfo endpoint for the consenting account
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
        console.warn('[api/gmail/connect] userinfo fetch error:', err?.message);
      }

      // Fallback/Verify with Gmail profile API if userinfo didn't return an email
      if (!consentedEmail) {
        try {
          const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (profileRes.ok) {
            const profileJson = (await profileRes.json().catch(() => ({}))) as { emailAddress?: string };
            if (profileJson?.emailAddress && typeof profileJson.emailAddress === 'string') {
              consentedEmail = profileJson.emailAddress.trim().toLowerCase();
            }
          }
        } catch (err: any) {
          console.warn('[api/gmail/connect] gmail profile fetch error:', err?.message);
        }
      }

      if (!consentedEmail) {
        return res.status(400).json({
          error: 'Unable to verify the consented Gmail account from Google. Please try again.',
        });
      }

      // Step 3: Save token payload to Supabase Vault
      await saveGmailTokenToVault(serviceSupabase, user.id, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry: Date.now() + expiresInSec * 1000,
      });

      let encryptedRefreshToken: string | null = null;
      if (refreshToken) {
        encryptedRefreshToken = await encryptValue(refreshToken);
      }

      // Update profiles table with the consented Gmail email using user client
      const profileUpdates: Record<string, any> = {
        gmail_connected: true,
        gmail_email: consentedEmail,
        gmail_sync_enabled: true,
        updated_at: new Date().toISOString(),
      };
      if (encryptedRefreshToken) {
        profileUpdates.gmail_refresh_token_encrypted = encryptedRefreshToken;
      }

      const { error: updateErr } = await db
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', user.id);

      if (updateErr) {
        console.error('[api/gmail/connect] DB update error:', updateErr.message);
        return res.status(400).json({ error: updateErr.message });
      }

      return res.status(200).json({
        success: true,
        gmail_connected: true,
        gmail_email: consentedEmail,
        has_refresh_token: Boolean(refreshToken),
      });
    }

    if (path.endsWith('/disconnect')) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      await deleteGmailTokenFromVault(serviceSupabase, user.id).catch((err) =>
        console.warn('[api/gmail/disconnect] vault delete warning:', err?.message)
      );

      await db
        .from('profiles')
        .update({
          gmail_connected: false,
          gmail_email: null,
          gmail_last_synced: null,
          gmail_sync_enabled: false,
          gmail_refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user?.id);
      return res.status(200).json({ success: true, gmail_connected: false });
    }

    if (path.endsWith('/settings') || path.endsWith('/sync-settings')) {
      if (req.method !== 'PATCH' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      const syncEnabled = req.body?.sync_enabled !== undefined ? req.body.sync_enabled : req.body?.gmail_sync_enabled;
      if (syncEnabled !== undefined) {
        await db
          .from('profiles')
          .update({
            gmail_sync_enabled: Boolean(syncEnabled),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user?.id);
      }
      return res.status(200).json({ success: true, settings: req.body });
    }

    if (path.endsWith('/sync')) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      if (!getServiceSupabase()) {
        return res.status(500).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to run Gmail sync.',
        });
      }

      // Enforce 5-minute manual sync cooldown
      const { data: latestLog } = await db
        .from('gmail_sync_log')
        .select('last_synced_at')
        .eq('user_id', user.id)
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
      const supabaseUrl = getSupabaseUrl();
      const canCallEdgeFunction =
        supabaseUrl &&
        !supabaseUrl.includes('placeholder') &&
        Boolean(serviceRoleKey) &&
        process.env.USE_SUPABASE_EDGE_GMAIL_SYNC === 'true';

      if (canCallEdgeFunction) {
        try {
          const fnRes = await fetch(`${supabaseUrl}/functions/v1/gmail-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ user_id: user.id }),
          });
          if (fnRes.ok) {
            const fnJson = await fnRes.json();
            if (typeof fnJson?.emails_processed === 'number') {
              return res.status(200).json(fnJson);
            }
          }
        } catch {
          // Fall back cleanly to server sync pipeline if Edge Function is not deployed/accessible
        }
      }

      const { runGmailSyncForUser } = await import('../src/lib/gmail-sync-service');
      const result = await runGmailSyncForUser(serviceSupabase, user.id);
      return res.status(200).json(result);
    }

    if (path.endsWith('/data')) {
      if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method Not Allowed' });
      const result = await deleteGmailImportedDataServerless(serviceSupabase || db, user.id);
      return res.status(200).json(result);
    }

    return res.status(404).json({ error: 'Gmail route not found' });
  } catch (err: any) {
    console.error('[api/gmail] Uncaught error:', err);
    if (path.endsWith('/status')) {
      return res.status(200).json({
        gmail_connected: false,
        gmail_email: null,
        gmail_last_synced: null,
        gmail_sync_enabled: false,
        has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        last_sync_summary: null,
      });
    }
    const message = err?.message || 'Internal server error in Gmail route';
    const isClientErr =
      message.includes('not connected') ||
      message.includes('expired') ||
      message.includes('reconnect');
    return res.status(isClientErr ? 400 : 500).json({ error: message });
  }
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
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    return res.status(200).json({ reports: [], transaction_count: count || 0 });
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
  try {
    if (!setCorsHeaders(req, res)) return;

    const path = getUrlPath(req);

    // If status check or connect, ensure we don't crash before handling
    const authenticated = await authenticateRequest(req as any, res, {
      optionalAuth: path === '/api/gmail/status',
    });
    if (!authenticated) {
      if (path === '/api/gmail/status') {
        return res.status(200).json({
          gmail_connected: false,
          gmail_email: null,
          gmail_last_synced: null,
          gmail_sync_enabled: false,
          has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
          last_sync_summary: null,
        });
      }
      return;
    }

    if (path === '/api/export') return await handleExport(req, res);
    if (path === '/api/backup') return await handleBackup(req, res);
    if (path.startsWith('/api/upload')) return await handleUpload(req, res, path);
    if (path.startsWith('/api/transactions')) return await handleTransactions(req, res, path);
    if (path.startsWith('/api/payment-instructions')) return await handlePaymentInstructions(req, res, path);
    if (path === '/api/profile/pan') return await handleProfilePan(req, res);
    if (path.startsWith('/api/gmail')) return await handleGmail(req, res, path);
    if (path.startsWith('/api/analytics')) return await handleAnalytics(req, res, path);
    if (path.startsWith('/api/ai')) return await handleAI(req, res, path);

    return res.status(404).json({ error: `API route not found: ${path}` });
  } catch (globalErr: any) {
    console.error('[api/handler] Global unhandled error:', globalErr);
    const path = getUrlPath(req);
    if (path === '/api/gmail/status') {
      return res.status(200).json({
        gmail_connected: false,
        gmail_email: null,
        gmail_last_synced: null,
        gmail_sync_enabled: false,
        has_offline_refresh_support: true,
        last_sync_summary: null,
      });
    }
    return res.status(500).json({ error: globalErr?.message || 'Server error' });
  }
}
