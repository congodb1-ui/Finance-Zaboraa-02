import { extractEmailAddress, truncateSnippet200 } from './helpers';
import {
  parseHdfcBalanceAlert,
  parseHdfcEftTransfer,
  parseHdfcImpsCredit,
  parseHdfcImpsDebit,
  parseHdfcUpiCredit,
  parseHdfcUpiDebit,
  parseHdfcRtgsAlert,
  parseHdfcNeftAlert,
} from './hdfc';
import { parseBomAlert } from './bom';
import { parseBoiAlert } from './boi';
import { parseGenericBankAlert } from './generic';
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
  'alerts@sbi.co.in',
  'cbssbi.cas@sbi.co.in',
  'alerts@icicibank.com',
  'alerts@axisbank.com',
  'bankalerts@kotak.com',
  'alerts@idfcfirstbank.com',
  'alerts@yesbank.in',
  'alerts@indusind.com',
] as const;

export const GMAIL_ALERT_QUERY_BASE =
  '(from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in OR alerts@sbi.co.in OR alerts@icicibank.com OR alerts@axisbank.com OR bankalerts@kotak.com OR alerts@idfcfirstbank.com OR alerts@yesbank.in OR alerts@indusind.com) OR (subject:(IMPS OR NEFT OR RTGS OR UPI OR "Account update" OR "Transaction with") ("Rs." OR "INR"))) -subject:(OTP OR "One Time Password" OR "e-statement" OR "Account Statement")';

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

function isOtpOrNonTxnEmail(subject: string, body: string): boolean {
  const text = `${subject} ${body}`;
  if (
    /\bis your OTP\b|\bOne Time Password\b|NEVER share your OTP|do not share.{0,20}OTP/i.test(
      text
    ) &&
    !/(?:debited|credited|deducted|added to your account)\s+(?:by\s+|for\s+|with\s+)?(?:Rs|INR)/i.test(
      text
    )
  ) {
    return true;
  }
  if (/\b(?:e-statement|monthly statement|statement is ready)\b/i.test(subject)) {
    return true;
  }
  if (/\b(?:failed|declined|unsuccessful)\b/i.test(text) && !/\bcredited|debited|deducted\b/i.test(text)) {
    return true;
  }
  return false;
}

