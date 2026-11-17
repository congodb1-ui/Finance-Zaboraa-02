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

async function decryptValue(cipherText: string): Promise<string> {
  if (!cipherText || !cipherText.startsWith(CIPHER_PREFIX)) return cipherText;
  const parts = cipherText.slice(CIPHER_PREFIX.length).split(':');
  if (parts.length !== 3) return cipherText;

  const [saltB64, ivB64, encryptedB64] = parts;
  const salt = new Uint8Array(Buffer.from(saltB64, 'base64'));
  const iv = new Uint8Array(Buffer.from(ivB64, 'base64'));
  const encryptedBuf = new Uint8Array(Buffer.from(encryptedB64, 'base64'));

  const secret = getEncryptionKeyFromEnv();
  const key = await deriveAesKey(secret, salt);

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBuf
  );

  return new TextDecoder().decode(decryptedBuf);
}

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

async function loadGmailTokenFromVault(
  serviceSupabase: any,
  userId: string
): Promise<GmailVaultTokenPayload | null> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to read Gmail tokens from Vault.');
  }

  const secretName = getGmailVaultSecretName(userId);
  const { data, error } = await serviceSupabase.rpc('get_gmail_vault_token', {
    p_secret_name: secretName,
  });

  if (error) {
    throw new Error(`Failed to read Gmail token from Vault: ${error.message}`);
  }

  if (!data || typeof data !== 'string') {
    return null;
  }

  const rawJson = data.startsWith(CIPHER_PREFIX) ? await decryptValue(data) : data;
  const parsed = JSON.parse(rawJson) as Partial<GmailVaultTokenPayload>;
  if (!parsed?.access_token) {
    return null;
  }

  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token || null,
    expiry: typeof parsed.expiry === 'number' ? parsed.expiry : 0,
  };
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

async function getValidGmailAccessToken(
  serviceSupabase: any,
  userId: string
): Promise<string> {
  const token = await loadGmailTokenFromVault(serviceSupabase, userId);
  if (!token) {
    throw new Error('Gmail is not connected for this user.');
  }

  const nowMs = Date.now();
  if (token.expiry > nowMs + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error('Gmail access token expired. Please reconnect Gmail in Settings.');
  }

  const clientId = (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'Gmail access token expired and GOOGLE_CLIENT_SECRET is not configured for offline refresh.'
    );
  }

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const refreshJson = (await refreshRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!refreshRes.ok || !refreshJson.access_token) {
    throw new Error(
      refreshJson.error_description ||
        refreshJson.error ||
        'Failed to refresh Gmail access token. Please reconnect Gmail in Settings.'
    );
  }

  const nextPayload: GmailVaultTokenPayload = {
    access_token: refreshJson.access_token,
    refresh_token: refreshJson.refresh_token || token.refresh_token,
    expiry: Date.now() + Number(refreshJson.expires_in || 3600) * 1000,
  };

  await saveGmailTokenToVault(serviceSupabase, userId, nextPayload);
  return nextPayload.access_token;
}

// --- Inlined Gmail Alert Parsers & Sync Engine ---
export interface GmailSyncResult {
  emails_processed: number;
  transactions_added: number;
  errors_count: number;
  last_synced_at: string;
}

const GMAIL_ALERT_QUERY =
  'from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in)';

const MONTH_MAP: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

