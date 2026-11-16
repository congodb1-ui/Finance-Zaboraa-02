import { parsePDFHDFC, cleanHdfcNarration } from '../src/lib/parsers/pdf-hdfc';
import type { PDFExtractionResult } from '../src/lib/parsers/pdf';

function testHDFCNarrationCleaner() {
  console.log('Testing HDFC Narration Cleaner...');

  const testCases = [
    {
      raw: 'UPI-NASEEMUSSAHAR SAJID PERWEZ ANSARI-*********7PE5@PTA-UTIB0000022-631904988044-SENT USING PAYTM U',
      refCol: '0000631904988044',
      expectedDesc: 'NASEEMUSSAHAR SAJID PERWEZ ANSARI',
      expectedRef: '631904988044',
    },
    {
      raw: 'UPI-BISMA ENTERPRISES-****************055J@PAYTM-PYTM0123456-631911560009-SENT USING PAYTM U',
      refCol: '0000631911560009',
      expectedDesc: 'BISMA ENTERPRISES',
      expectedRef: '631911560009',
    },
    {
      raw: 'UPI-BHAWANI SUPER MARKET-*********ZGYE@PTY-PYTM0123456-631910792761-SENT USING PAYTM U',
      refCol: '0000631910792761',
      expectedDesc: 'BHAWANI SUPER MARKET',
      expectedRef: '631910792761',
    },
    {
      raw: 'UPI-Western Bakery And General Stores-paytm-62432616@paytm-PYTM0123456-631910647565-SENT USING PAYTM U',
      refCol: '0000631910647565',
      expectedDesc: 'Western Bakery And General Stores',
      expectedRef: '631910647565',
    },
    {
      raw: 'UPI-RELIEF CHEMIST@YESB0BLUPI-YESB0000001-631908147950-SENT USING PAYTM U',
      refCol: '0000631908147950',
      expectedDesc: 'RELIEF CHEMIST',
      expectedRef: '631908147950',
    },
    {
      raw: 'UPI-MOHAMMAD HATIM MOTORWALA-*****1069@YBL-YESB0000001-631803023475-SENT USING PAYTM U',
      refCol: '0000631803023475',
      expectedDesc: 'MOHAMMAD HATIM MOTORWALA',
      expectedRef: '631803023475',
    },
    {
      raw: 'ATM-HDFC ATM WITHDRAWAL-631234567890',
      refCol: '631234567890',
      expectedDesc: 'HDFC ATM WITHDRAWAL',
      expectedRef: '631234567890',
    },
    {
      raw: 'NEFT-MERCHANT NAME-N2611151234567',
      refCol: 'N2611151234567',
      expectedDesc: 'MERCHANT NAME',
      expectedRef: 'N2611151234567',
    },
    {
      raw: 'CHQ-123456-SOME PAYEE',
      refCol: '000123456',
      expectedDesc: 'SOME PAYEE',
      expectedRef: '123456',
    },
  ];

  for (const tc of testCases) {
    const res = cleanHdfcNarration(tc.raw, tc.refCol);
    console.assert(
      res.cleanDescription.toLowerCase() === tc.expectedDesc.toLowerCase(),
      `Expected ${tc.expectedDesc}, got ${res.cleanDescription}`
    );
    console.assert(
      res.reference === tc.expectedRef,
      `Expected ref ${tc.expectedRef}, got ${res.reference}`
    );
  }
  console.log('HDFC Narration Cleaner unit test passed cleanly!');
}

function testHDFCParser() {
  console.log('Testing HDFC PDF parser debit/credit detection...');

  const mockPdfData: PDFExtractionResult = {
    openingBalance: 100000,
    closingBalance: 140000,
    fullDocumentText: 'HDFC Bank Statement of Account',
    allGridRows: [],
    pages: [
      {
        pageNumber: 1,
        fullText: 'HDFC Bank Statement',
        textItems: [],
        gridRows: [
          ['Date', 'Narration', 'Chq/Ref No', 'Value Dt', 'Withdrawal', 'Deposit', 'Balance'],
          ['01/04/2024', 'UPI-DEBIT-PAYMENT-1', '01/04/2024', 'REF101', '10000.00', '90000.00'], // 6 cells: 10k outflow -> bal 90k
          ['05/04/2024', 'SALARY CREDIT BY COMPANY', '05/04/2024', 'REF102', '50000.00', '140000.00'], // 6 cells: 50k inflow -> bal 140k
        ],
      },
    ],
  };

  parsePDFHDFC(new Uint8Array(0), mockPdfData).then((res) => {
    console.assert(res.rows.length === 2, `Expected 2 rows, got ${res.rows.length}`);
    const row1 = res.rows[0];
    const row2 = res.rows[1];

    console.assert(row1.Debit === '10000', `Row 1 Debit expected 10000, got ${row1.Debit}`);
    console.assert(row1.Credit === '', `Row 1 Credit expected empty, got ${row1.Credit}`);

    console.assert(row2.Credit === '50000', `Row 2 Credit expected 50000, got ${row2.Credit}`);
    console.assert(row2.Debit === '', `Row 2 Debit expected empty, got ${row2.Debit}`);

    let totalDebits = 0;
    let totalCredits = 0;
    for (const r of res.rows) {
      if (r.Debit) totalDebits += parseFloat(r.Debit);
      if (r.Credit) totalCredits += parseFloat(r.Credit);
    }

    const netChange = totalCredits - totalDebits;
    console.assert(netChange === 40000, `Expected net change 40000, got ${netChange}`);
    console.log('HDFC Parser Debit/Credit unit test passed cleanly!');
  });
}

testHDFCNarrationCleaner();
testHDFCParser();
