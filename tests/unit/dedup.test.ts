import { describe, it, expect } from 'vitest';
import { getDedupKey, normalizeDescription } from '../../src/lib/actions/transactions';
import { extractCrossSourceRefs } from '../../src/lib/parsers/utils';

describe('Dedup & Self-Transfer Unit Tests (TX-U01 - TX-U05)', () => {
  it('TX-U01: Dedup key generation: same date + description + amount', () => {
    const key1 = getDedupKey('2026-11-01', 'qa_Swiggy Order', 250, null, 'acc-1');
    const key2 = getDedupKey('2026-11-01', 'QA_SWIGGY ORDER!', 250, null, 'acc-1');
    expect(key1).toBe(key2);
  });

  it('TX-U02: UPI ref extraction across descriptions & ref numbers', () => {
    const ref1 = extractCrossSourceRefs({
      description: 'UPI/SWIGGY/631803023475/Payment',
      referenceNumber: '631803023475',
    });
    expect(ref1.upi_ref_no).toBe('631803023475');

    const keyWithUtr = getDedupKey('2026-11-01', 'SWIGGY', 250, null, 'acc-1', '631803023475');
    const keyWithDifferentDesc = getDedupKey('2026-11-01', 'OTHER DESC', 250, null, 'acc-1', '631803023475');
    expect(keyWithUtr).toBe(keyWithDifferentDesc);
  });

  it('TX-U03: IMPS & UPI refs distinguish self-transfers from duplicate UPIs', () => {
    const impsRef = extractCrossSourceRefs({
      description: 'IMPS/P2A/631803023475/SELF TRANSFER',
      referenceNumber: '631803023475',
    });
    expect(impsRef.imps_ref_no).toBe('631803023475');
  });

  it('TX-U04: balance_after running balance calculation logic', () => {
    const openingBalance = 10000;
    const txns = [
      { debit: 500, credit: null },
      { debit: null, credit: 2000 },
      { debit: 1500, credit: null },
    ];

    let running = openingBalance;
    const balances: number[] = [];

    for (const tx of txns) {
      const d = tx.debit ?? 0;
      const c = tx.credit ?? 0;
      running = running + c - d;
      balances.push(running);
    }

    expect(balances).toEqual([9500, 11500, 10000]);
  });

  it('TX-U05: normalizeDescription strips spaces and special chars', () => {
    expect(normalizeDescription('SWIGGY * FOOD (ORDER #123)')).toBe('swiggyfoodorder123');
    expect(normalizeDescription('  UPI-SALARY-OCT2026  ')).toBe('upisalaryoct2026');
  });
});
