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
  '(from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in OR alerts@sbi.co.in OR alerts@icicibank.com OR alerts@axisbank.com OR bankalerts@kotak.com OR alerts@idfcfirstbank.com OR alerts@yesbank.in OR alerts@indusind.com) OR (subject:(IMPS OR NEFT OR RTGS OR UPI OR "Account update" OR "Transaction with") ("Rs." OR "INR"))) -subject:(OTP OR "One Time Password" OR "e-statement" OR "Account Statement")';

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

const STOP_WORDS = new Set([
  'hdfc', 'bank', 'ltd', 'limited', 'india', 'private', 'pvt',
  'upi', 'imps', 'neft', 'rtgs', 'eft', 'tpt', 'ft', 'cr', 'dr',
  'transfer', 'payment', 'payee', 'from', 'towards', 'via', 'online',
  'banking', 'netbanking', 'remitter', 'recipient', 'sender', 'account',
  'saving', 'savings', 'current', 'self', 'na',
]);

const GENERIC_LABELS = new Set([
  'remitter', 'imps remitter', 'imps sender', 'imps recipient',
  'neft sender', 'neft recipient', 'rtgs sender', 'rtgs recipient',
  'hdfc online transfer', 'upi payment', 'upi sender', 'boi imps transfer',
]);

function isGenericCounterpartyLabel(desc?: string | null): boolean {
  const cleaned = (desc || '').trim().toLowerCase();
  if (!cleaned) return true;
  if (GENERIC_LABELS.has(cleaned)) return true;
  if (/^(bom|boi|hdfc|sbi|icici|axis|kotak)\s+(imps|neft|rtgs|upi|eft)\b/i.test(cleaned)) return true;
  if (/^upi transfer\b/i.test(cleaned)) return true;
  return false;
}

