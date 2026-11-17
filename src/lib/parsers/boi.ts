import Papa from 'papaparse';
import type { ColumnMapping, ParseResult, ParsedTransaction } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { extractImpsRef, parseIndianDate, parseMonetaryValue } from './utils';
import { isStatementNoiseLine } from './strip-statement-noise';
import { parseBankNarration } from './bank-transaction';

const BOI_COLUMNS = [
  'Date',
  'Narration',
  'Chq/Ref Number',
  'Debit',
  'Credit',
  'Balance',
];

const BOI_MAPPING: ColumnMapping = {
  date_col: 'Date',
  description_col: 'Narration',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: 'Balance',
  reference_col: 'Chq/Ref Number',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks whether text belongs to a Bank of India (BOI) statement,
 * excluding State Bank of India, Central Bank of India, Union Bank of India, HDFC Bank, etc.
 */
export function isBOIStatement(text: string): boolean {
  const lower = (text || '').toLowerCase();
  if (!lower.includes('bank of india')) return false;
  if (
    lower.includes('state bank of india') ||
    lower.includes('central bank of india') ||
    lower.includes('union bank of india') ||
    lower.includes('reserve bank of india') ||
    lower.includes('industrial development bank of india') ||
    lower.includes('hdfc bank') ||
    lower.includes('hdfcbank') ||
    lower.includes('bank of maharashtra') ||
    lower.includes('icici bank') ||
    lower.includes('axis bank') ||
    lower.includes('kotak mahindra')
  ) {
    return false;
  }
  return true;
}

function isBOIHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return (
    joined.includes('date') &&
    (joined.includes('narration') || joined.includes('particulars') || joined.includes('description')) &&
    (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('balance') || joined.includes('amount'))
  );
}

function isBOIFooterOrMeta(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  if (isStatementNoiseLine(cells.join(' '))) return true;
  return (
    joined.includes('bank of india') ||
    joined.includes('star connect') ||
    joined.includes('statement of account') ||
    joined.includes('opening balance') ||
    joined.includes('closing balance') ||
    joined.includes('page no') ||
    joined.includes('page :') ||
    joined.includes('generated on') ||
    joined.includes('customer id') ||
    joined.includes('account no') ||
    joined.includes('total debit') ||
    joined.includes('total credit')
  );
}

