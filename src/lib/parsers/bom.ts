import Papa from 'papaparse';
import type { ColumnMapping, ParseResult, ParsedTransaction } from '../../types/uploads';
import { extractPDFRawData, extractStatementPeriod, type PDFExtractionResult } from './pdf';
import { extractCrossSourceRefs, extractImpsRef, normalizeReferenceNumber, parseIndianDate, parseMonetaryValue } from './utils';
import { isStatementNoiseLine } from './strip-statement-noise';
import { parseBankNarration } from './bank-transaction';

const BOM_COLUMNS = [
  'Txn Date',
  'Value Date',
  'Description',
  'Ref No',
  'Debit',
  'Credit',
  'Balance',
];

const BOM_MAPPING: ColumnMapping = {
  date_col: 'Txn Date',
  description_col: 'Description',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: 'Balance',
  reference_col: 'Ref No',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks whether statement text belongs to Bank of Maharashtra.
 */
export function isBOMStatement(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return lower.includes('bank of maharashtra') || lower.includes('mahabank');
}

function isBOMHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return (
    (joined.includes('date') && (joined.includes('description') || joined.includes('narration') || joined.includes('particular'))) &&
    (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('balance'))
  );
}

function isBOMFooterOrMeta(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  if (isStatementNoiseLine(cells.join(' '))) return true;
  return (
    joined.includes('bank of maharashtra') ||
    joined.includes('statement of account') ||
    joined.includes('opening balance') ||
    joined.includes('closing balance') ||
    joined.includes('page no') ||
    joined.includes('page :') ||
    joined.includes('generated on') ||
    joined.includes('account number') ||
    joined.includes('ifsc code') ||
    joined.includes('total debit') ||
    joined.includes('total credit')
  );
}

function extractNeftUtr(text: string): string | null {
  if (!text) return null;
  const m =
    text.match(/UTR[:\s-]+([A-Z]{4}[A-Z0-9]{10,22})/i) ||
    text.match(/NEFT[\/\s-]+([A-Z0-9]{10,22})/i);
  return m ? m[1] : null;
}

