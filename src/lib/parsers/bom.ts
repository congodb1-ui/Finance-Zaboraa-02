import Papa from 'papaparse';
import type { ColumnMapping, ParseResult, ParsedTransaction } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { extractImpsRef, parseIndianDate, parseMonetaryValue } from './utils';
import { isStatementNoiseLine } from './strip-statement-noise';

const BOM_COLUMNS = [
  'Txn Date',
  'Value Date',
  'Description',
  'Ref No',
  'Debit',
  'Credit',
  'Balance',
];

const BOM_MAPPING: ColumnMapping = {
  date_col: 'Txn Date',
  description_col: 'Description',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: 'Balance',
  reference_col: 'Ref No',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks whether statement text belongs to Bank of Maharashtra.
 */
export function isBOMStatement(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return lower.includes('bank of maharashtra') || lower.includes('mahabank');
}

function isBOMHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return (
    (joined.includes('date') && (joined.includes('description') || joined.includes('narration') || joined.includes('particular'))) &&
    (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('balance'))
  );
}

function isBOMFooterOrMeta(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  if (isStatementNoiseLine(cells.join(' '))) return true;
  return (
    joined.includes('bank of maharashtra') ||
    joined.includes('statement of account') ||
    joined.includes('opening balance') ||
    joined.includes('closing balance') ||
    joined.includes('page no') ||
    joined.includes('page :') ||
    joined.includes('generated on') ||
    joined.includes('account number') ||
    joined.includes('ifsc code') ||
    joined.includes('total debit') ||
    joined.includes('total credit')
  );
}

function extractNeftUtr(text: string): string | null {
  if (!text) return null;
  const m =
    text.match(/UTR[:\s-]+([A-Z]{4}[A-Z0-9]{10,22})/i) ||
    text.match(/NEFT[\/\s-]+([A-Z0-9]{10,22})/i);
  return m ? m[1] : null;
}

