import { maskForAI, maskTransactionForAI } from '../src/lib/ai/pii-mask';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`✅ PASSED: ${testName}`);
}

console.log('--- Running PII Masking Unit Tests ---');

// Test 1: PAN Masking (standard Indian 10-char PAN)
const panSample = 'Salary credited from ABCDE1234F by employer';
const panResult = maskForAI(panSample);
assert(panResult.includes('[PAN-REDACTED]'), 'Test 1: Redacts 10-character PAN');
assert(!panResult.includes('ABCDE1234F'), 'Test 1: Removes raw PAN string');

// Test 2: Aadhaar Number Masking (12 digits with spaces or hyphens)
const aadhaarSample1 = 'KYC verification Aadhaar 4521 8901 2345 verified';
const aadhaarSample2 = 'Govt transfer Aadhaar: 987654321098';
assert(maskForAI(aadhaarSample1).includes('[AADHAAR-REDACTED]'), 'Test 2a: Redacts Aadhaar with spaces');
assert(maskForAI(aadhaarSample2).includes('[AADHAAR-REDACTED]'), 'Test 2b: Redacts 12-digit continuous Aadhaar');

// Test 3: Indian Mobile Numbers (10 digits starting with 6-9, with optional +91 or 0)
const mobileSample1 = 'UPI transfer from 9876543210 to vendor';
const mobileSample2 = 'SMS Alert +91-9820012345 confirmed';
assert(maskForAI(mobileSample1).includes('[MOBILE-REDACTED]'), 'Test 3a: Redacts 10-digit mobile number');
assert(maskForAI(mobileSample2).includes('[MOBILE-REDACTED]'), 'Test 3b: Redacts mobile with +91 prefix');

// Test 4: Email Address Masking
const emailSample = 'Invoice copy sent to wasim.sayyed@example.com for processing';
assert(maskForAI(emailSample).includes('[EMAIL-REDACTED]'), 'Test 4: Redacts email address');
assert(!maskForAI(emailSample).includes('wasim.sayyed@example.com'), 'Test 4: Removes raw email string');

// Test 5: Full Account Numbers & Last 4 Patterns
const acctSample1 = 'Transfer to AC 918237491028374 completed';
const acctSample2 = 'Card swipe at POS Ending in 4819';
assert(maskForAI(acctSample1).includes('[ACCT-REDACTED]'), 'Test 5a: Redacts long bank account number');
assert(maskForAI(acctSample2).includes('[ACCT-XXXX]'), 'Test 5b: Redacts account last 4 pattern');

// Test 6: IFSC Code Masking
const ifscSample = 'IMPS outward HDFC0001234 reference 928301';
assert(maskForAI(ifscSample).includes('[IFSC-REDACTED]'), 'Test 6: Redacts Indian IFSC code');
assert(!maskForAI(ifscSample).includes('HDFC0001234'), 'Test 6: Removes raw IFSC code');

// Test 7: Profile Name Redaction
const nameSample = 'Payment received from Wasim Sayyed for consultancy';
const nameResult = maskForAI(nameSample, 'Wasim Sayyed');
assert(nameResult.includes('[NAME-REDACTED]'), 'Test 7: Redacts owner profile name');
assert(!nameResult.includes('Wasim'), 'Test 7: Removes first name');

// Test 8: Transaction sanitization & balance removal
const mockTxn = {
  id: 'tx_9912',
  user_id: 'user_secret_123',
  account_id: 'acc_hdfc_01',
  txn_date: '2026-11-05',
  description: 'UPI/9876543210/Wasim Sayyed/PAN ABCDE1234F/Swiggy',
  debit: 540.0,
  credit: null,
  balance: 485000.0,
  notes: 'Secret personal note',
};
const maskedTxn = maskTransactionForAI(mockTxn, 'Wasim Sayyed');
assert(maskedTxn.id === 'tx_9912', 'Test 8a: Preserves transaction ID');
assert(maskedTxn.debit === 540.0, 'Test 8b: Preserves debit amount without account context');
assert(!('balance' in maskedTxn), 'Test 8c: Strips exact balance figure completely');
assert(!('notes' in maskedTxn), 'Test 8d: Strips notes completely');
assert(maskedTxn.masked_description.includes('[MOBILE-REDACTED]'), 'Test 8e: Masks mobile in txn description');
assert(maskedTxn.masked_description.includes('[PAN-REDACTED]'), 'Test 8f: Masks PAN in txn description');
assert(maskedTxn.masked_description.includes('[NAME-REDACTED]'), 'Test 8g: Masks name in txn description');

console.log('🎉 All 8 PII Masking test suites passed successfully!');
