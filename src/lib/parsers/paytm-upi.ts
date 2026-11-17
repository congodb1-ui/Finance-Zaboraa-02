import type { ColumnMapping, ParseResult, ParsedTransaction } from '../../types/uploads';
import type { Account } from '../../types/accounts';
import { extractPDFRawData, type PDFExtractionResult, type ExtractedTextItem } from './pdf';
import { buildIsoTimestamp, extractUpiRef, parseIndianDate, parseMonetaryValue } from './utils';
import { isStatementNoiseLine } from './strip-statement-noise';

const PAYTM_COLUMNS = [
  'Date',
  'Description',
  'Notes & Tags',
  'Your Account',
  'UPI Ref No',
  'Debit',
  'Credit',
];

const PAYTM_MAPPING: ColumnMapping = {
  date_col: 'Date',
  description_col: 'Description',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: null,
  reference_col: 'UPI Ref No',
  amount_col: null,
  is_single_amount_col: false,
};

export interface PaytmTagMapping {
  tag: string;
  category: string;
  aliases: string[];
  workspace: 'Personal';
}

export const PAYTM_TAG_MAP: Record<string, PaytmTagMapping> = {
  food: { tag: '# Food', category: 'Food', aliases: ['Food', 'Food & Dining'], workspace: 'Personal' },
  fuel: { tag: '# Fuel', category: 'Fuel', aliases: ['Fuel'], workspace: 'Personal' },
  shopping: { tag: '# Shopping', category: 'Shopping', aliases: ['Shopping'], workspace: 'Personal' },
  groceries: { tag: '# Groceries', category: 'Groceries', aliases: ['Groceries'], workspace: 'Personal' },
  travel: { tag: '# Travel', category: 'Travel', aliases: ['Travel'], workspace: 'Personal' },
  entertainment: {
    tag: '# Entertainment',
    category: 'Subscriptions',
    aliases: ['Subscriptions', 'Entertainment'],
    workspace: 'Personal',
  },
  health: {
    tag: '# Health',
    category: 'Health',
    aliases: ['Health', 'Medical & Health'],
    workspace: 'Personal',
  },
  utilities: { tag: '# Utilities', category: 'Utilities', aliases: ['Utilities'], workspace: 'Personal' },
  education: { tag: '# Education', category: 'Education', aliases: ['Education'], workspace: 'Personal' },
  recharge: {
    tag: '# Recharge',
    category: 'Utilities',
    aliases: ['Utilities', 'Recharge'],
    workspace: 'Personal',
  },
  transfer: {
    tag: '# Transfer',
    category: 'Self Transfer',
    aliases: ['Self Transfer', 'Self-Transfer'],
    workspace: 'Personal',
  },
};

/**
 * Resolves a Paytm `# Tag` string (e.g. "# Food", "#Fuel") to its system category & workspace.
 */
export function resolvePaytmTagCategory(rawNotesOrTag: string | null | undefined): PaytmTagMapping | null {
  if (!rawNotesOrTag) return null;
  const matches = rawNotesOrTag.matchAll(/#\s*([A-Za-z]+)/g);
  for (const m of matches) {
    const key = m[1].toLowerCase();
    if (PAYTM_TAG_MAP[key]) {
      return PAYTM_TAG_MAP[key];
    }
  }
  return null;
}

/**
 * Matches a Paytm "Your Account" label (e.g. "HDFC Bank - 97") against registered accounts
 * using bank name containment and last-2-digit suffix matching.
 */
export function matchAccountForPaytm(
  accountLabel: string | null | undefined,
  accounts: Account[]
): Account | null {
  if (!accountLabel || accounts.length === 0) return null;
  const label = accountLabel.trim();
  const m = label.match(/^(.*?)\s*[-–]\s*(\d{2,4})\b/);
  const bankPart = (m ? m[1] : label)
    .toLowerCase()
    .replace(/\bbank\b/g, '')
    .trim();
  const suffixDigits = m ? m[2] : '';

  const candidates = accounts.filter((acc) => {
    const accBank = (acc.bank_name || '').toLowerCase();
    const bankMatch =
      bankPart.length === 0 ||
      accBank.includes(bankPart) ||
      bankPart.split(/\s+/).some((tok) => tok.length >= 3 && accBank.includes(tok));
    if (!bankMatch) return false;
    if (suffixDigits) {
      return (acc.account_number_last4 || '').endsWith(suffixDigits);
    }
    return true;
  });

  if (candidates.length > 0) {
    return candidates.find((a) => a.is_active) || candidates[0];
  }

  // Suffix-only fallback if bank label was abbreviated
  if (suffixDigits) {
    const suffixMatch = accounts.find((a) => (a.account_number_last4 || '').endsWith(suffixDigits));
    if (suffixMatch) return suffixMatch;
  }

  return null;
}

/**
 * Checks whether PDF/statement text is a Paytm / PhonePe UPI statement.
 */
export function isPaytmStatement(text: string): boolean {
  const lower = (text || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('one97 communications') || lower.includes('paytm passbook')) {
    return true;
  }
  const hasWalletStructure =
    (lower.includes('notes & tags') && lower.includes('your account')) ||
    (lower.includes('upi ref no') &&
      (lower.includes('your account') || lower.includes('notes & tags') || lower.includes('transaction details')));
  if (hasWalletStructure) return true;

  // Reject standard bank statements (HDFC, BOM, BOI, SBI, ICICI, Axis) whose narrations mention @paytm / SENT USING PAYTM
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
    (lower.includes('upi statement') && (lower.includes('paytm') || lower.includes('phonepe'))) ||
    (/\bpaytm\b/.test(lower) && !lower.includes('@paytm') && !lower.includes('sent using paytm') && !lower.includes('sent from paytm')) ||
    (/\bphonepe\b/.test(lower) && !lower.includes('from phone'))
  );
}

