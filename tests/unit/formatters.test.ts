import { describe, it, expect } from 'vitest';
import { formatINR } from '../../src/types/design-system';
import { formatCurrency } from '../../src/lib/data/currencies';
import { formatAnalyticsDateTime, formatAnalyticsDate } from '../../src/components/analytics/AnalyticsReportView';
import { parseIndianDate, parseMonetaryValue } from '../../src/lib/parsers/utils';

describe('Formatters Unit Tests', () => {
  it('formatINR formats numbers and handles undefined, null, NaN safely', () => {
    expect(formatINR(undefined as any)).toBe('₹0.00');
    expect(formatINR(null as any)).toBe('₹0.00');
    expect(formatINR(NaN as any)).toBe('₹0.00');
    expect(formatINR(123456.78)).toBe('₹1,23,456.78');
    expect(formatINR(5000)).toBe('₹5,000.00');
  });

  it('formatCurrency formats currency codes properly', () => {
    expect(formatCurrency(undefined as any)).toBe('₹0.00');
    expect(formatCurrency(null as any)).toBe('₹0.00');
    expect(formatCurrency(5000, 'INR')).toBe('₹5,000.00');
    expect(formatCurrency(100, 'USD')).toMatch(/100/);
  });

  it('formatAnalyticsDateTime and formatAnalyticsDate handle null and invalid inputs safely', () => {
    expect(formatAnalyticsDateTime(null)).toBe('Never');
    expect(formatAnalyticsDateTime(undefined)).toBe('Never');
    expect(formatAnalyticsDateTime('invalid-date-string')).toBe('Never');
    expect(formatAnalyticsDate(null)).toBe('N/A');
    expect(formatAnalyticsDate(undefined)).toBe('N/A');
    expect(formatAnalyticsDate('invalid-date-string')).toBe('N/A');
  });

  it('parseIndianDate converts Indian date formats to YYYY-MM-DD ISO string', () => {
    expect(parseIndianDate('01/11/2026')).toBe('2026-11-01');
    expect(parseIndianDate('15-Aug-2026')).toBe('2026-08-15');
    expect(parseIndianDate('2026-11-01')).toBe('2026-11-01');
    expect(parseIndianDate('')).toBeNull();
  });

  it('parseMonetaryValue handles Indian monetary expressions cleanly', () => {
    expect(parseMonetaryValue('1,25,000.50')).toBe(125000.5);
    expect(parseMonetaryValue('₹ 4,200.00')).toBe(4200);
    expect(parseMonetaryValue('- Rs. 140.00')).toBe(-140);
    expect(parseMonetaryValue('nil')).toBeNull();
    expect(parseMonetaryValue(null)).toBeNull();
  });
});
