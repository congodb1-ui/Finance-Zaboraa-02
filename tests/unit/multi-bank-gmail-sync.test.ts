import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseStatementPDF } from '../../src/lib/parsers';
import { checkReconciliation } from '../../src/lib/actions/upload';
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
    expect(txns.some((t) => /PageNo|Summary for Account/i.test(t.description))).toBe(false);
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
});
