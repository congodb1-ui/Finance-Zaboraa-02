import { extractEmailAddress, truncateSnippet200 } from './helpers';
import {
  parseHdfcBalanceAlert,
  parseHdfcImpsCredit,
  parseHdfcImpsDebit,
  parseHdfcUpiDebit,
} from './hdfc';
import { parseBomImps } from './bom';
import { parseBoiImps } from './boi';
import type {
  GmailEmailKind,
  GmailMessage,
  GmailMessagePart,
  GmailParseOutcome,
} from './types';

export * from './types';
export { truncateSnippet200 } from './helpers';

export const CONFIRMED_BANK_SENDERS = [
  'alerts@hdfcbank.bank.in',
  'alerts@hdfcbank.net',
  'mahaalert@mahabank.co.in',
  'mahaalerts@bankofmaharashtra.bank.in',
  'ho.starsandesh@bankofindia.co.in',
] as const;

export function decodeBase64UrlText(data: string): string {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf8');
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|td|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function collectPartsByMime(
  part: GmailMessagePart | undefined,
  targetMime: string,
  out: string[]
): void {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  if (mime === targetMime && part.body?.data) {
    out.push(decodeBase64UrlText(part.body.data));
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      collectPartsByMime(child, targetMime, out);
    }
  }
}

export function extractGmailHeader(message: GmailMessage, headerName: string): string {
  const headers = message.payload?.headers || [];
  const lower = headerName.toLowerCase();
  const match = headers.find((h) => h.name?.toLowerCase() === lower);
  return match?.value || '';
}

export function extractGmailMessageBody(message: GmailMessage): string {
  if (typeof message.bodyText === 'string' && message.bodyText.trim()) {
    return message.bodyText.replace(/\s+/g, ' ').trim();
  }

  const rootPart: GmailMessagePart | undefined = message.payload
    ? {
        mimeType: message.payload.mimeType,
        body: message.payload.body,
        parts: message.payload.parts,
      }
    : undefined;

  const plainParts: string[] = [];
  collectPartsByMime(rootPart, 'text/plain', plainParts);
  const plainCombined = plainParts.join('\n').replace(/\s+/g, ' ').trim();
  if (plainCombined) return plainCombined;

  const htmlParts: string[] = [];
  collectPartsByMime(rootPart, 'text/html', htmlParts);
  const htmlCombined = stripHtmlToText(htmlParts.join(' '));
  if (htmlCombined) return htmlCombined;

  if (message.payload?.body?.data) {
    const raw = decodeBase64UrlText(message.payload.body.data);
    return stripHtmlToText(raw);
  }

  return (message.snippet || '').replace(/\s+/g, ' ').trim();
}

export function identifyGmailEmailType(
  fromAddress: string,
  body: string
): GmailEmailKind {
  const from = extractEmailAddress(fromAddress);
  const normalizedBody = body || '';

  if (from === 'alerts@hdfcbank.bank.in' && /is debited/i.test(normalizedBody)) {
    return 'HDFC_UPI_DEBIT';
  }

  if (from === 'alerts@hdfcbank.net') {
    if (/added to your account/i.test(normalizedBody)) {
      return 'HDFC_IMPS_CREDIT';
    }
    if (/deducted from your account/i.test(normalizedBody)) {
      return 'HDFC_IMPS_DEBIT';
    }
    if (/available balance/i.test(normalizedBody)) {
      return 'HDFC_BALANCE_ALERT';
    }
  }

  if (
    from === 'mahaalert@mahabank.co.in' ||
    from === 'mahaalerts@bankofmaharashtra.bank.in'
  ) {
    return 'BOM_IMPS';
  }

  if (from === 'ho.starsandesh@bankofindia.co.in') {
    return 'BOI_IMPS';
  }

  return 'UNKNOWN';
}

export function parseGmailTransactionEmail(message: GmailMessage): GmailParseOutcome {
  const rawFrom = message.from || extractGmailHeader(message, 'From');
  const fromAddress = extractEmailAddress(rawFrom);
  const subject = (message.subject || extractGmailHeader(message, 'Subject') || '').trim();
  const body = extractGmailMessageBody(message);
  const kind = identifyGmailEmailType(fromAddress, body);

  switch (kind) {
    case 'HDFC_UPI_DEBIT':
      return parseHdfcUpiDebit({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_IMPS_CREDIT':
      return parseHdfcImpsCredit({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_IMPS_DEBIT':
      return parseHdfcImpsDebit({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_BALANCE_ALERT':
      return parseHdfcBalanceAlert({
        msgId: message.id,
        fromAddress,
        subject,
        body,
      });
    case 'BOM_IMPS':
      return parseBomImps({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'BOI_IMPS':
      return parseBoiImps({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    default:
      return {
        kind: 'UNKNOWN',
        record_type: 'error',
        gmail_msg_id: message.id,
        from_address: fromAddress,
        subject,
        error_reason: 'Unrecognised bank alert format',
        raw_snippet: truncateSnippet200(body),
      };
  }
}

export async function parseGmailTransactionEmails(
  messages: GmailMessage[]
): Promise<GmailParseOutcome[]> {
  return (messages || []).map((msg) => parseGmailTransactionEmail(msg));
}
