import type { ParseResult, ColumnMapping } from '../../types/uploads';
import { extractPDFRawData, extractStatementPeriod, type PDFExtractionResult } from './pdf';

const HDFC_COLUMNS = [
  'Date',
  'Narration',
  'Value Dt',
  'Ref No./Cheque No.',
  'Debit',
  'Credit',
  'Balance',
];

const HDFC_HARDCODED_MAPPING: ColumnMapping = {
  date_col: 'Date',
  description_col: 'Narration',
  debit_col: 'Debit',
  credit_col: 'Credit',
  balance_col: 'Balance',
  reference_col: 'Ref No./Cheque No.',
  amount_col: null,
  is_single_amount_col: false,
};

/**
 * Checks if first page indicates an HDFC Bank statement
 */
export function isHDFCStatement(firstPageText: string): boolean {
  const lower = firstPageText.toLowerCase();
  return lower.includes('hdfc bank') || lower.includes('hdfcbank');
}

/**
 * Checks if a row is an HDFC page header, footer, account summary block, or page number line
 */
function isHDFCHeaderOrFooter(cells: string[]): boolean {
  if (cells.length === 0) return true;
  const rowText = cells.join(' ').toLowerCase();

  if (
    rowText.includes('hdfc bank limited') ||
    rowText.includes('registered office') ||
    rowText.includes('statement of account') ||
    rowText.includes('page no') ||
    rowText.includes('page :') ||
    rowText.includes('page number') ||
    rowText.includes('account branch') ||
    rowText.includes('address :') ||
    rowText.includes('city :') ||
    rowText.includes('state :') ||
    rowText.includes('phone no.') ||
    rowText.includes('email :') ||
    rowText.includes('cust id') ||
    rowText.includes('customer id') ||
    rowText.includes('account no') ||
    rowText.includes('a/c no') ||
    rowText.includes('nomination') ||
    rowText.includes('opening balance') ||
    rowText.includes('statement period') ||
    rowText.includes('statement from') ||
    rowText.includes('generated on') ||
    rowText.includes('contents of this statement') ||
    rowText.includes('closing balance') ||
    rowText.includes('total withdrawal') ||
    rowText.includes('total deposit')
  ) {
    return true;
  }

  if (
    rowText.includes('date') &&
    rowText.includes('narration') &&
    (rowText.includes('chq') || rowText.includes('ref') || rowText.includes('debit') || rowText.includes('credit'))
  ) {
    return true;
  }

  return false;
}

