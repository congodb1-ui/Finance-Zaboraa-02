import { parseBankNarration } from '../src/lib/parsers/bank-transaction';

const testCases = [
  {
    raw: 'RTGS CR-KKBK0000958-KOTAK SECURITIES LIMITED NSE CLI-WASIM SALIM SAYYED-KKBKR2202611062573795',
    refCol: 'KKBKR22026110625737795',
    expectedType: 'RTGS',
    expectedDesc: 'KOTAK SECURITIES LIMITED NSE CLI - WASIM SALIM SAYYED',
    expectedRef: 'KKBKR2202611062573795',
  },
  {
    raw: 'RTGS CR-KKBK0000958-KOTAK SECURITIES LIM ITED NSE CLI-WASIM SALIM SAYYED-KKBKR22026110625737795',
    refCol: 'KKBKR22026110625737795',
    expectedType: 'RTGS',
    expectedDesc: 'KOTAK SECURITIES LIMITED NSE CLI - WASIM SALIM SAYYED',
    expectedRef: 'KKBKR22026110625737795',
  },
  {
    raw: 'NEFT CR-HDFC0000001-SOME MERCHANT-N2611151234567',
    expectedType: 'NEFT',
    expectedDesc: 'SOME MERCHANT',
    expectedRef: 'N2611151234567',
  },
  {
    raw: 'NEFT DR-SBIN0001234-ANOTHER PERSON-N1234567890',
    expectedType: 'NEFT',
    expectedDesc: 'ANOTHER PERSON',
    expectedRef: 'N1234567890',
  },
  {
    raw: 'IMPS-631904988044-AMAZON PAY-HDFC-EXTRA',
    expectedType: 'IMPS',
    expectedDesc: 'AMAZON PAY',
    expectedRef: '631904988044',
  },
  {
    raw: 'IMPS CR-SWIGGY-631911560009',
    expectedType: 'IMPS',
    expectedDesc: 'SWIGGY',
    expectedRef: '631911560009',
  },
  {
    raw: 'EFT-RELIANCE RETAIL-631910647565',
    expectedType: 'EFT',
    expectedDesc: 'RELIANCE RETAIL',
    expectedRef: '631910647565',
  },
  {
    raw: 'ATM-HDFC ATM WITHDRAWAL-631234567890',
    expectedType: 'ATM',
    expectedDesc: 'HDFC ATM WITHDRAWAL',
    expectedRef: '631234567890',
  },
  {
    raw: 'POS-STARBUCKS-TERM01-631908147950',
    expectedType: 'POS',
    expectedDesc: 'STARBUCKS',
    expectedRef: '631908147950',
  },
  {
    raw: 'CHQ-000123456-SOME PAYEE',
    expectedType: 'CHQ',
    expectedDesc: 'SOME PAYEE',
    expectedRef: '123456',
  },
  {
    raw: 'UPI-NASEEMUSSAHAR SAJID PERWEZ ANSARI-*********7PE5@PTA-UTIB0000022-631904988044-SENT USING PAYTM U',
    expectedType: 'UPI',
    expectedDesc: 'NASEEMUSSAHAR SAJID PERWEZ ANSARI',
    expectedRef: '631904988044',
  },
  {
    raw: 'UPI-WESTERN BAKERY AND GENERAL STORES-******1069@YBL-YESB0BLUPI-631910647565-SENT USING PAYTM U',
    expectedType: 'UPI',
    expectedDesc: 'WESTERN BAKERY AND GENERAL STORES',
    expectedRef: '631910647565',
  },
  {
    raw: 'UPI-MOHAMMAD HATIM MOTORWALA-******3723@YBL-YESB0YBLUPI-631247105135-SENT USING PAYTM U',
    expectedType: 'UPI',
    expectedDesc: 'MOHAMMAD HATIM MOTORWALA',
    expectedRef: '631247105135',
  },
];

let failed = 0;
for (const tc of testCases) {
  const res = parseBankNarration(tc.raw, tc.refCol);
  let ok = true;
  if (res.transactionType !== tc.expectedType) {
    console.error(`FAIL: type mismatch for "${tc.raw}". Expected ${tc.expectedType}, got ${res.transactionType}`);
    ok = false;
  }
  if (res.description !== tc.expectedDesc) {
    console.error(`FAIL: desc mismatch for "${tc.raw}". Expected "${tc.expectedDesc}", got "${res.description}"`);
    ok = false;
  }
  if (res.reference !== tc.expectedRef) {
    console.error(`FAIL: ref mismatch for "${tc.raw}". Expected "${tc.expectedRef}", got "${res.reference}"`);
    ok = false;
  }
  if (!ok) failed++;
}

if (failed === 0) {
  console.log(`ALL ${testCases.length} TESTS PASSED!`);
} else {
  console.error(`${failed} TESTS FAILED!`);
  process.exit(1);
}
