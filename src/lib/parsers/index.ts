import type { ParseResult } from '../../types/uploads';
import { extractPDFRawData, PdfPasswordError, type PDFExtractionResult } from './pdf';
import { parsePDFHDFC, parseHDFCStatement, isHDFCStatement } from './pdf-hdfc';
import { parsePDFGeneric } from './pdf-generic';
import { parseCSV } from './csv';
import { parsePaytmUPI, isPaytmStatement, matchAccountForPaytm, resolvePaytmTagCategory } from './paytm-upi';
import { parseGPay, parseGPayCSV, parseGPayPDF, isGPayStatement, matchAccountForGPay } from './gpay';
import { parseBOM, isBOMStatement } from './bom';
import { parseBOI, isBOIStatement } from './boi';

export {
  PdfPasswordError,
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
  parseHDFCStatement,
  isHDFCStatement,
  parsePDFGeneric,
  parseCSV,
};

function extractPage1HeaderMetaText(pdfData: PDFExtractionResult): string {
  const page1 = pdfData.pages[0];
  if (!page1) return '';
  if (page1.gridRows && page1.gridRows.length > 0) {
    const nonTxnLines: string[] = [];
    for (const row of page1.gridRows) {
      const joined = row.join(' ').trim();
      if (!joined) continue;
      // Exclude transaction rows (lines starting with DD/MM/YY or SrNo + Date)
      if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(joined)) continue;
      if (/^\d{1,4}\s+\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(joined)) continue;
      nonTxnLines.push(joined);
    }
    if (nonTxnLines.length > 0) {
      return nonTxnLines.join(' ');
    }
  }
  return page1.fullText || '';
}

/**
 * Unified PDF parser dispatch:
 * Detects Paytm UPI, Google Pay, Bank of Maharashtra, Bank of India, HDFC Bank,
 * and falls through gracefully to Generic PDF on unrecognised formats.
 *
 * Uses Page-1 non-transaction metadata for bank identification so transaction
 * narrations mentioning another bank or wallet (e.g. "Bank of India", "@paytm", "GPay")
 * never hijack statement routing.
 */
export async function parseStatementPDF(
  buffer: ArrayBuffer | Uint8Array,
  options?: { preExtracted?: PDFExtractionResult; password?: string } | PDFExtractionResult
): Promise<ParseResult> {
  const preExtracted = options && 'pages' in options ? options : (options as any)?.preExtracted;
  const password = options && 'password' in options ? (options as any).password : undefined;
  const pdfData = preExtracted || (await extractPDFRawData(buffer, password));
  const firstPageText = pdfData.pages[0]?.fullText || pdfData.fullDocumentText;
  const headerMetaText = extractPage1HeaderMetaText(pdfData) || firstPageText;

  // 1. Paytm / PhonePe UPI (strict header/table markers)
  if (isPaytmStatement(headerMetaText)) {
    const res = await parsePaytmUPI(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 2. Google Pay (GPay) (strict header/table markers)
  if (isGPayStatement(headerMetaText)) {
    const res = await parseGPayPDF(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 3. HDFC Bank (checked using Page-1 header/footer before regional/generic banks)
  if (isHDFCStatement(headerMetaText) || isHDFCStatement(firstPageText)) {
    return parsePDFHDFC(buffer, pdfData);
  }

  // 4. Bank of Maharashtra (BOM)
  if (isBOMStatement(headerMetaText)) {
    const res = await parseBOM(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 5. Bank of India (BOI)
  if (isBOIStatement(headerMetaText)) {
    const res = await parseBOI(buffer, pdfData);
    if (res.rows.length > 0 && !res.parseError) {
      return res;
    }
  }

  // 6. Generic fallback (intelligent anchor parser across SBI, ICICI, Axis, Kotak, etc.)
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
