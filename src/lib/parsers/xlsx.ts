import * as XLSX from 'xlsx';
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
    'value dt',
  ];

  let bestIndex = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const row = lines[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const nonEmptyCells = row.filter(
      (c) => c !== undefined && c !== null && String(c).trim() !== ''
    );
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

    if (totalScore > maxScore && keywordScore >= 6) {
      maxScore = totalScore;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function formatExcelDateUtcSafe(date: Date): string {
  // Handle ~1-2 minute sub-second rounding drift from Excel serial numbers (e.g. 23:59:59Z)
  const adjusted =
    date.getUTCHours() === 23 && date.getUTCMinutes() >= 58
      ? new Date(date.getTime() + 120_000)
      : date;
  const year = adjusted.getUTCFullYear();
  const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCellPair(rawVal: any, formattedVal: any): string {
  // 1. Native Excel Date cell parsed via cellDates: true -> always emit YYYY-MM-DD so DD/MM vs MM/DD never flips
  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    return formatExcelDateUtcSafe(rawVal);
  }

  const fmtStr =
    formattedVal === undefined || formattedVal === null
      ? ''
      : String(formattedVal).trim();

  // 2. Numeric Excel cell -> avoid scientific notation on large refs (e.g. 2.00119E+11) while keeping formatted decimals ('250.00')
  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
    if (!fmtStr || /[eE][+-]?\d+/.test(fmtStr)) {
      return Number.isInteger(rawVal) ? rawVal.toFixed(0) : String(rawVal);
    }
    return fmtStr;
  }

  if (fmtStr) return fmtStr;
  if (rawVal === undefined || rawVal === null) return '';
  return String(rawVal).trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isSummaryOrFooterRow(cells: string[], dateColVal: string, descColVal: string): boolean {
  const nonEmpty = cells.filter((c) => c !== '');
  if (nonEmpty.length === 0) return true;
  if (nonEmpty.every(isSeparatorString)) return true;

  // If the date column holds a valid date, treat as a real transaction row unless narration itself says Opening/Closing Balance
  const hasValidDate = Boolean(dateColVal && parseIndianDate(dateColVal));
  if (hasValidDate) {
    if (/^(?:opening\s+balance|closing\s+balance|brought\s+forward|carried\s+forward)$/i.test(descColVal.trim())) {
      return true;
    }
    return false;
  }

  const joined = nonEmpty.join(' ').trim();
  if (SUMMARY_OR_NOISE_ROW_REGEX.test(joined) || SUMMARY_OR_NOISE_ROW_REGEX.test(descColVal.trim())) {
    return true;
  }
  if (/^\*+.*\*+$/.test(joined)) return true;

  return false;
}

function extractExcelMetadata(preHeaderRows: string[][]): {
  detectedLast4: string | null;
  openingBalance: number | null;
  summaryClosingBalance: number | null;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const flatText = preHeaderRows
    .map((r) => r.filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');

  let detectedLast4: string | null = null;
  const acctMatch =
    flatText.match(/(?:account|a\/c)(?:\s+no\.?)?\s*[:\-]?\s*[Xx*]*(\d{4,16})/i) ||
    flatText.match(/\b[Xx*]{4,}(\d{4})\b/);
  if (acctMatch?.[1]) {
    detectedLast4 = acctMatch[1].slice(-4);
  }

  let openingBalance: number | null = null;
  const openMatch = flatText.match(/opening\s+balance\s*[:\-]?\s*([-\d,]+\.?\d*)/i);
  if (openMatch?.[1]) {
    openingBalance = parseMonetaryValue(openMatch[1]);
  }

  let summaryClosingBalance: number | null = null;
  const closeMatch = flatText.match(/closing\s+balance\s*[:\-]?\s*([-\d,]+\.?\d*)/i);
  if (closeMatch?.[1]) {
    summaryClosingBalance = parseMonetaryValue(closeMatch[1]);
  }

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const periodMatch = flatText.match(
    /(?:from|period)\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/i
  );
  if (periodMatch) {
    periodStart = parseIndianDate(periodMatch[1]);
    periodEnd = parseIndianDate(periodMatch[2]);
  }

  return {
    detectedLast4,
    openingBalance,
    summaryClosingBalance,
    periodStart,
    periodEnd,
  };
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
      parser_version: 'xlsx-structured-v2',
    };
  }

  // Pick the first non-empty worksheet
  let selectedSheet = workbook.Sheets[sheetNames[0]];
  for (const name of sheetNames) {
    const candidate = workbook.Sheets[name];
    const probe: any[][] = XLSX.utils.sheet_to_json(candidate, { header: 1, defval: '' });
    if (probe.some((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))) {
      selectedSheet = candidate;
      break;
    }
  }

  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(selectedSheet, {
    header: 1,
    raw: true,
    defval: '',
  });
  const formattedMatrix: any[][] = XLSX.utils.sheet_to_json(selectedSheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });

  if (formattedMatrix.length === 0 && rawMatrix.length === 0) {
    return {
      headers: [],
      rows: [],
      parser_version: 'xlsx-structured-v2',
    };
  }

  const rowCountTotal = Math.max(rawMatrix.length, formattedMatrix.length);
  const normalizedMatrix: string[][] = [];
  for (let r = 0; r < rowCountTotal; r++) {
    const rawRow = rawMatrix[r] || [];
    const fmtRow = formattedMatrix[r] || [];
    const colLen = Math.max(rawRow.length, fmtRow.length);
    const cells: string[] = [];
    for (let c = 0; c < colLen; c++) {
      cells.push(formatCellPair(rawRow[c], fmtRow[c]));
    }
    normalizedMatrix.push(cells);
  }

  const headerRowIdx = findHeaderRowIndex(normalizedMatrix);
  const rawHeaders = [...(normalizedMatrix[headerRowIdx] || [])];

  // Trim trailing empty header columns so blank columns past the table don't create Column_8, Column_9...
  while (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1] === '') {
    rawHeaders.pop();
  }

  const seenHeaders = new Map<string, number>();
  const headers: string[] = [];

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    let headerText = rawHeaders[idx];
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
  const refIdx = mapping.reference_col ? headers.indexOf(mapping.reference_col) : -1;
  const debitIdx = mapping.debit_col ? headers.indexOf(mapping.debit_col) : -1;
  const creditIdx = mapping.credit_col ? headers.indexOf(mapping.credit_col) : -1;
  const balIdx = mapping.balance_col ? headers.indexOf(mapping.balance_col) : -1;
  const amtIdx = mapping.amount_col ? headers.indexOf(mapping.amount_col) : -1;

  const meta = extractExcelMetadata(normalizedMatrix.slice(0, headerRowIdx));
  const parserVersion =
    detected_bank === 'HDFC Bank' ? 'xlsx-hdfc-v2' : 'xlsx-structured-v2';

  const rows: Array<Record<string, string>> = [];
  const rawNarrations: string[] = [];
  let footerSummaryClosing = meta.summaryClosingBalance;
  let footerOpeningBalance = meta.openingBalance;

  for (let r = headerRowIdx + 1; r < normalizedMatrix.length; r++) {
    const rawRow = normalizedMatrix[r];
    if (!rawRow || rawRow.length === 0) continue;

    const sliced = headers.map((_, c) => (rawRow[c] || '').trim());
    const dateVal = dateIdx >= 0 ? sliced[dateIdx] : '';
    const descVal = descIdx >= 0 ? sliced[descIdx] : '';
    const debitVal = debitIdx >= 0 ? sliced[debitIdx] : '';
    const creditVal = creditIdx >= 0 ? sliced[creditIdx] : '';
    const amtVal = amtIdx >= 0 ? sliced[amtIdx] : '';
    const balVal = balIdx >= 0 ? sliced[balIdx] : '';

    // Capture footer opening/closing summary numbers if printed below table
    const joinedLower = sliced.filter(Boolean).join(' ').toLowerCase();
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

    // Handle wrapped multi-line narration continuation rows (blank date + blank amounts + text in description)
    const hasAnyAmount = Boolean(debitVal || creditVal || amtVal || balVal);
    const hasValidDate = dateIdx >= 0 ? Boolean(dateVal && parseIndianDate(dateVal)) : true;

    if (dateIdx >= 0 && !dateVal && !hasAnyAmount && descVal && rows.length > 0 && mapping.description_col) {
      const prevIdx = rows.length - 1;
      rawNarrations[prevIdx] = `${rawNarrations[prevIdx]} ${descVal}`.replace(/\s+/g, ' ').trim();
      rows[prevIdx][mapping.description_col] = rawNarrations[prevIdx];
      continue;
    }

    // If a Date column exists and this row neither has a valid date nor any financial amount, skip noise
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

  // Enrich rows with cleaned narration while preserving original in Raw Narration,
  // and build normalized transactions + balance reconciliation metadata.
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

    // Preserve raw narration so UPI/IMPS/NEFT/RTGS refs never vanish during cleanup
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

  // Infer statement period and opening/closing balances from transactions if not in header metadata
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
      // Determine chronological orientation (ascending vs descending)
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
