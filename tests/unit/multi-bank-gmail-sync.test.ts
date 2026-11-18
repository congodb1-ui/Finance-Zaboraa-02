import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseStatementPDF } from '../../src/lib/parsers';
import { checkReconciliation, checkAccountMismatch } from '../../src/lib/actions/upload';
import {
  GMAIL_ALERT_QUERY_BASE,
  parseGmailTransactionEmail,
  type GmailMessage,
} from '../../src/lib/parsers/gmail';
import {
  findBestCrossSourceMatch,
  type DedupCandidateTx,
  type IncomingDedupRow,
} from '../../src/lib/dedup-sync';
import {
  parseBankNarration,
  formatTransactionSubtitle,
  UNREADABLE_PAYEE_LABEL,
} from '../../src/lib/parsers/bank-transaction';
import { toTitleCase } from '../../src/lib/parsers/intelligent-parser';
import {
  orderTransactionsChronologically,
  countChronologicalBreaks,
  computeAuthoritativeAccountBalance,
} from '../../src/lib/balance-utils';
import { deleteGmailImportedData } from '../../src/lib/gmail-sync-service';
import {
  extractStatementBalances,
  extractStatementAccountInfo,
  type PDFExtractionResult,
} from '../../src/lib/parsers/pdf';

function toArrayBuffer(filePath: string): ArrayBuffer {
  const buf = fs.readFileSync(path.resolve(process.cwd(), filePath));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Multi-Bank Manual Statement Parsers (PDF)', () => {
  it('parses HDFC Account 3011 accurately with zero bleed and full refs', async () => {
    const ab = toArrayBuffer(
      'public/assets/aistudio/Acct_Statement_XXXXXXXX3011_16112026_unlocked_e135e135.pdf'
    );
    const res = await parseStatementPDF(ab, {});
    const txns = res.transactions || [];

    expect(res.detected_bank).toBe('HDFC Bank');
    expect(res.detected_account_last4).toBe('3011');
    expect(res.opening_balance).toBe(0);
    expect(res.closing_balance).toBe(1750520.24);
    expect(txns).toHaveLength(38);

    const recon = checkReconciliation(
      res.rows,
      res.suggested_mapping,
      res.opening_balance,
      res.closing_balance
    );
    expect(recon.warning).toBe(false);
    expect(recon.diff).toBe(0);

    expect(txns[0].description).toBe('Wasim Salim Sayyed');
    expect(txns[0].upi_ref_no).toBe('126012537860');
    expect(txns[txns.length - 1].reference_number).toBe('KKBKR22026110525706561');
    expect(txns[35].description).toBe('KOTAK Securities Limited NSE CLI - Alisha Wasim Sayyed - Kkbkr22');
    expect(txns[35].reference_number).toBe('KKBKR22026101725350598');
    expect(txns[37].description).toBe('KOTAK Securities Limited NSE CLI - Alisha Wasim Sayyed - Kkbkr22');
    expect(txns.some((t) => /PageNo|Summary for Account|Lim Kkbkr|\bIted\b/i.test(t.description))).toBe(false);
  });

  it('parses HDFC Account 8458 accurately (207 txns, zero diff, forex @ intact)', async () => {
    const ab = toArrayBuffer(
      'public/assets/aistudio/Acct_Statement_XXXXXXXX8458_16112026__2__unlocked_e6c9615e.pdf'
    );
    const res = await parseStatementPDF(ab, {});
    const txns = res.transactions || [];

    expect(res.detected_bank).toBe('HDFC Bank');
    expect(res.detected_account_last4).toBe('8458');
    expect(res.opening_balance).toBe(656605.29);
    expect(res.closing_balance).toBe(498962.86);
    expect(txns).toHaveLength(207);

    const recon = checkReconciliation(
      res.rows,
      res.suggested_mapping,
      res.opening_balance,
      res.closing_balance
    );
    expect(recon.warning).toBe(false);
    expect(recon.diff).toBe(0);

    expect(txns[3].description).toContain('USD4400.0@81.85');
    expect(txns[64].description).toBe('Huzefa Abbas Khan');
    expect(txns[153].description).toBe('Saber Sadeque Syed');
    const rtgsRow = txns.find((t) => t.reference_number === 'HDFCR52024110859480657');
    expect(rtgsRow).toBeDefined();
    expect(rtgsRow?.description).toBe('Salim Gaffar Sayyed - Netbank, Mum - Hdfcr52024110859480657 - Loan');

    // Audit fixes for File 2 (HDFC 8458): 40-char fixed-width wrap reconstruction & subtitle cleanup
    expect(txns[1].description).toBe('Infopro Learning Private Limited - Congo Technologies');
    expect(txns[36].description).toBe('Ebla Computer Consultancy - Congo Technologies');
    expect(txns[38].description).toBe('9579662397 (PAYTM)');
    expect(txns[22].description).toBe('Happyfares Ac Travel');
    expect(
      formatTransactionSubtitle(txns[22].description, txns[22].raw_description, txns[22].reference_number)
    ).toBe('UPI Payment · Ref: 404770566192');
    // Consistent payee name across all 6 Atmakuri transactions (no LAKSHMINAR false merge)
    const atmakuriRows = [txns[0], txns[13], txns[18], txns[73], txns[83], txns[134]];
    for (const row of atmakuriRows) {
      expect(row.description).toBe('Atmakuri Lakshmi Nar');
    }

    const badTokenRe =
      /Pri Vate|Consul Tancy|Fre Elanci|D Istant|F Rom|Fr Om|Fro M|P Hone|Ph One|Pho Ne|Phon E|Pay Ment|P Ayment|Ariademo|Pay Using|Usi Ng|Usin G|Pay Tm|\bSen T\b|\bU Sing\b|\bP Aytm\b|Lakshminar/i;
    for (const t of txns) {
      const sub = formatTransactionSubtitle(t.description, t.raw_description, t.reference_number);
      expect(badTokenRe.test(t.description)).toBe(false);
      if (sub) {
        expect(badTokenRe.test(sub)).toBe(false);
      }
    }
    expect(txns.some((t) => /AddressCity|CONGO TECHNOLOGIES State/i.test(t.description + ' ' + (t.raw_description || '')))).toBe(false);
  });

  it('never misroutes an HDFC statement to BOI/BOM/Paytm/GPay when transaction narrations mention those banks or wallets', async () => {
    const mockPdf: PDFExtractionResult = {
      openingBalance: 53577.32,
      closingBalance: 102077.32,
      fullDocumentText:
        'HDFC BANK LIMITED Statement From : 01/01/2023 To : 01/01/2024 Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance 01/01/23 ICIC0003182-300127212468-MONTHLY SAVING 0000300127212468 01/01/23 50000.00 103577.32 02/01/23 UPI-BANK OF INDIA-123@OKSBI-SBIN0001-300255127239-SENT USING PAYTM 0000300255127239 02/01/23 1500.00 102077.32',
      allGridRows: [
        ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
        ['01/01/23', 'ICIC0003182-300127212468-MONTHLY SAVING', '0000300127212468', '01/01/23', '50,000.00', '1,03,577.32'],
        ['02/01/23', 'UPI-BANK OF INDIA-123@OKSBI-SBIN0001-300255127239-SENT USING PAYTM GPAY', '0000300255127239', '02/01/23', '1,500.00', '1,02,077.32'],
        ['HDFC BANK LIMITED'],
      ],
      pages: [
        {
          pageNumber: 1,
          fullText:
            'Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance 01/01/23 ICIC0003182-300127212468-MONTHLY SAVING 0000300127212468 01/01/23 50,000.00 1,03,577.32 02/01/23 UPI-BANK OF INDIA-123@OKSBI-SBIN0001-300255127239-SENT USING PAYTM GPAY 0000300255127239 02/01/23 1,500.00 1,02,077.32 HDFC BANK LIMITED',
          textItems: [],
          gridRows: [
            ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
            ['01/01/23', 'ICIC0003182-300127212468-MONTHLY SAVING', '0000300127212468', '01/01/23', '50,000.00', '1,03,577.32'],
            ['02/01/23', 'UPI-BANK OF INDIA-123@OKSBI-SBIN0001-300255127239-SENT USING PAYTM GPAY', '0000300255127239', '02/01/23', '1,500.00', '1,02,077.32'],
            ['HDFC BANK LIMITED'],
          ],
        },
      ],
    };

    const res = await parseStatementPDF(new Uint8Array(0), { preExtracted: mockPdf });
    expect(res.detected_bank).toBe('HDFC Bank');
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions?.[0].credit).toBe(50000);
    expect(res.transactions?.[0].debit).toBeNull();
    expect(res.transactions?.[0].reference_number).toBe('300127212468');
    expect(res.transactions?.[1].debit).toBe(1500);
    expect(res.transactions?.[1].credit).toBeNull();
    expect(res.transactions?.[1].reference_number).toBe('300255127239');
  });

  it('parses Bank of Maharashtra FY 24-25 statement with exact 86 txns and zero column shift', async () => {
    const ab = toArrayBuffer(
      'public/assets/aistudio/BOM_Statement_FY_24-25_April-March_2601f9e9.pdf'
    );
    const res = await parseStatementPDF(ab, {});
    const txns = res.transactions || [];

    expect(res.detected_bank).toBe('Bank of Maharashtra');
    expect(res.detected_account_last4).toBe('8212');
    expect(res.statement_period_start).toBe('2024-04-02');
    expect(res.statement_period_end).toBe('2025-03-31');
    expect(res.opening_balance).toBe(390119.02);
    expect(res.closing_balance).toBe(20883.43);
    expect(txns).toHaveLength(86);

    const debits = txns.filter((t) => (t.debit ?? 0) > 0);
    const credits = txns.filter((t) => (t.credit ?? 0) > 0);
    expect(debits).toHaveLength(47);
    expect(credits).toHaveLength(39);

    const drSum = Math.round(debits.reduce((s, t) => s + (t.debit ?? 0), 0) * 100) / 100;
    const crSum = Math.round(credits.reduce((s, t) => s + (t.credit ?? 0), 0) * 100) / 100;
    expect(drSum).toBe(2437024.59);
    expect(crSum).toBe(2067789.0);

    const recon = checkReconciliation(
      res.rows,
      res.suggested_mapping,
      res.opening_balance,
      res.closing_balance
    );
    expect(recon.warning).toBe(false);
    expect(recon.diff).toBe(0);

    // Ensure row 3 (UPI 410031514728NA) did NOT inherit row 4's IMPS ref or shift columns
    expect(txns[3].credit).toBe(25000);
    expect(txns[3].upi_ref_no).toBe('410031514728');
    expect(txns[3].imps_ref_no).toBeNull();
    // Ensure final row did not swallow B. Summary footer
    expect(txns[85].description).toBe('BY INTT');
    expect(txns[85].credit).toBe(239);

    // Zero chronological continuity breaks across all 86 rows (Channel codes like 9999-CENTRAL OFF / 9022 / 1004 must not corrupt balance)
    const chrono = orderTransactionsChronologically(txns);
    expect(chrono.breaks).toBe(0);
    expect(txns[12].description).toBe('MONTHLY SMS CHA');
    expect(txns[12].balance).toBe(777344.02);
    expect(txns[14].description).toBe('Mrs. ALISHA WASIM SAYYED - Donation');
    expect(txns[14].reference_number).toBe('412413750673');
    expect(txns[19].description).toBe('JNS-PMSBY-23-24-01201780700-980');
    expect(txns[19].balance).toBe(1042508.48);
    expect(txns[31].balance).toBe(1596761.65);
    expect(txns[32].balance).toBe(1621761.65);
    expect(txns[68].reference_number).toBe('2502');
    expect(txns[68].balance).toBe(131915.1);
    expect(txns.some((t) => /\b\d{10,}\b/.test(t.description) && !/JNS-PMSBY/.test(t.description))).toBe(false);
  });

  it('normalizes split wallet/channel remarks cleanly in File 1 (HDFC 3597) subtitles', () => {
    const cases: Array<{ raw: string; expectedTitle: string; expectedSub: string }> = [
      {
        raw: 'UPI-CHANDANI BAKERY-Q340928003@YBL-YESB0YBLUPI-404123456789-SEN T USING PAYTM U',
        expectedTitle: 'CHANDANI BAKERY',
        expectedSub: 'UPI Payment · Ref: 404123456789',
      },
      {
        raw: 'UPI-SWIGGY-SWIGGY@AXISBANK-UTIB0000000-404123456789-SENT U SING PAYTM U',
        expectedTitle: 'SWIGGY',
        expectedSub: 'UPI Payment · Ref: 404123456789',
      },
      {
        raw: 'UPI-RELIEF CHEMIST-PAYTMQR123@PTY-PYTM0123456-404123456789-SENT USI NG PAYTM U',
        expectedTitle: 'RELIEF CHEMIST',
        expectedSub: 'UPI Payment · Ref: 404123456789',
      },
      {
        raw: 'UPI-CONGO TECHNOLOGIES-PAYTM@PTY-PYTM0123456-404123456789-SENT USING P AYTM U',
        expectedTitle: 'CONGO TECHNOLOGIES',
        expectedSub: 'UPI Payment · Ref: 404123456789',
      },
      {
        raw: 'UPI-HAPPYFARES-HAPPY@HDFC-HDFC0000001-404770566192-PAY USING UPI',
        expectedTitle: 'HAPPYFARES',
        expectedSub: 'UPI Payment · Ref: 404770566192',
      },
      {
        raw: 'UPI-ZOMATO-ZOM@ICICI-ICIC0000001-404770566193-PAYMENT F ROM PHONE',
        expectedTitle: 'ZOMATO',
        expectedSub: 'UPI Payment · Ref: 404770566193',
      },
    ];

    for (const c of cases) {
      const parsed = parseBankNarration(c.raw, '404123456789');
      expect(parsed.description).toBe(c.expectedTitle);
      const sub = formatTransactionSubtitle(parsed.description, c.raw, parsed.reference);
      expect(sub).toBe(c.expectedSub);
    }
  });
});