function parseBOMGridRows(gridRows: string[][]): {
  hasValidHeader: boolean;
  rows: Array<Record<string, string>>;
  transactions: ParsedTransaction[];
} {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(gridRows.length, 40); i++) {
    if (isBOMHeaderRow(gridRows[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { hasValidHeader: false, rows: [], transactions: [] };
  }

  const headerCells = gridRows[headerIdx].map((c) => c.toLowerCase().trim());
  const findCol = (kws: string[]) => headerCells.findIndex((h) => kws.some((k) => h.includes(k)));

  const txnDateIdx = findCol(['txn date', 'tran date', 'transaction date', 'date']);
  const valueDateIdx = findCol(['value date', 'val date']);
  const descIdx = findCol(['description', 'narration', 'particulars', 'remarks']);
  const refIdx = findCol(['ref no', 'chq', 'reference', 'cheque']);
  const debitIdx = findCol(['debit', 'withdrawal', 'dr']);
  const creditIdx = findCol(['credit', 'deposit', 'cr']);
  const balanceIdx = findCol(['balance', 'bal']);

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  let activeRow: Record<string, string> | null = null;
  let activeTx: ParsedTransaction | null = null;

  const flushActive = () => {
    if (activeRow && activeTx) {
      // Re-run IMPS / UTR extraction after multi-line narration merge
      const impsRef =
        extractImpsRef(activeTx.description) ||
        extractImpsRef(activeTx.reference_number || '');
      const utr = extractNeftUtr(activeTx.description);
      activeTx.imps_ref_no = impsRef;
      if (!activeTx.reference_number) {
        activeTx.reference_number = impsRef || utr || null;
        activeRow['Ref No'] = activeTx.reference_number || '';
      }
      activeRow.Description = activeTx.description;
      rows.push(activeRow);
      transactions.push(activeTx);
    }
    activeRow = null;
    activeTx = null;
  };

  for (let r = headerIdx + 1; r < gridRows.length; r++) {
    const cells = gridRows[r];
    if (!cells || cells.length === 0) continue;
    if (isBOMHeaderRow(cells) || isBOMFooterOrMeta(cells)) continue;

    const firstDateCandidate = cells[txnDateIdx >= 0 ? txnDateIdx : 0] || '';
    const isoDate = parseIndianDate(firstDateCandidate);

    if (!isoDate) {
      // Multi-line narration continuation
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

    const valueDateRaw = valueDateIdx >= 0 ? getCell(valueDateIdx, -1) : '';
    const valueDate = valueDateRaw ? parseIndianDate(valueDateRaw) || valueDateRaw : '';
    const description = getCell(descIdx, valueDateIdx >= 0 ? 2 : 1) || 'Bank of Maharashtra Txn';
    const refRaw = getCell(refIdx, -1);

    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;

    if (debitIdx >= 0 && creditIdx >= 0) {
      // Handle compact PDF rows where blank Debit or Credit cell was omitted by PDF extractor
      const hasFullWidth = cells.length >= headerCells.length;
      if (hasFullWidth) {
        const dVal = parseMonetaryValue(cells[debitIdx]);
        const cVal = parseMonetaryValue(cells[creditIdx]);
        debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
        credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
        balance = balanceIdx >= 0 ? parseMonetaryValue(cells[balanceIdx]) : null;
      } else {
        // Fallback: last numeric cell is Balance, preceding numeric cell is Debit or Credit
        const numericTail = cells
          .slice(Math.max(1, (descIdx >= 0 ? descIdx : 1) + 1))
          .map((c) => ({ raw: c, val: parseMonetaryValue(c) }))
          .filter((x) => x.val !== null);
        if (numericTail.length >= 2) {
          balance = numericTail[numericTail.length - 1].val;
          const amt = numericTail[numericTail.length - 2].val!;
          if (/\bcr\b/i.test(numericTail[numericTail.length - 2].raw) || /\bcr\b/i.test(description)) {
            credit = Math.abs(amt);
          } else {
            debit = Math.abs(amt);
          }
        } else if (numericTail.length === 1) {
          debit = Math.abs(numericTail[0].val!);
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

    const impsRef = extractImpsRef(description) || extractImpsRef(refRaw);
    const utr = extractNeftUtr(description);
    const refNo = refRaw || impsRef || utr || null;

    activeTx = {
      txn_date: isoDate,
      description,
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
      'Txn Date': isoDate,
      'Value Date': valueDate,
      Description: description,
      'Ref No': refNo || '',
      Debit: debit !== null ? debit.toFixed(2) : '',
      Credit: credit !== null ? credit.toFixed(2) : '',
      Balance: balance !== null ? balance.toFixed(2) : '',
    };
  }

  flushActive();

  return { hasValidHeader: true, rows, transactions };
}

/**
 * Bank of Maharashtra (BOM) statement parser for PDF or CSV.
 * Returns parseError without throwing if format is not recognised.
 */
export async function parseBOM(
  input: string | ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  if (typeof input === 'string') {
    const clean = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const csvParsed = Papa.parse<string[]>(clean, {
      skipEmptyLines: 'greedy',
      delimiter: '',
    });
    const res = parseBOMGridRows(csvParsed.data || []);
    if (!res.hasValidHeader || res.rows.length === 0) {
      return {
        headers: [...BOM_COLUMNS],
        rows: [],
        transactions: [],
        parser_version: 'bom-csv-v1',
        detected_bank: 'Bank of Maharashtra',
        confidence: 'none',
        suggested_mapping: BOM_MAPPING,
        parseError: 'BOM format not recognised — try Generic CSV',
      };
    }

    return {
      headers: [...BOM_COLUMNS],
      rows: res.rows,
      transactions: res.transactions,
      parser_version: 'bom-csv-v1',
      detected_bank: 'Bank of Maharashtra',
      confidence: 'high',
      suggested_mapping: BOM_MAPPING,
    };
  }

  const pdfData = preExtracted || (await extractPDFRawData(input));
  const res = parseBOMGridRows(pdfData.allGridRows);

  if (!res.hasValidHeader || res.rows.length === 0) {
    return {
      headers: [...BOM_COLUMNS],
      rows: [],
      transactions: [],
      parser_version: 'bom-pdf-v1',
      detected_bank: 'Bank of Maharashtra',
      confidence: 'none',
      suggested_mapping: BOM_MAPPING,
      opening_balance: pdfData.openingBalance,
      closing_balance: pdfData.closingBalance,
      raw_text: pdfData.fullDocumentText,
      parseError: 'BOM format not recognised — try Generic CSV',
    };
  }

  return {
    headers: [...BOM_COLUMNS],
    rows: res.rows,
    transactions: res.transactions,
    parser_version: 'bom-pdf-v1',
    detected_bank: 'Bank of Maharashtra',
    confidence: 'high',
    suggested_mapping: BOM_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    raw_text: pdfData.fullDocumentText,
  };
}