function cleanNumber(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

interface PreParsedRow {
  date: string;
  narration: string;
  valueDt: string;
  refNo: string;
  rawDebit?: string;
  rawCredit?: string;
  rawAmount?: string;
  rawBalance?: string;
}

export async function parsePDFHDFC(
  buffer: ArrayBuffer | Uint8Array,
  preExtracted?: PDFExtractionResult
): Promise<ParseResult> {
  const pdfData = preExtracted || (await extractPDFRawData(buffer));

  const rawCandidates: PreParsedRow[] = [];

  for (const page of pdfData.pages) {
    for (const gridRow of page.gridRows) {
      if (isHDFCHeaderOrFooter(gridRow)) continue;

      if (gridRow.length < 3) continue;
      const firstCell = gridRow[0].trim();
      const dateMatch = firstCell.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
      if (!dateMatch) continue;

      let narration = '';
      let valueDt = '';
      let refNo = '';
      let rawDebit = '';
      let rawCredit = '';
      let rawAmount = '';
      let rawBalance = '';

      if (gridRow.length >= 7) {
        narration = gridRow[1] || '';
        valueDt = gridRow[2] || '';
        refNo = gridRow[3] || '';
        rawDebit = gridRow[4] || '';
        rawCredit = gridRow[5] || '';
        rawBalance = gridRow[6] || '';
      } else if (gridRow.length === 6) {
        narration = gridRow[1] || '';
        valueDt = gridRow[2] || '';
        refNo = gridRow[3] || '';
        rawAmount = gridRow[4] || '';
        rawBalance = gridRow[5] || '';
      } else if (gridRow.length === 5) {
        narration = gridRow[1] || '';
        refNo = gridRow[2] || '';
        rawAmount = gridRow[3] || '';
        rawBalance = gridRow[4] || '';
      } else {
        narration = gridRow[1] || '';
        rawBalance = gridRow[gridRow.length - 1] || '';
        rawAmount = gridRow[gridRow.length - 2] || '';
      }

      rawCandidates.push({
        date: firstCell,
        narration: narration.trim(),
        valueDt: valueDt.trim(),
        refNo: refNo.trim(),
        rawDebit,
        rawCredit,
        rawAmount,
        rawBalance,
      });
    }
  }

  // Pass 2: Determine Debit / Credit & Running Balance
  const rows: Array<Record<string, string>> = [];
  let runningBalance = pdfData.openingBalance;

  for (let i = 0; i < rawCandidates.length; i++) {
    const candidate = rawCandidates[i];
    let debitStr = '';
    let creditStr = '';
    let balanceStr = candidate.rawBalance ? candidate.rawBalance.replace(/[^\d.-]/g, '') : '';

    const currentBalNum = cleanNumber(balanceStr);
    let isCredit = false;
    let isDebit = false;
    let needsReview = false;

    if (candidate.rawDebit && candidate.rawCredit) {
      const dNum = cleanNumber(candidate.rawDebit);
      const cNum = cleanNumber(candidate.rawCredit);
      if (dNum !== null && dNum > 0) {
        debitStr = String(dNum);
        isDebit = true;
      }
      if (cNum !== null && cNum > 0) {
        creditStr = String(cNum);
        isCredit = true;
      }
    } else {
      const amtNum = cleanNumber(candidate.rawAmount || candidate.rawDebit || candidate.rawCredit || '');
      if (amtNum !== null && amtNum > 0) {
        if (currentBalNum !== null && runningBalance !== null && runningBalance !== undefined) {
          const diff = currentBalNum - runningBalance;
          if (Math.abs(diff - amtNum) < 1.0 || diff > 0.05) {
            isCredit = true;
            creditStr = String(amtNum);
          } else if (Math.abs(-diff - amtNum) < 1.0 || diff < -0.05) {
            isDebit = true;
            debitStr = String(amtNum);
          }
        }

        if (!isCredit && !isDebit) {
          const upperNarr = candidate.narration.toUpperCase();
          if (
            upperNarr.includes('CR') ||
            upperNarr.includes('BY ') ||
            upperNarr.includes('CREDIT') ||
            upperNarr.includes('SALARY') ||
            upperNarr.includes('REFUND') ||
            upperNarr.includes('INT.PD') ||
            upperNarr.includes('INTEREST')
          ) {
            isCredit = true;
            creditStr = String(amtNum);
          } else if (
            upperNarr.includes('DR') ||
            upperNarr.includes('TO ') ||
            upperNarr.includes('DEBIT') ||
            upperNarr.includes('POS') ||
            upperNarr.includes('ATM') ||
            upperNarr.includes('WDL')
          ) {
            isDebit = true;
            debitStr = String(amtNum);
          } else {
            // Unresolved: mark for review, default to debit but flag needs_review
            debitStr = String(amtNum);
            needsReview = true;
          }
        }
      }
    }

    if (currentBalNum !== null) {
      runningBalance = currentBalNum;
    } else if (runningBalance !== null && runningBalance !== undefined) {
      const cNum = cleanNumber(creditStr) || 0;
      const dNum = cleanNumber(debitStr) || 0;
      runningBalance = runningBalance + cNum - dNum;
      balanceStr = String(runningBalance);
    }

    const rowObj: Record<string, string> = {
      Date: candidate.date,
      Narration: candidate.narration,
      'Value Dt': candidate.valueDt,
      'Ref No./Cheque No.': candidate.refNo,
      Debit: debitStr,
      Credit: creditStr,
      Balance: balanceStr,
    };

    if (needsReview) {
      rowObj['needs_review'] = 'true';
    }

    rows.push(rowObj);
  }

  const period = pdfData.statementPeriodStart && pdfData.statementPeriodEnd
    ? { start: pdfData.statementPeriodStart, end: pdfData.statementPeriodEnd }
    : extractStatementPeriod(pdfData.fullDocumentText);

  let periodStart = period.start;
  let periodEnd = period.end;
  if (!periodStart && rows.length > 0) {
    periodStart = rows[0].Date;
    periodEnd = rows[rows.length - 1].Date;
  }

  return {
    headers: [...HDFC_COLUMNS],
    rows,
    parser_version: 'hdfc-pdf-v2',
    detected_bank: 'HDFC Bank',
    confidence: 'high',
    suggested_mapping: HDFC_HARDCODED_MAPPING,
    opening_balance: pdfData.openingBalance,
    closing_balance: pdfData.closingBalance,
    statement_period_start: periodStart,
    statement_period_end: periodEnd,
    raw_text: pdfData.fullDocumentText,
  };
}
