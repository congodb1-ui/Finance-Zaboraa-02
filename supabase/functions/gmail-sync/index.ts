// Supabase Edge Function: gmail-sync
// Cron schedule: "0 */6 * * *" (every 6 hours)
// Also callable over HTTP POST with { user_id } + service_role authorization.
// Privacy guarantees:
// - gmail.readonly scope only
// - Tokens stored in Supabase Vault (gmail_token_{user_id}) — never in profiles
// - Never sends email content to Gemini — only PII-masked { payee_name, amount, method, account_type }
// - Never stores full email body or subject beyond email_parse_errors.raw_snippet (200 chars max)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

const GMAIL_ALERT_QUERY =
  'from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in) (subject:(UPI OR RTGS OR NEFT OR IMPS OR EFT OR credited OR debited OR "account credit" OR "account debit" OR "RTGS Credit" OR "NEFT Credit" OR "IMPS Credit"))';

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
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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

async function decryptEnvelopeIfEncrypted(envelope: string, encryptionKey: string): Promise<string> {
  if (!envelope.startsWith('zbf:v1:')) return envelope;
  if (!encryptionKey) throw new Error('ENCRYPTION_KEY is missing in Edge Function env');
  const parts = envelope.slice('zbf:v1:'.length).split(':');
  const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const salt = fromB64(parts[0]);
  const iv = fromB64(parts[1]);
  const data = fromB64(parts[2]);
  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
  return new TextDecoder().decode(plain);
}

async function encryptEnvelopeIfConfigured(plaintext: string, encryptionKey: string): Promise<string> {
  if (!encryptionKey) return plaintext;
  const toB64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  return `zbf:v1:${toB64(salt)}:${toB64(iv)}:${toB64(new Uint8Array(cipher))}`;
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

  if (fromAddress === 'alerts@hdfcbank.net' || fromAddress === 'alerts@hdfcbank.bank.in') {
    if (/rtgs/i.test(body)) {
      const isCredit = /credited|added to/i.test(body) || /credited|credit/i.test(subject);
      const amount = parseAmount(body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || body.match(/A\/c (?:No )?[Xx*]*(\d{4})/i)?.[1] || '';
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_RTGS missing amount/last4', snippet: truncate200(body) };
      }
      const utrMatch = body.match(/(?:UTR|Ref(?:erence)?(?:\s+No)?)[.:\s]+([A-Z0-9]{12,26})/i) || body.match(/RTGS[-\s]+(?:CR|DR)?[-\s]*[A-Z0-9]*[-\s]+.*?([A-Z0-9]{16,26})/i);
      const utrRef = utrMatch?.[1]?.trim() || null;
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      const senderMatch = body.match(/(?:from|by|to)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s+towards|\.|\s*$)/i);
      const payee = senderMatch?.[1]?.trim() || (isCredit ? 'RTGS Sender' : 'RTGS Recipient');
      return { type: 'tx' as const, bank: 'HDFC', method: 'RTGS' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef: null, rtgsRef: utrRef, refNo: utrRef, balanceAfter, rawDesc: utrRef ? `RTGS-${utrRef}-${payee}` : `RTGS-${payee}`, fromAddress, subject };
    }

    if (/neft/i.test(body)) {
      const isCredit = /credited|added to/i.test(body) || /credited|credit/i.test(subject);
      const amount = parseAmount(body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || body.match(/A\/c (?:No )?[Xx*]*(\d{4})/i)?.[1] || '';
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_NEFT missing amount/last4', snippet: truncate200(body) };
      }
      const neftMatch = body.match(/(?:NEFT|UTR|Ref(?:erence)?(?:\s+No)?)[.:\s]+([A-Z0-9]{10,22})/i);
      const neftRef = neftMatch?.[1]?.trim() || null;
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      const senderMatch = body.match(/(?:from|by|to)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s+towards|\.|\s*$)/i);
      const payee = senderMatch?.[1]?.trim() || (isCredit ? 'NEFT Sender' : 'NEFT Recipient');
      return { type: 'tx' as const, bank: 'HDFC', method: 'NEFT' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef: null, neftRef, refNo: neftRef, balanceAfter, rawDesc: neftRef ? `NEFT-${neftRef}-${payee}` : `NEFT-${payee}`, fromAddress, subject };
    }

    if (/added to your account/i.test(body)) {
      const amount = parseAmount(body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+has been successfully added/i)?.[1]);
      const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_IMPS_CREDIT missing amount/last4', snippet: truncate200(body) };
      }
      const impsRef = body.match(/IMPS-(\d+)-/i)?.[1] || null;
      const payee = body.match(/IMPS-\d+-([^-]+)-/i)?.[1]?.trim() || 'IMPS Sender';
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'IMPS' as const, direction: 'credit' as const, amount, last4, date, payee, upiRef: null, impsRef, refNo: impsRef, balanceAfter, rawDesc: impsRef ? `IMPS-${impsRef}-${payee}` : `IMPS-${payee}`, fromAddress, subject };
    }

    if (/deducted from your account/i.test(body)) {
      const amount = parseAmount(body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+is deducted/i)?.[1]);
      const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_IMPS_DEBIT missing amount/last4', snippet: truncate200(body) };
      }
      const impsRef = body.match(/IMPS-(\d+)-/i)?.[1] || null;
      const payee = (body.match(/added to IMPS-\d+-([^-]+)-/i)?.[1] || body.match(/IMPS-\d+-([^-]+)-/i)?.[1] || 'IMPS Recipient').trim();
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'IMPS' as const, direction: 'debit' as const, amount, last4, date, payee, upiRef: null, impsRef, refNo: impsRef, balanceAfter, rawDesc: impsRef ? `IMPS-${impsRef}-${payee}` : `IMPS-${payee}`, fromAddress, subject };
    }

    if (/available balance/i.test(body)) {
      const last4 = body.match(/account ending (?:XX)?(\d{4})/i)?.[1] || '';
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      if (!last4 || balanceAfter === null) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_BALANCE_ALERT missing last4/balance', snippet: truncate200(body) };
      }
      return { type: 'balance' as const, last4, balanceAfter, fromAddress, subject };
    }
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