describe('Gmail Multi-Bank Alert Parsers (UPI, IMPS, NEFT, RTGS, EFT)', () => {
  it('uses an inclusive multi-bank query without dropping IMPS/NEFT/RTGS or generic subjects', () => {
    expect(GMAIL_ALERT_QUERY_BASE).toContain('alerts@hdfcbank.net');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('mahaalert@mahabank.co.in');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('Account update');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('IMPS OR NEFT OR RTGS OR UPI');
  });

  it('parses gmail-04 HDFC UPI debit alerts cleanly', () => {
    const msg: GmailMessage = {
      id: 'g4-1',
      from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>',
      subject: '❗ You have done a UPI txn. Check details!',
      bodyText:
        'Rs.494.42 is debited from your account ending 3597 towards VPA *******dyen@axisupi (Udemy) on 16-11-26. UPI transaction reference no.: 632017074185.',
    };
    const out = parseGmailTransactionEmail(msg);
    expect(out.record_type).toBe('transaction');
    if (out.record_type === 'transaction') {
      expect(out.bank).toBe('HDFC');
      expect(out.method).toBe('UPI');
      expect(out.direction).toBe('debit');
      expect(out.amount).toBe(494.42);
      expect(out.account_last4).toBe('3597');
      expect(out.txn_date).toBe('2026-11-16');
      expect(out.payee_name).toBe('Udemy');
      expect(out.upi_ref_no).toBe('632017074185');
    }
  });

  it('parses gmail-02 Bank of Maharashtra IMPS credit with spaced xx 9735 account mask', () => {
    const msg: GmailMessage = {
      id: 'g2-1',
      from: 'Bank of Maharashtra <mahaalert@mahabank.co.in>',
      subject: 'Transaction with Bank of Maharashtra',
      bodyText:
        'Your A/c No xx 9735 has been credited by INR 589.00 on 30-JUL-2026 by IMPS 621104845495 from REMITTER. A/c Bal is INR 30,163.90 CR and AVL Bal INR 30,163.90-Bank of Maharashtra',
    };
    const out = parseGmailTransactionEmail(msg);
    expect(out.record_type).toBe('transaction');
    if (out.record_type === 'transaction') {
      expect(out.bank).toBe('BOM');
      expect(out.method).toBe('IMPS');
      expect(out.direction).toBe('credit');
      expect(out.amount).toBe(589);
      expect(out.account_last4).toBe('9735');
      expect(out.txn_date).toBe('2026-07-30');
      expect(out.imps_ref_no).toBe('621104845495');
      expect(out.balance_after).toBe(30163.9);
    }
  });

  it('parses all gmail-01 alert types (NetBanking EFT, IMPS Ref debit, Online Banking, UPI Credit) and ignores OTP', () => {
    const nov13_2025_ms = String(new Date('2025-11-13T05:00:00Z').getTime());

    // Email 1: NetBanking
    const nb = parseGmailTransactionEmail({
      id: 'g1-nb',
      internalDate: nov13_2025_ms,
      from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.net>',
      subject: 'View: Account update for your HDFC Bank A/c',
      bodyText:
        'Dear Customer, Thank you for using HDFC Bank NetBanking for payment of Rs. 700000.00 from A/c XX3597 to MOTILALOSWALSECURITI Not you?Call 18002586161',
    });
    expect(nb.record_type).toBe('transaction');
    if (nb.record_type === 'transaction') {
      expect(nb.method).toBe('EFT');
      expect(nb.direction).toBe('debit');
      expect(nb.amount).toBe(700000);
      expect(nb.account_last4).toBe('3597');
      expect(nb.payee_name).toBe('MOTILALOSWALSECURITI');
      expect(nb.txn_date).toBe('2025-11-13');
    }

    // Email 2: IMPS debit (NOT misrouted to UPI!)
    const imps = parseGmailTransactionEmail({
      id: 'g1-imps',
      from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.net>',
      subject: 'View: Account update for your HDFC Bank A/c',
      bodyText:
        'Your A/c xxxxxxxxxx8458 is debited for INR 1,43,145.00 on 13-11-25 and A/c xxxxxxx8212 is credited. (IMPS Ref No. 531710956364). Available balance is INR 13,93,066.52.',
    });
    expect(imps.record_type).toBe('transaction');
    if (imps.record_type === 'transaction') {
      expect(imps.method).toBe('IMPS');
      expect(imps.direction).toBe('debit');
      expect(imps.amount).toBe(143145);
      expect(imps.account_last4).toBe('8458');
      expect(imps.imps_ref_no).toBe('531710956364');
      expect(imps.upi_ref_no).toBeNull();
      expect(imps.balance_after).toBe(1393066.52);
    }

    // Email 3: OTP -> ignored, NOT error
    const otp = parseGmailTransactionEmail({
      id: 'g1-otp',
      from: 'alerts@hdfcbank.net',
      subject: 'View: Account update for your HDFC Bank A/c',
      bodyText:
        '099036 is your OTP for money transfer to a third party within Bank from A/c ending in XX8458. NEVER share your OTP with anyone.',
    });
    expect(otp.record_type).toBe('ignored');

    // Email 4: Online Banking
    const ob = parseGmailTransactionEmail({
      id: 'g1-ob',
      internalDate: nov13_2025_ms,
      from: 'alerts@hdfcbank.net',
      subject: 'View: Account update for your HDFC Bank A/c',
      bodyText:
        'Rs. 13,50,000.00 has been deducted from your Account No. ending in XX8458 for a Transfer to payee Wasim Saving via HDFC Bank Online Banking.',
    });
    expect(ob.record_type).toBe('transaction');
    if (ob.record_type === 'transaction') {
      expect(ob.method).toBe('EFT');
      expect(ob.amount).toBe(1350000);
      expect(ob.account_last4).toBe('8458');
      expect(ob.payee_name).toBe('Wasim Saving');
    }

    // Email 6: UPI Credit
    const upiCr = parseGmailTransactionEmail({
      id: 'g1-upicr',
      from: 'alerts@hdfcbank.net',
      subject: 'View: Account update for your HDFC Bank A/c',
      bodyText:
        'Dear Customer, Rs. 7000.00 is successfully credited to your account **3597 by VPA 8208481741@ibl CONGO TECHNOLOGIES on 13-11-25. Your UPI transaction reference number is 336478590076.',
    });
    expect(upiCr.record_type).toBe('transaction');
    if (upiCr.record_type === 'transaction') {
      expect(upiCr.method).toBe('UPI');
      expect(upiCr.direction).toBe('credit');
      expect(upiCr.amount).toBe(7000);
      expect(upiCr.account_last4).toBe('3597');
      expect(upiCr.payee_name).toBe('CONGO TECHNOLOGIES');
      expect(upiCr.upi_ref_no).toBe('336478590076');
    }
  });

  it('parses NEFT and RTGS alerts across HDFC, BOM, and generic banks without capturing words as UTR', () => {
    // Word "transaction" after NEFT must NOT be captured as UTR
    const hdfcNeft = parseGmailTransactionEmail({
      id: 'hdfc-neft-1',
      from: 'alerts@hdfcbank.net',
      subject: 'NEFT Credit Alert',
      bodyText:
        'NEFT transaction alert: Rs. INR 2,50,000.00 is credited to your account ending XX8458 from ACME INFOTECH PVT LTD with UTR HDFCN24312987654 on 10-11-2026. Available balance is INR 7,48,962.86.',
    });
    expect(hdfcNeft.record_type).toBe('transaction');
    if (hdfcNeft.record_type === 'transaction') {
      expect(hdfcNeft.method).toBe('NEFT');
      expect(hdfcNeft.direction).toBe('credit');
      expect(hdfcNeft.amount).toBe(250000);
      expect(hdfcNeft.reference_number).toBe('HDFCN24312987654');
      expect(hdfcNeft.payee_name).toContain('ACME INFOTECH');
    }

    const hdfcRtgs = parseGmailTransactionEmail({
      id: 'hdfc-rtgs-1',
      from: 'alerts@hdfcbank.net',
      subject: 'RTGS Credit',
      bodyText:
        'Your A/c ending XX3011 is credited with INR 11,14,832.13 on 05-11-26 by RTGS UTR KKBKR22026110525706561 from KOTAK SECURITIES LIMITED.',
    });
    expect(hdfcRtgs.record_type).toBe('transaction');
    if (hdfcRtgs.record_type === 'transaction') {
      expect(hdfcRtgs.method).toBe('RTGS');
      expect(hdfcRtgs.direction).toBe('credit');
      expect(hdfcRtgs.reference_number).toBe('KKBKR22026110525706561');
    }

    const bomNeft = parseGmailTransactionEmail({
      id: 'bom-neft-1',
      from: 'mahaalert@mahabank.co.in',
      subject: 'Transaction with Bank of Maharashtra',
      bodyText:
        'Your A/c No xx 8212 has been credited by INR 75,000.00 on 15-MAR-2025 by NEFT MAHBH25074123456 from CLIENT CORP. A/c Bal is INR 95,883.43 CR',
    });
    expect(bomNeft.record_type).toBe('transaction');
    if (bomNeft.record_type === 'transaction') {
      expect(bomNeft.bank).toBe('BOM');
      expect(bomNeft.method).toBe('NEFT');
      expect(bomNeft.direction).toBe('credit');
      expect(bomNeft.reference_number).toBe('MAHBH25074123456');
    }

    const iciciRtgs = parseGmailTransactionEmail({
      id: 'icici-rtgs-1',
      from: 'alerts@icicibank.com',
      subject: 'ICICI Bank Account Alert',
      bodyText:
        'Dear Customer, Acct XX4421 is debited with INR 5,00,000.00 on 12-Nov-26 towards GLOBAL VENDORS via RTGS UTR ICICR520261112009911. Avl Bal INR 1,20,000.00.',
    });
    expect(iciciRtgs.record_type).toBe('transaction');
    if (iciciRtgs.record_type === 'transaction') {
      expect(iciciRtgs.bank).toBe('ICICI');
      expect(iciciRtgs.method).toBe('RTGS');
      expect(iciciRtgs.direction).toBe('debit');
      expect(iciciRtgs.account_last4).toBe('4421');
      expect(iciciRtgs.reference_number).toBe('ICICR520261112009911');
    }
  });
});

