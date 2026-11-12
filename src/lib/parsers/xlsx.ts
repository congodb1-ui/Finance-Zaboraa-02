import * as XLSX from 'xlsx';
import type { ParseResult } from '../../types/uploads';
import { detectColumnMapping } from './column-mapper';

function findHeaderRowIndex(lines: any[][]): number {
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
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const nonEmptyCells = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmptyCells.length < 2) continue;

    let keywordScore = 0;
    for (const cell of nonEmptyCells) {
      const lower = String(cell).toLowerCase().trim();
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

function formatCell(val: any): string {
  if (val === undefined || val === null) return '';

  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  if (typeof val === 'number') {
    // Preserve numeric value without scientific notation where possible
    return String(val);
  }

  return String(val).trim();
}

export function parseXLSX(buffer: ArrayBuffer | Uint8Array): ParseResult {
  const workbook = XLSX.read(buffer, {
    type: buffer instanceof ArrayBuffer ? 'array' : 'buffer',
    cellDates: true,
  });

  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    return {
      headers: [],
      rows: [],
      parser_version: 'xlsx-generic-v1',
    };
  }

  // Parse first sheet only
  const firstSheet = workbook.Sheets[sheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });

  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      parser_version: 'xlsx-generic-v1',
    };
  }

  const headerRowIdx = findHeaderRowIndex(matrix);
  const rawHeaders = matrix[headerRowIdx] || [];

  const seenHeaders = new Map<string, number>();
  const headers: string[] = [];

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    let headerText = formatCell(rawHeaders[idx]);
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
    if (!rawRow || !Array.isArray(rawRow)) continue;

    const nonEmpty = rawRow.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpty.length === 0) continue;

    const rowObj: Record<string, string> = {};
    let hasValidData = false;

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const cellVal = formatCell(rawRow[c]);
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
    parser_version: 'xlsx-generic-v1',
    detected_bank: detected_bank || undefined,
    confidence,
    suggested_mapping: mapping,
  };
}