function parseBOIGridRows(gridRows: string[][]): {
  hasValidHeader: boolean;
  rows: Array<Record<string, string>>;
  transactions: ParsedTransaction[];
} {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(gridRows.length, 40); i++) {
    if (isBOIHeaderRow(gridRows[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { hasValidHeader: false, rows: [], transactions: [] };
  }

  const headerCells = gridRows[headerIdx].map((c) => c.toLowerCase().trim());
  const findCol = (kws: string[]) => headerCells.findIndex((h) => kws.some((k) => h.includes(k)));

  const dateIdx = findCol(['date', 'txn date', 'tran date']);
  const descIdx = findCol(['narration', 'particulars', 'description', 'remarks']);
  const refIdx = findCol(['chq', 'ref', 'cheque', 'reference']);
  const debitIdx = findCol(['debit', 'withdrawal', 'dr']);
  const creditIdx = findCol(['credit', 'deposit', 'cr']);
  const balanceIdx = findCol(['balance', 'bal']);

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  let activeRow: Record<string, string> | null = null;
  let activeTx: ParsedTransaction | null = null;
  let runningBalance: number | null = null;

  const flushActive = () => {
    if (activeRow && activeTx) {
      const rawNarration = activeTx.description;
      const bankParsed = parseBankNarration(rawNarration, activeTx.reference_number || undefined);
      const impsRef =
        extractImpsRef(rawNarration) ||
        extractImpsRef(activeTx.reference_number || '');
      activeTx.raw_description = rawNarration;
      if (bankParsed.transactionType !== 'OTHER') {
        activeTx.description = bankParsed.description;
      }
      activeTx.imps_ref_no = impsRef;
      if (!activeTx.reference_number && (bankParsed.reference || impsRef)) {
        activeTx.reference_number = bankParsed.reference || impsRef || null;
        activeRow['Chq/Ref Number'] = activeTx.reference_number || '';
      }
      activeRow.Narration = activeTx.description;
      activeRow['Raw Narration'] = rawNarration;
      rows.push(activeRow);
      transactions.push(activeTx);
    }
    activeRow = null;
    activeTx = null;
  };

  for (let r = headerIdx + 1; r < gridRows.length; r++) {
    const cells = gridRows[r];
    if (!cells || cells.length === 0) continue;
    if (isBOIHeaderRow(cells) || isBOIFooterOrMeta(cells)) continue;

    const dateCandidate = cells[dateIdx >= 0 ? dateIdx : 0] || '';
    const isoDate = parseIndianDate(dateCandidate);

    if (!isoDate) {
      if (activeTx && cells.length <= 3) {
        const extra = cells.map((c) => c.trim()).filter(Boolean).join(' ');
        if (extra && !/^\d[\d,.]*$/.test(extra)) {
          activeTx.description = `${activeTx.description} ${extra}`.trim();
        }
      }
      continue;
    }

    flushActive();

    const getCell = (idx: number, fallbackIdx: number): string => {
      if (idx >= 0 && idx < cells.length) return (cells[idx] || '').trim();
      if (fallbackIdx >= 0 && fallbackIdx < cells.length) return (cells[fallbackIdx] || '').trim();
      return '';
    };

    const narration = getCell(descIdx, 1) || 'Bank of India Txn';
    const refRaw = getCell(refIdx, -1);

    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;

    if (debitIdx >= 0 && creditIdx >= 0) {
      if (cells.length >= headerCells.length) {
        const dVal = parseMonetaryValue(cells[debitIdx]);
        const cVal = parseMonetaryValue(cells[creditIdx]);
        debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
        credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
        balance = balanceIdx >= 0 ? parseMonetaryValue(cells[balanceIdx]) : null;
      } else {
        const numericTail = cells
          .slice(Math.max(1, (descIdx >= 0 ? descIdx : 1) + 1))
          .map((c) => ({ raw: c, val: parseMonetaryValue(c) }))
          .filter((x) => x.val !== null);

        if (numericTail.length >= 2) {
          balance = numericTail[numericTail.length - 1].val;
          const amt = Math.abs(numericTail[numericTail.length - 2].val!);
          if (runningBalance !== null && balance !== null) {
            const dDiff = Math.abs(runningBalance - amt - balance);
            const cDiff = Math.abs(runningBalance + amt - balance);
            if (cDiff < 0.05 && dDiff >= 0.05) {
              credit = amt;
            } else if (dDiff < 0.05 && cDiff >= 0.05) {
              debit = amt;
            } else if (/\bcr\b/i.test(numericTail[numericTail.length - 2].raw) || /(?:IMPS|NEFT|RTGS|UPI)[\/\s]CR/i.test(narration)) {
              credit = amt;
            } else {
              debit = amt;
            }
          } else if (/\bcr\b/i.test(numericTail[numericTail.length - 2].raw) || /(?:IMPS|NEFT|RTGS|UPI)[\/\s]CR/i.test(narration)) {
            credit = amt;
          } else {
            debit = amt;
          }
        } else if (numericTail.length === 1) {
          if (/(?:IMPS|NEFT|RTGS|UPI)[\/\s]CR/i.test(narration)) credit = Math.abs(numericTail[0].val!);
          else debit = Math.abs(numericTail[0].val!);
        }
      }
    } else {
      const dVal = debitIdx >= 0 ? parseMonetaryValue(cells[debitIdx]) : null;
      const cVal = creditIdx >= 0 ? parseMonetaryValue(cells[creditIdx]) : null;
      debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
      credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
      balance = balanceIdx >= 0 ? parseMonetaryValue(cells[balanceIdx]) : null;
    }

    if (debit === null && credit === null) continue;
    if (balance !== null) {
      runningBalance = balance;
    }

    const impsRef = extractImpsRef(narration) || extractImpsRef(refRaw);
    const refNo = refRaw || impsRef || null;

    activeTx = {
      txn_date: isoDate,
      description: narration,
      debit,
      credit,
      balance,
      balance_after: balance,
      reference_number: refNo,
      upi_ref_no: null,
      imps_ref_no: impsRef,
      source: 'statement_import',
    };

    activeRow = {
      Date: isoDate,
      Narration: narration,
      'Chq/Ref Number': refNo || '',
      Debit: debit !== null ? debit.toFixed(2) : '',
      Credit: credit !== null ? credit.toFixed(2) : '',
      Balance: balance !== null ? balance.toFixed(2) : '',
    };
  }

  flushActive();

  return { hasValidHeader: true, rows, transactions };
}

/**
 * Bank of India (BOI) statement parser for PDF or CSV.
 * Extracts IMPS references and handles DD-MM-YYYY, DD/MM/YYYY, and DD MMM YYYY dates.
 */
export async function parseBOI(
  input: string | ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  if (typeof input === 'string') {
    const clean = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const csvParsed = Papa.parse<string[]>(clean, {
      skipEmptyLines: 'greedy',
      delimiter: '',
    });
    const res = parseBOIGridRows(csvParsed.data || []);
    if (!res.hasValidHeader || res.rows.length === 0) {
      return {
        headers: [...BOI_COLUMNS],
        rows: [],
        transactions: [],
        parser_version: 'boi-csv-v1',
        detected_bank: 'Bank of India',
        confidence: 'none',
        suggested_mapping: BOI_MAPPING,
        parseError: 'BOI format not recognised — try Generic CSV',
      };
    }

    return {
      headers: [...BOI_COLUMNS],
      rows: res.rows,
      transactions: res.transactions,
      parser_version: 'boi-csv-v1',
      detected_bank: 'Bank of India',
      confidence: 'high',
      suggested_mapping: BOI_MAPPING,
    };
  }

  const pdfData = preExtracted || (await extractPDFRawData(input));
  const res = parseBOIGridRows(pdfData.allGridRows);

  if (!res.hasValidHeader || res.rows.length === 0) {
    return {
      headers: [...BOI_COLUMNS],
      rows: [],
      transactions: [],
      parser_version: 'boi-pdf-v1',
      detected_bank: 'Bank of India',
      confidence: 'none',
      suggested_mapping: BOI_MAPPING,
      opening_balance: pdfData.openingBalance,
      closing_balance: pdfData.closingBalance,
      raw_text: pdfData.fullDocumentText,
      parseError: 'BOI format not recognised — try Generic CSV',
    };
  }

  return {
    headers: [...BOI_COLUMNS],
    rows: res.rows,
    transactions: res.transactions,
    parser_version: 'boi-pdf-v1',
    detected_bank: 'Bank of India',
    confidence: 'high',
    suggested_mapping: BOI_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    raw_text: pdfData.fullDocumentText,
  };
}
