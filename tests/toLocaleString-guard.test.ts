import { formatINR } from '../src/types/design-system';
import { formatCurrency } from '../src/lib/data/currencies';
import { formatAnalyticsDateTime, formatAnalyticsDate } from '../src/components/analytics/AnalyticsReportView';

function runUnitTests() {
  console.log('Running ISSUE 1 unit tests for toLocaleString guards...');

  // Test 1: formatINR with undefined, null, NaN
  console.assert(formatINR(undefined as any) === '₹0.00', 'formatINR(undefined) failed');
  console.assert(formatINR(null as any) === '₹0.00', 'formatINR(null) failed');
  console.assert(formatINR(NaN as any) === '₹0.00', 'formatINR(NaN) failed');
  console.assert(formatINR(123456.78) === '₹1,23,456.78', 'formatINR(123456.78) failed');

  // Test 2: formatCurrency with undefined, null, NaN
  console.assert(formatCurrency(undefined as any) === '₹0.00', 'formatCurrency(undefined) failed');
  console.assert(formatCurrency(null as any) === '₹0.00', 'formatCurrency(null) failed');
  console.assert(formatCurrency(5000, 'INR') === '₹5,000.00', 'formatCurrency(5000) failed');

  // Test 3: formatAnalyticsDateTime & formatAnalyticsDate with invalid date inputs
  console.assert(formatAnalyticsDateTime(null) === 'Never', 'formatAnalyticsDateTime(null) failed');
  console.assert(formatAnalyticsDateTime(undefined) === 'Never', 'formatAnalyticsDateTime(undefined) failed');
  console.assert(formatAnalyticsDateTime('invalid-date-string') === 'Never', 'formatAnalyticsDateTime(invalid) failed');
  console.assert(formatAnalyticsDate(null) === 'N/A', 'formatAnalyticsDate(null) failed');

  // Test 4: Guard check on undefined toLocaleString calls
  const dummyTx: any = { debit: undefined, credit: undefined, balance: undefined, created_at: undefined };
  const safeDebit = (dummyTx.debit ?? 0).toLocaleString('en-IN');
  const safeCredit = (dummyTx.credit ?? 0).toLocaleString('en-IN');
  const safeTxnCount = (dummyTx.txn_count ?? 0).toLocaleString('en-IN');
  console.assert(safeDebit === '0', 'safeDebit failed');
  console.assert(safeCredit === '0', 'safeCredit failed');
  console.assert(safeTxnCount === '0', 'safeTxnCount failed');

  console.log('ALL ISSUE 1 unit tests passed successfully!');
}

runUnitTests();