describe('Bidirectional Cross-Source Deduplication & Enrichment', () => {
  it('deduplicates and enriches Gmail UPI/IMPS/RTGS/NetBanking rows when manual statement is uploaded later', () => {
    const existingGmailRows: DedupCandidateTx[] = [
      {
        id: 'tx-gmail-upi',
        account_id: 'acc-3597',
        txn_date: '2026-11-16',
        description: 'Udemy',
        raw_description: 'UPI/632017074185/Udemy (*******dyen@axisupi)',
        debit: 494.42,
        credit: null,
        balance: null,
        balance_after: null,
        reference_number: '632017074185',
        upi_ref_no: '632017074185',
        imps_ref_no: null,
        source: 'gmail_auto',
      },
      {
        id: 'tx-gmail-eft',
        account_id: 'acc-3597',
        txn_date: '2025-11-13',
        description: 'MOTILALOSWALSECURITI',
        raw_description: 'EFT-MOTILALOSWALSECURITI',
        debit: 700000,
        credit: null,
        balance: null,
        balance_after: null,
        reference_number: null,
        upi_ref_no: null,
        imps_ref_no: null,
        source: 'gmail_auto',
      },
    ];

    // 1. Statement UPI row with zero-padded reference enriches Gmail row
    const stmtUpi: IncomingDedupRow = {
      account_id: 'acc-3597',
      upload_id: 'up-1',
      txn_date: '2026-11-16',
      description: 'Udemy Axisupi',
      raw_description: 'UPI-UDEMY-*******DYEN@AXISUPI-UTIB0000100-632017074185-UPI',
      debit: 494.42,
      credit: null,
      balance: 84210.58,
      reference_number: '632017074185',
      upi_ref_no: '632017074185',
      imps_ref_no: null,
      source: 'statement_import',
    };
    const m1 = findBestCrossSourceMatch(stmtUpi, existingGmailRows);
    expect(m1?.matched.id).toBe('tx-gmail-upi');
    expect(m1?.matchTier).toBe('tier1_ref');
    expect(m1?.enrichmentPatch?.balance).toBe(84210.58);
    expect(m1?.enrichmentPatch?.upload_id).toBe('up-1');

    // 2. Statement NetBanking row (+1 day settlement lag, no email ref) matches ref-less Gmail EFT
    const stmtEft: IncomingDedupRow = {
      account_id: 'acc-3597',
      upload_id: 'up-1',
      txn_date: '2025-11-14',
      description: 'MOTILAL OSWAL SECURITIES',
      raw_description: 'NETBANKING TPT - MOTILAL OSWAL SECURITIES LTD',
      debit: 700000,
      credit: null,
      balance: 100000,
      reference_number: 'IB99887766',
      upi_ref_no: null,
      imps_ref_no: null,
      source: 'statement_import',
    };
    const m2 = findBestCrossSourceMatch(stmtEft, existingGmailRows);
    expect(m2?.matched.id).toBe('tx-gmail-eft');
    expect(m2?.matchTier).toBe('tier2_fuzzy');
    expect(m2?.enrichmentPatch?.reference_number).toBe('IB99887766');
  });

  it('never false-merges same-day identical amounts with distinct UPI refs or distinct tax lines (CGST vs SGST)', () => {
    const existing: DedupCandidateTx[] = [
      {
        id: 'tx-punjab-1',
        account_id: 'acc-3597',
        txn_date: '2026-11-08',
        description: 'PUNJAB BAKERY',
        raw_description: 'UPI/631247105135/PUNJAB BAKERY',
        debit: 50,
        credit: null,
        reference_number: '631247105135',
        upi_ref_no: '631247105135',
        imps_ref_no: null,
        source: 'statement_import',
      },
      {
        id: 'tx-cgst',
        account_id: 'acc-8458',
        txn_date: '2024-01-19',
        description: 'CGST',
        raw_description: '190124I049902115 CGST',
        debit: 207.06,
        credit: null,
        reference_number: '190124168312',
        upi_ref_no: null,
        imps_ref_no: null,
        source: 'statement_import',
      },
    ];

    const incomingPunjab2: IncomingDedupRow = {
      account_id: 'acc-3597',
      txn_date: '2026-11-08',
      description: 'PUNJAB BAKERY',
      raw_description: 'UPI/631247117100/PUNJAB BAKERY',
      debit: 50,
      credit: null,
      reference_number: '631247117100',
      upi_ref_no: '631247117100',
      imps_ref_no: null,
      source: 'gmail_auto',
    };
    expect(findBestCrossSourceMatch(incomingPunjab2, existing)).toBeNull();

    const incomingSgst: IncomingDedupRow = {
      account_id: 'acc-8458',
      txn_date: '2024-01-19',
      description: 'SGST',
      raw_description: '190124I049902115 SGST',
      debit: 207.06,
      credit: null,
      reference_number: '190124168313',
      upi_ref_no: null,
      imps_ref_no: null,
      source: 'gmail_auto',
    };
    expect(findBestCrossSourceMatch(incomingSgst, existing)).toBeNull();
  });

  it('does not deduplicate opposite-direction IMPS legs across two owner accounts (preserves self-transfer pair)', () => {
    const existingDebitOn8458: DedupCandidateTx[] = [
      {
        id: 'tx-8458-dr',
        account_id: 'acc-8458',
        txn_date: '2025-11-13',
        description: 'A/c xxxxxxx8212',
        debit: 143145,
        credit: null,
        reference_number: '531710956364',
        upi_ref_no: null,
        imps_ref_no: '531710956364',
        source: 'gmail_auto',
      },
    ];

    const bomCreditOn8212: IncomingDedupRow = {
      account_id: 'acc-8212',
      txn_date: '2025-11-13',
      description: 'WASIMHDFC',
      debit: null,
      credit: 143145,
      reference_number: '531710956364',
      upi_ref_no: null,
      imps_ref_no: '531710956364',
      source: 'statement_import',
    };
    expect(findBestCrossSourceMatch(bomCreditOn8212, existingDebitOn8458)).toBeNull();
  });

  it('upgrades generic Gmail counterparty labels when statement row brings real beneficiary name & fills balance', () => {
    const existingGenericGmail: DedupCandidateTx[] = [
      {
        id: 'tx-bom-gmail-1',
        account_id: 'acc-8212',
        txn_date: '2026-07-30',
        description: 'REMITTER',
        raw_description: 'IMPS/621104845495/REMITTER',
        debit: null,
        credit: 589,
        balance: null,
        balance_after: null,
        reference_number: '621104845495',
        upi_ref_no: null,
        imps_ref_no: '621104845495',
        source: 'gmail_auto',
      },
    ];

    const stmtRow: IncomingDedupRow = {
      account_id: 'acc-8212',
      upload_id: 'up-bom-1',
      txn_date: '2026-07-30',
      description: 'ZABORA DIGITAL SERVICES',
      raw_description: 'IMPS/621104845495/ZABORA DIGITAL SERVICES',
      debit: null,
      credit: 589,
      balance: 30163.9,
      reference_number: '621104845495',
      upi_ref_no: null,
      imps_ref_no: '621104845495',
      source: 'statement_import',
    };

    const match = findBestCrossSourceMatch(stmtRow, existingGenericGmail);
    expect(match?.matched.id).toBe('tx-bom-gmail-1');
    expect(match?.enrichmentPatch?.description).toBe('ZABORA DIGITAL SERVICES');
    expect(match?.enrichmentPatch?.balance).toBe(30163.9);
    expect(match?.enrichmentPatch?.balance_after).toBe(30163.9);
  });
});

