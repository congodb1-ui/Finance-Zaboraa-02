import Papa from 'papaparse';
import type { ColumnMapping, ParseResult, ParsedTransaction } from '../../types/uploads';
import type { Account } from '../../types/accounts';
import { extractPDFRawData, type PDFExtractionResult, type ExtractedTextItem } from './pdf';
import { buildIsoTimestamp, parseIndianDate, parseMonetaryValue } from './utils';
import { isStatementNoiseLine } from './strip-statement-noise';

const GPAY_COLUMNS = [
  'Date',
  'Description',
  'UPI Transaction ID',
  'Bank used',
  'Debit',
  'Credit',
];

const GPAY_MAPPING: ColumnMapping = {
  date_col: 'Date',
  description_col: 'Description',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: null,
  reference_col: 'UPI Transaction ID',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks whether PDF or CSV text looks like a Google Pay (GPay) export.
 */
export function isGPayStatement(text: string): boolean {
  const lower = (text || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('upi transaction id') && (lower.includes('payee') || lower.includes('bank used'))) {
    return true;
  }
  if (
    lower.includes('hdfc bank') ||
    lower.includes('bank of maharashtra') ||
    lower.includes('state bank of india') ||
    lower.includes('chq./ref.no.') ||
    lower.includes('withdrawal amt')
  ) {
    return false;
  }
  return (
    lower.includes('google pay') ||
    lower.includes('upi transaction id') ||
    (/\bgpay\b/.test(lower) && !lower.includes('-gpay-') && !lower.includes('using gpay'))
  );
}

/**
 * Matches "Bank used" column from a GPay export against registered accounts.
 * When multiple accounts share the same bank, prefers:
 * 1) Account with `upi_id` set
 * 2) HDFC account ending in 3597 (default GPay linked account)
 * 3) First active matching account
 */
export function matchAccountForGPay(
  bankUsed: string | null | undefined,
  accounts: Account[]
): Account | null {
  if (!bankUsed || accounts.length === 0) return null;
  const cleaned = bankUsed.toLowerCase().replace(/\bbank\b/g, '').trim();
  if (!cleaned) return null;

  const matching = accounts.filter((acc) => {
    const accBank = (acc.bank_name || '').toLowerCase();
    return (
      accBank.includes(cleaned) ||
      cleaned.split(/\s+/).some((tok) => tok.length >= 3 && accBank.includes(tok))
    );
  });

  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  const withUpi = matching.find((a) => Boolean(a.upi_id && a.upi_id.trim()));
  if (withUpi) return withUpi;

  if (cleaned.includes('hdfc')) {
    const hdfc3597 = matching.find((a) => a.account_number_last4 === '3597');
    if (hdfc3597) return hdfc3597;
  }

  return matching.find((a) => a.is_active) || matching[0];
}

function parseGPayDateAndTime(raw: string): { isoDate: string; timestamp: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const commaParts = cleaned.split(',');
  const datePart = (commaParts[0] || '').trim();
  const timePart = commaParts.slice(1).join(',').trim();

  const isoDate = parseIndianDate(datePart) || parseIndianDate(cleaned);
  if (!isoDate) return null;

  // Check if time is embedded without a comma (e.g. "14 Nov 2026 3:30 PM")
  let resolvedTime = timePart;
  if (!resolvedTime) {
    const tMatch = cleaned.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)$/i);
    if (tMatch) resolvedTime = tMatch[1];
  }

  return {
    isoDate,
    timestamp: buildIsoTimestamp(isoDate, resolvedTime || null),
  };
}

function buildRowAndTx(params: {
  rawDateTime: string;
  payee: string;
  upiTxnId: string;
  bankUsed: string;
  amountRaw: string;
}): { row: Record<string, string>; tx: ParsedTransaction } | null {
  const dt = parseGPayDateAndTime(params.rawDateTime);
  if (!dt) return null;

  const parsedAmt = parseMonetaryValue(params.amountRaw);
  if (parsedAmt === null || parsedAmt === 0) return null;

  // GPay exports only contain outgoing payments (always DEBIT)
  const absAmt = Math.abs(parsedAmt);
  const cleanUpiId = (params.upiTxnId || '').replace(/[^A-Za-z0-9]/g, '').trim() || null;
  const payee = (params.payee || '').trim() || 'GPay Payment';
  const bankUsed = (params.bankUsed || '').trim();

  const tx: ParsedTransaction = {
    txn_date: dt.isoDate,
    description: payee,
    debit: absAmt,
    credit: null,
    balance: null,
    balance_after: null,
    reference_number: cleanUpiId,
    upi_ref_no: cleanUpiId,
    imps_ref_no: null,
    source: 'statement_import',
    account_hint: bankUsed || null,
    timestamp: dt.timestamp,
  };

  const row: Record<string, string> = {
    Date: dt.isoDate,
    Description: payee,
    'UPI Transaction ID': cleanUpiId || '',
    'Bank used': bankUsed,
    Debit: absAmt.toFixed(2),
    Credit: '',
  };

  return { row, tx };
}