async function gmailSyncForUser(supabase: any, userId: string) {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') || '';
  const { data: rawSecret } = await supabase.rpc('get_gmail_vault_token', {
    p_secret_name: `gmail_token_${userId}`,
  });
  if (!rawSecret) throw new Error('Gmail token not found in Vault');

  const decoded = await decryptEnvelopeIfEncrypted(String(rawSecret), encryptionKey);
  const tokenObj = JSON.parse(decoded) as {
    access_token: string;
    refresh_token?: string | null;
    expiry: number;
  };

  let accessToken = tokenObj.access_token;
  if (tokenObj.expiry <= Date.now() + 60_000) {
    if (!tokenObj.refresh_token) throw new Error('Gmail token expired without refresh token');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenObj.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const rJson = await r.json();
    if (!r.ok || !rJson.access_token) throw new Error('Failed to refresh Gmail token');
    accessToken = rJson.access_token;
    const nextStored = await encryptEnvelopeIfConfigured(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: rJson.refresh_token || tokenObj.refresh_token,
        expiry: Date.now() + Number(rJson.expires_in || 3600) * 1000,
      }),
      encryptionKey
    );
    await supabase.rpc('upsert_gmail_vault_token', {
      p_secret_name: `gmail_token_${userId}`,
      p_secret_value: nextStored,
    });
  }

  const [{ data: profile }, { data: accounts }, { data: rules }, { data: categories }] = await Promise.all([
    supabase.from('profiles').select('gmail_last_synced, owner_full_name, full_name').eq('user_id', userId).maybeSingle(),
    supabase.from('accounts').select('id, account_number_last4, account_type').eq('user_id', userId),
    supabase.from('transaction_rules').select('*').eq('user_id', userId).eq('is_active', true).order('priority', { ascending: true }),
    supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
  ]);

  const lastMs = profile?.gmail_last_synced ? new Date(profile.gmail_last_synced).getTime() : NaN;
  const afterSec = Number.isFinite(lastMs)
    ? Math.max(0, Math.floor(lastMs / 1000) - 60)
    : Math.floor(Date.now() / 1000) - 30 * 86400;

  const accountMap = new Map<string, { id: string; account_type: string }>();
  for (const acc of accounts || []) {
    if (acc.account_number_last4) accountMap.set(String(acc.account_number_last4).trim(), acc);
  }

  const msgs: Array<{ id: string }> = [];
  let pageToken: string | undefined;
  do {
    const u = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    u.searchParams.set('q', `${GMAIL_ALERT_QUERY} after:${afterSec}`);
    u.searchParams.set('maxResults', '100');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const listRes = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) throw new Error(`Gmail list error (${listRes.status})`);
    const listJson = await listRes.json();
    if (Array.isArray(listJson.messages)) msgs.push(...listJson.messages);
    pageToken = listJson.nextPageToken;
  } while (pageToken);

  let emailsProcessed = 0;
  let transactionsAdded = 0;
  let errorsCount = 0;
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
  const flashModel = Deno.env.get('GEMINI_MODEL_FLASH') || 'gemini-3.5-flash-lite';
  const ownerName = profile?.owner_full_name || profile?.full_name || '';

  for (const ref of msgs) {
    emailsProcessed++;
    const fullRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!fullRes.ok) {
      errorsCount++;
      continue;
    }
    const fullMsg = await fullRes.json();
    const parsed = parseAlertEmail(fullMsg);

    if (parsed.type === 'error') {
      errorsCount++;
      await supabase.from('email_parse_errors').insert({
        user_id: userId,
        gmail_msg_id: ref.id,
        from_address: parsed.fromAddress,
        subject: parsed.subject,
        error_reason: parsed.reason,
        raw_snippet: parsed.snippet,
      });
      continue;
    }

    const account = accountMap.get(parsed.last4);
    if (!account) {
      errorsCount++;
      await supabase.from('email_parse_errors').insert({
        user_id: userId,
        gmail_msg_id: ref.id,
        from_address: parsed.fromAddress,
        subject: parsed.subject,
        error_reason: `No account matched last4 ${parsed.last4}`,
        raw_snippet: truncate200(`Account last4 ${parsed.last4}`),
      });
      continue;
    }

    if (parsed.type === 'balance') {
      await supabase
        .from('accounts')
        .update({ current_balance: parsed.balanceAfter, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .eq('user_id', userId);
      continue;
    }

    const refNum = parsed.upiRef || parsed.impsRef || (parsed as any).rtgsRef || (parsed as any).neftRef || (parsed as any).refNo || null;
    if (refNum) {
      const { data: dup } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .or(`reference_number.eq.${refNum},upi_ref_no.eq.${refNum},imps_ref_no.eq.${refNum}`)
        .limit(1)
        .maybeSingle();
      if (dup) continue;
    }

    const debit = parsed.direction === 'debit' ? parsed.amount : null;
    const credit = parsed.direction === 'credit' ? parsed.amount : null;
    let txnType = parsed.direction === 'debit' ? 'expense' : 'income';
    let categoryId: string | null = null;
    let workspaceId: string | null = null;
    let status: 'confirmed' | 'review' = 'review';

    const matchedRule = (rules || []).find((r: any) => {
      if (r.match_field !== 'description') return false;
      const val = String(r.match_value || '').toLowerCase();
      return parsed.payee.toLowerCase().includes(val);
    });

    if (matchedRule) {
      categoryId = matchedRule.set_category || null;
      workspaceId = matchedRule.set_workspace || null;
      if (matchedRule.set_txn_type) txnType = matchedRule.set_txn_type;
      status = 'confirmed';
    } else if (geminiKey && (categories || []).length > 0) {
      const aiPayload = {
        payee_name: maskPayeeForAI(parsed.payee, ownerName),
        amount: parsed.amount,
        method: parsed.method,
        account_type: account.account_type || 'savings',
      };
      const catList = (categories || []).map((c: any) => ({ id: c.id, name: c.name }));
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${flashModel}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Return JSON {"category_id":"...","confidence":0.0..1.0} for ${JSON.stringify(aiPayload)} using ${JSON.stringify(catList)}` }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (gRes.ok) {
        const gJson = await gRes.json();
        const txt = gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        try {
          const obj = JSON.parse(txt.replace(/```json|```/gi, '').trim());
          if ((categories || []).some((c: any) => c.id === obj.category_id)) {
            categoryId = obj.category_id;
            status = Number(obj.confidence) > 0.75 ? 'confirmed' : 'review';
          }
        } catch {
          // keep review
        }
      }
    }

    const { error: insErr } = await supabase.from('transactions').insert({
      user_id: userId,
      account_id: account.id,
      txn_date: parsed.date,
      description: parsed.payee,
      raw_description: parsed.rawDesc,
      debit,
      credit,
      balance: parsed.balanceAfter,
      balance_after: parsed.balanceAfter,
      reference_number: refNum,
      upi_ref_no: parsed.upiRef,
      imps_ref_no: parsed.impsRef,
      source: 'gmail_auto',
      status,
      category_id: categoryId,
      workspace_id: workspaceId,
      txn_type: txnType,
      is_transfer: false,
      is_self_transfer: false,
      is_manual: false,
    });

    if (insErr) {
      errorsCount++;
      continue;
    }

    transactionsAdded++;
    if (parsed.balanceAfter !== null) {
      await supabase
        .from('accounts')
        .update({ current_balance: parsed.balanceAfter, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .eq('user_id', userId);
    }
  }

  const nowIso = new Date().toISOString();
  await Promise.all([
    supabase.from('gmail_sync_log').insert({
      user_id: userId,
      last_synced_at: nowIso,
      emails_processed: emailsProcessed,
      transactions_added: transactionsAdded,
      errors_count: errorsCount,
    }),
    supabase.from('profiles').update({ gmail_last_synced: nowIso }).eq('user_id', userId),
  ]);

  return {
    emails_processed: emailsProcessed,
    transactions_added: transactionsAdded,
    errors_count: errorsCount,
    last_synced_at: nowIso,
  };
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase service configuration' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    if (body?.user_id) {
      const result = await gmailSyncForUser(supabase, String(body.user_id));
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Scheduled cron run ("0 */6 * * *"): sync all connected & enabled profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('gmail_connected', true)
      .eq('gmail_sync_enabled', true);

    const results = [];
    for (const p of profiles || []) {
      try {
        results.push({ user_id: p.user_id, ...(await gmailSyncForUser(supabase, p.user_id)) });
      } catch (err: any) {
        results.push({ user_id: p.user_id, error: err?.message || 'sync failed' });
      }
    }

    return new Response(JSON.stringify({ cron: true, synced: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