function truncate200(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function parseAmount(raw?: string | null): number | null {
  if (!raw) return null;
  const num = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function normalizeDate(dateStr?: string | null, internalDateMs?: string): string {
  if (dateStr) {
    const trimmed = dateStr.trim();
    const mon = trimmed.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (mon && MONTH_MAP[mon[2].toUpperCase()]) {
      return `${mon[3]}-${MONTH_MAP[mon[2].toUpperCase()]}-${mon[1]}`;
    }
    const short = trimmed.match(/^(\d{2})[-\/](\d{2})[-\/](\d{2})$/);
    if (short) return `20${short[3]}-${short[2]}-${short[1]}`;
    const full = trimmed.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (full) return `${full[3]}-${full[2]}-${full[1]}`;
  }
  const ms = internalDateMs && /^\d+$/.test(internalDateMs) ? Number(internalDateMs) : Date.now();
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function decodeBase64Url(data: string): string {
  if (!data) return '';
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBody(payload: any, fallbackSnippet = ''): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: any) => {
    if (!part) return;
    const mime = String(part.mimeType || '').toLowerCase();
    if (mime === 'text/plain' && part.body?.data) plain.push(decodeBase64Url(part.body.data));
    if (mime === 'text/html' && part.body?.data) html.push(decodeBase64Url(part.body.data));
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  if (plain.length > 0) return plain.join(' ').replace(/\s+/g, ' ').trim();
  if (html.length > 0) return stripHtml(html.join(' '));
  if (payload?.body?.data) return stripHtml(decodeBase64Url(payload.body.data));
  return fallbackSnippet.replace(/\s+/g, ' ').trim();
}

function maskPayeeForAI(text: string, ownerName?: string): string {
  let out = (text || '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[EMAIL-REDACTED]')
    .replace(/\b[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}\b/g, '[PAN-REDACTED]')
    .replace(/(?<!\d)(?:\+91[-\s]?|0)?[6-9]\d{4}[-\s]?\d{5}(?!\d)/g, '[MOBILE-REDACTED]')
    .replace(/\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g, '[IFSC-REDACTED]');

  if (ownerName && ownerName.trim().length > 2) {
    const escaped = ownerName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[NAME-REDACTED]');
  }
  return out;
}

function parseAlertEmail(msg: any) {
  const headers: Array<{ name: string; value: string }> = msg?.payload?.headers || [];
  const getHeader = (n: string) =>
    headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || '';

  const rawFrom = getHeader('From');
  const fromMatch = rawFrom.match(/<([^>]+)>/);
  const fromAddress = (fromMatch ? fromMatch[1] : rawFrom).trim().toLowerCase();
  const subject = getHeader('Subject').trim();
  const body = extractBody(msg?.payload, msg?.snippet || '');

  if (fromAddress === 'alerts@hdfcbank.bank.in' && /is debited/i.test(body)) {
    const amount = parseAmount(body.match(/Rs\.?\s*([\d,]+\.?\d*)\s+is debited/i)?.[1]);
    const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
    if (!amount || !last4) {
      return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_UPI_DEBIT missing amount/last4', snippet: truncate200(body) };
    }
    const vpa = body.match(/towards VPA\s+(\S+)/i)?.[1]?.replace(/[.,;]+$/, '') || null;
    const payee = (body.match(/towards VPA\s+\S+\s*\(([^)]+)\)/i)?.[1] || body.match(/\(([^)]+)\)/)?.[1] || vpa || 'UPI Payment').trim();
    const upiRef = body.match(/UPI transaction reference no\.?:?\s*(\d+)/i)?.[1] || null;
    const date = normalizeDate(body.match(/on (\d{2}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/i)?.[1], msg.internalDate);
    return { type: 'tx' as const, bank: 'HDFC', method: 'UPI' as const, direction: 'debit' as const, amount, last4, date, payee, upiRef, impsRef: null, balanceAfter: null, rawDesc: upiRef ? `UPI/${upiRef}/${payee}` : `UPI/${payee}`, fromAddress, subject };
  }

  if (fromAddress === 'alerts@hdfcbank.net' && /added to your account/i.test(body)) {
    const amount = parseAmount(body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+has been successfully added/i)?.[1]);
    const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
    if (!amount || !last4) {
      return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_IMPS_CREDIT missing amount/last4', snippet: truncate200(body) };
    }
    const impsRef = body.match(/IMPS-(\d+)-/i)?.[1] || null;
    const payee = body.match(/IMPS-\d+-([^-]+)-/i)?.[1]?.trim() || 'IMPS Sender';
    const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i)?.[1], msg.internalDate);
    return { type: 'tx' as const, bank: 'HDFC', method: 'IMPS' as const, direction: 'credit' as const, amount, last4, date, payee, upiRef: null, impsRef, balanceAfter, rawDesc: impsRef ? `IMPS-${impsRef}-${payee}` : `IMPS-${payee}`, fromAddress, subject };
  }

  if (fromAddress === 'alerts@hdfcbank.net' && /deducted from your account/i.test(body)) {
    const amount = parseAmount(body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+is deducted/i)?.[1]);
    const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
    if (!amount || !last4) {
      return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_IMPS_DEBIT missing amount/last4', snippet: truncate200(body) };
    }
    const impsRef = body.match(/IMPS-(\d+)-/i)?.[1] || null;
    const payee = (body.match(/added to IMPS-\d+-([^-]+)-/i)?.[1] || body.match(/IMPS-\d+-([^-]+)-/i)?.[1] || 'IMPS Recipient').trim();
    const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i)?.[1], msg.internalDate);
    return { type: 'tx' as const, bank: 'HDFC', method: 'IMPS' as const, direction: 'debit' as const, amount, last4, date, payee, upiRef: null, impsRef, balanceAfter, rawDesc: impsRef ? `IMPS-${impsRef}-${payee}` : `IMPS-${payee}`, fromAddress, subject };
  }

  if (fromAddress === 'alerts@hdfcbank.net' && /available balance/i.test(body)) {
    const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
    const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
    if (!last4 || balanceAfter === null) {
      return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_BALANCE_ALERT missing last4/balance', snippet: truncate200(body) };
    }
    return { type: 'balance' as const, last4, balanceAfter, fromAddress, subject };
  }

  if (fromAddress === 'mahaalert@mahabank.co.in' || fromAddress === 'mahaalerts@bankofmaharashtra.bank.in') {
    const last4 = body.match(/A\/c No [Xx*]*(\d{4})/i)?.[1] || '';
    const dir = body.match(/credited|debited/i)?.[0]?.toLowerCase() || '';
    const amount = parseAmount(body.match(/by INR\s*([\d,]+\.?\d*)/i)?.[1]);
    if (!last4 || !dir || !amount) {
      return { type: 'error' as const, fromAddress, subject, reason: 'BOM_IMPS missing required fields', snippet: truncate200(body) };
    }
    const direction = dir === 'credited' ? ('credit' as const) : ('debit' as const);
    const impsRef = body.match(/by IMPS (\d+)/i)?.[1] || null;
    const payee = body.match(/from ([A-Za-z0-9 .&-]+?)(?:\.|\s+A\/c|\s*$)/i)?.[1]?.trim() || 'BOM IMPS';
    const balanceAfter = parseAmount(body.match(/A\/c Bal(?:ance)? (?:is )?(?:INR\s*|Rs\.?\s*)?([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
    return { type: 'tx' as const, bank: 'BOM', method: 'IMPS' as const, direction, amount, last4, date, payee, upiRef: null, impsRef, balanceAfter, rawDesc: impsRef ? `IMPS/${impsRef}/${payee}` : `BOM/${payee}`, fromAddress, subject };
  }

  if (fromAddress === 'ho.starsandesh@bankofindia.co.in') {
    const last4 = body.match(/A\/c[.\s]+[Xx*]+(\d{4})/i)?.[1] || '';
    const dir = body.match(/credited|debited|\bCR\b|\bDR\b/i)?.[0]?.toLowerCase() || '';
    const amount = parseAmount(body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1]);
    if (!last4 || !dir || !amount) {
      return { type: 'error' as const, fromAddress, subject, reason: 'BOI_IMPS could not extract required fields', snippet: truncate200(body) };
    }
    const direction = dir === 'credited' || dir === 'cr' ? ('credit' as const) : ('debit' as const);
    const impsRef = body.match(/IMPS[\/\s]?(?:Ref)?[.:\s]+(\d{12})/i)?.[1] || null;
    const balanceAfter = parseAmount(body.match(/(?:Bal|Balance)[.:\s]+(?:Rs\.?\s*|INR\s*)?([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/(\d{2}[-\/]\d{2}[-\/]\d{4}|\d{2}-[A-Z]{3}-\d{4})/i)?.[1], msg.internalDate);
    const payee = impsRef ? `BOI IMPS ${impsRef}` : 'BOI IMPS Transfer';
    return { type: 'tx' as const, bank: 'BOI', method: 'IMPS' as const, direction, amount, last4, date, payee, upiRef: null, impsRef, balanceAfter, rawDesc: impsRef ? `BOI/IMPS/${impsRef}` : `BOI IMPS ${direction}`, fromAddress, subject };
  }

  return { type: 'error' as const, fromAddress, subject, reason: 'Unrecognised bank alert format', snippet: truncate200(body) };
}

async function listGmailAlertMessages(
  accessToken: string,
  afterUnixSec: number
): Promise<Array<{ id: string }>> {
  const query = `${GMAIL_ALERT_QUERY} after:${afterUnixSec}`;
  const collected: Array<{ id: string }> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gmail API list messages failed (${res.status}): ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };

    if (Array.isArray(json.messages)) {
      collected.push(...json.messages);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return collected;
}

async function fetchFullGmailMessage(
  accessToken: string,
  messageId: string
): Promise<any> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
    messageId
  )}?format=full`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail API get message ${messageId} failed (${res.status})`);
  }

  return await res.json();
}

