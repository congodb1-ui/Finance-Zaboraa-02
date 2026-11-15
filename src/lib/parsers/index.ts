import type { ParseResult } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { parsePDFHDFC, isHDFCStatement } from './pdf-hdfc';
import { parsePDFGeneric } from './pdf-generic';
import { parseCSV } from './csv';
import { parsePaytmUPI, isPaytmStatement, matchAccountForPaytm, resolvePaytmTagCategory } from './paytm-upi';
import { parseGPay, parseGPayCSV, parseGPayPDF, isGPayStatement, matchAccountForGPay } from './gpay';
import { parseBOM, isBOMStatement } from './bom';
import { parseBOI, isBOIStatement } from './boi';

export {
  parsePaytmUPI,
  isPaytmStatement,
  matchAccountForPaytm,
  resolvePaytmTagCategory,
  parseGPay,
  parseGPayCSV,
  parseGPayPDF,
  isGPayStatement,
  matchAccountForGPay,
  parseBOM,
  isBOMStatement,
  parseBOI,
  isBOIStatement,
  parsePDFHDFC,
  isHDFCStatement,
  parsePDFGeneric,
  parseCSV,
};

/**
 * Unified PDF parser dispatch:
 * Detects Paytm UPI, Google Pay, Bank of Maharashtra, Bank of India, HDFC Bank,
 * and falls through gracefully to Generic PDF on unrecognised formats.
 */
export async function parseStatementPDF(
  buffer: ArrayBuffer | Uint8Array,
  options?: { preExtracted?: PDFExtractionResult } | PDFExtractionResult
): Promise<ParseResult> {
  const preExtracted = options && 'pages' in options ? options : options?.preExtracted;
  const pdfData = preExtracted || (await extractPDFRawData(buffer));
  const firstPageText = pdfData.pages[0]?.fullText || pdfData.fullDocumentText;
  const fullText = pdfData.fullDocumentText;

  // 1. Paytm / PhonePe UPI
  if (isPaytmStatement(firstPageText) || isPaytmStatement(fullText)) {
    const res = await parsePaytmUPI(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 2. Google Pay (GPay)
  if (isGPayStatement(firstPageText) || isGPayStatement(fullText)) {
    const res = await parseGPayPDF(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 3. Bank of Maharashtra (BOM)
  if (isBOMStatement(firstPageText) || isBOMStatement(fullText)) {
    const res = await parseBOM(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 4. Bank of India (BOI)
  if (isBOIStatement(firstPageText) || isBOIStatement(fullText)) {
    const res = await parseBOI(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 5. Existing HDFC Bank parser (unchanged)
  if (isHDFCStatement(firstPageText)) {
    return parsePDFHDFC(buffer, pdfData);
  }

  // 6. Generic fallback (unchanged)
  return parsePDFGeneric(buffer, pdfData);
}

/**
 * Unified CSV parser dispatch:
 * Checks Google Pay, Bank of Maharashtra, and Bank of India CSV formats first,
 * falling through to generic CSV parser for all other CSV exports.
 */
export async function parseStatementCSV(csvContent: string): Promise<ParseResult> {
  if (isGPayStatement(csvContent)) {
    const res = parseGPayCSV(csvContent);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  if (isBOMStatement(csvContent)) {
    const res = await parseBOM(csvContent);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  if (isBOIStatement(csvContent)) {
    const res = await parseBOI(csvContent);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  return parseCSV(csvContent);
}
