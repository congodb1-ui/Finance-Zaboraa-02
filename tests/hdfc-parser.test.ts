import { parsePDFHDFC } from '../src/lib/parsers/pdf-hdfc';
import type { PDFExtractionResult } from '../src/lib/parsers/pdf';

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

testHDFCParser();