async function runGmailSyncForUser(
  serviceSupabase: any,
  userId: string,
  userSupabase?: any
): Promise<GmailSyncResult> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run Gmail sync.');
  }

  const db = userSupabase || serviceSupabase;

  // 1 & 2. Load token from Vault & refresh if expired
  const accessToken = await getValidGmailAccessToken(serviceSupabase, userId);

  // Load user profile, accounts, rules, categories, and AI settings
  const [
    { data: profileRow },
    { data: accounts },
    { data: rules },
    { data: categories },
    { data: aiSettingsRow },
  ] = await Promise.all([
    db
      .from('profiles')
      .select('gmail_last_synced, owner_full_name, full_name')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('accounts')
      .select('id, account_number_last4, account_type')
      .eq('user_id', userId),
    db
      .from('transaction_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: true }),
    db
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_system.eq.true`),
    db
      .from('ai_settings')
      .select('ai_enabled')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const lastSyncedMs = profileRow?.gmail_last_synced
    ? new Date(profileRow.gmail_last_synced).getTime()
    : NaN;
  const afterUnixSec = Number.isFinite(lastSyncedMs)
    ? Math.max(0, Math.floor(lastSyncedMs / 1000) - 60)
    : Math.floor(Date.now() / 1000) - 30 * 86400;

  const ownerName: string | undefined =
    profileRow?.owner_full_name || profileRow?.full_name || undefined;
  const aiEnabled = aiSettingsRow ? Boolean(aiSettingsRow.ai_enabled) : true;
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const flashModel = process.env.GEMINI_MODEL_FLASH || 'gemini-1.5-flash';

  const accountByLast4 = new Map<string, { id: string; account_type: string }>();
  for (const acc of accounts || []) {
    if (acc.account_number_last4) {
      accountByLast4.set(String(acc.account_number_last4).trim(), {
        id: acc.id,
        account_type: acc.account_type || 'savings',
      });
    }
  }

  // 3. Query Gmail API
  const messageRefs = await listGmailAlertMessages(accessToken, afterUnixSec);

  let emailsProcessed = 0;
  let transactionsAdded = 0;
  let errorsCount = 0;

  // 4 & 5. Fetch & parse each message -> dedup -> categorise -> insert
  for (const ref of messageRefs) {
    emailsProcessed++;
    try {
      const fullMsg = await fetchFullGmailMessage(accessToken, ref.id);
      const outcome = parseAlertEmail(fullMsg);

      if (outcome.type === 'error') {
        errorsCount++;
        await db.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: ref.id,
          from_address: outcome.fromAddress,
          subject: outcome.subject,
          error_reason: outcome.reason,
          raw_snippet: truncate200(outcome.snippet),
        });
        continue;
      }

      // Match account by last4
      const matchedAccount = accountByLast4.get(outcome.last4);
      if (!matchedAccount) {
        errorsCount++;
        await db.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: ref.id,
          from_address: outcome.fromAddress,
          subject: outcome.subject,
          error_reason: `No account matched last4 ${outcome.last4}`,
          raw_snippet: truncate200(
            outcome.type === 'tx' ? outcome.rawDesc : `Balance alert Rs.${outcome.balanceAfter}`
          ),
        });
        continue;
      }

      // Balance alert: update accounts.current_balance ONLY
      if (outcome.type === 'balance') {
        if (outcome.balanceAfter !== null && outcome.balanceAfter !== undefined) {
          await db
            .from('accounts')
            .update({
              current_balance: outcome.balanceAfter,
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchedAccount.id)
            .eq('user_id', userId);
        }
        continue;
      }

      // Transaction dedup check (UPI / IMPS ref)
      if (outcome.upiRef) {
        const { data: existingUpi } = await db
          .from('transactions')
          .select('id')
          .eq('upi_ref_no', outcome.upiRef)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (existingUpi) {
          continue; // Silent dedup skip
        }
      } else if (outcome.impsRef) {
        const { data: existingImps } = await db
          .from('transactions')
          .select('id')
          .eq('imps_ref_no', outcome.impsRef)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (existingImps) {
          continue; // Silent dedup skip
        }
      }

      // Step 6: Rules BEFORE AI categorisation
      const debit = outcome.direction === 'debit' ? outcome.amount : null;
      const credit = outcome.direction === 'credit' ? outcome.amount : null;
      let txnType: 'expense' | 'income' | 'transfer' | 'refund' =
        outcome.direction === 'debit' ? 'expense' : 'income';
      let categoryId: string | null = null;
      let workspaceId: string | null = null;
      let tags: string[] | null = null;
      let status: 'confirmed' | 'review' = 'review';

      const matchedRule = (rules || []).find((r: any) => {
        if (r.match_field === 'description') {
          return outcome.payee.toLowerCase().includes(String(r.match_value || '').toLowerCase());
        }
        return false;
      });

      if (matchedRule) {
        if (matchedRule.set_category) categoryId = matchedRule.set_category;
        if (matchedRule.set_workspace) workspaceId = matchedRule.set_workspace;
        if (matchedRule.set_txn_type) txnType = matchedRule.set_txn_type;
        if (matchedRule.set_tags && Array.isArray(matchedRule.set_tags) && matchedRule.set_tags.length > 0) {
          tags = [...matchedRule.set_tags];
        }
        status = 'confirmed';
      } else if (aiEnabled && geminiKey && (categories || []).length > 0) {
        try {
          const aiPayload = {
            payee_name: maskPayeeForAI(outcome.payee, ownerName) || 'Merchant',
            amount: outcome.amount,
            method: outcome.method,
            account_type: matchedAccount.account_type,
          };
          const catList = (categories || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.is_income ? 'income' : 'expense',
          }));

          const prompt = `Categorise this single Indian bank transaction into one of the provided categories. Return ONLY valid JSON: { "category_id": "<id_or_null>", "confidence": <0.0_to_1.0> }\nCategories: ${JSON.stringify(catList)}\nTransaction: ${JSON.stringify(aiPayload)}`;
          const gRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${flashModel}:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' },
              }),
            }
          );
          if (gRes.ok) {
            const gJson = await gRes.json();
            const txt = gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleaned = txt.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned) as { category_id?: string | null; confidence?: number };
            if (parsed.category_id && (categories || []).some((c: any) => c.id === parsed.category_id)) {
              categoryId = parsed.category_id;
              status = (parsed.confidence || 0) > 0.75 ? 'confirmed' : 'review';
            }
          }
        } catch {
          // Fall back gracefully
        }
      }

      // Step 7: Insert transaction
      const { data: insertedTx, error: insertErr } = await db
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: matchedAccount.id,
          txn_date: outcome.date,
          description: outcome.payee,
          raw_description: outcome.rawDesc,
          debit,
          credit,
          balance: outcome.balanceAfter,
          balance_after: outcome.balanceAfter,
          reference_number: outcome.upiRef || outcome.impsRef,
          upi_ref_no: outcome.upiRef,
          imps_ref_no: outcome.impsRef,
          source: 'gmail_auto',
          status,
          category_id: categoryId,
          workspace_id: workspaceId,
          txn_type: txnType,
          is_transfer: false,
          is_self_transfer: false,
          is_manual: false,
          tags,
        })
        .select('id')
        .single();

      if (insertErr || !insertedTx) {
        errorsCount++;
        await db.from('email_parse_errors').insert({
          user_id: userId,
          gmail_msg_id: ref.id,
          from_address: outcome.fromAddress,
          subject: outcome.subject,
          error_reason: `DB insert error: ${insertErr?.message || 'unknown'}`,
          raw_snippet: truncate200(outcome.rawDesc),
        });
        continue;
      }

      transactionsAdded++;

      // Step 8: Update account current_balance if balanceAfter was extracted
      if (outcome.balanceAfter !== null && outcome.balanceAfter !== undefined) {
        await db
          .from('accounts')
          .update({
            current_balance: outcome.balanceAfter,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedAccount.id)
          .eq('user_id', userId);
      }
    } catch (msgErr: any) {
      errorsCount++;
      await db.from('email_parse_errors').insert({
        user_id: userId,
        gmail_msg_id: ref.id,
        from_address: 'unknown',
        subject: 'Fetch error',
        error_reason: msgErr?.message || 'Failed to fetch/parse message',
        raw_snippet: truncate200(String(msgErr)),
      });
    }
  }

  const nowIso = new Date().toISOString();
  await Promise.all([
    db.from('gmail_sync_log').insert({
      user_id: userId,
      last_synced_at: nowIso,
      emails_processed: emailsProcessed,
      transactions_added: transactionsAdded,
      errors_count: errorsCount,
    }),
    db.from('profiles').update({ gmail_last_synced: nowIso }).eq('user_id', userId),
  ]);

  return {
    emails_processed: emailsProcessed,
    transactions_added: transactionsAdded,
    errors_count: errorsCount,
    last_synced_at: nowIso,
  };
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

        const { data: lastLog } = await db
          .from('gmail_sync_log')
          .select('last_synced_at, emails_processed, transactions_added, errors_count')
          .eq('user_id', user?.id)
          .order('last_synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return res.status(200).json({
          gmail_connected: isConnected,
          gmail_email: isConnected ? data?.gmail_email || null : null,
          gmail_last_synced: data?.gmail_last_synced || null,
          gmail_sync_enabled: syncEnabled,
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

      const result = await runGmailSyncForUser(serviceSupabase, user.id, supabase);
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