function parseBOMGridRows(gridRows: string[][]): {
  hasValidHeader: boolean;
  rows: Array<Record<string, string>>;
  transactions: ParsedTransaction[];
} {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(gridRows.length, 40); i++) {
    if (isBOMHeaderRow(gridRows[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { hasValidHeader: false, rows: [], transactions: [] };
  }

  const headerCells = gridRows[headerIdx].map((c) => c.toLowerCase().trim());
  const findCol = (kws: string[]) => headerCells.findIndex((h) => kws.some((k) => h.includes(k)));

  const txnDateIdx = findCol(['txn date', 'tran date', 'transaction date', 'date']);
  const valueDateIdx = findCol(['value date', 'val date']);
  const descIdx = findCol(['description', 'narration', 'particulars', 'remarks']);
  const refIdx = findCol(['ref no', 'chq', 'reference', 'cheque']);
  const debitIdx = findCol(['debit', 'withdrawal', 'dr']);
  const creditIdx = findCol(['credit', 'deposit', 'cr']);
  const balanceIdx = findCol(['balance', 'bal']);

  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];

  let activeRow: Record<string, string> | null = null;
  let activeTx: ParsedTransaction | null = null;

  const flushActive = () => {
    if (activeRow && activeTx) {
      // Re-run IMPS / UTR extraction after multi-line narration merge
      const impsRef =
        extractImpsRef(activeTx.description) ||
        extractImpsRef(activeTx.reference_number || '');
      const utr = extractNeftUtr(activeTx.description);
      activeTx.imps_ref_no = impsRef;
      if (!activeTx.reference_number) {
        activeTx.reference_number = impsRef || utr || null;
        activeRow['Ref No'] = activeTx.reference_number || '';
      }
      activeRow.Description = activeTx.description;
      rows.push(activeRow);
      transactions.push(activeTx);
    }
    activeRow = null;
    activeTx = null;
  };

  for (let r = headerIdx + 1; r < gridRows.length; r++) {
    const cells = gridRows[r];
    if (!cells || cells.length === 0) continue;
    if (isBOMHeaderRow(cells) || isBOMFooterOrMeta(cells)) continue;

    const firstDateCandidate = cells[txnDateIdx >= 0 ? txnDateIdx : 0] || '';
    const isoDate = parseIndianDate(firstDateCandidate);

    if (!isoDate) {
      // Multi-line narration continuation
      if (activeTx && cells.length <= 3) {
        const extra = cells.map((c) => c.trim()).filter(Boolean).join(' ');
        if (extra && !/^\d[\d,.]*$/.test(extra)) {
          activeTx.description = `${activeTx.description} ${extra}`.trim();
        }
      }
      continue;
    }

    flushActive();

    const getCell = (idx: number, fallbackIdx: number): string => {
      if (idx >= 0 && idx < cells.length) return (cells[idx] || '').trim();
      if (fallbackIdx >= 0 && fallbackIdx < cells.length) return (cells[fallbackIdx] || '').trim();
      return '';
    };

    const valueDateRaw = valueDateIdx >= 0 ? getCell(valueDateIdx, -1) : '';
    const valueDate = valueDateRaw ? parseIndianDate(valueDateRaw) || valueDateRaw : '';
    const description = getCell(descIdx, valueDateIdx >= 0 ? 2 : 1) || 'Bank of Maharashtra Txn';
    const refRaw = getCell(refIdx, -1);

    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;

    if (debitIdx >= 0 && creditIdx >= 0) {
      // Handle compact PDF rows where blank Debit or Credit cell was omitted by PDF extractor
      const hasFullWidth = cells.length >= headerCells.length;
      if (hasFullWidth) {
        const dVal = parseMonetaryValue(cells[debitIdx]);
        const cVal = parseMonetaryValue(cells[creditIdx]);
        debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
        credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
        balance = balanceIdx >= 0 ? parseMonetaryValue(cells[balanceIdx]) : null;
      } else {
        // Fallback: last numeric cell is Balance, preceding numeric cell is Debit or Credit
        const numericTail = cells
          .slice(Math.max(1, (descIdx >= 0 ? descIdx : 1) + 1))
          .map((c) => ({ raw: c, val: parseMonetaryValue(c) }))
          .filter((x) => x.val !== null);
        if (numericTail.length >= 2) {
          balance = numericTail[numericTail.length - 1].val;
          const amt = numericTail[numericTail.length - 2].val!;
          if (/\bcr\b/i.test(numericTail[numericTail.length - 2].raw) || /\bcr\b/i.test(description)) {
            credit = Math.abs(amt);
          } else {
            debit = Math.abs(amt);
          }
        } else if (numericTail.length === 1) {
          debit = Math.abs(numericTail[0].val!);
        }
      }
    } else {
      const dVal = debitIdx >= 0 ? parseMonetaryValue(cells[debitIdx]) : null;
      const cVal = creditIdx >= 0 ? parseMonetaryValue(cells[creditIdx]) : null;
      debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
      credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
      balance = balanceIdx >= 0 ? parseMonetaryValue(cells[balanceIdx]) : null;
    }

    if (debit === null && credit === null) continue;

    const impsRef = extractImpsRef(description) || extractImpsRef(refRaw);
    const utr = extractNeftUtr(description);
    const refNo = refRaw || impsRef || utr || null;

    activeTx = {
      txn_date: isoDate,
      description,
      debit,
      credit,
      balance,
      balance_after: balance,
      reference_number: refNo,
      upi_ref_no: null,
      imps_ref_no: impsRef,
      source: 'statement_import',
    };

    activeRow = {
      'Txn Date': isoDate,
      'Value Date': valueDate,
      Description: description,
      'Ref No': refNo || '',
      Debit: debit !== null ? debit.toFixed(2) : '',
      Credit: credit !== null ? credit.toFixed(2) : '',
      Balance: balance !== null ? balance.toFixed(2) : '',
    };
  }

  flushActive();

  return { hasValidHeader: true, rows, transactions };
}

/**
 * Coordinate-aware BOM PDF parser:
 * BOM tables vertically center multi-line Particulars around each row's Date anchor Y,
 * so items slightly above and below anchor[k].y belong to anchor[k], never anchor[k-1].
 */
function parseBOMPdfPages(pdfData: PDFExtractionResult): {
  hasValidHeader: boolean;
  rows: Array<Record<string, string>>;
  transactions: ParsedTransaction[];
} {
  const rows: Array<Record<string, string>> = [];
  const transactions: ParsedTransaction[] = [];
  let foundAnyHeader = false;
  let summaryReached = false;

  // Persist detected column X bounds across pages (continuation pages may omit header)
  let colBounds = {
    dateMinX: 130,
    dateMaxX: 210,
    partMinX: 210,
    partMaxX: 395,
    refMinX: 395,
    refMaxX: 500,
    debitMinX: 500,
    debitMaxX: 590,
    creditMinX: 590,
    creditMaxX: 690,
    balMinX: 690,
    balMaxX: 830,
    chanMinX: 830,
  };

  for (const page of pdfData.pages) {
    if (summaryReached) break;
    const items = [...(page.textItems || [])].sort((a, b) => b.y - a.y || a.x - b.x);
    if (items.length === 0) continue;

    // Detect table header row on this page if present
    let tableTopY = Infinity;
    let footerStartY = -Infinity;

    for (const it of items) {
      const txt = it.text.trim();
      if (/^(?:B\.\s*Summary\s+for\s+Account|\*\s*END\s+OF\s+STATEMENT|Page\s+\d+\s+of\s+\d+)$/i.test(txt) ||
          /^B\.\s*Summary\s+for\s+Account/i.test(txt) ||
          /^\*\s*END\s+OF\s+STATEMENT/i.test(txt)) {
        if (/B\.\s*Summary|END\s+OF\s+STATEMENT/i.test(txt)) {
          summaryReached = true;
        }
        footerStartY = Math.max(footerStartY, it.y + 4);
      }
    }

    // Locate header items by looking for "Particulars" & "Debit" on same visual line
    const visualYs: Array<{ y: number; items: typeof items }> = [];
    for (const it of items) {
      if (!it.text.trim()) continue;
      const g = visualYs.find((v) => Math.abs(v.y - it.y) <= 3.5);
      if (g) g.items.push(it);
      else visualYs.push({ y: it.y, items: [it] });
    }

    for (const row of visualYs) {
      const joined = row.items.map((i) => i.text.trim()).join(' ').toLowerCase();
      if (joined.includes('particulars') && joined.includes('debit') && joined.includes('balance')) {
        foundAnyHeader = true;
        tableTopY = row.y - 12;

        const dateH = row.items.find((i) => /^date$/i.test(i.text.trim()));
        const partH = row.items.find((i) => /particulars/i.test(i.text.trim()));
        const debitH = row.items.find((i) => /^debit$/i.test(i.text.trim()));
        const creditH = row.items.find((i) => /^credit$/i.test(i.text.trim()));
        const balH = row.items.find((i) => /^balance$/i.test(i.text.trim()));
        const chanH = row.items.find((i) => /^channel$/i.test(i.text.trim()));

        // "Cheque" / "/Reference No" may be slightly below this Y
        const refHeaderItem = items.find(
          (i) => Math.abs(i.y - row.y) <= 14 && /cheque|reference/i.test(i.text.trim())
        );

        const dateX = dateH ? dateH.x : 165;
        const partX = partH ? partH.x : 283;
        const refX = refHeaderItem ? refHeaderItem.x : 405;
        const debitX = debitH ? debitH.x : 520;
        const creditX = creditH ? creditH.x : 607;
        const balX = balH ? balH.x : 715;
        const chanX = chanH ? chanH.x : 848;

        colBounds = {
          dateMinX: dateX - 30,
          dateMaxX: partX - 75,
          partMinX: partX - 75,
          partMaxX: refX - 10,
          refMinX: refX - 15,
          refMaxX: debitX - 25,
          debitMinX: debitX - 25,
          debitMaxX: (debitX + creditX) / 2 + 5,
          creditMinX: (debitX + creditX) / 2 + 5,
          creditMaxX: (creditX + balX) / 2 + 5,
          balMinX: (creditX + balX) / 2 + 5,
          balMaxX: chanX - 15,
          chanMinX: chanX - 15,
        };
        break;
      }
    }

    // Also stop below B. Summary / Page X of Y / All the amounts
    for (const row of visualYs) {
      const joined = row.items.map((i) => i.text.trim()).join(' ');
      if (
        /^\s*(?:B\.\s*Summary\s+for\s+Account|\*\s*END\s+OF\s+STATEMENT|Page\s+\d+\s+of\s+\d+|All\s+the\s+amounts)/i.test(joined)
      ) {
        footerStartY = Math.max(footerStartY, row.y + 4);
        if (/B\.\s*Summary|END\s+OF\s+STATEMENT/i.test(joined)) {
          summaryReached = true;
        }
      }
    }

    // Collect valid items within table body (below header, above footer)
    const bodyItems = items.filter(
      (it) => it.text.trim() && it.y < tableTopY && it.y > footerStartY
    );

    // Find transaction anchors: Date items in the Date X-band matching DD/MM/YYYY
    const anchors = bodyItems
      .filter((it) => {
        const t = it.text.trim();
        return (
          it.x >= colBounds.dateMinX &&
          it.x < colBounds.dateMaxX &&
          /^\d{2}\/\d{2}\/\d{4}$/.test(t)
        );
      })
      .sort((a, b) => b.y - a.y);

    if (anchors.length === 0) continue;

    for (let idx = 0; idx < anchors.length; idx++) {
      const anchor = anchors[idx];
      const upperY = idx === 0 ? tableTopY : (anchors[idx - 1].y + anchor.y) / 2;
      const lowerY =
        idx === anchors.length - 1 ? footerStartY : (anchor.y + anchors[idx + 1].y) / 2;

      const cellItems = bodyItems
        .filter((it) => it.y <= upperY && it.y > lowerY)
        .sort((a, b) => b.y - a.y || a.x - b.x);

      const partItems = cellItems.filter(
        (it) => it.x >= colBounds.partMinX && it.x < colBounds.partMaxX
      );
      const refItems = cellItems.filter(
        (it) => it.x >= colBounds.refMinX && it.x < colBounds.refMaxX
      );
      const debitItems = cellItems.filter(
        (it) => it.x >= colBounds.debitMinX && it.x < colBounds.debitMaxX
      );
      const creditItems = cellItems.filter(
        (it) => it.x >= colBounds.creditMinX && it.x < colBounds.creditMaxX
      );
      const balItems = cellItems.filter(
        (it) => it.x >= colBounds.balMinX && it.x < colBounds.balMaxX
      );
      const chanItems = cellItems.filter((it) => it.x >= colBounds.chanMinX);

      // Reconstruct multi-line Particulars preserving natural line breaks
      const partLines: Array<{ y: number; text: string }> = [];
      for (const p of partItems) {
        const line = partLines.find((pl) => Math.abs(pl.y - p.y) <= 3.0);
        if (line) line.text = `${line.text} ${p.text.trim()}`.trim();
        else partLines.push({ y: p.y, text: p.text.trim() });
      }
      partLines.sort((a, b) => b.y - a.y);

      const rawNarration = partLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      const refRaw = refItems.map((i) => i.text.trim()).join('').trim();
      const channel = chanItems.map((i) => i.text.trim()).join(' ').trim();
      const dVal = parseMonetaryValue(debitItems.map((i) => i.text.trim()).join(''));
      const cVal = parseMonetaryValue(creditItems.map((i) => i.text.trim()).join(''));
      const bVal = parseMonetaryValue(balItems.map((i) => i.text.trim()).join(''));

      const debit = dVal !== null && Math.abs(dVal) > 0 ? Math.abs(dVal) : null;
      const credit = cVal !== null && Math.abs(cVal) > 0 ? Math.abs(cVal) : null;
      const balance = bVal !== null ? bVal : null;
      const isoDate = parseIndianDate(anchor.text.trim());

      if (!isoDate || (debit === null && credit === null)) continue;

      const parsedNarration = parseBankNarration(rawNarration, refRaw);
      const combinedRaw = [rawNarration, channel].filter(Boolean).join(' | ');
      const refs = extractCrossSourceRefs({
        parserVersion: 'bom-pdf-v1',
        description: parsedNarration.description,
        rawNarration: combinedRaw,
        referenceNumber: refRaw || parsedNarration.reference || null,
      });

      const normRef =
        normalizeReferenceNumber(refRaw) ||
        normalizeReferenceNumber(parsedNarration.reference) ||
        refs.imps_ref_no ||
        refs.upi_ref_no ||
        null;

      const cleanDesc = parsedNarration.description || rawNarration || 'Bank of Maharashtra Txn';

      transactions.push({
        txn_date: isoDate,
        description: cleanDesc,
        raw_description: combinedRaw,
        debit,
        credit,
        balance,
        balance_after: balance,
        reference_number: normRef,
        upi_ref_no: refs.upi_ref_no,
        imps_ref_no: refs.imps_ref_no,
        source: 'statement_import',
      });

      rows.push({
        'Txn Date': isoDate,
        'Value Date': '',
        Description: cleanDesc,
        'Raw Narration': combinedRaw,
        'Ref No': normRef || '',
        Debit: debit !== null ? debit.toFixed(2) : '',
        Credit: credit !== null ? credit.toFixed(2) : '',
        Balance: balance !== null ? balance.toFixed(2) : '',
      });
    }
  }

  return { hasValidHeader: foundAnyHeader || rows.length > 0, rows, transactions };
}

/**
 * Bank of Maharashtra (BOM) statement parser for PDF or CSV.
 * Returns parseError without throwing if format is not recognised.
 */
export async function parseBOM(
  input: string | ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  if (typeof input === 'string') {
    const clean = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const csvParsed = Papa.parse<string[]>(clean, {
      skipEmptyLines: 'greedy',
      delimiter: '',
    });
    const res = parseBOMGridRows(csvParsed.data || []);
    if (!res.hasValidHeader || res.rows.length === 0) {
      return {
        headers: [...BOM_COLUMNS],
        rows: [],
        transactions: [],
        parser_version: 'bom-csv-v1',
        detected_bank: 'Bank of Maharashtra',
        confidence: 'none',
        suggested_mapping: BOM_MAPPING,
        parseError: 'BOM format not recognised — try Generic CSV',
      };
    }

    return {
      headers: [...BOM_COLUMNS],
      rows: res.rows,
      transactions: res.transactions,
      parser_version: 'bom-csv-v1',
      detected_bank: 'Bank of Maharashtra',
      confidence: 'high',
      suggested_mapping: BOM_MAPPING,
    };
  }

  const pdfData = preExtracted || (await extractPDFRawData(input));
  const hasCoordItems = pdfData.pages.some((p) => p.textItems && p.textItems.length > 0);
  const res = hasCoordItems
    ? parseBOMPdfPages(pdfData)
    : parseBOMGridRows(pdfData.allGridRows);

  if (!res.hasValidHeader || res.rows.length === 0) {
    return {
      headers: [...BOM_COLUMNS],
      rows: [],
      transactions: [],
      parser_version: 'bom-pdf-v1',
      detected_bank: 'Bank of Maharashtra',
      detected_account_last4: pdfData.accountLast4 || null,
      confidence: 'none',
      suggested_mapping: BOM_MAPPING,
      opening_balance: pdfData.openingBalance,
      closing_balance: pdfData.closingBalance,
      statement_period_start: pdfData.statementPeriodStart || undefined,
      statement_period_end: pdfData.statementPeriodEnd || undefined,
      raw_text: pdfData.fullDocumentText,
      parseError: 'BOM format not recognised — try Generic CSV',
    };
  }

  const period =
    pdfData.statementPeriodStart && pdfData.statementPeriodEnd
      ? { start: pdfData.statementPeriodStart, end: pdfData.statementPeriodEnd }
      : extractStatementPeriod(pdfData.fullDocumentText);

  return {
    headers: [...BOM_COLUMNS],
    rows: res.rows,
    transactions: res.transactions,
    parser_version: 'bom-pdf-v1',
    detected_bank: 'Bank of Maharashtra',
    detected_account_last4: pdfData.accountLast4 || null,
    confidence: 'high',
    suggested_mapping: BOM_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    statement_period_start: period.start || res.rows[0]?.['Txn Date'],
    statement_period_end: period.end || res.rows[res.rows.length - 1]?.['Txn Date'],
    raw_text: pdfData.fullDocumentText,
  };
}