describe('UPI Narration Cleanup & Intra-Day Balance Continuity Healing', () => {
  it('strips VPA fragments, redaction artifacts, and PDF line-wrap splits without merging valid initials', () => {
    const cases: Array<[string, string, string]> = [
      [
        'UPI-ADIL ASLAM SAYYED-ADIZAFFARSAYYED727 6-1@OKHDFCBANK-HDFC0000029-430891522824- UPI',
        'Adil Aslam Sayyed',
        '430891522824',
      ],
      [
        'UPI-SAVERA DECORATORS-IRSHADSHAIKH7621-1 Addresscity State @OKAXIS-HDFC0000029-430707130698-SENT FR OM PAYTM',
        'Savera Decorators',
        '430707130698',
      ],
      [
        'UPI-SHAHIL ALI SO KALIM -GPAY-1125139179 9@OKBIZAXIS-UTIB0000553-430767867444-NA',
        'Shahil Ali So Kalim',
        '430767867444',
      ],
      [
        'UPI-TASLIMMUSHAQURESHI-BHARATPE.90070652 442@FBPE-FDRL0001382-430749132578-PAY TO BHARATPE ME',
        'Taslimmushaqureshi',
        '430749132578',
      ],
      [
        'UPI-ANWAR GULAMDASTAGIR Addresscity State -ANWARSHAIKH6781 @OKAXIS-KKBK0000724-430624635858-SENT FR OM PAYTM',
        'Anwar Gulamdastagir',
        '430624635858',
      ],
      [
        'UPI-IRFAN ABDUL REHMAN S-SHIAKHIS16@OKAX IS-BKID0000520-430704074340-SENT FROM PA YTM',
        'Irfan Abdul Rehman S',
        '430704074340',
      ],
      [
        'UPI-ATIF MHAMMED HASAN Q-9168466515@YBL- RATN0000000-467311064591-SENT FROM PAYTM',
        'Atif Mhammed Hasan Q',
        '467311064591',
      ],
    ];

    for (const [raw, expectedDesc, expectedRef] of cases) {
      const parsed = parseBankNarration(raw, expectedRef);
      expect(parsed.description).toBe(expectedDesc.toUpperCase());
      expect(toTitleCase(parsed.description)).toBe(expectedDesc);
      expect(parsed.reference).toBe(expectedRef);
    }
  });

  it('reconstructs scrambled intra-day statement rows with zero false continuity breaks', () => {
    // Exact balance chain from Screenshot 2 (2024-11-01 to 2024-11-03) in scrambled descending DB order
    const scrambledRows = [
      { txn_date: '2024-11-03', debit: 800, credit: null, balance: 16505.86 },
      { txn_date: '2024-11-03', debit: 1000, credit: null, balance: 17305.86 },
      { txn_date: '2024-11-03', debit: 8000, credit: null, balance: 18305.86 },
      { txn_date: '2024-11-03', debit: 800, credit: null, balance: 26305.86 },
      { txn_date: '2024-11-03', debit: 600, credit: null, balance: 27105.86 },
      { txn_date: '2024-11-03', debit: 1450, credit: null, balance: 27705.86 },
      // Scrambled 2024-11-02 rows (indices 7..13 in Screenshot 2)
      { txn_date: '2024-11-02', debit: 570, credit: null, balance: 29155.86 },
      { txn_date: '2024-11-02', debit: 11500, credit: null, balance: 29725.86 },
      { txn_date: '2024-11-02', debit: 50, credit: null, balance: 41225.86 },
      { txn_date: '2024-11-02', debit: 70, credit: null, balance: 43695.86 },
      { txn_date: '2024-11-02', debit: 40, credit: null, balance: 43655.86 },
      { txn_date: '2024-11-02', debit: 1380, credit: null, balance: 42275.86 },
      { txn_date: '2024-11-02', debit: 1000, credit: null, balance: 41275.86 },
      // 2024-11-01 anchor (note: opening before 1000 debit on Nov 2 requires prior credit/closing = 43,765.86; simulate 2024-11-01 ending at 43765.86)
      { txn_date: '2024-11-01', debit: 1650, credit: null, balance: 43765.86 },
    ];

    const result = orderTransactionsChronologically(scrambledRows);
    expect(result.breaks).toBe(0);
    expect(result.ordered[0].balance).toBe(43765.86);
    expect(result.ordered[1].balance).toBe(43695.86); // 43765.86 - 70
    expect(result.ordered[2].balance).toBe(43655.86); // - 40
    expect(result.ordered[3].balance).toBe(42275.86); // - 1380
    expect(result.ordered[4].balance).toBe(41275.86); // - 1000
    expect(result.ordered[5].balance).toBe(41225.86); // - 50
    expect(result.ordered[6].balance).toBe(29725.86); // - 11500
    expect(result.ordered[7].balance).toBe(29155.86); // - 570
    expect(result.ordered[result.ordered.length - 1].balance).toBe(16505.86);

    // Genuine discontinuity still flagged
    const withGenuineBreak = [
      { txn_date: '2024-11-01', debit: 100, credit: null, balance: 5000 },
      { txn_date: '2024-11-02', debit: 200, credit: null, balance: 4000 }, // missing Rs.800 gap
    ];
    expect(countChronologicalBreaks(withGenuineBreak).breaks).toBe(1);
    expect(orderTransactionsChronologically(withGenuineBreak).breaks).toBe(1);
  });

  it('computes authoritative account balance from bank balance anchors plus subsequent balance-less Gmail txns', () => {
    const txs = [
      { txn_date: '2026-11-10', debit: 500, credit: null, balance: 20000 },
      { txn_date: '2026-11-11', debit: 494.42, credit: null, balance: null, balance_after: null }, // Gmail UPI debit
      { txn_date: '2026-11-12', debit: null, credit: 5000, balance: null, balance_after: null }, // Gmail credit
    ];
    expect(computeAuthoritativeAccountBalance(0, txs)).toBe(24505.58);
  });

  it('cleans 2023 HDFC compact/truncated UPI & IFSC-UTR narrations without returning bare numeric IDs', () => {
    expect(parseBankNarration('ICIC0003182-300127212468-MONTHLY SAVING')).toEqual({
      description: 'MONTHLY SAVING',
      reference: '300127212468',
      transactionType: 'UPI',
    });
    expect(parseBankNarration('COMPA-MAHESHJAGTAP330-1@OKSBI-SBIN0011698-300543939673-UPI')).toEqual({
      description: 'MAHESHJAGTAP330',
      reference: '300543939673',
      transactionType: 'UPI',
    });
    expect(parseBankNarration('HANS-PAYTM-64179453@PAYTM-PYTM0123456-340069732816-OID20230203510')).toEqual({
      description: 'HANS',
      reference: '340069732816',
      transactionType: 'UPI',
    });
    expect(parseBankNarration('MOTORS-DHONEMOTORS.99585249@HDFCBANK-HDFC0000001-302050193473-NA')).toEqual({
      description: 'DHONEMOTORS',
      reference: '302050193473',
      transactionType: 'UPI',
    });
    expect(parseBankNarration('C-XXXXXXXX0921-FAMILY', '0000300112504365')).toEqual({
      description: 'FAMILY (A/c 0921)',
      reference: '300112504365',
      transactionType: 'OTHER',
    });
  });
});

