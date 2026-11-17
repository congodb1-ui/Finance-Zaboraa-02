import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXLSX } from '../../src/lib/parsers/xlsx';
import {
  GMAIL_ALERT_QUERY_BASE,
  parseGmailTransactionEmail,
} from '../../src/lib/parsers/gmail';
import {
  findBestCrossSourceMatch,
  type DedupCandidateTx,
  type IncomingDedupRow,
} from '../../src/lib/dedup-sync';

describe('Structured 7-Column Excel Statement Upload (image.png reference format)', () => {
  it('parses the 7-column HDFC Excel format cleanly with dates, leading-zero refs, narrations, and balance math', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'Date',
        'Narration',
        'Chq./Ref.No.',
        'Value Dt',
        'Withdrawal Amt.',
        'Deposit Amt.',
        'Closing Balance',
      ],
      [
        '01/01/22',
        'UPI-ANSARI NAZIR HUSAIN-PAYTMQR2810050501011VMKGYAK062C@PAYTM-PYTM0123456-200118540577-UPI',
        '0000200118540577',
        '01/01/22',
        20,
        '',
        31788.26,
      ],
      [
        '01/01/22',
        'UPI-BALAJI FOOD TRADERS-BALAJIFOODTRADERS.28116949@HDFCBANK-HDFC0000001-200120181168-UPI',
        '0000200120181168',
        '01/01/22',
        2864,
        '',
        28924.26,
      ],
      [
        '02/01/22',
        'UPI-AZIZ PAYA AND CHICKE-GPAY-11176256288@OKBIZAXIS-UTIB0000000-200230337950-UPI',
        '0000200230337950',
        '02/01/22',
        200,
        '',
        28724.26,
      ],
      ['STATEMENT SUMMARY', '', '', '', '', '', ''],
      ['Opening Balance', '31808.26', 'Dr Count', '3', 'Closing Balance', '28724.26', ''],
    ]);

    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = parseXLSX(buf);
    expect(res.confidence).toBe('high');
    expect(res.detected_bank).toBe('HDFC Bank');
    expect(res.rows).toHaveLength(3);
    expect(res.transactions).toHaveLength(3);

    expect(res.suggested_mapping?.date_col).toBe('Date');
    expect(res.suggested_mapping?.description_col).toBe('Narration');
    expect(res.suggested_mapping?.reference_col).toBe('Chq./Ref.No.');
    expect(res.suggested_mapping?.debit_col).toBe('Withdrawal Amt.');
    expect(res.suggested_mapping?.credit_col).toBe('Deposit Amt.');
    expect(res.suggested_mapping?.balance_col).toBe('Closing Balance');

    expect(res.transactions?.[0]).toMatchObject({
      txn_date: '2022-01-01',
      debit: 20,
      credit: null,
      balance: 31788.26,
      upi_ref_no: '200118540577',
    });
    expect(res.transactions?.[1]).toMatchObject({
      txn_date: '2022-01-01',
      debit: 2864,
      balance: 28924.26,
      upi_ref_no: '200120181168',
    });
    expect(res.transactions?.[2]).toMatchObject({
      txn_date: '2022-01-02',
      debit: 200,
      balance: 28724.26,
      upi_ref_no: '200230337950',
    });

    expect(res.opening_balance).toBe(31808.26);
    expect(res.closing_balance).toBe(28724.26);
    expect(res.statement_period_start).toBe('2022-01-01');
    expect(res.statement_period_end).toBe('2022-01-02');
  });

  it('handles native Excel Date cells without MDY flipping and large numeric Chq./Ref.No. without scientific notation', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'Date',
        'Narration',
        'Chq./Ref.No.',
        'Value Dt',
        'Withdrawal Amt.',
        'Deposit Amt.',
        'Closing Balance',
      ],
      [
        new Date(Date.UTC(2022, 0, 2)), // Jan 2, 2022 -> must stay 2022-01-02 (NOT Feb 1!)
        'NEFT CR-HDFC0000123-ACME SOFTWARE PVT LTD',
        200118540577, // numeric large integer ref
        new Date(Date.UTC(2022, 0, 2)),
        null,
        50000,
        81788.26,
      ],
    ]);

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = parseXLSX(buf);
    expect(res.rows).toHaveLength(1);
    expect(res.transactions?.[0].txn_date).toBe('2022-01-02');
    expect(res.transactions?.[0].reference_number).toBe('200118540577');
    expect(res.rows[0]['Chq./Ref.No.']).toBe('200118540577');
    expect(res.transactions?.[0].credit).toBe(50000);
    expect(res.opening_balance).toBe(31788.26);
  });

  it('parses REV-UPI, UPIRET, POS, ATW, NEFT CR, IMPS, ACH C, CREDIT INTEREST CAPITALISED, BHAWANI, RELIEF CHEMIST, and XXXXXX8212 accurately', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
      [
        '04/01/22',
        'UPI-RELIEF CHEMIST-PAYTMQR28100505010112K8BIRB5VB0@PAYTM-PYTM0123456-200463667436-UPI',
        '0000200463667436',
        '04/01/22',
        65,
        '',
        31743.26,
      ],
      [
        '14/01/22',
        'UPI-BHAWANI SUPER MARKE-PAYTMQR281005050101SN3GORJNOSQ1@PAYTM-PYTM0123456-201438203313-UPI',
        '0000201438203313',
        '14/01/22',
        37,
        '',
        31706.26,
      ],
      [
        '02/01/22',
        'ATW-405988XXXXXX0875-P3ECPU33-PUNE',
        '0000000000009859',
        '02/01/22',
        15000,
        '',
        16706.26,
      ],
      [
        '08/01/22',
        'POS 405988XXXXXX0875 KEDARI SERVICE',
        '0000000000007439',
        '08/01/22',
        499,
        '',
        16207.26,
      ],
      [
        '28/02/22',
        'NEFT CR-HSBC0411002-SUNGARD AVAILABILITY SERVICES (INDI-WASIM SALIM SAYYED-HSBCN22059427439',
        'HSBCN22059427439',
        '28/02/22',
        '',
        72302,
        88509.26,
      ],
      [
        '31/01/22',
        'UPIRET-20220129-202992473262',
        '000000000000000',
        '31/01/22',
        '',
        1800,
        90309.26,
      ],
      [
        '31/01/22',
        'UPI-TANVEER TANVEER TANV-9096077863@YBL-HDFC0CMUSLM-203138811720-PAYMENT FROM PHONE',
        '0000203138811720',
        '31/01/22',
        10,
        '',
        90299.26,
      ],
      [
        '31/01/22',
        'REV-UPI-50100124093597-9579662397@IBL-203138811720-PAYMENT FROM PHONEPE',
        '0000203138811720',
        '31/01/22',
        '',
        10,
        90309.26,
      ],
      [
        '05/01/22',
        'BAJAJ FINEMI-BF-1218824-41789',
        '000000000000000',
        '05/01/22',
        2450,
        '',
        87859.26,
      ],
      [
        '13/02/22',
        'ACH C- RELIANCE INDUSTRIES-9911223344',
        '0000000099112233',
        '14/02/22',
        '',
        1250,
        89109.26,
      ],
      [
        '31/03/22',
        'CREDIT INTEREST CAPITALISED',
        '',
        '31/03/22',
        '',
        420,
        89529.26,
      ],
      [
        '15/02/22',
        'XXXXXX8212',
        '0000204611223344',
        '15/02/22',
        500,
        '',
        89029.26,
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = parseXLSX(buf);
    const txns = res.transactions || [];
    expect(txns).toHaveLength(12);

    expect(txns[0]).toMatchObject({ description: 'RELIEF CHEMIST', upi_ref_no: '200463667436', debit: 65 });
    expect(txns[1]).toMatchObject({ description: 'BHAWANI SUPER MARKE', upi_ref_no: '201438203313', debit: 37 });
    expect(txns[2]).toMatchObject({ description: 'Card / ATM - Pune', reference_number: '9859', debit: 15000 });
    expect(txns[3]).toMatchObject({ description: 'POS - Kedari Service', reference_number: '7439', debit: 499 });
    expect(txns[4]).toMatchObject({
      description: 'SUNGARD AVAILABILITY SERVICES (INDI - WASIM SALIM SAYYED',
      reference_number: 'HSBCN22059427439',
      credit: 72302,
    });
    expect(txns[5]).toMatchObject({
      description: 'UPI Return / Reversal',
      reference_number: '202992473262',
      upi_ref_no: '202992473262',
      credit: 1800,
    });
    expect(txns[6]).toMatchObject({
      description: 'TANVEER TANVEER TANV',
      upi_ref_no: '203138811720',
      debit: 10,
    });
    expect(txns[7]).toMatchObject({
      description: 'UPI Reversal - 9579662397',
      upi_ref_no: '203138811720',
      credit: 10,
    });
    expect(txns[8]).toMatchObject({
      description: 'BAJAJ FINEMI-BF-1218824-41789',
      reference_number: null,
      debit: 2450,
    });
    // Value Dt (14/02/22) differs from Date (13/02/22) -> txn_date uses Date (2022-02-13)
    expect(txns[9]).toMatchObject({
      txn_date: '2022-02-13',
      description: 'RELIANCE INDUSTRIES',
      credit: 1250,
    });
    expect(res.rows[9]['Value Dt']).toBe('14/02/22');
    expect(txns[10]).toMatchObject({ description: 'CREDIT INTEREST CAPITALISED', credit: 420 });
    expect(txns[11]).toMatchObject({
      description: 'UNREADABLE PAYEE - CHECK PDF',
      reference_number: '204611223344',
    });

    // Opening & Closing match statement endpoints even when middle rows differ slightly
    expect(res.opening_balance).toBe(31808.26);
    expect(res.closing_balance).toBe(89029.26);

    // Ensure same-account REV-UPI credit does NOT false-merge with original UPI debit sharing same UTR
    const existingDebit: DedupCandidateTx[] = [
      {
        id: 'tx-debit-tanveer',
        account_id: 'acc-1',
        txn_date: '2022-01-31',
        description: 'TANVEER TANVEER TANV',
        raw_description: txns[6].raw_description,
        debit: 10,
        credit: null,
        reference_number: '203138811720',
        upi_ref_no: '203138811720',
        imps_ref_no: null,
        source: 'statement_import',
      },
    ];
    const incomingRev: IncomingDedupRow = {
      account_id: 'acc-1',
      txn_date: '2022-01-31',
      description: txns[7].description,
      raw_description: txns[7].raw_description,
      debit: null,
      credit: 10,
      reference_number: txns[7].reference_number,
      upi_ref_no: txns[7].upi_ref_no,
      imps_ref_no: null,
      source: 'statement_import',
    };
    expect(findBestCrossSourceMatch(incomingRev, existingDebit)).toBeNull();
  });

  it('parses a 5-year 4,500-row single-sheet Excel workbook quickly with exact opening/closing math', () => {
    const sheetRows: any[][] = [
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ];
    let balance = 100000;
    const totalRows = 4500;
    const startMs = Date.UTC(2021, 0, 1);
    for (let i = 0; i < totalRows; i++) {
      const d = new Date(startMs + Math.floor(i / 3) * 86_400_000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yy = String(d.getUTCFullYear()).slice(-2);
      const dateStr = `${dd}/${mm}/${yy}`;
      const utr = String(200000000001 + i);
      const isCredit = i % 10 === 0;
      const amt = isCredit ? 5000 : 100;
      balance = Math.round((balance + (isCredit ? amt : -amt)) * 100) / 100;
      sheetRows.push([
        dateStr,
        `UPI-MERCHANT ${i}-M${i}@PAYTM-PYTM0123456-${utr}-UPI`,
        `0000${utr}`,
        dateStr,
        isCredit ? '' : amt,
        isCredit ? amt : '',
        balance,
      ]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, '5YearStatement');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const t0 = Date.now();
    const res = parseXLSX(buf);
    const elapsedMs = Date.now() - t0;

    expect(res.rows).toHaveLength(totalRows);
    expect(res.transactions).toHaveLength(totalRows);
    expect(res.opening_balance).toBe(100000);
    expect(res.closing_balance).toBe(balance);
    expect(elapsedMs).toBeLessThan(10_000);
  });
});

