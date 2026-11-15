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
}

/**
 * Extracts text items with their (x, y) coordinates from PDF ArrayBuffer
 */
export async function extractPDFRawData(
  buffer: ArrayBuffer | Uint8Array,
  password?: string
): Promise<PDFExtractionResult> {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

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
      err?.message?.toLowerCase().includes('password') ||
      err?.code === 1
    ) {
      throw new Error('This PDF is password-protected. Enter the PDF password and try again.');
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

  return {
    pages,
    allGridRows,
    fullDocumentText,
    openingBalance: balances.opening,
    closingBalance: balances.closing,
  };
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