describe('Delete All Gmail Imported Data', () => {
  it('deletes pure gmail_auto rows, preserves statement-linked rows as statement_import, unlinks transfers, clears logs, and recalculates balances', async () => {
    const store: Record<string, any[]> = {
      transactions: [
        {
          id: 'tx-stmt-1',
          user_id: 'u1',
          account_id: 'acc-1',
          upload_id: 'up-1',
          txn_date: '2026-11-10',
          debit: 500,
          credit: null,
          balance: 20000,
          balance_after: 20000,
          source: 'statement_import',
          transfer_pair_id: 'tx-gmail-1',
          is_self_transfer: true,
          is_transfer: true,
          created_at: '2026-11-10T10:00:00Z',
        },
        {
          id: 'tx-gmail-linked',
          user_id: 'u1',
          account_id: 'acc-1',
          upload_id: 'up-1',
          txn_date: '2026-11-11',
          debit: 200,
          credit: null,
          balance: 19800,
          balance_after: 19800,
          source: 'gmail_auto',
          transfer_pair_id: null,
          is_self_transfer: false,
          is_transfer: false,
          created_at: '2026-11-11T10:00:00Z',
        },
        {
          id: 'tx-gmail-1',
          user_id: 'u1',
          account_id: 'acc-1',
          upload_id: null,
          txn_date: '2026-11-12',
          debit: null,
          credit: 5000,
          balance: null,
          balance_after: null,
          source: 'gmail_auto',
          transfer_pair_id: 'tx-stmt-1',
          is_self_transfer: true,
          is_transfer: true,
          created_at: '2026-11-12T10:00:00Z',
        },
      ],
      accounts: [
        { id: 'acc-1', user_id: 'u1', opening_balance: 0, current_balance: 24800 },
      ],
      profiles: [
        {
          user_id: 'u1',
          gmail_connected: true,
          gmail_last_synced: '2026-11-16T10:00:00Z',
        },
      ],
      gmail_sync_log: [{ id: 'log-1', user_id: 'u1' }],
      email_parse_errors: [{ id: 'err-1', user_id: 'u1' }],
      invoices: [{ id: 'inv-1', user_id: 'u1', linked_transaction_id: 'tx-gmail-1' }],
      audit_log: [],
    };

    const makeBuilder = (table: string) => {
      const filters: Array<(r: any) => boolean> = [];
      let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
      let patch: any = null;
      let rangeSlice: [number, number] | null = null;
      let singleMode = false;

      const exec = async () => {
        const rows = store[table] || [];
        if (op === 'insert') {
          const items = Array.isArray(patch) ? patch : [patch];
          rows.push(...items);
          return { data: items, error: null };
        }
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        if (op === 'delete') {
          const matchedSet = new Set(matched);
          store[table] = rows.filter((r) => !matchedSet.has(r));
          return { data: matched, error: null };
        }
        if (op === 'update') {
          for (const r of matched) Object.assign(r, patch);
          return { data: matched, error: null };
        }
        const out = rangeSlice ? matched.slice(rangeSlice[0], rangeSlice[1] + 1) : matched;
        if (singleMode) {
          return { data: out[0] ?? null, error: null };
        }
        return { data: out, error: null };
      };

      const builder: any = {
        select: () => {
          op = 'select';
          return builder;
        },
        update: (p: any) => {
          op = 'update';
          patch = p;
          return builder;
        },
        delete: () => {
          op = 'delete';
          return builder;
        },
        insert: (p: any) => {
          op = 'insert';
          patch = p;
          return exec();
        },
        eq: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((r) => vals.includes(r[col]));
          return builder;
        },
        order: () => builder,
        range: (from: number, to: number) => {
          rangeSlice = [from, to];
          return builder;
        },
        single: () => {
          singleMode = true;
          return builder;
        },
        maybeSingle: () => {
          singleMode = true;
          return builder;
        },
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      };
      return builder;
    };

    const mockDb = { from: (t: string) => makeBuilder(t) };
    const result = await deleteGmailImportedData(mockDb, 'u1');

    expect(result).toEqual({
      success: true,
      deleted_transactions: 1,
      preserved_statement_transactions: 1,
      affected_accounts: 1,
    });
    expect(store.transactions.map((t) => t.id)).toEqual(['tx-stmt-1', 'tx-gmail-linked']);
    expect(store.transactions[1].source).toBe('statement_import');
    expect(store.transactions[0].transfer_pair_id).toBeNull();
    expect(store.transactions[0].is_self_transfer).toBe(false);
    expect(store.invoices[0].linked_transaction_id).toBeNull();
    expect(store.gmail_sync_log).toHaveLength(0);
    expect(store.email_parse_errors).toHaveLength(0);
    expect(store.profiles[0].gmail_last_synced).toBeNull();
    expect(store.profiles[0].gmail_connected).toBe(true);
    expect(store.accounts[0].current_balance).toBe(19800);
  });

  it('falls back to secondary DB client when primary client returns permission denied for table transactions', async () => {
    const store: Record<string, any[]> = {
      accounts: [{ id: 'acc-1', user_id: 'u1', opening_balance: 5000, current_balance: 4500 }],
      transactions: [
        {
          id: 'tx-gmail-1',
          user_id: 'u1',
          account_id: 'acc-1',
          upload_id: null,
          txn_date: '2026-11-10',
          debit: 500,
          credit: null,
          balance: 4500,
          balance_after: 4500,
          source: 'gmail_auto',
          created_at: '2026-11-10T10:00:00Z',
        },
      ],
      invoices: [],
      gmail_sync_log: [{ id: 'log-1', user_id: 'u1' }],
      email_parse_errors: [],
      profiles: [{ user_id: 'u1', gmail_last_synced: '2026-11-10T10:00:00Z' }],
      audit_log: [],
    };

    const makeOkBuilder = (table: string) => {
      const filters: Array<(r: any) => boolean> = [];
      let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
      let patch: any = null;
      const exec = async () => {
        const rows = store[table] || [];
        if (op === 'insert') {
          const items = Array.isArray(patch) ? patch : [patch];
          rows.push(...items);
          return { data: items, error: null };
        }
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        if (op === 'delete') {
          const set = new Set(matched);
          store[table] = rows.filter((r) => !set.has(r));
          return { data: matched, error: null };
        }
        if (op === 'update') {
          for (const r of matched) Object.assign(r, patch);
          return { data: matched, error: null };
        }
        return { data: matched, error: null };
      };
      const b: any = {
        select: () => { op = 'select'; return b; },
        update: (p: any) => { op = 'update'; patch = p; return b; },
        delete: () => { op = 'delete'; return b; },
        insert: (p: any) => { op = 'insert'; patch = p; return exec(); },
        eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return b; },
        in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return b; },
        order: () => b,
        range: () => b,
        maybeSingle: async () => {
          const r = await exec();
          return { data: r.data[0] ?? null, error: null };
        },
        then: (res: any, rej: any) => exec().then(res, rej),
      };
      return b;
    };

    const deniedDb = {
      from: () => {
        const b: any = {
          select: () => b,
          delete: () => b,
          update: () => b,
          eq: () => b,
          in: () => b,
          range: () => b,
          then: (res: any) =>
            Promise.resolve({
              data: null,
              error: { code: '42501', message: 'permission denied for table transactions' },
            }).then(res),
        };
        return b;
      },
    };
    const workingDb = { from: (t: string) => makeOkBuilder(t) };

    const result = await deleteGmailImportedData(deniedDb, 'u1', workingDb);
    expect(result).toEqual({
      success: true,
      deleted_transactions: 1,
      preserved_statement_transactions: 0,
      affected_accounts: 1,
    });
    expect(store.transactions).toHaveLength(0);
    expect(store.accounts[0].current_balance).toBe(5000);
  });

  it('parses 2023 HDFC multi-page PDF without BOI misdetection or AddressCity/this statement footer bleed', async () => {
    const mock2023Pdf: PDFExtractionResult = {
      openingBalance: 53567.32,
      closingBalance: 102678.32,
      fullDocumentText: 'RTGS/NEFT IFSC : HDFC0000104 Statement From : 01/01/2023 To : 01/01/2024',
      allGridRows: [],
      pages: [
        {
          pageNumber: 1,
          fullText: 'Page No .: 1 RTGS/NEFT IFSC : HDFC0000104 BANK OF INDIA',
          gridRows: [
            ['Page No .: 1', 'Statement of account'],
            ['RTGS/NEFT IFSC : HDFC0000104', 'MICR : 411240003'],
            ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
            ['01/01/23 ICIC0003182-300127212468-MONTHLY SAVING', '0000300127212468 01/01/23', '50,000.00', '1,03,567.32'],
            ['BANK OF INDIA TRANSFER'],
            ['this statement.'],
          ],
          textItems: [
            { text: 'Page No .: 1', x: 34, y: 780, width: 55, height: 10 },
            { text: 'RTGS/NEFT IFSC : HDFC0000104', x: 320, y: 700, width: 130, height: 10 },
            // Table header row
            { text: 'Date', x: 40, y: 600, width: 16, height: 10 },
            { text: 'Narration', x: 144, y: 600, width: 34, height: 10 },
            { text: 'Chq./Ref.No.', x: 284, y: 600, width: 45, height: 10 },
            { text: 'Value Dt', x: 362, y: 600, width: 30, height: 10 },
            { text: 'Withdrawal Amt.', x: 405, y: 600, width: 60, height: 10 },
            { text: 'Deposit Amt.', x: 491, y: 600, width: 45, height: 10 },
            { text: 'Closing Balance', x: 564, y: 600, width: 55, height: 10 },
            // Row 1: Credit +50,000.00
            { text: '01/01/23', x: 34, y: 580, width: 28, height: 10 },
            { text: 'ICIC0003182-300127212468-MONTHLY SAVING', x: 68, y: 580, width: 180, height: 10 },
            { text: '0000300127212468', x: 288, y: 580, width: 68, height: 10 },
            { text: '01/01/23', x: 362, y: 580, width: 28, height: 10 },
            { text: '50,000.00', x: 505, y: 580, width: 32, height: 10 },
            { text: '1,03,567.32', x: 585, y: 580, width: 38, height: 10 },
            // Row 2: Debit -899.00 split across Page 1 & Page 2
            { text: '02/01/23', x: 34, y: 560, width: 28, height: 10 },
            { text: '300255127239-BROADBAND', x: 68, y: 560, width: 110, height: 10 },
            { text: '0000300255127239', x: 288, y: 560, width: 68, height: 10 },
            { text: '02/01/23', x: 362, y: 560, width: 28, height: 10 },
            { text: '899.00', x: 430, y: 560, width: 24, height: 10 },
            { text: '1,02,668.32', x: 585, y: 560, width: 38, height: 10 },
            // Page 1 footer
            { text: 'HDFC BANK LIMITED', x: 34, y: 60, width: 80, height: 10 },
            { text: 'this statement.', x: 34, y: 40, width: 55, height: 10 },
          ],
        },
        {
          pageNumber: 2,
          fullText: 'Page No .: 2 Address : GROUND FLOOR',
          gridRows: [],
          textItems: [
            { text: 'Page No .: 2', x: 34, y: 780, width: 55, height: 10 },
            { text: 'Address : GROUND FLOOR, 15A/1, HOTEL GULMOHAR', x: 34, y: 750, width: 200, height: 10 },
            { text: 'City : PUNE', x: 34, y: 735, width: 55, height: 10 },
            { text: 'State : MAHARASHTRA', x: 34, y: 720, width: 80, height: 10 },
            // Row 3 on Page 2: Credit +10.00 (no column header row on Page 2!)
            { text: '03/01/23', x: 34, y: 620, width: 28, height: 10 },
            { text: 'C-XXXXXXXX0921-FAMILY', x: 68, y: 620, width: 100, height: 10 },
            { text: '0000300390523785', x: 288, y: 620, width: 68, height: 10 },
            { text: '03/01/23', x: 362, y: 620, width: 28, height: 10 },
            { text: '10.00', x: 515, y: 620, width: 22, height: 10 },
            { text: '1,02,678.32', x: 585, y: 620, width: 38, height: 10 },
          ],
        },
      ],
    };

    const res = await parseStatementPDF(new Uint8Array(0), { preExtracted: mock2023Pdf });
    const txns = res.transactions || [];

    expect(res.detected_bank).toBe('HDFC Bank');
    expect(txns).toHaveLength(3);

    expect(txns[0].credit).toBe(50000);
    expect(txns[0].debit).toBeNull();
    expect(txns[0].description).toBe('Monthly Saving');
    expect(txns[0].reference_number).toBe('300127212468');

    expect(txns[1].debit).toBe(899);
    expect(txns[1].credit).toBeNull();
    expect(txns[1].description).toBe('BROADBAND');
    expect(txns[1].reference_number).toBe('300255127239');

    expect(txns[2].credit).toBe(10);
    expect(txns[2].debit).toBeNull();
    expect(txns[2].description).toBe('Family (A/c 0921)');
    expect(txns[2].reference_number).toBe('300390523785');
    expect(txns.some((t) => /GROUND FLOOR|this statement|State : MAHARASHTRA/i.test(t.description))).toBe(false);
  });

  it('cleans 2023 compact HDFC narration edge cases cleanly', () => {
    const p1 = parseBankNarration('0000300255127239 02/01/23 300255127239-BROADBAND');
    expect(p1.description).toBe('BROADBAND');
    expect(p1.reference).toBe('300255127239');

    const p2 = parseBankNarration('0000337449264055 08/01/23 -PUNB0290100-337449264055-NA');
    expect(p2.description).toBe('UPI Transfer (4055)');
    expect(p2.reference).toBe('337449264055');

    const p3 = parseBankNarration('0000300911763203 09/01/23 AHB-XXXXXXXX8212-SAVING');
    expect(p3.description).toBe('SAVING (A/c 8212)');
    expect(p3.reference).toBe('300911763203');

    const p4 = parseBankNarration('0000304337355253 12/02/23 SAHU-Q730408582@YBL-YESBOYBLUPI-304337355253-NA');
    expect(p4.description).toBe('SAHU');
    expect(p4.reference).toBe('304337355253');
  });

  it('cleans 2025 HDFC IMPS P2P, wrapped VPA handles, spaced @ OKBIZAXIS, and grey subtitle cleanly', () => {
    const imps = parseBankNarration('.IMPS P2P 436020341706#25/12/2024 251224 -MIR2500254810095');
    expect(imps.transactionType).toBe('IMPS');
    expect(imps.description).toBe('IMPS P2P Transfer (1706)');
    expect(imps.reference).toBe('MIR2500254810095');

    const bajaj = parseBankNarration(
      'UPI-SHAMSHUDDIN ABDUL RA-BAJAJPAY.687972 9.05470945@INDB0000006-INDBMERCHA-501052621462 2-SENT USING PAYTM U'
    );
    expect(bajaj.description).toBe('SHAMSHUDDIN ABDUL RA');
    expect(bajaj.reference).toBe('501052621462');

    const relief = parseBankNarration(
      'UPI-RELIEF CHEMIST-PAYTMQR2810050501011E TV0FS05SJ@PAYTM-PYTM0123456-501272898695-NA'
    );
    expect(relief.description).toBe('RELIEF CHEMIST');
    expect(relief.reference).toBe('501272898695');

    const spacedAt = parseBankNarration(
      'UPI-MR MOHAMMED ABDUL-GPAY-11198252189@ OKBIZAXIS-UTIB0000553-501274325828-SENT USING PAYTM U'
    );
    expect(spacedAt.description).toBe('MR MOHAMMED ABDUL');
    expect(spacedAt.reference).toBe('501274325828');

    const airtel = parseBankNarration(
      'UPI-AIRTEL PAYMENTS ENT.PAYTM@YBL-YESB0YBLUPI-500357274514 -AIRTEL BROADBAND R'
    );
    expect(airtel.description).toBe('AIRTEL PAYMENTS ENT');
    expect(airtel.reference).toBe('500357274514');

    const subUpi = formatTransactionSubtitle(
      'Rohidas Chintoba Raw',
      'UPI-ROHIDAS CHINTOBA RAW-Q551721378@YBL-YESB0YBLUPI-500138183605-SENT USING PAYTM U',
      '500138183605'
    );
    expect(subUpi).toBe('UPI Payment · Ref: 500138183605');
    expect(subUpi).not.toMatch(/UPI-|@YBL|SENT USING PAYTM|paytmqr|@OKBIZAXIS/i);

    const subNote = formatTransactionSubtitle(
      'Airtel Payments Ent',
      'UPI-AIRTEL PAYMENTS ENT.PAYTM@YBL-YESB0YBLUPI-500357274514 -AIRTEL BROADBAND R',
      '500357274514'
    );
    expect(subNote).toBe('UPI · Airtel Broadband R');

    const subImps = formatTransactionSubtitle(
      'IMPS P2P Transfer (1706)',
      '.IMPS P2P 436020341706#25/12/2024 251224 -MIR2500254810095',
      'MIR2500254810095'
    );
    expect(subImps).toBe('IMPS · 25/12/2024');
  });
});