function findHeaderColIndex(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[._\-]/g, ' ').replace(/\s+/g, ' ').trim());
  for (const cand of candidates) {
    const exact = norm.findIndex((h) => h === cand);
    if (exact !== -1) return exact;
  }
  for (const cand of candidates) {
    const partial = norm.findIndex((h) => h.includes(cand));
    if (partial !== -1) return partial;
  }
  return -1;
}

export function parseGPayCSV(csvText: string): ParseResult {
  const cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const parsed = Papa.parse<string[]>(cleanText, {
    skipEmptyLines: 'greedy',
    delimiter: '',
  });
  const matrix = parsed.data || [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const line = (matrix[i] || []).join(' ').toLowerCase();
    if (
      (line.includes('date') && (line.includes('payee') || line.includes('upi transaction id'))) ||
      line.includes('upi transaction id')
    ) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      headers: [...GPAY_COLUMNS],
      rows: [],
      transactions: [],
      parser_version: 'gpay-csv-v1',
      detected_bank: 'Google Pay',
      confidence: 'none',
      suggested_mapping: GPAY_MAPPING,
      parseError: 'GPay CSV headers not recognised.',
    };
  }

  const headers = matrix[headerIdx].map((h) => (h || '').trim());
  const dateIdx = findHeaderColIndex(headers, ['date & time', 'date and time', 'date', 'time']);
  const payeeIdx = findHeaderColIndex(headers, ['payee name', 'payee', 'paid to', 'description', 'name']);
  const upiIdx = findHeaderColIndex(headers, ['upi transaction id', 'upi ref no', 'transaction id', 'upi id']);
  const bankIdx = findHeaderColIndex(headers, ['bank used', 'bank', 'payment method', 'account']);
  const amountIdx = findHeaderColIndex(headers, ['amount', 'amount (inr)', 'txn amount']);

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.length === 0) continue;

    const item = buildRowAndTx({
      rawDateTime: dateIdx >= 0 ? rawRow[dateIdx] || '' : rawRow[0] || '',
      payee: payeeIdx >= 0 ? rawRow[payeeIdx] || '' : rawRow[1] || '',
      upiTxnId: upiIdx >= 0 ? rawRow[upiIdx] || '' : rawRow[2] || '',
      bankUsed: bankIdx >= 0 ? rawRow[bankIdx] || '' : rawRow[3] || '',
      amountRaw: amountIdx >= 0 ? rawRow[amountIdx] || '' : rawRow[rawRow.length - 1] || '',
    });

    if (item) {
      rows.push(item.row);
      transactions.push(item.tx);
    }
  }

  return {
    headers: [...GPAY_COLUMNS],
    rows,
    transactions,
    parser_version: 'gpay-csv-v1',
    detected_bank: 'Google Pay',
    confidence: rows.length > 0 ? 'high' : 'none',
    suggested_mapping: GPAY_MAPPING,
  };
}

interface GPayBounds {
  dateMaxX: number;
  payeeMaxX: number;
  upiMaxX: number;
  bankMaxX: number;
}

function detectGPayBounds(items: ExtractedTextItem[]): GPayBounds | null {
  const dateH = items.find((i) => i.text.toLowerCase().includes('date'));
  const payeeH = items.find((i) => i.text.toLowerCase().includes('payee'));
  const upiH = items.find((i) => i.text.toLowerCase().includes('upi transaction'));
  const bankH = items.find((i) => i.text.toLowerCase().includes('bank'));
  const amtH = items.find((i) => i.text.toLowerCase().includes('amount'));

  if (payeeH && amtH) {
    const upiX = upiH ? upiH.x : payeeH.x + 140;
    const bankX = bankH ? bankH.x : upiX + 110;
    return {
      dateMaxX: Math.max((dateH?.x ?? 20) + 70, payeeH.x - 8),
      payeeMaxX: Math.max(payeeH.x + 80, upiX - 8),
      upiMaxX: Math.max(upiX + 70, bankX - 8),
      bankMaxX: Math.max(bankX + 60, amtH.x - 8),
    };
  }
  return null;
}

