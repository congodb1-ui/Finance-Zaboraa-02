import type { ParseResult } from '../../types/uploads';
import { extractPDFRawData, type PDFExtractionResult } from './pdf';
import { detectColumnMapping } from './column-mapper';
import { isStatementNoiseLine } from './strip-statement-noise';
import { intelligentParse } from './intelligent-parser';

function findHeaderRowIndex(lines: string[][]): number {
  if (lines.length === 0) return 0;

  const headerKeywords = [
    'date',
    'narration',
    'description',
    'particulars',
    'debit',
    'credit',
    'withdrawal',
    'deposit',
    'balance',
    'ref',
    'chq',
    'amount',
  ];

  let bestIndex = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const row = lines[i];
    if (!row || row.length === 0) continue;

    const nonEmptyCells = row.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (nonEmptyCells.length < 2) continue;

    let keywordScore = 0;
    for (const cell of nonEmptyCells) {
      const lower = cell.toLowerCase().trim();
      for (const kw of headerKeywords) {
        if (lower.includes(kw)) {
          keywordScore += 3;
          break;
        }
      }
    }

    const totalScore = keywordScore * 2 + nonEmptyCells.length;

    if (totalScore > maxScore && keywordScore >= 3) {
      maxScore = totalScore;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export async function parsePDFGeneric(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));

  // For multi-bank PDFs (SBI, ICICI, Axis, Kotak, etc.) with coordinate text items,
  // try the dynamic-column intelligent anchor parser first so multi-line narrations & balances parse accurately.
  if (pdfData.pages.some((p) => p.textItems && p.textItems.length > 0)) {
    const intelRes = await intelligentParse(pdfData);
    if (intelRes.rows.length > 0) {
      return {
        ...intelRes,
        detected_account_last4: pdfData.accountLast4 || null,
      };
    }
  }

  const matrix = pdfData.allGridRows;

  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      parser_version: 'pdf-generic-v1',
      opening_balance: pdfData.openingBalance,
      closing_balance: pdfData.closingBalance,
      detected_account_last4: pdfData.accountLast4 || null,
    };
  }

  const headerRowIdx = findHeaderRowIndex(matrix);
  const rawHeaders = matrix[headerRowIdx] || [];

  const seenHeaders = new Map<string, number>();
  const headers: string[] = [];

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    let headerText = (rawHeaders[idx] || '').trim();
    if (!headerText) {
      headerText = `Column_${idx + 1}`;
    }

    const count = seenHeaders.get(headerText) || 0;
    if (count > 0) {
      headers.push(`${headerText}_${count + 1}`);
      seenHeaders.set(headerText, count + 1);
    } else {
      headers.push(headerText);
      seenHeaders.set(headerText, 1);
    }
  }

  const rows: Array<Record<string, string>> = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.length === 0) continue;

    const nonEmpty = rawRow.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (nonEmpty.length === 0) continue;

    // Skip summary / page footer rows
    const rowText = nonEmpty.join(' ').toLowerCase();
    if (
      isStatementNoiseLine(nonEmpty.join(' ')) ||
      rowText.includes('page no') ||
      rowText.includes('page :') ||
      rowText.includes('total withdrawal') ||
      rowText.includes('total deposit') ||
      rowText.includes('closing balance')
    ) {
      continue;
    }

    const rowObj: Record<string, string> = {};
    let hasValidData = false;

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const cellVal = (rawRow[c] !== undefined && rawRow[c] !== null ? String(rawRow[c]) : '').trim();
      rowObj[colName] = cellVal;
      if (cellVal !== '') {
        hasValidData = true;
      }
    }

    if (hasValidData) {
      rows.push(rowObj);
    }
  }

  const { mapping, confidence, detected_bank } = detectColumnMapping(headers);

  return {
    headers,
    rows,
    parser_version: 'pdf-generic-v1',
    detected_bank: detected_bank || undefined,
    detected_account_last4: pdfData.accountLast4 || null,
    confidence,
    suggested_mapping: mapping,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    statement_period_start: pdfData.statementPeriodStart || undefined,
    statement_period_end: pdfData.statementPeriodEnd || undefined,
    raw_text: pdfData.fullDocumentText,
  };
}