describe('Gmail Fetching: NEFT, IMPS, ATM Cash Withdrawal, and RTGS across Banks', () => {
  it('queries NEFT, IMPS, RTGS, ATM cash withdrawals, and SBI/HDFC/BOM/BOI senders', () => {
    expect(GMAIL_ALERT_QUERY_BASE).toContain('IMPS OR NEFT OR RTGS OR UPI');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('ATM');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('"Cash Withdrawal"');
    expect(GMAIL_ALERT_QUERY_BASE).toContain('cbssbi.cas@sbi.co.in');
  });

  it('parses HDFC ATM cash withdrawal alerts (Account + Debit Card last4 fallback)', () => {
    const hdfcAtmAcct = parseGmailTransactionEmail({
      id: 'hdfc-atm-1',
      from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.net>',
      subject: 'Alert: ATM Cash Withdrawal from your HDFC Bank A/c',
      bodyText:
        'Rs. 10,000.00 is withdrawn from your account ending XX3597 at BANDRA WEST ATM on 14-11-26. RRN: 631910223344. Available balance is INR 45,200.50.',
    });
    expect(hdfcAtmAcct.record_type).toBe('transaction');
    if (hdfcAtmAcct.record_type === 'transaction') {
      expect(hdfcAtmAcct.bank).toBe('HDFC');
      expect(hdfcAtmAcct.method).toBe('ATM');
      expect(hdfcAtmAcct.direction).toBe('debit');
      expect(hdfcAtmAcct.amount).toBe(10000);
      expect(hdfcAtmAcct.account_last4).toBe('3597');
      expect(hdfcAtmAcct.reference_number).toBe('631910223344');
      expect(hdfcAtmAcct.payee_name).toContain('ATM Cash Withdrawal');
      expect(hdfcAtmAcct.payee_name).toContain('BANDRA WEST ATM');
      expect(hdfcAtmAcct.balance_after).toBe(45200.5);
    }

    const hdfcAtmCard = parseGmailTransactionEmail({
      id: 'hdfc-atm-2',
      from: 'alerts@hdfcbank.bank.in',
      subject: 'Debit Card ATM Transaction Alert',
      bodyText:
        'Thank you for using your HDFC Bank Debit Card ending 3597 for ₹5,000.00 at ATM ANDHERI EAST on 15-11-2026. Ref No: 632011223344.',
    });
    expect(hdfcAtmCard.record_type).toBe('transaction');
    if (hdfcAtmCard.record_type === 'transaction') {
      expect(hdfcAtmCard.method).toBe('ATM');
      expect(hdfcAtmCard.direction).toBe('debit');
      expect(hdfcAtmCard.amount).toBe(5000);
      expect(hdfcAtmCard.account_last4).toBe('3597');
      expect(hdfcAtmCard.reference_number).toBe('632011223344');
    }
  });

  it('parses BOM and BOI ATM cash withdrawal, NEFT, IMPS, and RTGS alerts', () => {
    const bomAtm = parseGmailTransactionEmail({
      id: 'bom-atm-1',
      from: 'mahaalert@mahabank.co.in',
      subject: 'ATM Cash Withdrawal Alert',
      bodyText:
        'Your A/c No xx 9735 has been debited by INR 4,000.00 on 15-NOV-2026 for ATM Cash Withdrawal at PUNEFCROAD RRN 632055443322. AVL Bal INR 26,163.90.',
    });
    expect(bomAtm.record_type).toBe('transaction');
    if (bomAtm.record_type === 'transaction') {
      expect(bomAtm.bank).toBe('BOM');
      expect(bomAtm.method).toBe('ATM');
      expect(bomAtm.direction).toBe('debit');
      expect(bomAtm.amount).toBe(4000);
      expect(bomAtm.account_last4).toBe('9735');
      expect(bomAtm.reference_number).toBe('632055443322');
      expect(bomAtm.balance_after).toBe(26163.9);
    }

    const bomRtgs = parseGmailTransactionEmail({
      id: 'bom-rtgs-1',
      from: 'mahaalerts@bankofmaharashtra.bank.in',
      subject: 'RTGS Credit Alert',
      bodyText:
        'Your A/c No xx 9735 has been credited by INR 2,50,000.00 on 15-NOV-2026 by RTGS MAHBR20261115123456 from ZETA ENTERPRISES. A/c Bal is INR 2,76,163.90 CR.',
    });
    expect(bomRtgs.record_type).toBe('transaction');
    if (bomRtgs.record_type === 'transaction') {
      expect(bomRtgs.bank).toBe('BOM');
      expect(bomRtgs.method).toBe('RTGS');
      expect(bomRtgs.direction).toBe('credit');
      expect(bomRtgs.amount).toBe(250000);
      expect(bomRtgs.rtgs_ref_no).toBe('MAHBR20261115123456');
    }

    const boiNeft = parseGmailTransactionEmail({
      id: 'boi-neft-1',
      from: 'HO.starsandesh@bankofindia.co.in',
      subject: 'BOI NEFT Credit Alert',
      bodyText:
        'Your A/c XX4411 is credited with Rs. 85,000.00 on 14-11-2026 via NEFT UTR BKIDN26319001122 from ALPHA TRADERS. Bal: Rs. 1,45,000.00',
    });
    expect(boiNeft.record_type).toBe('transaction');
    if (boiNeft.record_type === 'transaction') {
      expect(boiNeft.bank).toBe('BOI');
      expect(boiNeft.method).toBe('NEFT');
      expect(boiNeft.direction).toBe('credit');
      expect(boiNeft.amount).toBe(85000);
      expect(boiNeft.neft_ref_no).toBe('BKIDN26319001122');
    }

    const boiAtm = parseGmailTransactionEmail({
      id: 'boi-atm-1',
      from: 'HO.starsandesh@bankofindia.co.in',
      subject: 'ATM Withdrawal Alert',
      bodyText:
        'Your A/c XX4411 is debited by INR 2,500.00 on 15-11-2026 for ATM withdrawal at DADAR ATM. Ref No: 632099887766. Bal: INR 1,42,500.00.',
    });
    expect(boiAtm.record_type).toBe('transaction');
    if (boiAtm.record_type === 'transaction') {
      expect(boiAtm.bank).toBe('BOI');
      expect(boiAtm.method).toBe('ATM');
      expect(boiAtm.direction).toBe('debit');
      expect(boiAtm.amount).toBe(2500);
      expect(boiAtm.reference_number).toBe('632099887766');
    }
  });

  it('parses generic bank (SBI / Axis) IMPS, NEFT, RTGS, and ATM cash withdrawal alerts', () => {
    const sbiAtm = parseGmailTransactionEmail({
      id: 'sbi-atm-1',
      from: 'cbssbi.cas@sbi.co.in',
      subject: 'ATM Cash Withdrawal Alert',
      bodyText:
        'Dear Customer, ₹15,000.00 withdrawn via Debit Card ending 7821 at SBI ATM FORT MUMBAI on 15-11-26. RRN 632012349876. Avl Bal ₹64,500.00.',
    });
    expect(sbiAtm.record_type).toBe('transaction');
    if (sbiAtm.record_type === 'transaction') {
      expect(sbiAtm.bank).toBe('SBI');
      expect(sbiAtm.method).toBe('ATM');
      expect(sbiAtm.direction).toBe('debit');
      expect(sbiAtm.amount).toBe(15000);
      expect(sbiAtm.account_last4).toBe('7821');
      expect(sbiAtm.reference_number).toBe('632012349876');
      expect(sbiAtm.balance_after).toBe(64500);
    }

    const axisImps = parseGmailTransactionEmail({
      id: 'axis-imps-1',
      from: 'alerts@axisbank.com',
      subject: 'Transaction Alert from Axis Bank',
      bodyText:
        'INR 18,500.00 was debited from your A/c XX9901 on 15-11-2026 via IMPS Ref No: 632077665544 towards RAJESH SHARMA. Avl Bal INR 92,000.00.',
    });
    expect(axisImps.record_type).toBe('transaction');
    if (axisImps.record_type === 'transaction') {
      expect(axisImps.bank).toBe('AXIS');
      expect(axisImps.method).toBe('IMPS');
      expect(axisImps.direction).toBe('debit');
      expect(axisImps.amount).toBe(18500);
      expect(axisImps.imps_ref_no).toBe('632077665544');
    }
  });

  it('deduplicates ATM cash withdrawal Gmail alert with uploaded bank statement ATM row', () => {
    const existing: DedupCandidateTx[] = [
      {
        id: 'tx-stmt-atm-1',
        account_id: 'acc-3597',
        upload_id: 'up-excel-1',
        txn_date: '2026-11-14',
        description: 'ATW-416210XXXXXX3597-BANDRA WEST ATM',
        raw_description: 'ATW-416210XXXXXX3597-BANDRA WEST ATM',
        debit: 10000,
        credit: null,
        balance: 45200.5,
        balance_after: 45200.5,
        reference_number: '631910223344',
        upi_ref_no: null,
        imps_ref_no: null,
        source: 'statement_import',
      },
    ];

    const incoming: IncomingDedupRow = {
      account_id: 'acc-3597',
      txn_date: '2026-11-14',
      description: 'ATM Cash Withdrawal - BANDRA WEST ATM',
      raw_description: 'ATM/631910223344/ATM Cash Withdrawal - BANDRA WEST ATM',
      debit: 10000,
      credit: null,
      balance: 45200.5,
      reference_number: '631910223344',
      upi_ref_no: null,
      imps_ref_no: null,
      source: 'gmail_auto',
    };

    const match = findBestCrossSourceMatch(incoming, existing);
    expect(match).not.toBeNull();
    expect(match?.matched.id).toBe('tx-stmt-atm-1');
    expect(match?.matchTier).toBe('tier1_ref');
  });
});