describe('Phase 2 Fixes — Dynamic Columns, 2-Row Summary, Account Mismatch & Payee Guard', () => {
  it('FIX 1: detects column X dynamically per file without caching & flags BALANCE_MISMATCH without silent debit/credit inversion', async () => {
    // File A: +140px shifted columns + one broken math row where Withdrawal must remain Debit and be flagged
    const shiftedPdfA: PDFExtractionResult = {
      openingBalance: 10000,
      closingBalance: 14500,
      fullDocumentText: 'HDFC BANK LIMITED Statement From : 01/01/2026 To : 31/01/2026',
      allGridRows: [],
      pages: [
        {
          pageNumber: 1,
          fullText: 'HDFC BANK LIMITED',
          gridRows: [],
          textItems: [
            { text: 'Date', x: 180, y: 700, width: 20, height: 10 },
            { text: 'Narration', x: 260, y: 700, width: 40, height: 10 },
            { text: 'Chq./Ref.No.', x: 420, y: 700, width: 48, height: 10 },
            { text: 'Value Dt', x: 500, y: 700, width: 32, height: 10 },
            { text: 'Withdrawal Amt.', x: 560, y: 700, width: 60, height: 10 },
            { text: 'Deposit Amt.', x: 645, y: 700, width: 50, height: 10 },
            { text: 'Closing Balance', x: 720, y: 700, width: 60, height: 10 },
            // Row 1: Credit +5000 -> 15000 (OK)
            { text: '02/01/26', x: 175, y: 675, width: 30, height: 10 },
            { text: 'UPI-ACME CORP-ACME@OKAXIS-HDFC0001-111222333444-NA', x: 245, y: 675, width: 140, height: 10 },
            { text: '0000111222333444', x: 420, y: 675, width: 65, height: 10 },
            { text: '02/01/26', x: 500, y: 675, width: 30, height: 10 },
            { text: '5,000.00', x: 655, y: 675, width: 35, height: 10 },
            { text: '15,000.00', x: 730, y: 675, width: 42, height: 10 },
            // Row 2: In Withdrawal column (580), Debit 500, but Balance printed as 16,000.00 (math mismatch!)
            // Parser MUST keep it in Debit (500) and flag BALANCE_MISMATCH instead of silently flipping to Credit.
            { text: '03/01/26', x: 175, y: 655, width: 30, height: 10 },
            { text: 'UPI-VENDOR TWO-V2@OKSBI-SBIN0001-555666777888-NA', x: 245, y: 655, width: 140, height: 10 },
            { text: '0000555666777888', x: 420, y: 655, width: 65, height: 10 },
            { text: '03/01/26', x: 500, y: 655, width: 30, height: 10 },
            { text: '500.00', x: 580, y: 655, width: 28, height: 10 },
            { text: '16,000.00', x: 730, y: 655, width: 42, height: 10 },
          ],
        },
      ],
    };

    const resA = await parseStatementPDF(new Uint8Array(0), { preExtracted: shiftedPdfA });
    const txA = resA.transactions || [];
    expect(txA).toHaveLength(2);
    expect(txA[0].credit).toBe(5000);
    expect(txA[0].debit).toBeNull();
    expect(txA[0].balance_status).toBe('OK');

    expect(txA[1].debit).toBe(500);
    expect(txA[1].credit).toBeNull();
    expect(txA[1].balance_mismatch).toBe(true);
    expect(txA[1].balance_status).toBe('BALANCE_MISMATCH');
    expect(txA[1].needs_review).toBe(true);

    // FIX 2 closing balance mismatch also detected when summary (14500) != last row balance (16000)
    expect(resA.closing_balance_mismatch).toBe(true);
    expect(resA.closing_balance_diff).toBe(1500);
    expect(resA.reconciliation_warning).toBe(true);

    // File B immediately after File A: compressed -40px layout (no cross-file X cache)
    const compressedPdfB: PDFExtractionResult = {
      openingBalance: 1000,
      closingBalance: 750,
      fullDocumentText: 'HDFC BANK LIMITED Statement From : 01/02/2026 To : 28/02/2026',
      allGridRows: [],
      pages: [
        {
          pageNumber: 1,
          fullText: 'HDFC BANK LIMITED',
          gridRows: [],
          textItems: [
            { text: 'Date', x: 12, y: 700, width: 18, height: 10 },
            { text: 'Narration', x: 55, y: 700, width: 36, height: 10 },
            { text: 'Chq./Ref.No.', x: 195, y: 700, width: 45, height: 10 },
            { text: 'Value Dt', x: 265, y: 700, width: 30, height: 10 },
            { text: 'Withdrawal Amt.', x: 320, y: 700, width: 55, height: 10 },
            { text: 'Deposit Amt.', x: 390, y: 700, width: 45, height: 10 },
            { text: 'Closing Balance', x: 455, y: 700, width: 55, height: 10 },
            // Row 1: Debit 250 -> 750 (OK)
            { text: '05/02/26', x: 12, y: 675, width: 28, height: 10 },
            { text: 'UPI-CAFE THREE-C3@OKAXIS-HDFC0001-999000111222-NA', x: 55, y: 675, width: 120, height: 10 },
            { text: '0000999000111222', x: 195, y: 675, width: 60, height: 10 },
            { text: '05/02/26', x: 265, y: 675, width: 28, height: 10 },
            { text: '250.00', x: 335, y: 675, width: 26, height: 10 },
            { text: '750.00', x: 470, y: 675, width: 30, height: 10 },
          ],
        },
      ],
    };

    const resB = await parseStatementPDF(new Uint8Array(0), { preExtracted: compressedPdfB });
    const txB = resB.transactions || [];
    expect(txB).toHaveLength(1);
    expect(txB[0].debit).toBe(250);
    expect(txB[0].credit).toBeNull();
    expect(txB[0].balance).toBe(750);
    expect(txB[0].balance_status).toBe('OK');
    expect(resB.closing_balance_mismatch).toBe(false);
  });

  it('FIX 2: extractStatementBalances handles 2-row HDFC summary with merged cells and collapsed text', () => {
    // Merged grid row (nextRow has fewer cells than headerRow)
    const mergedGrid = [
      ['Opening Balance', 'Dr Count', 'Cr Count', 'Debits', 'Credits', 'Closing Bal'],
      ['0.00 22 16', '2,978,162.93', '4,728,683.17', '1,750,520.24'],
    ];
    expect(extractStatementBalances('', mergedGrid)).toEqual({
      opening: 0,
      closing: 1750520.24,
    });

    // Collapsed inline summary text fallback
    const collapsed =
      'Summary for Account 50200078768458 Opening Balance Dr Count Cr Count Debits Credits Closing Bal 656,605.29 185 22 5,746,280.65 5,588,638.22 498,962.86';
    expect(extractStatementBalances(collapsed)).toEqual({
      opening: 656605.29,
      closing: 498962.86,
    });
  });

  it('FIX 3: extracts statement account last4 and blocks/prompts on account mismatch', () => {
    expect(extractStatementAccountInfo('Account No : 50100879613011 Statement')).toEqual({
      accountNumber: '50100879613011',
      accountLast4: '3011',
    });
    expect(extractStatementAccountInfo('A/c No. 5020 0078 7684 58 INR')).toEqual({
      accountNumber: '50200078768458',
      accountLast4: '8458',
    });

    const mismatch = checkAccountMismatch('8458', '3011');
    expect(mismatch).toEqual({
      isMismatch: true,
      detectedLast4: '8458',
      selectedLast4: '3011',
      message: 'This statement is for ...8458, but you selected ...3011. Continue?',
    });

    expect(checkAccountMismatch('8458', '8458').isMismatch).toBe(false);
    expect(checkAccountMismatch(null, '8458').isMismatch).toBe(false);
  });

  it('FIX 4: replaces Xxxxx / unreadable masked-account placeholders with UNREADABLE PAYEE - CHECK PDF', () => {
    const maskedCases = [
      'UPI-XXXXX8212-8212@YBL-YESB0YBLUPI-6986531676151-NA',
      'IMPS-6986531676151-XXXXX8212',
      'C-XXXXXXXX0921-NA',
      'Xxxxx8212',
    ];
    for (const raw of maskedCases) {
      const parsed = parseBankNarration(raw, '6986531676151');
      expect(parsed.description).toBe(UNREADABLE_PAYEE_LABEL);
      expect(parsed.description).not.toMatch(/Xxxxx/i);
      expect(toTitleCase(parsed.description)).toBe(UNREADABLE_PAYEE_LABEL);
    }

    // Named transfer with masked account still preserves the real name
    expect(parseBankNarration('C-XXXXXXXX0921-FAMILY', '0000300112504365').description).toBe(
      'FAMILY (A/c 0921)'
    );
  });

  it('FIX 5 (2026 HDFC Audit): eliminates word-splitting, wrapped title truncation, card terminal noise, and Xxxxx8212 across tight-gap & wrapped PDF textItems', async () => {
    const mock2026Pdf: PDFExtractionResult = {
      openingBalance: 100000,
      closingBalance: 85000,
      fullDocumentText: 'HDFC BANK LIMITED Statement From : 01/01/2026 To : 31/01/2026',
      allGridRows: [],
      pages: [
        {
          pageNumber: 1,
          fullText: 'HDFC BANK LIMITED',
          gridRows: [],
          textItems: [
            { text: 'Date', x: 34, y: 700, width: 16, height: 10 },
            { text: 'Narration', x: 68, y: 700, width: 40, height: 10 },
            { text: 'Chq./Ref.No.', x: 284, y: 700, width: 48, height: 10 },
            { text: 'Value Dt', x: 362, y: 700, width: 30, height: 10 },
            { text: 'Withdrawal Amt.', x: 405, y: 700, width: 60, height: 10 },
            { text: 'Deposit Amt.', x: 491, y: 700, width: 45, height: 10 },
            { text: 'Closing Balance', x: 564, y: 700, width: 55, height: 10 },

            // Row 1: Tight-gap split CONG + O TECHNOLOGIES and Sent Usin G Paytm U
            { text: '01/01/26', x: 34, y: 675, width: 28, height: 10 },
            { text: 'UPI-CONG', x: 68, y: 675, width: 40, height: 10 },
            { text: 'O TECHNOLOGIES-CONGO@YBL-YESB0YBLUPI-', x: 108.4, y: 675, width: 165, height: 10 },
            { text: '6986531676001-SENT USIN G PAYTM U', x: 68, y: 664, width: 170, height: 10 },
            { text: '6986531676001', x: 288, y: 675, width: 62, height: 10 },
            { text: '01/01/26', x: 362, y: 675, width: 28, height: 10 },
            { text: '1,000.00', x: 425, y: 675, width: 32, height: 10 },
            { text: '99,000.00', x: 580, y: 675, width: 38, height: 10 },

            // Row 2: Wrapped title Airtel Broadb And B + ill + Up I Mandate
            { text: '02/01/26', x: 34, y: 645, width: 28, height: 10 },
            { text: 'UPI-AIRTEL BROADB AND B', x: 68, y: 645, width: 130, height: 10 },
            { text: 'ILL-AIRTEL@YBL-YESB0YBLUPI-6986531676002-UP I MANDATE', x: 68, y: 634, width: 195, height: 10 },
            { text: '6986531676002', x: 288, y: 645, width: 62, height: 10 },
            { text: '02/01/26', x: 362, y: 645, width: 28, height: 10 },
            { text: '2,000.00', x: 425, y: 645, width: 32, height: 10 },
            { text: '97,000.00', x: 580, y: 645, width: 38, height: 10 },

            // Row 3: Wrapped title King Bakery And Conf + ectioners + UpiIntent
            { text: '03/01/26', x: 34, y: 615, width: 28, height: 10 },
            { text: 'UPI-KING BAKERY AND CONF', x: 68, y: 615, width: 140, height: 10 },
            { text: 'ECTIONERS-Q123@YBL-YESB0YBLUPI-6986531676003-UPIINTENT', x: 68, y: 604, width: 195, height: 10 },
            { text: '6986531676003', x: 288, y: 615, width: 62, height: 10 },
            { text: '03/01/26', x: 362, y: 615, width: 28, height: 10 },
            { text: '1,000.00', x: 425, y: 615, width: 32, height: 10 },
            { text: '96,000.00', x: 580, y: 615, width: 38, height: 10 },

            // Row 4: Xxxxx8212 + 13-digit ref 6986531676151 -> UNREADABLE PAYEE - CHECK PDF
            { text: '04/01/26', x: 34, y: 585, width: 28, height: 10 },
            { text: 'Xxxxx8212', x: 68, y: 585, width: 55, height: 10 },
            { text: '6986531676151', x: 288, y: 585, width: 62, height: 10 },
            { text: '04/01/26', x: 362, y: 585, width: 28, height: 10 },
            { text: '10,000.00', x: 420, y: 585, width: 38, height: 10 },
            { text: '86,000.00', x: 580, y: 585, width: 38, height: 10 },

            // Row 5: Garbled masked card row 416021xxxxxx9358-s1anpu6f-pune
            { text: '05/01/26', x: 34, y: 555, width: 28, height: 10 },
            { text: '416021xxxxxx9358-s1anpu6f-pune', x: 68, y: 555, width: 150, height: 10 },
            { text: '000000123456', x: 288, y: 555, width: 58, height: 10 },
            { text: '05/01/26', x: 362, y: 555, width: 28, height: 10 },
            { text: '1,000.00', x: 425, y: 555, width: 32, height: 10 },
            { text: '85,000.00', x: 580, y: 555, width: 38, height: 10 },
          ],
        },
      ],
    };

    const res = await parseStatementPDF(new Uint8Array(0), { preExtracted: mock2026Pdf });
    const txns = res.transactions || [];
    expect(txns).toHaveLength(5);

    expect(txns[0].description.toUpperCase()).toBe('CONGO TECHNOLOGIES');
    expect(txns[0].upi_ref_no).toBe('6986531676001');

    expect(txns[1].description).toBe('Airtel Broadband Bill');
    expect(txns[1].upi_ref_no).toBe('6986531676002');

    expect(txns[2].description).toBe('King Bakery And Confectioners');
    expect(txns[2].upi_ref_no).toBe('6986531676003');

    expect(txns[3].description).toBe(UNREADABLE_PAYEE_LABEL);
    expect(txns[3].reference_number).toBe('6986531676151');

    expect(txns[4].description).toBe('Card / ATM - Pune');

    // All 4 split Paytm variants + Mandate + Intent normalize to ONE canonical channel label without "Usi"
    const subVariants = [
      'UPI-TEST PAYEE-TEST@YBL-YESB0YBLUPI-6986531676001-SENT USI NG PAYTM U',
      'UPI-TEST PAYEE-TEST@YBL-YESB0YBLUPI-6986531676001-SENT USING PAY TM U',
      'UPI-TEST PAYEE-TEST@YBL-YESB0YBLUPI-6986531676001-SENT USIN G PAYTM U',
      'UPI-TEST PAYEE-TEST@YBL-YESB0YBLUPI-6986531676001-SENT USING PAYTM U',
    ];
    for (const rawSub of subVariants) {
      const sub = formatTransactionSubtitle('Test Payee', rawSub, '6986531676001');
      expect(sub).toBe('UPI Payment · Ref: 6986531676001');
      expect(sub).not.toMatch(/Usi|Pay Tm/i);
    }

    expect(
      formatTransactionSubtitle(
        'Airtel Broadband Bill',
        'UPI-AIRTEL-AIRTEL@YBL-YESB0YBLUPI-6986531676002-Up I Mandate',
        '6986531676002'
      )
    ).toBe('UPI Mandate · Ref: 6986531676002');

    expect(
      formatTransactionSubtitle(
        'King Bakery And Confectioners',
        'UPI-KING-Q123@YBL-YESB0YBLUPI-6986531676003-UpiIntent',
        '6986531676003'
      )
    ).toBe('UPI Intent · Ref: 6986531676003');

    expect(
      formatTransactionSubtitle('Card / ATM - Pune', '416021xxxxxx9358-s1anpu6f-pune', '123456')
    ).toBe('Card / ATM · Ref: 123456');

    for (const t of txns) {
      const sub = formatTransactionSubtitle(t.description, t.raw_description, t.reference_number) || '';
      const combined = `${t.description} ${sub}`;
      expect(combined).not.toMatch(/Usi Ng|Usin G|Pay Tm|CONG O|Xxxxx|Up I|UpiIntent|s1anpu6f/i);
      expect(sub).not.toMatch(/\bUsi/i);
    }
  });
});




