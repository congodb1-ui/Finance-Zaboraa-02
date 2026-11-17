import type { ParseResult, ColumnMapping } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { intelligentParse } from './intelligent-parser';

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
  return lower.includes('hdfc bank') || lower.includes('hdfcbank');
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
  const { parseBankNarration } = require('./bank-transaction');
  const parsed = parseBankNarration(rawNarration);
  return {
    description: parsed.description,
    cleanDescription: parsed.description,
    reference: parsed.reference || refColumn.replace(/^0+/, ''),
    cleanReference: parsed.reference || refColumn.replace(/^0+/, ''),
  };
}
