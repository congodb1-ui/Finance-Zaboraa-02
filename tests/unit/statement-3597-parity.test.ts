import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parsePDFIntelligent } from '../../src/lib/parsers/intelligent-parser';
import { parseCSV } from '../../src/lib/parsers/csv';
import {
  parseBankNarration,
  formatTransactionSubtitle,
  UNREADABLE_PAYEE_LABEL,
} from '../../src/lib/parsers/bank-transaction';
import { getTransactions } from '../../src/lib/actions/transactions';
import { ReviewScreen } from '../../src/components/upload/ReviewScreen';
import type { StatementUpload, StagedTransaction } from '../../src/types/uploads';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe('HDFC 3597 Three-Source Parity (PDF Statement, Excel/CSV Upload, Gmail/Ledger)', () => {
  it('parses Account_Statement_3597_6bf7f8ed.pdf with exact totals, zero unreadable payees, zero balance mismatches, and 100% narration parity', async () => {
    const pdfPath = path.resolve(
      process.cwd(),
      'public/assets/aistudio/Account_Statement_3597_6bf7f8ed.pdf'
    );
    const buf = new Uint8Array(fs.readFileSync(pdfPath));
    const res = await parsePDFIntelligent(buf);
    const txns = res.transactions || [];

    expect(txns.length).toBe(731);
    expect(res.opening_balance).toBe(31808.26);
    expect(res.closing_balance).toBe(53567.32);

    let debSum = 0;
    let debCount = 0;
    let credSum = 0;
    let credCount = 0;
    let mismatchCount = 0;
    let unreadableCount = 0;
    let zeroRefCount = 0;
    let narrationDiffCount = 0;

    for (const t of txns) {
      if (t.debit && t.debit > 0) {
        debSum += t.debit;
        debCount++;
      }
      if (t.credit && t.credit > 0) {
        credSum += t.credit;
        credCount++;
      }
      if (t.balance_mismatch) mismatchCount++;
      if (t.description === UNREADABLE_PAYEE_LABEL) unreadableCount++;
      if (t.reference_number && /^0+$/.test(t.reference_number)) zeroRefCount++;

      const bankParsed = parseBankNarration(t.raw_description || '', t.reference_number ?? undefined);
      if (t.description.toLowerCase() !== bankParsed.description.toLowerCase()) {
        narrationDiffCount++;
      }
    }

    expect(debCount).toBe(625);
    expect(round2(debSum)).toBe(1852984.02);
    expect(credCount).toBe(106);
    expect(round2(credSum)).toBe(1874743.08);
    expect(mismatchCount).toBe(0);
    expect(unreadableCount).toBe(0);
    expect(zeroRefCount).toBe(0);
    expect(narrationDiffCount).toBe(0);
  });

  it('parses previously-unreadable HDFC masked-account UPI transfers and fuel surcharge cleanly across parseBankNarration & subtitles', () => {
    const cases = [
      {
        raw: 'UPI-XXXXXX8212-UTIB0000000-208350942132-UPI',
        ref: '208350942132',
        expectedDesc: 'UPI Transfer - Axis (A/c 8212)',
        expectedSubtitle: 'UPI Payment · Ref: 208350942132',
      },
      {
        raw: 'UPI-XXXXXX0921-MAHB0000909-215198109074-MOBILE RECHARGE',
        ref: '215198109074',
        expectedDesc: 'MOBILE RECHARGE (A/c 0921)',
        expectedSubtitle: 'UPI Payment · Ref: 215198109074',
      },
      {
        raw: 'UPI-XXXXXX0063-HDFC0000001-230207046626-NA',
        ref: '230207046626',
        expectedDesc: 'UPI Transfer - HDFC (A/c 0063)',
        expectedSubtitle: 'UPI Payment · Ref: 230207046626',
      },
      {
        raw: 'FUEL SURCHG 405988******0875 DT 29/10/22',
        ref: '000000000000000',
        expectedDesc: 'Card / ATM - Fuel Surcharge (0875)',
        expectedSubtitle: 'Card / ATM',
      },
    ];

    for (const c of cases) {
      const parsed = parseBankNarration(c.raw, c.ref);
      expect(parsed.description).toBe(c.expectedDesc);
      expect(parsed.description).not.toBe(UNREADABLE_PAYEE_LABEL);
      const sub = formatTransactionSubtitle(parsed.description, c.raw, parsed.reference);
      expect(sub).toBe(c.expectedSubtitle);
    }
  });

  it('normalizes CSV statements identically to XLSX/PDF with Raw Narration, transactions[], and derived opening/closing balances', () => {
    const csv = [
      'Account No : XXXXXXXX3597',
      'Statement From : 01/01/2022 To : 01/01/2023',
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '01/01/22,UPI-XXXXXX8212-UTIB0000000-208350942132-UPI,0000208350942132,01/01/22,20.00,,31788.26',
      '02/01/22,UPI-XXXXXX0921-MAHB0000909-215198109074-MOBILE RECHARGE,0000215198109074,02/01/22,400.00,,31388.26',
      '29/10/22,FUEL SURCHG 405988******0875 DT 29/10/22,000000000000000,29/10/22,4.25,,31384.01',
      '30/10/22,NEFT CR-KKBK0000724-CONGO CONSULTANCY-KKBKR22026101725350598,KKBKR22026101725350598,30/10/22,,5000.00,36384.01',
    ].join('\n');

    const res = parseCSV(csv);
    expect(res.detected_account_last4).toBe('3597');
    expect(res.statement_period_start).toBe('2022-01-01');
    expect(res.statement_period_end).toBe('2023-01-01');
    expect(res.opening_balance).toBe(31808.26);
    expect(res.closing_balance).toBe(36384.01);
    expect(res.transactions).toHaveLength(4);
    expect(res.transactions![0].description).toBe('UPI Transfer - Axis (A/c 8212)');
    expect(res.transactions![0].reference_number).toBe('208350942132');
    expect(res.transactions![1].description).toBe('MOBILE RECHARGE (A/c 0921)');
    expect(res.transactions![2].description).toBe('Card / ATM - Fuel Surcharge (0875)');
    expect(res.transactions![2].reference_number).toBeNull();
    expect(res.rows[0]['Raw Narration']).toBe('UPI-XXXXXX8212-UTIB0000000-208350942132-UPI');
  });

  it('ReviewScreen derives Opening Balance from staged rows when statement_uploads row lacks opening_balance', () => {
    const upload: StatementUpload = {
      id: 'upl-1',
      user_id: 'u-1',
      account_id: 'acc-1',
      file_name: 'Acct_Statement_XXXXXXXX3597_17112026 (1).xls',
      file_type: 'xlsx',
      file_hash: 'hash-1',
      file_size_bytes: 1024,
      storage_path: '/tmp/upl-1.xls',
      parser_version: 'xlsx-structured-v2',
      row_count: 2,
      imported_count: 2,
      duplicate_count: 0,
      error_message: null,
      statement_period_start: '2022-01-01',
      statement_period_end: '2023-01-01',
      imported_at: '2026-11-17T00:00:00Z',
      status: 'imported',
      opening_balance: null,
      closing_balance: 53567.32,
      created_at: '2026-11-17T00:00:00Z',
      updated_at: '2026-11-17T00:00:00Z',
    };

    const txns: StagedTransaction[] = [
      {
        id: 'st-1',
        upload_id: 'upl-1',
        user_id: 'u-1',
        account_id: 'acc-1',
        raw_date: '01/01/22',
        txn_date: '2022-01-01',
        description: 'UPI Transfer - Axis (A/c 8212)',
        raw_description: 'UPI-XXXXXX8212-UTIB0000000-208350942132-UPI',
        debit: 20,
        credit: null,
        balance: 31788.26,
        reference_number: '208350942132',
        is_duplicate: false,
        duplicate_of_id: null,
        created_at: '2026-11-17T00:00:00Z',
      },
      {
        id: 'st-2',
        upload_id: 'upl-1',
        user_id: 'u-1',
        account_id: 'acc-1',
        raw_date: '01/01/23',
        txn_date: '2023-01-01',
        description: 'Client Deposit',
        raw_description: 'Client Deposit',
        debit: null,
        credit: 21779.06,
        balance: 53567.32,
        reference_number: null,
        is_duplicate: false,
        duplicate_of_id: null,
        created_at: '2026-11-17T00:00:00Z',
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ReviewScreen, {
        upload,
        transactions: txns,
        isReadOnly: true,
        onConfirmImport: async () => {},
        onCancelUpload: async () => {},
      })
    );

    expect(html).toContain('31,808.26');
    expect(html).toContain('Derived from statement');
  });

  it('getTransactions backfills chronological running balance for gmail_auto rows lacking bank-reported balance without overwriting reported balances', async () => {
    const pageRows = [
      {
        id: 'tx-3',
        user_id: 'u-1',
        account_id: 'acc-1',
        txn_date: '2026-11-12',
        created_at: '2026-11-12T10:00:00Z',
        description: 'Swiggy',
        raw_description: 'UPI/631803023475/Swiggy (swiggy@icici)',
        debit: 250,
        credit: null,
        balance: null,
        balance_after: null,
        reference_number: '631803023475',
        source: 'gmail_auto',
        accounts: { id: 'acc-1', name: 'HDFC 3597', bank_name: 'HDFC', account_number_last4: '3597' },
      },
      {
        id: 'tx-2',
        user_id: 'u-1',
        account_id: 'acc-1',
        txn_date: '2026-11-11',
        created_at: '2026-11-11T09:00:00Z',
        description: 'Client Payout',
        raw_description: 'UPI/631700001111/Client',
        debit: null,
        credit: 5000,
        balance: null,
        balance_after: null,
        reference_number: '631700001111',
        source: 'gmail_auto',
        accounts: { id: 'acc-1', name: 'HDFC 3597', bank_name: 'HDFC', account_number_last4: '3597' },
      },
      {
        id: 'tx-1',
        user_id: 'u-1',
        account_id: 'acc-1',
        txn_date: '2026-11-10',
        created_at: '2026-11-10T08:00:00Z',
        description: 'Opening Statement Row',
        raw_description: 'NEFT',
        debit: 100,
        credit: null,
        balance: 53467.32,
        balance_after: 53467.32,
        reference_number: 'REF1',
        source: 'statement_import',
        accounts: { id: 'acc-1', name: 'HDFC 3597', bank_name: 'HDFC', account_number_last4: '3597' },
      },
    ];

    const createQueryBuilder = (table: string) => {
      let selectCols = '';
      const chain: any = {
        select: (cols: string) => {
          selectCols = cols;
          return chain;
        },
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        in: () => chain,
        is: () => chain,
        or: () => chain,
        order: () => chain,
        range: async () => {
          if (selectCols.includes('accounts(')) {
            return { data: pageRows, count: pageRows.length, error: null };
          }
          if (selectCols === 'debit, credit') {
            return { data: pageRows, error: null };
          }
          return { data: [...pageRows].reverse(), error: null };
        },
        single: async () => {
          if (table === 'accounts') {
            return { data: { opening_balance: 0, current_balance: 58217.32 }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    };

    const mockClient: any = {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
      from: (table: string) => createQueryBuilder(table),
    };

    const result = await getTransactions({ page: 1, pageSize: 50 }, mockClient);
    expect(result.transactions).toHaveLength(3);
    // Chronological: tx-1 (53467.32 reported) -> tx-2 (+5000 = 58467.32) -> tx-3 (-250 = 58217.32)
    expect(result.transactions[0].balance).toBe(58217.32);
    expect(result.transactions[1].balance).toBe(58467.32);
    expect(result.transactions[2].balance).toBe(53467.32);
  });
});