function inferStatementYear(fullText: string): number {
  const periodMatch = fullText.match(
    /(?:statement|period|from)\s*[:\-]?\s*\d{1,2}\s+[A-Za-z]{3,9}\s+(20\d{2})/i
  );
  if (periodMatch) {
    const y = parseInt(periodMatch[1], 10);
    if (y >= 2015 && y <= 2099) return y;
  }
  const anyYear = fullText.match(/\b(202\d)\b/);
  if (anyYear) {
    return parseInt(anyYear[1], 10);
  }
  return new Date().getFullYear();
}

function isPaytmHeaderOrFooter(text: string): boolean {
  if (!text) return true;
  if (isStatementNoiseLine(text)) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('date & time') ||
    lower.includes('transaction details') ||
    lower.includes('notes & tags') ||
    lower.includes('your account') ||
    lower.includes('upi statement') ||
    lower.includes('passbook') ||
    lower.includes('page ') ||
    lower.includes('powered by') ||
    lower.includes('one97 communications') ||
    lower.includes('total money') ||
    lower.includes('money sent') ||
    lower.includes('money received')
  );
}

interface ColumnBounds {
  dateMaxX: number;
  detailsMaxX: number;
  notesMaxX: number;
  accountMaxX: number;
}

function detectPaytmColumnBounds(items: ExtractedTextItem[]): ColumnBounds | null {
  const findHeader = (kw: string) =>
    items.find((it) => it.text.toLowerCase().includes(kw));

  const dateH = findHeader('date');
  const detailsH = findHeader('transaction details') || findHeader('details');
  const notesH = findHeader('notes');
  const accountH = findHeader('your account') || findHeader('account');
  const amountH = findHeader('amount');

  if (detailsH && amountH) {
    const detailsX = detailsH.x;
    const notesX = notesH ? notesH.x : detailsX + 160;
    const accountX = accountH ? accountH.x : notesX + 90;
    const amountX = amountH.x;
    return {
      dateMaxX: Math.max((dateH?.x ?? 20) + 55, detailsX - 8),
      detailsMaxX: Math.max(detailsX + 80, notesX - 8),
      notesMaxX: Math.max(notesX + 50, accountX - 8),
      accountMaxX: Math.max(accountX + 50, amountX - 8),
    };
  }
  return null;
}

function extractPayeeFromDetails(detailsLines: string[]): string {
  const firstLine = (detailsLines[0] || '').trim();
  if (!firstLine) return 'UPI Transaction';
  const paidTo = firstLine.match(/^(?:Paid\s+to|Money\s+sent\s+to|Received\s+from|Paid\s+for|Transfer\s+to)\s+(.+)$/i);
  if (paidTo && paidTo[1]) {
    return firstLine; // Keep readable "Paid to X" or extracted payee cleanly
  }
  return firstLine;
}

interface RawPaytmBlock {
  dateLines: string[];
  detailLines: string[];
  noteLines: string[];
  accountLines: string[];
  amountRaw: string;
}

const DATE_DAY_MONTH_RE = /^(\d{1,2}\s+[A-Za-z]{3,9})(?:\s+(\d{2,4}))?$/;
const AMOUNT_SIGNED_RE = /^([+-])\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)$/i;