export async function parseGPayPDF(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));

  let bounds: GPayBounds | null = null;
  for (const p of pdfData.pages) {
    bounds = detectGPayBounds(p.textItems);
    if (bounds) break;
  }

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  for (const page of pdfData.pages) {
    const sorted = [...page.textItems].sort((a, b) => b.y - a.y || a.x - b.x);
    const yLines: Array<{ y: number; items: ExtractedTextItem[] }> = [];
    for (const item of sorted) {
      const cluster = yLines.find((l) => Math.abs(l.y - item.y) <= 3.5);
      if (cluster) cluster.items.push(item);
      else yLines.push({ y: item.y, items: [item] });
    }

    for (const line of yLines) {
      line.items.sort((a, b) => a.x - b.x);
      const lineText = line.items.map((it) => it.text.trim()).filter(Boolean).join(' ');
      const lower = lineText.toLowerCase();
      if (
        !lineText ||
        isStatementNoiseLine(lineText) ||
        lower.includes('upi transaction id') ||
        lower.includes('date & time') ||
        lower.includes('google pay') ||
        lower.includes('page ')
      ) {
        continue;
      }

      if (bounds) {
        const cDate: string[] = [];
        const cPayee: string[] = [];
        const cUpi: string[] = [];
        const cBank: string[] = [];
        const cAmt: string[] = [];

        for (const it of line.items) {
          const t = it.text.trim();
          if (!t) continue;
          if (it.x < bounds.dateMaxX) cDate.push(t);
          else if (it.x < bounds.payeeMaxX) cPayee.push(t);
          else if (it.x < bounds.upiMaxX) cUpi.push(t);
          else if (it.x < bounds.bankMaxX) cBank.push(t);
          else cAmt.push(t);
        }

        const item = buildRowAndTx({
          rawDateTime: cDate.join(' '),
          payee: cPayee.join(' '),
          upiTxnId: cUpi.join(' '),
          bankUsed: cBank.join(' '),
          amountRaw: cAmt.join(' '),
        });
        if (item) {
          rows.push(item.row);
          transactions.push(item.tx);
        }
      } else {
        // Regex fallback on merged gridRow text
        const m = lineText.match(
          /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\s+(.+?)\s+(\d{10,16})\s+([A-Za-z\s]+?)\s+((?:Rs\.?|INR|₹)?\s*[\d,]+(?:\.\d{1,2})?)$/i
        );
        if (m) {
          const item = buildRowAndTx({
            rawDateTime: m[1],
            payee: m[2],
            upiTxnId: m[3],
            bankUsed: m[4],
            amountRaw: m[5],
          });
          if (item) {
            rows.push(item.row);
            transactions.push(item.tx);
          }
        }
      }
    }
  }

  return {
    headers: [...GPAY_COLUMNS],
    rows,
    transactions,
    parser_version: 'gpay-pdf-v1',
    detected_bank: 'Google Pay',
    confidence: rows.length > 0 ? 'high' : 'none',
    suggested_mapping: GPAY_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    raw_text: pdfData.fullDocumentText,
  };
}

/**
 * Unified Google Pay parser supporting both CSV (.csv / text/csv) and PDF.
 */
export async function parseGPay(
  input: string | ArrayBuffer | Uint8Array,
  options?: {
    mimeType?: string;
    fileName?: string;
    preExtracted?: PDFExtractionResult;
  }
): Promise<ParseResult> {
  const isCsv =
    typeof input === 'string' ||
    options?.mimeType === 'text/csv' ||
    options?.fileName?.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const csvStr =
      typeof input === 'string'
        ? input
        : new TextDecoder('utf-8').decode(
            input instanceof Uint8Array ? input : new Uint8Array(input)
          );
    return parseGPayCSV(csvStr);
  }

  return parseGPayPDF(input as ArrayBuffer | Uint8Array, options?.preExtracted);
}
