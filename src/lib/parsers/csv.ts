import Papa from 'papaparse';
import type { ParseResult } from '../../types/uploads';
import { detectColumnMapping } from './column-mapper';

/**
 * Finds the index of the header row in a raw 2D array of rows.
 * Indian bank CSVs often contain 5-15 rows of account & customer metadata
 * before the transaction table starts.
 */
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
  ];

  let bestIndex = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const row = lines[i];
    if (!row || row.length === 0) continue;

    const nonEmptyCells = row.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (nonEmptyCells.length < 2) continue;

    // Score based on matching known financial header keywords
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

    // Combine cell count density and keyword match score
    const totalScore = keywordScore * 2 + nonEmptyCells.length;

    if (totalScore > maxScore && keywordScore >= 3) {
      maxScore = totalScore;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function parseCSV(csvContent: string): ParseResult {
  // Strip UTF-8 Byte Order Mark (BOM) if present
  let cleanContent = csvContent;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  // First pass: parse as raw 2D string matrix to detect true header row
  const rawParse = Papa.parse<string[]>(cleanContent, {
    skipEmptyLines: 'greedy',
    delimiter: '', // auto-detect delimiter (comma, semicolon, tab)
  });

  const matrix = rawParse.data || [];
  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      parser_version: 'csv-generic-v1',
    };
  }

  const headerRowIdx = findHeaderRowIndex(matrix);
  const rawHeaders = matrix[headerRowIdx] || [];

  // Clean and deduplicate headers
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

  // Parse subsequent rows into Record<string, string>
  const rows: Array<Record<string, string>> = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!rawRow) continue;

    // Skip empty or summary rows (e.g. "Total Balance", "Generated on...")
    const nonEmpty = rawRow.filter((c) => typeof c === 'string' && c.trim() !== '');
    if (nonEmpty.length === 0) continue;

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
    parser_version: 'csv-generic-v1',
    detected_bank: detected_bank || undefined,
    confidence,
    suggested_mapping: mapping,
  };
}
