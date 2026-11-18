import Papa from 'papaparse';
import type { ParseResult, ParsedTransaction } from '../../types/uploads';
import { detectColumnMapping } from './column-mapper';
import { parseBankNarration } from './bank-transaction';
import {
  extractCrossSourceRefs,
  normalizeReferenceNumber,
  parseIndianDate,
  parseMonetaryValue,
} from './utils';

const SUMMARY_OR_NOISE_ROW_REGEX =
  /^(?:statement\s+summary|opening\s+balance|closing\s+balance|dr\s+count|cr\s+count|debits?\b|credits?\b|total\b|grand\s+total|end\s+of\s+statement|generated\s+on|page\s+no|hdfc\s+bank|state\s+bank|icici\s+bank|axis\s+bank|kotak\s+mahindra|bank\s+of\s+maharashtra|bank\s+of\s+india|registered\s+office|computer\s+generated|contents\s+of\s+this\s+statement|unless\s+the\s+constituent)/i;

function isSeparatorString(val: string): boolean {
  const trimmed = val.trim();
  return /^[*_\-=.~•\s]{3,}$/.test(trimmed);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

function extractCsvPreHeaderMetadata(matrix: string[][], headerRowIdx: number): {
  periodStart: string | null;
  periodEnd: string | null;
  detectedLast4: string | null;
} {
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let detectedLast4: string | null = null;

  for (let i = 0; i < headerRowIdx; i++) {
    const rowText = (matrix[i] || []).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!rowText) continue;

    if (!periodStart || !periodEnd) {
      const periodMatch = rowText.match(
        /Statement\s+From\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+To\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
      );
      if (periodMatch) {
        periodStart = parseIndianDate(periodMatch[1]);
        periodEnd = parseIndianDate(periodMatch[2]);
      }
    }

    if (!detectedLast4) {
      const acctMatch = rowText.match(
        /(?:Account\s*(?:No\.?|Number)|A\/C\s*No\.?)\s*[:\-]?\s*(?:[X*#\d\-\s]*?)(\d{4})\b/i
      );
      if (acctMatch) {
        detectedLast4 = acctMatch[1];
      }
    }
  }

  return { periodStart, periodEnd, detectedLast4 };
}

function isSummaryOrFooterRow(cells: string[], dateColVal: string, descColVal: string): boolean {
  const nonEmpty = cells.filter((c) => c !== '');
  if (nonEmpty.length === 0) return true;
  if (nonEmpty.every(isSeparatorString)) return true;

  const hasValidDate = Boolean(dateColVal && parseIndianDate(dateColVal));
  if (hasValidDate) {
    if (/^(?:opening\s+balance|closing\s+balance|brought\s+forward|carried\s+forward)$/i.test(descColVal.trim())) {
      return true;
    }
    return false;
  }

  const joined = nonEmpty.join(' ').trim();
  if (SUMMARY_OR_NOISE_ROW_REGEX.test(joined)) return true;

  if (/^opening\s+balance\b|^closing\s+balance\b|^statement\s+summary\b|^end\s+of\s+statement\b/i.test(joined)) {
    return true;
  }

  return false;
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
      parser_version: 'csv-generic-v2',
    };
  }

  const headerRowIdx = findHeaderRowIndex(matrix);
  const rawHeaders = matrix[headerRowIdx] || [];
  const meta = extractCsvPreHeaderMetadata(matrix, headerRowIdx);

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

  const { mapping, confidence, detected_bank } = detectColumnMapping(headers);
  const dateIdx = mapping.date_col ? headers.indexOf(mapping.date_col) : -1;
  const descIdx = mapping.description_col ? headers.indexOf(mapping.description_col) : -1;
  const debitIdx = mapping.debit_col ? headers.indexOf(mapping.debit_col) : -1;
  const creditIdx = mapping.credit_col ? headers.indexOf(mapping.credit_col) : -1;
  const amtIdx = mapping.amount_col ? headers.indexOf(mapping.amount_col) : -1;
  const balIdx = mapping.balance_col ? headers.indexOf(mapping.balance_col) : -1;

  const rows: Array<Record<string, string>> = [];
  const rawNarrations: string[] = [];
  let footerOpeningBalance: number | null = null;
  let footerSummaryClosing: number | null = null;

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!rawRow) continue;

    const sliced: string[] = [];
    for (let c = 0; c < headers.length; c++) {
      sliced.push((rawRow[c] !== undefined && rawRow[c] !== null ? String(rawRow[c]) : '').trim());
    }

    const nonEmpty = sliced.filter((c) => c !== '');
    if (nonEmpty.length === 0) continue;

    const dateVal = dateIdx >= 0 ? sliced[dateIdx] : '';
    const descVal = descIdx >= 0 ? sliced[descIdx] : '';
    const debitVal = debitIdx >= 0 ? sliced[debitIdx] : '';
    const creditVal = creditIdx >= 0 ? sliced[creditIdx] : '';
    const amtVal = amtIdx >= 0 ? sliced[amtIdx] : '';
    const balVal = balIdx >= 0 ? sliced[balIdx] : '';

    // Capture footer opening/closing summary numbers if printed below table
    const joinedLower = nonEmpty.join(' ').toLowerCase();
    if (!dateVal || !parseIndianDate(dateVal)) {
      const fClose = joinedLower.match(/closing\s+(?:bal(?:ance)?)\s*[:\-]?\s*([-\d,]+\.?\d*)/i);
      if (fClose && footerSummaryClosing === null) {
        footerSummaryClosing = parseMonetaryValue(fClose[1]);
      }
      const fOpen = joinedLower.match(/opening\s+(?:bal(?:ance)?)\s*[:\-]?\s*([-\d,]+\.?\d*)/i);
      if (fOpen && footerOpeningBalance === null) {
        footerOpeningBalance = parseMonetaryValue(fOpen[1]);
      }
    }

    if (isSummaryOrFooterRow(sliced, dateVal, descVal)) {
      continue;
    }

    // Handle wrapped multi-line narration continuation rows
    const hasAnyAmount = Boolean(debitVal || creditVal || amtVal || balVal);
    const hasValidDate = dateIdx >= 0 ? Boolean(dateVal && parseIndianDate(dateVal)) : true;

    if (dateIdx >= 0 && !dateVal && !hasAnyAmount && descVal && rows.length > 0 && mapping.description_col) {
      const prevIdx = rows.length - 1;
      rawNarrations[prevIdx] = `${rawNarrations[prevIdx]} ${descVal}`.replace(/\s+/g, ' ').trim();
      rows[prevIdx][mapping.description_col] = rawNarrations[prevIdx];
      continue;
    }

    if (dateIdx >= 0 && !hasValidDate && !hasAnyAmount) {
      continue;
    }

    const rowObj: Record<string, string> = {};
    let hasValidData = false;
    for (let c = 0; c < headers.length; c++) {
      const val = sliced[c];
      rowObj[headers[c]] = val;
      if (val !== '') hasValidData = true;
    }

    if (hasValidData) {
      rows.push(rowObj);
      rawNarrations.push(descVal);
    }
  }

  const parserVersion = 'csv-generic-v2';
  const transactions: ParsedTransaction[] = [];
  const canBuildStructuredTxns = Boolean(
    mapping.date_col &&
      mapping.description_col &&
      (mapping.debit_col || mapping.credit_col || (mapping.is_single_amount_col && mapping.amount_col))
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawDateStr = mapping.date_col ? row[mapping.date_col] || '' : '';
    const isoDate = parseIndianDate(rawDateStr) || rawDateStr;
    const rawDesc = rawNarrations[i] || (mapping.description_col ? row[mapping.description_col] || '' : '');
    const rawRefCol = mapping.reference_col ? row[mapping.reference_col] || '' : '';

    const parsedNarration = rawDesc ? parseBankNarration(rawDesc, rawRefCol) : null;
    const cleanDesc = parsedNarration?.description || rawDesc || 'Transaction';

    if (rawDesc && mapping.description_col && cleanDesc !== rawDesc) {
      row['Raw Narration'] = rawDesc;
      row[mapping.description_col] = cleanDesc;
    }

    if (canBuildStructuredTxns) {
      let debit: number | null = null;
      let credit: number | null = null;

      if (mapping.is_single_amount_col && mapping.amount_col) {
        const amt = parseMonetaryValue(row[mapping.amount_col]);
        if (amt !== null && amt !== 0) {
          if (amt < 0) debit = Math.abs(amt);
          else credit = amt;
        }
      } else {
        if (mapping.debit_col) {
          const d = parseMonetaryValue(row[mapping.debit_col]);
          if (d !== null && d !== 0) debit = Math.abs(d);
        }
        if (mapping.credit_col) {
          const cr = parseMonetaryValue(row[mapping.credit_col]);
          if (cr !== null && cr !== 0) credit = Math.abs(cr);
        }
      }

      const bal = mapping.balance_col ? parseMonetaryValue(row[mapping.balance_col]) : null;
      const nonZeroFallbackRef =
        rawRefCol && !/^0+$/.test(rawRefCol.trim()) ? rawRefCol.trim() : null;
      const normRef =
        normalizeReferenceNumber(parsedNarration?.reference) ||
        normalizeReferenceNumber(rawRefCol) ||
        nonZeroFallbackRef ||
        null;

      const refs = extractCrossSourceRefs({
        parserVersion,
        description: cleanDesc,
        rawNarration: rawDesc,
        referenceNumber: normRef,
      });

      transactions.push({
        txn_date: isoDate,
        description: cleanDesc,
        raw_description: rawDesc || cleanDesc,
        debit,
        credit,
        balance: bal,
        balance_after: bal,
        reference_number: normRef,
        upi_ref_no: refs.upi_ref_no,
        imps_ref_no: refs.imps_ref_no,
        source: 'statement_import',
      });
    }
  }

  let periodStart = meta.periodStart;
  let periodEnd = meta.periodEnd;
  let openingBalance = footerOpeningBalance;
  let lastRowBalance: number | null = null;
  let closingBalance = footerSummaryClosing;

  if (transactions.length > 0) {
    const validDates = transactions.map((t) => t.txn_date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (validDates.length > 0) {
      const sortedDates = [...validDates].sort();
      if (!periodStart) periodStart = sortedDates[0];
      if (!periodEnd) periodEnd = sortedDates[sortedDates.length - 1];
    }

    const withBalances = transactions.filter((t) => t.balance !== null && t.balance !== undefined);
    if (withBalances.length > 0) {
      let isDescending = false;
      if (transactions.length >= 2) {
        const first = transactions[0];
        const second = transactions[1];
        const last = transactions[transactions.length - 1];
        if (first.balance != null && second.balance != null) {
          const forwardCalc = round2(first.balance + (second.credit ?? 0) - (second.debit ?? 0));
          const reverseCalc = round2(second.balance + (first.credit ?? 0) - (first.debit ?? 0));
          if (Math.abs(reverseCalc - first.balance) <= 0.05 && Math.abs(forwardCalc - second.balance) > 0.05) {
            isDescending = true;
          }
        } else if (first.txn_date > last.txn_date) {
          isDescending = true;
        }
      }

      const earliestTx = isDescending ? transactions[transactions.length - 1] : transactions[0];
      const latestTx = isDescending ? transactions[0] : transactions[transactions.length - 1];

      lastRowBalance = latestTx.balance ?? null;
      if (closingBalance === null && lastRowBalance !== null) {
        closingBalance = lastRowBalance;
      }
      if (openingBalance === null && earliestTx.balance !== null && earliestTx.balance !== undefined) {
        openingBalance = round2(
          earliestTx.balance + (earliestTx.debit ?? 0) - (earliestTx.credit ?? 0)
        );
      }
    }
  }

  return {
    headers,
    rows,
    ...(transactions.length > 0 ? { transactions } : {}),
    parser_version: parserVersion,
    detected_bank: detected_bank || undefined,
    detected_account_last4: meta.detectedLast4,
    confidence,
    suggested_mapping: mapping,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    summary_closing_balance: footerSummaryClosing,
    last_row_balance: lastRowBalance,
    statement_period_start: periodStart,
    statement_period_end: periodEnd,
  };
}
