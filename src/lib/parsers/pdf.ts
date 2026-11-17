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
  accountNumber?: string | null;
  accountLast4?: string | null;
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
          'This PDF is password-protected. Please enter password to unlock.'
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

    // Cluster text items into rows by y-coordinate proximity (tolerance: ±3.5px)
    items.sort((a, b) => b.y - a.y);

    interface RowCluster {
      baseY: number;
      items: ExtractedTextItem[];
    }

    const rowClusters: RowCluster[] = [];

    for (const item of items) {
      const matchedCluster = rowClusters.find((cluster) => Math.abs(cluster.baseY - item.y) <= 3.5);

      if (matchedCluster) {
        matchedCluster.items.push(item);
      } else {
        rowClusters.push({
          baseY: item.y,
          items: [item],
        });
      }
    }

    rowClusters.sort((a, b) => b.baseY - a.baseY);

    const pageGridRows: string[][] = [];

    for (const cluster of rowClusters) {
      cluster.items.sort((a, b) => a.x - b.x);

      const mergedCells: string[] = [];
      let currentCell = '';
      let prevX = -999;
      let prevWidth = 0;

      for (const item of cluster.items) {
        const gap = item.x - (prevX + prevWidth);
        if (prevX !== -999 && gap < 12 && gap >= -2) {
          const isTightGlyphJoin =
            prevWidth > 0 &&
            gap >= -1.5 &&
            gap < 1.3 &&
            !/\s$/.test(currentCell) &&
            !/^\s/.test(item.text) &&
            !(/\.\d{2}$/.test(currentCell) && /^\d/.test(item.text.trim()));
          currentCell = isTightGlyphJoin
            ? `${currentCell}${item.text}`.trim()
            : `${currentCell} ${item.text}`.trim();
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

  const balances = extractStatementBalances(fullDocumentText, allGridRows, pages);
  const period = extractStatementPeriod(fullDocumentText);
  const acct = extractStatementAccountInfo(fullDocumentText);

  return {
    pages,
    allGridRows,
    fullDocumentText,
    openingBalance: balances.opening,
    closingBalance: balances.closing,
    statementPeriodStart: period.start,
    statementPeriodEnd: period.end,
    accountNumber: acct.accountNumber,
    accountLast4: acct.accountLast4,
  };
}

/**
 * Extracts statement account number & last4 across Indian banks.
 */
export function extractStatementAccountInfo(text: string): {
  accountNumber: string | null;
  accountLast4: string | null;
} {
  if (!text) return { accountNumber: null, accountLast4: null };
  const m =
    text.match(/(?:Account|A\/c)\s*(?:No|Number)\.?\s*[:\-]?\s*([Xx*\d](?:[Xx*\d]|[ \-](?=[Xx*\d])){4,26}\d{2,4})(?=\s|$|[^Xx*\d\-])/i) ||
    text.match(/Statement\s+(?:for|of)\s+Account\s*(?:No\.?)?\s*[:\-]?\s*([Xx*\d](?:[Xx*\d]|[ \-](?=[Xx*\d])){4,26}\d{2,4})(?=\s|$|[^Xx*\d\-])/i) ||
    text.match(/(?:Account|A\/c)\s*(?:No|Number)\.?\s*[:\-]?\s*([Xx*\d]{6,20})/i) ||
    text.match(/Statement\s+for\s+Account\s+No\.?\s*[:\-]?\s*([Xx*\d]{6,20})/i);
  if (!m?.[1]) return { accountNumber: null, accountLast4: null };
  const raw = m[1].replace(/[\s\-]+/g, '').trim();
  const digits = raw.match(/(\d{4})$/)?.[1] || null;
  return { accountNumber: raw, accountLast4: digits };
}

/**
 * Searches statement text for statement period / date range patterns
 * Matches HDFC, BOM ("Statement for Account No ... from DD/MM/YYYY to DD/MM/YYYY"), SBI, ICICI, etc.
 */
export function extractStatementPeriod(text: string): { start: string | null; end: string | null } {
  if (!text) return { start: null, end: null };

  // Pattern 1: Statement From : DD/MM/YYYY To : DD/MM/YYYY
  const p1 = text.match(/statement\s+from\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+(?:to|-)\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p1 && p1[1] && p1[2]) {
    return { start: p1[1].trim(), end: p1[2].trim() };
  }

  // Pattern 2: Statement for Account No X from DD/MM/YYYY to DD/MM/YYYY (BOM)
  const pBom = text.match(/statement\s+for\s+account\s+(?:no\.?\s*)?\S+\s+from\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+(?:to|-)\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (pBom && pBom[1] && pBom[2]) {
    return { start: pBom[1].trim(), end: pBom[2].trim() };
  }

  // Pattern 3: Statement Period : DD/MM/YYYY to DD/MM/YYYY or DD-Mon-YYYY to DD-Mon-YYYY
  const p2 = text.match(/(?:statement\s+period|period|txn\s+period|from\s+date)\s*[:\-]?\s*(\d{1,2}[/\-.][\w]+[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s*(?:to|-)\s*[:\-]?\s*(\d{1,2}[/\-.][\w]+[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p2 && p2[1] && p2[2]) {
    return { start: p2[1].trim(), end: p2[2].trim() };
  }

  // Pattern 4: From DD/MM/YYYY To DD/MM/YYYY
  const p3 = text.match(/from\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+to\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  if (p3 && p3[1] && p3[2]) {
    return { start: p3[1].trim(), end: p3[2].trim() };
  }

  return { start: null, end: null };
}

function parseSummaryNumber(token: string | undefined): number | null {
  if (!token) return null;
  const cleaned = token.replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Searches statement text, tabular summary grid rows, and page coordinates
 * for opening and closing balance patterns (including HDFC 2-row Summary tables).
 */
export function extractStatementBalances(
  text: string,
  allGridRows?: string[][],
  pages?: PDFRawPage[]
): { opening: number | null; closing: number | null } {
  let opening: number | null = null;
  let closing: number | null = null;

  // 1. Coordinate-aware 2-row Summary detection on page textItems (handles shifted/merged HDFC summaries)
  if (pages && pages.length > 0) {
    for (const page of pages) {
      if (!page.textItems || page.textItems.length === 0) continue;
      const rows: Array<{ y: number; items: ExtractedTextItem[] }> = [];
      const sorted = [...page.textItems].sort((a, b) => b.y - a.y || a.x - b.x);
      for (const it of sorted) {
        if (!it.text || !it.text.trim()) continue;
        const row = rows.find((r) => Math.abs(r.y - it.y) <= 3.5);
        if (row) row.items.push(it);
        else rows.push({ y: it.y, items: [it] });
      }
      for (const r of rows) r.items.sort((a, b) => a.x - b.x);

      for (let rIdx = 0; rIdx < rows.length - 1; rIdx++) {
        const hdr = rows[rIdx];
        const hdrText = hdr.items.map((i) => i.text.trim()).join(' ');
        if (
          !/opening\s+bal(?:ance)?/i.test(hdrText) ||
          !/(?:closing|ending|clg)\s+bal(?:ance)?/i.test(hdrText)
        ) {
          continue;
        }

        // Find the first numeric value row below header row within ~45px
        for (let vIdx = rIdx + 1; vIdx < Math.min(rows.length, rIdx + 4); vIdx++) {
          const valRow = rows[vIdx];
          if (hdr.y - valRow.y > 48) break;
          const numericItems = valRow.items
            .flatMap((it) => {
              const parts = it.text.trim().split(/\s+/);
              if (parts.length <= 1) {
                const n = parseSummaryNumber(it.text);
                return n !== null ? [{ num: n, cx: it.x + (it.width || 0) / 2 }] : [];
              }
              const step = (it.width || it.text.length * 4) / parts.length;
              return parts
                .map((p, idx) => {
                  const n = parseSummaryNumber(p);
                  return n !== null ? { num: n, cx: it.x + step * (idx + 0.5) } : null;
                })
                .filter((x): x is { num: number; cx: number } => x !== null);
            });

          if (numericItems.length < 2) continue;

          const openHeaderIt = hdr.items.find((i) => /opening\s+bal/i.test(i.text));
          const closeHeaderIt = hdr.items.find((i) => /(?:closing|ending|clg)\s+bal/i.test(i.text));

          if (openHeaderIt && closeHeaderIt && openHeaderIt !== closeHeaderIt) {
            const openCx = openHeaderIt.x + (openHeaderIt.width || 0) / 2;
            const closeCx = closeHeaderIt.x + (closeHeaderIt.width || 0) / 2;
            let bestOpen = numericItems[0];
            let bestClose = numericItems[numericItems.length - 1];
            let bestOpenDist = Infinity;
            let bestCloseDist = Infinity;
            for (const ni of numericItems) {
              const od = Math.abs(ni.cx - openCx);
              if (od < bestOpenDist) {
                bestOpenDist = od;
                bestOpen = ni;
              }
              const cd = Math.abs(ni.cx - closeCx);
              if (cd < bestCloseDist) {
                bestCloseDist = cd;
                bestClose = ni;
              }
            }
            opening = bestOpen.num;
            closing = bestClose.num;
          } else {
            opening = numericItems[0].num;
            closing = numericItems[numericItems.length - 1].num;
          }

          if (opening !== null && closing !== null) {
            return { opening, closing };
          }
        }
      }
    }
  }

  // 2. Check HDFC-style 2-row summary header in gridRows:
  // Row i:   ['Opening Balance', 'Dr Count', 'Cr Count', 'Debits', 'Credits', 'Closing Bal']
  // Row i+1: ['0.00', '22', '16', '2,978,162.93', '4,728,683.17', '1,750,520.24']
  if (allGridRows && allGridRows.length > 1) {
    for (let i = 0; i < allGridRows.length - 1; i++) {
      const headerRow = allGridRows[i];
      const joinedHeader = headerRow.join(' ');
      if (
        !/opening\s+bal(?:ance)?/i.test(joinedHeader) ||
        !/(?:closing|ending|clg)\s+bal(?:ance)?/i.test(joinedHeader)
      ) {
        continue;
      }

      const openColIdx = headerRow.findIndex((c) => /opening\s+bal(?:ance)?/i.test(c.trim()));
      const closeColIdx = headerRow.findIndex((c) => /(?:closing|ending|clg)\s+bal(?:ance)?/i.test(c.trim()));

      for (let look = 1; look <= 2 && i + look < allGridRows.length; look++) {
        const nextRow = allGridRows[i + look];
        const numericTokens = nextRow
          .flatMap((cell) => cell.trim().split(/\s+/))
          .map((tok) => parseSummaryNumber(tok))
          .filter((n): n is number => n !== null);
        if (numericTokens.length < 2) continue;

        if (openColIdx >= 0 && closeColIdx >= 0 && openColIdx !== closeColIdx && nextRow.length >= headerRow.length) {
          const oNum = parseSummaryNumber(nextRow[openColIdx]);
          const cNum = parseSummaryNumber(nextRow[closeColIdx]);
          if (oNum !== null) opening = oNum;
          if (cNum !== null) closing = cNum;
        } else {
          // Handles merged count/header cells by taking first (Opening Balance) and last (Closing Bal) numbers
          opening = numericTokens[0];
          closing = numericTokens[numericTokens.length - 1];
        }

        if (opening !== null && closing !== null) {
          return { opening, closing };
        }
      }
    }
  }

  // 3. Collapsed inline 2-row HDFC summary text fallback:
  // "Opening Balance Dr Count Cr Count Debits Credits Closing Bal 0.00 22 16 2,978,162.93 4,728,683.17 1,750,520.24"
  const collapsedSummary = text.match(
    /opening\s+bal(?:ance)?\s+dr\.?\s*count\s+cr\.?\s*count\s+debits?\s+credits?\s+(?:closing|ending|clg)\s+bal(?:ance)?\s+(-?[\d,]+\.\d{2}|-?[\d,]+)\s+\d+\s+\d+\s+[\d,.]+\s+[\d,.]+\s+(-?[\d,]+\.\d{2}|-?[\d,]+)/i
  );
  if (collapsedSummary) {
    const oNum = parseSummaryNumber(collapsedSummary[1]);
    const cNum = parseSummaryNumber(collapsedSummary[2]);
    if (oNum !== null && cNum !== null) {
      return { opening: oNum, closing: cNum };
    }
  }

  // Inline patterns for Opening Balance
  const openingPatterns = [
    /opening\s+bal(?:ance)?\s*[:\-]\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2}|-?[\d,]+)/i,
    /opening\s+bal(?:ance)?\s+(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
    /b\/f\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
    /brought\s+forward\s*[:\-]?\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
  ];

  for (const pat of openingPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const num = parseSummaryNumber(match[1]);
      if (num !== null) {
        opening = num;
        break;
      }
    }
  }

  // Inline patterns for Closing Balance
  const closingPatterns = [
    /(?:closing|ending|clg)\s+bal(?:ance)?\s*[:\-]\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2}|-?[\d,]+)/i,
    /(?:closing|ending|clg)\s+bal(?:ance)?\s+(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
    /c\/f\s+bal(?:ance)?\s*[:\-]?\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
    /carried\s+forward\s*[:\-]?\s*(?:inr|rs\.?)?\s*(-?[\d,]+\.\d{2})/i,
  ];

  for (const pat of closingPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const num = parseSummaryNumber(match[1]);
      if (num !== null) {
        closing = num;
        break;
      }
    }
  }

  return { opening, closing };
}
