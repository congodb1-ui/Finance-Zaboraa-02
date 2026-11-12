import type { ParseResult, ColumnMapping } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';

const HDFC_COLUMNS = [
  'Date',
  'Narration',
  'Value Dt',
  'Ref No./Cheque No.',
  'Debit',
  'Credit',
  'Balance',
];

const HDFC_HARDCODED_MAPPING: ColumnMapping = {
  date_col: 'Date',
  description_col: 'Narration',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: 'Balance',
  reference_col: 'Ref No./Cheque No.',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks if first page indicates an HDFC Bank statement
 */
export function isHDFCStatement(firstPageText: string): boolean {
  const lower = firstPageText.toLowerCase();
  return lower.includes('hdfc bank') || lower.includes('hdfcbank');
}

/**
 * Checks if a row is an HDFC page header, footer, account summary block, or page number line
 */
function isHDFCHeaderOrFooter(cells: string[]): boolean {
  if (cells.length === 0) return true;
  const rowText = cells.join(' ').toLowerCase();

  // Repeating page headers / footers
  if (
    rowText.includes('hdfc bank limited') ||
    rowText.includes('registered office') ||
    rowText.includes('statement of account') ||
    rowText.includes('page no') ||
    rowText.includes('page :') ||
    rowText.includes('page number') ||
    rowText.includes('account branch') ||
    rowText.includes('address :') ||
    rowText.includes('city :') ||
    rowText.includes('state :') ||
    rowText.includes('phone no.') ||
    rowText.includes('email :') ||
    rowText.includes('cust id') ||
    rowText.includes('customer id') ||
    rowText.includes('account no') ||
    rowText.includes('a/c no') ||
    rowText.includes('nomination') ||
    rowText.includes('opening balance') ||
    rowText.includes('statement period') ||
    rowText.includes('statement from') ||
    rowText.includes('generated on') ||
    rowText.includes('contents of this statement') ||
    rowText.includes('closing balance') ||
    rowText.includes('total withdrawal') ||
    rowText.includes('total deposit')
  ) {
    return true;
  }

  // Exact header line (Date, Narration, Value Dt...)
  if (
    rowText.includes('date') &&
    rowText.includes('narration') &&
    (rowText.includes('chq') || rowText.includes('ref'))
  ) {
    return true;
  }

  return false;
}

/**
 * Normalizes an HDFC transaction row into HDFC_COLUMNS mapping
 */
function parseHDFCRow(cells: string[]): Record<string, string> | null {
  if (cells.length < 3) return null;

  // The first cell must look like a date (DD/MM/YY or DD/MM/YYYY or DD-MM-YYYY)
  const firstCell = cells[0].trim();
  const dateMatch = firstCell.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!dateMatch) return null;

  const dateVal = firstCell;
  let narration = '';
  let valueDt = '';
  let refNo = '';
  let debit = '';
  let credit = '';
  let balance = '';

  if (cells.length >= 7) {
    narration = cells[1];
    valueDt = cells[2];
    refNo = cells[3];
    debit = cells[4];
    credit = cells[5];
    balance = cells[6];
  } else if (cells.length === 6) {
    narration = cells[1];
    valueDt = cells[2];
    refNo = cells[3];
    debit = cells[4];
    balance = cells[5];
  } else if (cells.length === 5) {
    narration = cells[1];
    refNo = cells[2];
    debit = cells[3];
    balance = cells[4];
  } else {
    // Variable length fallback
    narration = cells[1] || '';
    balance = cells[cells.length - 1] || '';
    debit = cells[cells.length - 2] || '';
  }

  // Clean numeric amounts: remove comma and verify
  const cleanDebit = debit.replace(/[^\d.-]/g, '');
  const cleanCredit = credit.replace(/[^\d.-]/g, '');
  const cleanBalance = balance.replace(/[^\d.-]/g, '');

  return {
    Date: dateVal,
    Narration: narration.trim(),
    'Value Dt': valueDt.trim(),
    'Ref No./Cheque No.': refNo.trim(),
    Debit: cleanDebit,
    Credit: cleanCredit,
    Balance: cleanBalance,
  };
}

export async function parsePDFHDFC(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));

  const rows: Array<Record<string, string>> = [];

  for (const page of pdfData.pages) {
    for (const gridRow of page.gridRows) {
      if (isHDFCHeaderOrFooter(gridRow)) {
        continue;
      }

      const parsedObj = parseHDFCRow(gridRow);
      if (parsedObj) {
        rows.push(parsedObj);
      }
    }
  }

  return {
    headers: [...HDFC_COLUMNS],
    rows,
    parser_version: 'hdfc-pdf-v1',
    detected_bank: 'HDFC Bank',
    confidence: 'high',
    suggested_mapping: HDFC_HARDCODED_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    raw_text: pdfData.fullDocumentText,
  };
}
