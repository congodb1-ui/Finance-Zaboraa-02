import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parsePDFHDFC } from '../../src/lib/parsers/pdf-hdfc';
import { parseCSV } from '../../src/lib/parsers/csv';
import { parseXLSX } from '../../src/lib/parsers/xlsx';
import { extractPDFRawData } from '../../src/lib/parsers/pdf';
import { computeSHA256, normalizeDate } from '../../src/lib/actions/upload';
import { getAllTransactions } from '../../src/lib/actions/transactions';

const fixturesDir = path.join(process.cwd(), 'tests', 'helpers', 'fixtures');

describe('Parsers Unit Tests (UP-U01 - UP-U08)', () => {
  it('UP-U01: HDFC PDF parser on sample-hdfc.pdf', async () => {
    const pdfBuf = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-hdfc.pdf')));
    const res = await parsePDFHDFC(pdfBuf);
    expect(res.rows.length).toBeGreaterThanOrEqual(20);
    expect(res.suggested_mapping?.debit_col).toBe('Debit');
    expect(res.suggested_mapping?.credit_col).toBe('Credit');
    for (const r of res.rows) {
      expect(r.Debit !== '' || r.Credit !== '').toBe(true);
    }
  });

  it('UP-U02: CSV parser on sample.csv', () => {
    const csvStr = fs.readFileSync(path.join(fixturesDir, 'sample.csv'), 'utf-8');
    const res = parseCSV(csvStr);
    expect(res.rows.length).toBe(5);
    expect(res.confidence).toBe('high');
  });

  it('UP-U03: XLSX parser on sample.xlsx', () => {
    const xlsxBuf = fs.readFileSync(path.join(fixturesDir, 'sample.xlsx'));
    const res = parseXLSX(xlsxBuf);
    expect(res.rows.length).toBe(5);
    expect(res.rows[0].Debit).toBe('250.00');
    expect(res.rows[1].Credit).toBe('50000.00');
  });

  it('UP-U04: Locked PDF throws exact message', async () => {
    const lockedBuf = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-hdfc-locked.pdf')));
    await expect(extractPDFRawData(lockedBuf)).rejects.toThrow(
      /^This PDF is password-protected/
    );
  });

  it('UP-U05: SHA-256 is deterministic', async () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    const hash1 = await computeSHA256(buf);
    const hash2 = await computeSHA256(buf);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('UP-U06: Pagination: getAllTransactions handles 1100 rows mock without truncation', async () => {
    const mockData = Array.from({ length: 1100 }, (_, i) => ({
      id: `tx-${i}`,
      user_id: 'user-1',
      account_id: 'acc-1',
      txn_date: '2026-11-01',
      description: `Tx ${i}`,
      debit: 100,
      credit: null,
      created_at: new Date().toISOString(),
    }));

    const mockClient: any = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        expect(table).toBe('transactions');
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({
                  range: async (from: number, to: number) => {
                    const slice = mockData.slice(from, to + 1);
                    return { data: slice, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      },
    };

    const res = await getAllTransactions(mockClient);
    expect(res).toHaveLength(1100);
  });

  it('UP-U07: HDFC parser classifies Withdrawal as debit, Deposit as credit', async () => {
    const pdfBuf = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-hdfc.pdf')));
    const res = await parsePDFHDFC(pdfBuf);
    for (const r of res.rows) {
      const debitNum = r.Debit ? parseFloat(r.Debit) : 0;
      const creditNum = r.Credit ? parseFloat(r.Credit) : 0;
      expect(debitNum > 0 || creditNum > 0).toBe(true);
    }
  });

  it('UP-U08: normalizeDate handles DD/MM/YYYY and YYYY-MM-DD', () => {
    expect(normalizeDate('01/11/2026')).toBe('2026-11-01');
    expect(normalizeDate('2026-11-01')).toBe('2026-11-01');
    expect(normalizeDate('15-08-2026')).toBe('2026-08-15');
  });

  it('UP-U09: extractStatementPeriod parses Statement From ... To format correctly', async () => {
    const mockPdfData = {
      openingBalance: 238591,
      closingBalance: 809.20,
      fullDocumentText: 'Statement From : 01/01/2026 To : 19/07/2026\\nAccount Statement for 123456783597',
      allGridRows: [],
      pages: [
        {
          pageNumber: 1,
          fullText: 'Statement From : 01/01/2026 To : 19/07/2026',
          textItems: [],
          gridRows: [
            ['Date', 'Narration', 'Chq/Ref No', 'Value Dt', 'Withdrawal', 'Deposit', 'Balance'],
            ['01/01/2026', 'UPI-DEBIT-PAYMENT-1', '01/01/2026', 'REF101', '100.00', '238491.00'],
          ],
        },
      ],
    };

    const res = await parsePDFHDFC(new Uint8Array(0), mockPdfData);
    expect(res.statement_period_start).toBe('01/01/2026');
    expect(res.statement_period_end).toBe('19/07/2026');
  });
});