export function identifyGmailEmailType(
  fromAddress: string,
  body: string,
  subject: string = ''
): GmailEmailKind {
  const from = extractEmailAddress(fromAddress);
  const normalizedBody = body || '';

  if (isOtpOrNonTxnEmail(subject, normalizedBody)) {
    return 'OTP_OR_PROMO';
  }

  const isHdfc =
    from === 'alerts@hdfcbank.bank.in' ||
    from === 'alerts@hdfcbank.net' ||
    from.endsWith('@hdfcbank.bank.in') ||
    from.endsWith('@hdfcbank.net');

  if (isHdfc) {
    if (/\brtgs\b/i.test(normalizedBody) || /\brtgs\b/i.test(subject)) {
      return /credited|added to/i.test(normalizedBody)
        ? 'HDFC_RTGS_CREDIT'
        : 'HDFC_RTGS_DEBIT';
    }
    if (/\bneft\b/i.test(normalizedBody) || /\bneft\b/i.test(subject)) {
      return /credited|added to/i.test(normalizedBody)
        ? 'HDFC_NEFT_CREDIT'
        : 'HDFC_NEFT_DEBIT';
    }
    // Check IMPS BEFORE generic debit/credit! (Matches gmail-01 "is debited for INR ... (IMPS Ref No. ...)")
    if (/\bimps\b/i.test(normalizedBody) || /added to your account/i.test(normalizedBody)) {
      return /credited|has been successfully added/i.test(normalizedBody) &&
        !/\bis debited\b|\bis deducted\b/i.test(normalizedBody)
        ? 'HDFC_IMPS_CREDIT'
        : 'HDFC_IMPS_DEBIT';
    }
    if (
      /deducted from your account/i.test(normalizedBody) &&
      !/Online Banking|Transfer to payee/i.test(normalizedBody)
    ) {
      return 'HDFC_IMPS_DEBIT';
    }
    // UPI Credit (gmail-01 Email 6: "Rs. 7000.00 is successfully credited ... by VPA ... UPI transaction reference number is ...")
    if (
      /\bis (?:successfully )?credited\b/i.test(normalizedBody) &&
      (/\bupi\b/i.test(normalizedBody) || /\bVPA\b/i.test(normalizedBody))
    ) {
      return 'HDFC_UPI_CREDIT';
    }
    // UPI Debit (gmail-03 / gmail-04)
    if (
      /\bis debited\b/i.test(normalizedBody) &&
      (/\bupi\b/i.test(normalizedBody) || /\bVPA\b/i.test(normalizedBody))
    ) {
      return 'HDFC_UPI_DEBIT';
    }
    // HDFC NetBanking / Online Banking transfers (gmail-01 Emails 1, 4, 5)
    if (
      /HDFC Bank NetBanking|HDFC Bank Online Banking|Transfer to payee/i.test(normalizedBody)
    ) {
      return /\bcredited\b/i.test(normalizedBody) ? 'HDFC_EFT_CREDIT' : 'HDFC_EFT_DEBIT';
    }
    if (/\bis debited\b/i.test(normalizedBody)) {
      return 'HDFC_UPI_DEBIT';
    }
    if (/available balance/i.test(normalizedBody)) {
      return 'HDFC_BALANCE_ALERT';
    }
  }

  if (
    from === 'mahaalert@mahabank.co.in' ||
    from === 'mahaalerts@bankofmaharashtra.bank.in' ||
    from.includes('mahabank') ||
    from.includes('bankofmaharashtra')
  ) {
    if (/\bRTGS\b/i.test(normalizedBody)) return 'BOM_RTGS';
    if (/\bNEFT\b/i.test(normalizedBody)) return 'BOM_NEFT';
    if (/\bUPI\b/i.test(normalizedBody)) return 'BOM_UPI';
    return 'BOM_IMPS';
  }

  if (from === 'ho.starsandesh@bankofindia.co.in' || from.includes('bankofindia')) {
    if (/\bRTGS\b/i.test(normalizedBody)) return 'BOI_RTGS';
    if (/\bNEFT\b/i.test(normalizedBody)) return 'BOI_NEFT';
    if (/\bUPI\b/i.test(normalizedBody)) return 'BOI_UPI';
    return 'BOI_IMPS';
  }

  if (
    /(?:INR|Rs\.?|₹)\s*[\d,]+/i.test(normalizedBody) &&
    /\b(?:credited|debited|deducted|transferred|paid)\b/i.test(normalizedBody) &&
    /\b(?:UPI|IMPS|NEFT|RTGS|A\/c|Account)\b/i.test(normalizedBody)
  ) {
    return 'GENERIC_BANK_ALERT';
  }

  return 'UNKNOWN';
}

export function parseGmailTransactionEmail(message: GmailMessage): GmailParseOutcome {
  const rawFrom = message.from || extractGmailHeader(message, 'From');
  const fromAddress = extractEmailAddress(rawFrom);
  const subject = (message.subject || extractGmailHeader(message, 'Subject') || '').trim();
  const body = extractGmailMessageBody(message);
  const kind = identifyGmailEmailType(fromAddress, body, subject);

  switch (kind) {
    case 'OTP_OR_PROMO':
      return {
        kind: 'OTP_OR_PROMO',
        record_type: 'ignored',
        gmail_msg_id: message.id,
        from_address: fromAddress,
        subject,
        reason: 'OTP, statement notice, or non-transaction alert ignored',
      };
    case 'HDFC_UPI_DEBIT':
      return parseHdfcUpiDebit({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_UPI_CREDIT':
      return parseHdfcUpiCredit({
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
    case 'HDFC_EFT_DEBIT':
    case 'HDFC_EFT_CREDIT':
      return parseHdfcEftTransfer({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_RTGS_CREDIT':
    case 'HDFC_RTGS_DEBIT':
      return parseHdfcRtgsAlert({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'HDFC_NEFT_CREDIT':
    case 'HDFC_NEFT_DEBIT':
      return parseHdfcNeftAlert({
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
    case 'BOM_NEFT':
    case 'BOM_RTGS':
    case 'BOM_UPI':
      return parseBomAlert({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'BOI_IMPS':
    case 'BOI_NEFT':
    case 'BOI_RTGS':
    case 'BOI_UPI':
      return parseBoiAlert({
        msgId: message.id,
        fromAddress,
        subject,
        body,
        internalDate: message.internalDate,
      });
    case 'GENERIC_BANK_ALERT':
      return parseGenericBankAlert({
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
