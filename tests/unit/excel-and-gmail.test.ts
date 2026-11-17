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
