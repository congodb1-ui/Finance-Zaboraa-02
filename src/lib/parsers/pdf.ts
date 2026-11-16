// SETUP: Copy node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js
// to public/pdf.worker.min.js — required for pdfjs-dist to work in Next.js.
// Add this to your postinstall script or copy manually after npm install.

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configure GlobalWorkerOptions
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

export interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PDFRawPage {
  pageNumber: number;
  textItems: ExtractedTextItem[];
  fullText: string;
  gridRows: string[][];
}

export interface PDFExtractionResult {
  pages: PDFRawPage[];
  allGridRows: string[][];
  fullDocumentText: string;
  openingBalance: number | null;
  closingBalance: number | null;
  statementPeriodStart?: string | null;
  statementPeriodEnd?: string | null;
}

export class PdfPasswordError extends Error {
  code: 'PASSWORD_REQUIRED' | 'INCORRECT_PASSWORD';
  constructor(code: 'PASSWORD_REQUIRED' | 'INCORRECT_PASSWORD', message: string) {
    super(message);
    this.name = 'PdfPasswordError';
    this.code = code;
  }
}

/**
 * Extracts text items with their (x, y) coordinates from PDF ArrayBuffer
 */
export async function extractPDFRawData(
  buffer: ArrayBuffer | Uint8Array,
  password?: string
): Promise<PDFExtractionResult> {
  const data =
    buffer instanceof Uint8Array
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      password: password || undefined,
      useSystemFonts: true,
      disableFontFace: false,
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    if (
      err?.name === 'PasswordException' ||
      err?.name === 'PasswordResponses' ||
      err?.message?.toLowerCase().includes('password') ||
      err?.code === 1 ||
      err?.code === 2
    ) {
      if (password) {
        throw new PdfPasswordError(
          'INCORRECT_PASSWORD',
          'Incorrect PDF password. Please check and try again.'
        );
      } else {
        throw new PdfPasswordError(
          'PASSWORD_REQUIRED',
          'This PDF statement is password-protected. Please enter password to unlock.'
        );
      }
    }
    throw err;
  }

  const numPages = pdfDoc.numPages;

  const pages: PDFRawPage[] = [];
  let fullDocumentText = '';
  const allGridRows: string[][] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items: ExtractedTextItem[] = [];
    const textPieces: string[] = [];

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const text = item.str.trim();
        if (text) {
          textPieces.push(text);
          const x = item.transform ? item.transform[4] : 0;
          const y = item.transform ? item.transform[5] : 0;
          items.push({
            text: item.str,
            x,
            y,
            width: item.width || 0,
            height: item.height || 0,
          });
        }
      }
    }

    const pageFullText = textPieces.join(' ');
    fullDocumentText += ` ${pageFullText}`;

    // Cluster text items into rows by y-coordinate proximity (tolerance: ±3px)
    // Sort descending by y (top of page has higher y in PDF coordinates)
    items.sort((a, b) => b.y - a.y);

    interface RowCluster {
      baseY: number;
      items: ExtractedTextItem[];
    }

    const rowClusters: RowCluster[] = [];

    for (const item of items) {
      // Find existing cluster within ±3px
      let matchedCluster = rowClusters.find((cluster) => Math.abs(cluster.baseY - item.y) <= 3.5);

      if (matchedCluster) {
        matchedCluster.items.push(item);
      } else {
        rowClusters.push({
          baseY: item.y,
          items: [item],
        });
      }
    }

    // Sort clusters top-to-bottom (highest baseY first)
    rowClusters.sort((a, b) => b.baseY - a.baseY);

    const pageGridRows: string[][] = [];

    for (const cluster of rowClusters) {
      // Sort items left-to-right by x-coordinate
      cluster.items.sort((a, b) => a.x - b.x);

      // Merge items that are horizontally adjacent within the same column cell (e.g. words separated by a space)
      const mergedCells: string[] = [];
      let currentCell = '';
      let prevX = -999;
      let prevWidth = 0;

      for (const item of cluster.items) {
        // If the gap between previous item right edge and current item left edge is small (< 12px), merge
        const gap = item.x - (prevX + prevWidth);
        if (prevX !== -999 && gap < 12 && gap >= -2) {
          currentCell = `${currentCell} ${item.text}`.trim();
        } else {
          if (currentCell) {
            mergedCells.push(currentCell.trim());
          }
          currentCell = item.text.trim();
        }
        prevX = item.x;
        prevWidth = item.width;
      }
      if (currentCell) {
        mergedCells.push(currentCell.trim());
      }

      if (mergedCells.length > 0) {
        pageGridRows.push(mergedCells);
        allGridRows.push(mergedCells);
      }
    }

    pages.push({
      pageNumber: pageNum,
      textItems: items,
      fullText: pageFullText,
      gridRows: pageGridRows,
    });
  }

  // Attempt to extract opening and closing balance from full document text for reconciliation
  const balances = extractStatementBalances(fullDocumentText);
  const period = extractStatementPeriod(fullDocumentText);

  return {
    pages,
    allGridRows,
    fullDocumentText,
    openingBalance: balances.opening,
    closingBalance: balances.closing,
    statementPeriodStart: period.start,
    statementPeriodEnd: period.end,
  };
}

/**
 * Searches statement text for statement period / date range patterns
 * Matches "Statement From : 01/01/2026 To : 19/07/2026", "Statement From 01/01/2026 To 19/07/2026", etc.
 */
export function extractStatementPeriod(text: string): { start: string | null; end: string | null } {
  if (!text) return { start: null, end: null };

  // Pattern 1: Statement From : DD/MM/YYYY To : DD/MM/YYYY
  const p1 = text.match(/statement\s+from\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+(?:to|-)\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p1 && p1[1] && p1[2]) {
    return { start: p1[1].trim(), end: p1[2].trim() };
  }

  // Pattern 2: Statement Period : DD/MM/YYYY to DD/MM/YYYY or DD-Mon-YYYY to DD-Mon-YYYY
  const p2 = text.match(/(?:statement\s+period|period|txn\s+period|from\s+date)\s*[:\-]?\s*(\d{1,2}[/\-.][\w]+[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s*(?:to|-)\s*[:\-]?\s*(\d{1,2}[/\-.][\w]+[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p2 && p2[1] && p2[2]) {
    return { start: p2[1].trim(), end: p2[2].trim() };
  }

  // Pattern 3: From DD/MM/YYYY To DD/MM/YYYY
  const p3 = text.match(/from\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+to\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p3 && p3[1] && p3[2]) {
    return { start: p3[1].trim(), end: p3[2].trim() };
  }

  return { start: null, end: null };
}

/**
 * Searches statement text for opening and closing balance patterns
 */
export function extractStatementBalances(text: string): { opening: number | null; closing: number | null } {
  let opening: number | null = null;
  let closing: number | null = null;

  // Patterns for Opening Balance
  const openingPatterns = [
    /opening\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
    /b\/f\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
    /brought\s+forward\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pat of openingPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num)) {
        opening = num;
        break;
      }
    }
  }

  // Patterns for Closing Balance
  const closingPatterns = [
    /closing\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
    /c\/f\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
    /ending\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
    /carried\s+forward\s*[:\-]?\s*(?:inr|rs\.?)?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pat of closingPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num)) {
        closing = num;
        break;
      }
    }
  }

  return { opening, closing };
}