function truncate200(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function parseAmount(raw?: string | null): number | null {
  if (!raw) return null;
  const num = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function normalizeRef(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, '').trim();
  if (!cleaned || /^0+$/.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) {
    const stripped = cleaned.replace(/^0+/, '');
    return stripped || null;
  }
  return cleaned.toUpperCase();
}

function cleanEntity(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/\b(Not you\??|Call\s+\d+|If you did not|Available balance|Warm regards|For queries|SMS\s+'?BLOCK|via HDFC Bank Online Banking|A\/c Bal).*$/i, '')
    .replace(/^[-:.\s]+|[-:.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(dateStr?: string | null, internalDateMs?: string): string {
  if (dateStr) {
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const mon = trimmed.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3})[\s\-/,]+(\d{2,4})$/);
    if (mon && MONTH_MAP[mon[2].toUpperCase()]) {
      const yyyy = mon[3].length === 2 ? `20${mon[3]}` : mon[3];
      return `${yyyy}-${MONTH_MAP[mon[2].toUpperCase()]}-${mon[1].padStart(2, '0')}`;
    }
    const short = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
    if (short) return `20${short[3]}-${short[2].padStart(2, '0')}-${short[1].padStart(2, '0')}`;
    const full = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (full) return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
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

function extractHdfcLast4(body: string): string {
  const m =
    body.match(/(?:account|A\/c)(?:\s+No\.?)?\s+ending(?:\s+in)?\s+(?:XX|\*{2,}|[Xx*]+)?\s*(\d{4})/i) ||
    body.match(/account\s+[Xx*]+(\d{4})/i) ||
    body.match(/A\/c(?:\s+No\.?)?\s*[Xx*]*\s*(\d{4})/i);
  return m?.[1] || '';
}

function inferBankCode(fromAddress: string, body: string): string {
  const hay = `${fromAddress} ${body}`.toLowerCase();
  if (hay.includes('hdfc')) return 'HDFC';
  if (hay.includes('mahabank') || hay.includes('maharashtra')) return 'BOM';
  if (hay.includes('bankofindia') || /\bboi\b/.test(hay)) return 'BOI';
  if (hay.includes('sbi') || hay.includes('state bank')) return 'SBI';
  if (hay.includes('icici')) return 'ICICI';
  if (hay.includes('axisbank') || hay.includes('axis bank')) return 'AXIS';
  if (hay.includes('kotak')) return 'KOTAK';
  if (hay.includes('idfc')) return 'IDFC';
  if (hay.includes('yesbank') || hay.includes('yes bank')) return 'YES';
  return 'BANK';
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

  // Ignore OTPs, e-statements, and failed alerts
  const combined = `${subject} ${body}`;
  if (
    (/\bis your OTP\b|\bOne Time Password\b|NEVER share your OTP|do not share.{0,20}OTP/i.test(combined) &&
      !/(?:debited|credited|deducted|added to your account)\s+(?:by\s+|for\s+|with\s+)?(?:Rs|INR)/i.test(combined)) ||
    /\b(?:e-statement|monthly statement|statement is ready)\b/i.test(subject) ||
    (/\b(?:failed|declined|unsuccessful)\b/i.test(combined) && !/\bcredited|debited|deducted\b/i.test(combined))
  ) {
    return { type: 'ignored' as const, fromAddress, subject };
  }

  const isHdfc =
    fromAddress === 'alerts@hdfcbank.net' ||
    fromAddress === 'alerts@hdfcbank.bank.in' ||
    fromAddress.endsWith('@hdfcbank.net') ||
    fromAddress.endsWith('@hdfcbank.bank.in');

  if (isHdfc) {
    if (/\brtgs\b/i.test(body) || /\brtgs\b/i.test(subject)) {
      const isCredit = /\b(?:credited|has been successfully added|added to|received)\b/i.test(body) || /\bcredited|credit\b/i.test(subject);
      const amount = parseAmount(body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_RTGS missing amount/last4', snippet: truncate200(body) };
      }
      const utrMatch =
        body.match(/(?:UTR|Ref(?:erence)?(?:\s+No\.?)?|RTGS\s*(?:Ref|UTR)?)[.:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{10,26})/i) ||
        body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
        body.match(/RTGS[-\s]+(?:CR|DR)?[-\s]*[A-Z0-9]*[-\s]+.*?((?=[A-Z0-9]*\d)[A-Z0-9]{12,26})/i);
      const utrRef = normalizeRef(utrMatch?.[1]);
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      const senderMatch = body.match(/(?:from|by|to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s*\(|\s+on\s+\d|\s+Not you|\.\s|\s*$)/i);
      const payee = cleanEntity(senderMatch?.[1]) || (isCredit ? 'RTGS Sender' : 'RTGS Recipient');
      return { type: 'tx' as const, bank: 'HDFC', method: 'RTGS' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef: null, rtgsRef: utrRef, refNo: utrRef, balanceAfter, rawDesc: utrRef ? `RTGS-${utrRef}-${payee}` : `RTGS-${payee}`, fromAddress, subject };
    }

    if (/\bneft\b/i.test(body) || /\bneft\b/i.test(subject)) {
      const isCredit = /\b(?:credited|has been successfully added|added to|received)\b/i.test(body) || /\bcredited|credit\b/i.test(subject);
      const amount = parseAmount(body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_NEFT missing amount/last4', snippet: truncate200(body) };
      }
      const neftMatch =
        body.match(/(?:NEFT\s*(?:Ref|UTR)?|UTR|Ref(?:erence)?(?:\s+No\.?)?)[.:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{10,26})/i) ||
        body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
        body.match(/NEFT[-\/](?:CR|DR)?[-\/]?.*?[-\/]((?=[A-Z0-9]*\d)[A-Z0-9]{10,24})/i);
      const neftRef = normalizeRef(neftMatch?.[1]);
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      const senderMatch = body.match(/(?:from|by|to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s*\(|\s+on\s+\d|\s+Not you|\.\s|\s*$)/i);
      const payee = cleanEntity(senderMatch?.[1]) || (isCredit ? 'NEFT Sender' : 'NEFT Recipient');
      return { type: 'tx' as const, bank: 'HDFC', method: 'NEFT' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef: null, neftRef, refNo: neftRef, balanceAfter, rawDesc: neftRef ? `NEFT-${neftRef}-${payee}` : `NEFT-${payee}`, fromAddress, subject };
    }

    if (/\bimps\b/i.test(body) || /added to your account/i.test(body) || (/deducted from your account/i.test(body) && !/Online Banking|Transfer to payee/i.test(body))) {
      const isCredit = /\bcredited|has been successfully added\b/i.test(body) && !/\bis debited\b|\bis deducted\b/i.test(body);
      const amount = parseAmount(
        (isCredit
          ? body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)\s+has been successfully added/i) ||
            body.match(/is credited (?:for|with|by)\s*(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)
          : body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)\s+is deducted/i) ||
            body.match(/is debited (?:for|with|by)\s*(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i) ||
            body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)
        )?.[1]
      );
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_IMPS missing amount/last4', snippet: truncate200(body) };
      }
      const impsRef = normalizeRef((body.match(/IMPS\s*Ref\s*(?:No\.?)?[:\s]+(\d{9,16})/i) || body.match(/IMPS[-\/\s]+(\d{9,16})\b/i))?.[1]);
      const pairedAcct = body.match(/and\s+(A\/c\s+[Xx*]+\d{4})\s+is\s+credited/i)?.[1];
      const payee =
        cleanEntity(
          (isCredit ? body.match(/IMPS-\d+-([^-]+)-/i)?.[1] : body.match(/added to IMPS-\d+-([^-]+)-/i)?.[1] || body.match(/IMPS-\d+-([^-]+)-/i)?.[1]) ||
            pairedAcct ||
            ''
        ) || (isCredit ? 'IMPS Sender' : 'IMPS Recipient');
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'IMPS' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef, refNo: impsRef, balanceAfter, rawDesc: impsRef ? `IMPS-${impsRef}-${payee}` : `IMPS-${payee}`, fromAddress, subject };
    }

    if (/\bis (?:successfully )?credited\b/i.test(body) && (/\bupi\b/i.test(body) || /\bVPA\b/i.test(body))) {
      const amount = parseAmount(body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s+is (?:successfully\s+)?credited/i)?.[1]);
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_UPI_CREDIT missing amount/last4', snippet: truncate200(body) };
      }
      const vpaName = body.match(/(?:by|from)\s+VPA\s+([^\s]+)\s+(.+?)\s+on\s+\d{1,2}[-\/]/i);
      const vpa = (vpaName?.[1] || body.match(/(?:by|from)\s+VPA\s+(\S+)/i)?.[1] || '').replace(/[.,;]+$/, '').trim() || null;
      const payee = cleanEntity(body.match(/(?:by|from)\s+VPA\s+\S+\s*\(([^)]+)\)/i)?.[1] || vpaName?.[2] || '') || vpa || 'UPI Sender';
      const upiRef = normalizeRef(body.match(/UPI\s*transaction\s*reference\s*(?:no\.?|number)\s*(?:is|:)\s*(\d+)/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'UPI' as const, direction: 'credit' as const, amount, last4, date, payee, upiRef, impsRef: null, refNo: upiRef, balanceAfter: null, rawDesc: upiRef ? `UPI/${upiRef}/${payee}` : `UPI/${payee}`, fromAddress, subject };
    }

    if (/\bis debited\b/i.test(body)) {
      const amount = parseAmount(body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s+is debited/i)?.[1]);
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_UPI_DEBIT missing amount/last4', snippet: truncate200(body) };
      }
      const vpa = body.match(/towards VPA\s+(\S+)/i)?.[1]?.replace(/[.,;]+$/, '') || null;
      const payee = cleanEntity(body.match(/towards VPA\s+\S+\s*\(([^)]+)\)/i)?.[1] || body.match(/\(([^)]+)\)/)?.[1] || '') || vpa || 'UPI Payment';
      const upiRef = normalizeRef(body.match(/UPI\s*transaction\s*reference\s*(?:no\.?|number)\s*(?:is|:)\s*(\d+)/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'UPI' as const, direction: 'debit' as const, amount, last4, date, payee, upiRef, impsRef: null, refNo: upiRef, balanceAfter: null, rawDesc: upiRef ? `UPI/${upiRef}/${payee}` : `UPI/${payee}`, fromAddress, subject };
    }

    if (/HDFC Bank NetBanking|HDFC Bank Online Banking|Transfer to payee/i.test(body)) {
      const isCredit = /\bcredited\b|\badded to\b/i.test(body);
      const amount = parseAmount((body.match(/payment\s+of\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i) || body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i))?.[1]);
      const last4 = extractHdfcLast4(body);
      if (!amount || !last4) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_EFT missing amount/last4', snippet: truncate200(body) };
      }
      const payeeMatch =
        body.match(/Transfer\s+to\s+payee\s+(.+?)(?:\s+via\s+HDFC|\s*\.|\s*$)/i) ||
        body.match(/from\s+A\/c\s+[Xx*]+\d{4}\s+to\s+([A-Za-z0-9 .&_-]+?)(?:\s+Not you|\s*\.|\s*$)/i);
      const payee = cleanEntity(payeeMatch?.[1]) || 'HDFC Online Transfer';
      const refNo = normalizeRef(body.match(/(?:Ref(?:erence)?(?:\s+No\.?)?|Txn\s+ID)[:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{6,22})/i)?.[1]);
      const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
      return { type: 'tx' as const, bank: 'HDFC', method: 'EFT' as const, direction: isCredit ? ('credit' as const) : ('debit' as const), amount, last4, date, payee, upiRef: null, impsRef: null, refNo, balanceAfter: null, rawDesc: `EFT-${payee}`, fromAddress, subject };
    }

    if (/available balance/i.test(body)) {
      const last4 = extractHdfcLast4(body);
      const balanceAfter = parseAmount(body.match(/available balance.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1]);
      if (!last4 || balanceAfter === null) {
        return { type: 'error' as const, fromAddress, subject, reason: 'HDFC_BALANCE_ALERT missing last4/balance', snippet: truncate200(body) };
      }
      return { type: 'balance' as const, last4, balanceAfter, fromAddress, subject };
    }
  }

  if (fromAddress.includes('mahabank') || fromAddress.includes('bankofmaharashtra')) {
    const last4 = body.match(/A\/c(?:\s+No\.?)?\s*[Xx*\s]*(\d{4})/i)?.[1] || '';
    const dir = body.match(/\b(credited|debited|CR|DR)\b/i)?.[1]?.toLowerCase() || '';
    const amount = parseAmount((body.match(/(?:by|for|of)\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i) || body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i))?.[1]);
    if (!last4 || !dir || !amount) {
      return { type: 'error' as const, fromAddress, subject, reason: 'BOM alert missing required fields', snippet: truncate200(body) };
    }
    const method = /\bRTGS\b/i.test(body) ? ('RTGS' as const) : /\bNEFT\b/i.test(body) ? ('NEFT' as const) : /\bUPI\b/i.test(body) ? ('UPI' as const) : ('IMPS' as const);
    const direction = dir === 'credited' || dir === 'cr' ? ('credit' as const) : ('debit' as const);
    const refMatch =
      body.match(/(?:by\s+)?(?:IMPS|UPI|NEFT|RTGS)(?:\s+(?:Ref|UTR)(?:\s*No\.?)?)?[:\s\-\/]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i) ||
      body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
      body.match(/\b(\d{12})\b/);
    const rawRef = normalizeRef(refMatch?.[1]);
    const payee = cleanEntity(body.match(/(?:from|to|towards)\s+([A-Za-z0-9 .&-]+?)(?=\.\s*A\/c|\s+A\/c|\s+AVL|\s+on\s+\d|\.\s|\s*$)/i)?.[1]) || `BOM ${method}`;
    const balanceAfter = parseAmount(body.match(/(?:A\/c Bal(?:ance)?|AVL Bal)(?:\s+is)?(?:\s+INR|\s+Rs\.?)?\s*([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
    return {
      type: 'tx' as const,
      bank: 'BOM',
      method,
      direction,
      amount,
      last4,
      date,
      payee,
      upiRef: method === 'UPI' ? rawRef : null,
      impsRef: method === 'IMPS' ? rawRef : null,
      refNo: rawRef,
      balanceAfter,
      rawDesc: rawRef ? `${method}/${rawRef}/${payee}` : `BOM ${method} ${payee}`,
      fromAddress,
      subject,
    };
  }

  if (fromAddress.includes('bankofindia') || (/(?:INR|Rs\.?|₹)\s*[\d,]+/i.test(body) && /\b(?:credited|debited|deducted|transferred|paid)\b/i.test(body) && /\b(?:UPI|IMPS|NEFT|RTGS|A\/c|Account)\b/i.test(body))) {
    const bank = inferBankCode(fromAddress, body);
    const last4 = body.match(/(?:A\/c|Account|Acct)(?:\s+(?:No\.?|ending(?:\s+in)?|bearing))?\s*[Xx*\s]*(\d{4})/i)?.[1] || '';
    const isCredit = /\b(?:credited|received|deposited|CR)\b/i.test(body);
    const isDebit = /\b(?:debited|deducted|paid|transferred|DR)\b/i.test(body);
    const amount = parseAmount(body.match(/(?:INR|Rs\.?|₹)\s*([\d,]+\.?\d*)/i)?.[1]);
    if (!last4 || (!isCredit && !isDebit) || !amount) {
      return { type: 'error' as const, fromAddress, subject, reason: `${bank} alert missing required fields`, snippet: truncate200(body) };
    }
    const direction = isCredit && !isDebit ? ('credit' as const) : ('debit' as const);
    const method = /\bRTGS\b/i.test(body) ? ('RTGS' as const) : /\bNEFT\b/i.test(body) ? ('NEFT' as const) : /\bIMPS\b/i.test(body) ? ('IMPS' as const) : /\bUPI\b|@[a-zA-Z0-9.-]+/i.test(body) ? ('UPI' as const) : ('EFT' as const);
    const refMatch =
      body.match(/(?:UPI|IMPS|NEFT|RTGS|UTR|Ref(?:erence)?(?:\s*No\.?)?)(?:\s+is\s+|[:\s\-\/#]+)((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i) ||
      body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
      body.match(/\b(\d{12})\b/);
    const rawRef = normalizeRef(refMatch?.[1]);
    const balanceAfter = parseAmount(body.match(/(?:Avl\.?\s*Bal(?:ance)?|Available\s*Balance|Bal(?:ance)?)[:\s]*(?:is\s*)?(?:INR|Rs\.?|₹)?\s*([\d,]+\.?\d*)/i)?.[1]);
    const date = normalizeDate(body.match(/(?:on|dated?)\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1], msg.internalDate);
    const counterpartyMatch = body.match(/(?:from|to|towards|Info)[:\s]+([A-Za-z0-9 .&-]+?)(?:\s+on|\s+Ref|\s+UTR|\.\s|\s*$)/i);
    const payee = cleanEntity(counterpartyMatch?.[1]) || (rawRef ? `${bank} ${method} ${rawRef}` : `${bank} ${method}`);
    return {
      type: 'tx' as const,
      bank,
      method,
      direction,
      amount,
      last4,
      date,
      payee,
      upiRef: method === 'UPI' ? rawRef : null,
      impsRef: method === 'IMPS' ? rawRef : null,
      refNo: rawRef,
      balanceAfter,
      rawDesc: rawRef ? `${bank}/${method}/${rawRef}` : `${bank} ${method} ${direction}`,
      fromAddress,
      subject,
    };
  }

  return { type: 'error' as const, fromAddress, subject, reason: 'Unrecognised bank alert format', snippet: truncate200(body) };
}

function getEdgeStrongRef(tx: { upi_ref_no?: string | null; imps_ref_no?: string | null; reference_number?: string | null }): string | null {
  const upi = normalizeRef(tx.upi_ref_no);
  if (upi) return `UPI:${upi}`;
  const imps = normalizeRef(tx.imps_ref_no);
  if (imps) return `IMPS:${imps}`;
  const ref = normalizeRef(tx.reference_number);
  if (ref && ref.length >= 8) return `REF:${ref}`;
  return null;
}

function compatibleCounterparties(aDesc: string, aRaw: string, bDesc: string, bRaw: string): boolean {
  const ca = (aDesc || '').trim().toLowerCase();
  const cb = (bDesc || '').trim().toLowerCase();
  if (!ca || !cb || GENERIC_LABELS.has(ca) || GENERIC_LABELS.has(cb)) return true;
  const tok = (s: string) =>
    Array.from(
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
      )
    );
  const ta = tok(`${aDesc} ${aRaw}`);
  const tb = tok(`${bDesc} ${bRaw}`);
  if (ta.length === 0 || tb.length === 0) return true;
  const setB = new Set(tb);
  if (ta.some((t) => setB.has(t))) return true;
  const sa = `${aDesc}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sb = `${bDesc}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sa.length >= 7 && sb.length >= 7) {
    for (let i = 0; i <= sa.length - 7; i++) {
      const sub = sa.slice(i, i + 7);
      if (!/^\d+$/.test(sub) && sb.includes(sub)) return true;
    }
  }
  return false;
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
    supabase.from('accounts').select('id, account_number_last4, account_type, opening_balance').eq('user_id', userId),
    supabase.from('transaction_rules').select('*').eq('user_id', userId).eq('is_active', true).order('priority', { ascending: true }),
    supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
  ]);

  const lastMs = profile?.gmail_last_synced ? new Date(profile.gmail_last_synced).getTime() : NaN;
  const afterSec = Number.isFinite(lastMs)
    ? Math.max(0, Math.floor(lastMs / 1000) - 60)
    : Math.floor(Date.now() / 1000) - 30 * 86400;

  const accountMap = new Map<string, { id: string; account_type: string; opening_balance?: number }>();
  const openingBalMap = new Map<string, number>();
  for (const acc of accounts || []) {
    openingBalMap.set(acc.id, Number(acc.opening_balance ?? 0));
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
  const touchedAccounts = new Set<string>();
  const latestAlerts = new Map<string, { balance: number; dateIso: string; internalMs: number }>();

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

    if (parsed.type === 'ignored') {
      continue;
    }

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
      const rawMs = fullMsg?.internalDate;
      const internalMs = rawMs && /^\d+$/.test(String(rawMs)) ? Number(rawMs) : Date.now();
      const dateIso = new Date(internalMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const prev = latestAlerts.get(account.id);
      if (!prev || internalMs >= prev.internalMs) {
        latestAlerts.set(account.id, { balance: parsed.balanceAfter, dateIso, internalMs });
      }
      touchedAccounts.add(account.id);
      continue;
    }

    const refNum = normalizeRef(parsed.upiRef || parsed.impsRef || (parsed as any).rtgsRef || (parsed as any).neftRef || (parsed as any).refNo);
    const minD = new Date(parsed.date);
    minD.setDate(minD.getDate() - 2);
    const maxD = new Date(parsed.date);
    maxD.setDate(maxD.getDate() + 2);

    const candCols = 'id, account_id, txn_date, description, raw_description, debit, credit, balance, balance_after, reference_number, upi_ref_no, imps_ref_no, source';
    const [{ data: refMatches }, { data: winMatches }] = await Promise.all([
      refNum
        ? supabase.from('transactions').select(candCols).eq('user_id', userId).or(`reference_number.eq.${refNum},upi_ref_no.eq.${refNum},imps_ref_no.eq.${refNum}`).limit(10)
        : Promise.resolve({ data: [] }),
      supabase.from('transactions').select(candCols).eq('user_id', userId).eq('account_id', account.id).gte('txn_date', minD.toISOString().split('T')[0]).lte('txn_date', maxD.toISOString().split('T')[0]).limit(100),
    ]);

    const cands = [...(refMatches || []), ...(winMatches || [])];
    const inStrong = getEdgeStrongRef({ upi_ref_no: parsed.upiRef, imps_ref_no: parsed.impsRef, reference_number: refNum });
    const inIsDebit = parsed.direction === 'debit';
    const matchedDup = cands.find((c: any) => {
      const cAmt = (c.debit !== null && Number(c.debit) > 0 ? Number(c.debit) : Number(c.credit || 0));
      const cIsDebit = c.debit !== null && Number(c.debit) > 0;
      const sameAcc = c.account_id === account.id;
      const sameAmt = Math.abs(cAmt - parsed.amount) <= 0.01;
      const cu = normalizeRef(c.upi_ref_no);
      const ci = normalizeRef(c.imps_ref_no);
      const cr = normalizeRef(c.reference_number);
      if (parsed.upiRef && (cu === parsed.upiRef || cr === parsed.upiRef) && (sameAcc || (cIsDebit === inIsDebit && sameAmt))) return true;
      if (parsed.impsRef && (ci === parsed.impsRef || cr === parsed.impsRef) && (sameAcc || (cIsDebit === inIsDebit && sameAmt))) return true;
      if (refNum && refNum.length >= 8 && sameAcc && cIsDebit === inIsDebit && sameAmt && (cr === refNum || cu === refNum || ci === refNum)) return true;
      if (sameAcc && c.source !== 'gmail_auto' && cIsDebit === inIsDebit && sameAmt) {
        const cStrong = getEdgeStrongRef(c);
        if (inStrong && cStrong && inStrong !== cStrong) return false;
        return compatibleCounterparties(parsed.payee, parsed.rawDesc, c.description || '', c.raw_description || '');
      }
      return false;
    });

    if (matchedDup) {
      const patch: Record<string, any> = {};
      if (parsed.balanceAfter !== null && matchedDup.balance_after == null) patch.balance_after = parsed.balanceAfter;
      if (parsed.balanceAfter !== null && matchedDup.balance == null) patch.balance = parsed.balanceAfter;
      if (refNum && !matchedDup.reference_number) patch.reference_number = refNum;
      if (parsed.upiRef && !matchedDup.upi_ref_no) patch.upi_ref_no = parsed.upiRef;
      if (parsed.impsRef && !matchedDup.imps_ref_no) patch.imps_ref_no = parsed.impsRef;
      if (isGenericCounterpartyLabel(matchedDup.description) && parsed.payee && !isGenericCounterpartyLabel(parsed.payee)) {
        patch.description = parsed.payee;
      }
      if (Object.keys(patch).length > 0) {
        await supabase.from('transactions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', matchedDup.id).eq('user_id', userId);
      }
      touchedAccounts.add(account.id);
      continue;
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

    const alertCreatedAt =
      fullMsg?.internalDate && /^\d+$/.test(String(fullMsg.internalDate))
        ? new Date(Number(fullMsg.internalDate)).toISOString()
        : undefined;

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
      ...(alertCreatedAt ? { created_at: alertCreatedAt } : {}),
    });

    if (insErr) {
      errorsCount++;
      continue;
    }

    transactionsAdded++;
    touchedAccounts.add(account.id);
  }

  for (const accountId of touchedAccounts) {
    const txns: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: pageRows, error: pageErr } = await supabase
        .from('transactions')
        .select('txn_date, debit, credit, balance, balance_after')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .order('txn_date', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (pageErr || !pageRows || pageRows.length === 0) break;
      txns.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    let running = openingBalMap.get(accountId) ?? 0;
    for (const t of txns) {
      const reported = t.balance_after ?? t.balance;
      if (reported !== null && reported !== undefined && Number.isFinite(Number(reported))) {
        running = Number(reported);
      } else {
        running = running + Number(t.credit ?? 0) - Number(t.debit ?? 0);
      }
    }
    let nextBal = Math.round(running * 100) / 100;

    const alert = latestAlerts.get(accountId);
    if (alert) {
      const latestTxnDate = txns.length > 0 ? txns[txns.length - 1].txn_date || '' : '';
      if (!latestTxnDate || alert.dateIso >= latestTxnDate) {
        nextBal = alert.balance;
      }
    }

    await supabase
      .from('accounts')
      .update({ current_balance: nextBal, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('user_id', userId);
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