export async function parsePaytmUPI(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));
  const fallbackYear = inferStatementYear(pdfData.fullDocumentText);

  let bounds: ColumnBounds | null = null;
  for (const page of pdfData.pages) {
    bounds = detectPaytmColumnBounds(page.textItems);
    if (bounds) break;
  }

  const blocks: RawPaytmBlock[] = [];
  let current: RawPaytmBlock | null = null;

  const pushCurrent = () => {
    if (current && current.dateLines.length > 0 && current.amountRaw) {
      blocks.push(current);
    }
    current = null;
  };

  for (const page of pdfData.pages) {
    // Group page textItems by Y coordinate (±3.5px)
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
      if (!lineText || isPaytmHeaderOrFooter(lineText)) continue;

      if (bounds) {
        const colDate: string[] = [];
        const colDetails: string[] = [];
        const colNotes: string[] = [];
        const colAccount: string[] = [];
        const colAmount: string[] = [];

        for (const it of line.items) {
          const txt = it.text.trim();
          if (!txt) continue;
          if (it.x < bounds.dateMaxX) colDate.push(txt);
          else if (it.x < bounds.detailsMaxX) colDetails.push(txt);
          else if (it.x < bounds.notesMaxX) colNotes.push(txt);
          else if (it.x < bounds.accountMaxX) colAccount.push(txt);
          else colAmount.push(txt);
        }

        const dateJoined = colDate.join(' ').trim();
        const amountJoined = colAmount.join(' ').trim();
        const isAnchor = DATE_DAY_MONTH_RE.test(dateJoined) || AMOUNT_SIGNED_RE.test(amountJoined);

        if (isAnchor && DATE_DAY_MONTH_RE.test(dateJoined)) {
          pushCurrent();
          current = {
            dateLines: [dateJoined],
            detailLines: colDetails.length ? [colDetails.join(' ')] : [],
            noteLines: colNotes.length ? [colNotes.join(' ')] : [],
            accountLines: colAccount.length ? [colAccount.join(' ')] : [],
            amountRaw: amountJoined,
          };
        } else if (current) {
          if (dateJoined) current.dateLines.push(dateJoined);
          if (colDetails.length) current.detailLines.push(colDetails.join(' '));
          if (colNotes.length) current.noteLines.push(colNotes.join(' '));
          if (colAccount.length) current.accountLines.push(colAccount.join(' '));
          if (amountJoined && !current.amountRaw) current.amountRaw = amountJoined;
        }
      } else {
        // Grid-row fallback when column headers could not be located via X-coordinates
        const dateMatch = lineText.match(/^(\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?)\s+(.*)$/);
        const amtMatch = lineText.match(/([+-]\s*(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?)\s*$/i);
        if (dateMatch && amtMatch) {
          pushCurrent();
          current = {
            dateLines: [dateMatch[1]],
            detailLines: [dateMatch[2].replace(amtMatch[1], '').trim()],
            noteLines: [],
            accountLines: [],
            amountRaw: amtMatch[1],
          };
        } else if (current) {
          current.detailLines.push(lineText);
        }
      }
    }
  }
  pushCurrent();

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  for (const blk of blocks) {
    const rawDateStr = blk.dateLines[0] || '';
    const rawTimeStr = blk.dateLines[1] || '';
    const isoDate = parseIndianDate(rawDateStr, fallbackYear);
    if (!isoDate) continue;

    const amtSigned = parseMonetaryValue(blk.amountRaw);
    if (amtSigned === null || amtSigned === 0) continue;

    const isDebit = amtSigned < 0 || /^\s*-/.test(blk.amountRaw);
    const absAmt = Math.abs(amtSigned);
    const debit = isDebit ? absAmt : null;
    const credit = !isDebit ? absAmt : null;

    const detailsJoined = blk.detailLines.join('\n').trim();
    const notesJoined = blk.noteLines.join(' ').trim();
    const accountJoined = blk.accountLines.join(' ').trim();

    const upiRef = extractUpiRef(detailsJoined) || extractUpiRef(blk.detailLines.join(' '));
    const payee = extractPayeeFromDetails(blk.detailLines);
    const tagMatch = resolvePaytmTagCategory(notesJoined) || resolvePaytmTagCategory(detailsJoined);
    const timestamp = buildIsoTimestamp(isoDate, rawTimeStr);

    const parsedTx: ParsedTransaction = {
      txn_date: isoDate,
      description: payee,
      debit,
      credit,
      balance: null,
      balance_after: null,
      reference_number: upiRef,
      upi_ref_no: upiRef,
      imps_ref_no: null,
      source: 'statement_import',
      ai_category_skip: Boolean(tagMatch),
      category_name: tagMatch ? tagMatch.category : null,
      workspace: tagMatch ? tagMatch.workspace : null,
      paytm_tag: tagMatch ? tagMatch.tag : null,
      account_hint: accountJoined || null,
      timestamp,
      raw_notes: notesJoined || null,
    };
    transactions.push(parsedTx);

    rows.push({
      Date: isoDate,
      Description: payee,
      'Notes & Tags': notesJoined,
      'Your Account': accountJoined,
      'UPI Ref No': upiRef || '',
      Debit: debit !== null ? debit.toFixed(2) : '',
      Credit: credit !== null ? credit.toFixed(2) : '',
    });
  }

  return {
    headers: [...PAYTM_COLUMNS],
    rows,
    parser_version: 'paytm-upi-pdf-v1',
    detected_bank: 'Paytm UPI',
    confidence: rows.length > 0 ? 'high' : 'none',
    suggested_mapping: PAYTM_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    raw_text: pdfData.fullDocumentText,
    transactions,
  };
}
