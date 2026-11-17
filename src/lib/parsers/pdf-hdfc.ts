import type { ParseResult, ColumnMapping } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { intelligentParse } from './intelligent-parser';
import { parseBankNarration } from './bank-transaction';

export const HDFC_COLUMNS = [
  'Date',
  'Narration',
  'Value Dt',
  'Ref No./Cheque No.',
  'Debit',
  'Credit',
  'Balance',
];

export const HDFC_HARDCODED_MAPPING: ColumnMapping = {
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
  const lower = (firstPageText || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('hdfc bank') || lower.includes('hdfcbank')) {
    return true;
  }
  if (/(?:rtgs\/neft\s+)?ifsc\s*(?:code)?\s*[:\-]?\s*hdfc0[a-z0-9]{6}/i.test(firstPageText)) {
    return true;
  }
  // Signature HDFC 7-column header: Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance
  if (
    lower.includes('narration') &&
    lower.includes('chq./ref.no.') &&
    lower.includes('value dt') &&
    lower.includes('withdrawal amt') &&
    lower.includes('deposit amt') &&
    lower.includes('closing balance')
  ) {
    return true;
  }
  return false;
}

/**
 * Parses HDFC Bank PDF statement using Intelligent Anchor-Based Parser.
 */
export async function parsePDFHDFC(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));
  return intelligentParse(pdfData, 'HDFC');
}

export const parseHDFCStatement = parsePDFHDFC;

export function cleanHdfcNarration(rawNarration: string, refColumn: string = '') {
  const parsed = parseBankNarration(rawNarration);
  return {
    description: parsed.description,
    cleanDescription: parsed.description,
    reference: parsed.reference || refColumn.replace(/^0+/, ''),
    cleanReference: parsed.reference || refColumn.replace(/^0+/, ''),
  };
}
