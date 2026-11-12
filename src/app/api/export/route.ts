import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getAllTransactions, getITRSummaryData } from '../../../lib/actions/transactions';
import { getAccounts } from '../../../lib/actions/accounts';
import { getCategories } from '../../../lib/actions/categories';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'xlsx';
    const fy = searchParams.get('fy') || 'FY2026-27';
    const workspace = searchParams.get('workspace') || 'all';

    // 1. Tally XML Export stub (HTTP 501)
    if (format === 'tally') {
      return NextResponse.json(
        {
          error: 'TALLY_EXPORT_COMING_SOON',
          message: 'Tally XML export is coming in a future update.',
        },
        { status: 501 }
      );
    }

    // Determine FY date window
    let startDate = '2026-04-01';
    let endDate = '2027-03-31';
    if (fy === 'FY2025-26') {
      startDate = '2025-04-01';
      endDate = '2026-03-31';
    } else if (fy === 'FY2024-25') {
      startDate = '2024-04-01';
      endDate = '2025-03-31';
    }

    const [allTxns, accounts, categories, itrData] = await Promise.all([
      getAllTransactions(),
      getAccounts(),
      getCategories(),
      getITRSummaryData({ startDate, endDate }),
    ]);

    // Filter transactions by FY and workspace
    let filteredTxns = allTxns.filter((t) => t.txn_date >= startDate && t.txn_date <= endDate);
    if (workspace && workspace !== 'all') {
      filteredTxns = filteredTxns.filter((t) => {
        if (workspace === 'Personal') return t.workspace_id === 'ws_personal';
        if (workspace === 'Business') return t.workspace_id === 'ws_business';
        if (workspace === 'Mixed') return t.workspace_id === 'ws_mixed';
        return t.workspace_id === workspace;
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. CSV EXPORT
    if (format === 'csv') {
      const csvRows = filteredTxns.map((t) => ({
        'Transaction ID': t.id,
        Date: t.txn_date,
        Description: t.description,
        'Raw Description': t.raw_description || '',
        Account: t.account?.name || '',
        'Bank Name': t.account?.bank_name || '',
        Category: t.category?.name || 'Uncategorized',
        Workspace: t.workspace?.name || 'Personal',
        'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : '',
        'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : '',
        'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : '',
        'Reference / UTR': t.reference_number || '',
        'Is Transfer': t.is_transfer ? 'YES' : 'NO',
        'Transfer Pair ID': t.transfer_pair_id || '',
        'Transaction Type': t.txn_type || '',
        Tags: (t.tags || []).join('; '),
        Notes: t.notes || '',
        'Is Manual': t.is_manual ? 'YES' : 'NO',
      }));

      const worksheet = XLSX.utils.json_to_sheet(csvRows);
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="zaboraa-transactions-${fy}-${todayStr}.csv"`,
        },
      });
    }

    // 3. EXCEL EXPORT (4 Sheets: Transactions, ITR Summary, Category Breakdown, Account Summary)
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Transactions
    const txnSheetRows = filteredTxns.map((t) => ({
      'Transaction ID': t.id,
      Date: t.txn_date,
      Description: t.description,
      'Raw Description': t.raw_description || '',
      Account: t.account?.name || '',
      'Bank Name': t.account?.bank_name || '',
      Category: t.category?.name || 'Uncategorized',
      Workspace: t.workspace?.name || 'Personal',
      'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
      'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
      'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
      'Reference / UTR': t.reference_number || '',
      'Is Transfer': t.is_transfer ? 'YES' : 'NO',
      'Transfer Pair ID': t.transfer_pair_id || '',
      'Transaction Type': t.txn_type || '',
      Tags: (t.tags || []).join('; '),
      Notes: t.notes || '',
      'Is Manual': t.is_manual ? 'YES' : 'NO',
    }));
    const sheet1 = XLSX.utils.json_to_sheet(txnSheetRows);
    sheet1['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet1, 'Transactions');

    // Sheet 2: ITR Summary
    const itrRows = itrData.lineItems.map((item) => ({
      Section: item.section,
      'Line Item': item.lineItem,
      'Amount (INR)': Number(item.amount),
    }));
    const sheet2 = XLSX.utils.json_to_sheet(itrRows);
    sheet2['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet2, 'ITR Summary');

    // Sheet 3: Category Breakdown
    const catMap = new Map<string, { debits: number; credits: number; count: number }>();
    for (const t of filteredTxns) {
      const cName = t.category?.name || 'Uncategorized';
      const cur = catMap.get(cName) || { debits: 0, credits: 0, count: 0 };
      cur.debits += t.debit ?? 0;
      cur.credits += t.credit ?? 0;
      cur.count += 1;
      catMap.set(cName, cur);
    }
    const catRows = Array.from(catMap.entries()).map(([cName, data]) => ({
      Category: cName,
      'Total Debit Outflows (INR)': Math.round(data.debits * 100) / 100,
      'Total Credit Inflows (INR)': Math.round(data.credits * 100) / 100,
      'Transaction Count': data.count,
    }));
    const sheet3 = XLSX.utils.json_to_sheet(catRows);
    sheet3['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet3, 'Category Breakdown');

    // Sheet 4: Account Summary
    const accSummaryRows = accounts.map((acc) => {
      const accTxns = filteredTxns.filter((t) => t.account_id === acc.id);
      let totalC = 0;
      let totalD = 0;
      for (const tx of accTxns) {
        totalC += tx.credit ?? 0;
        totalD += tx.debit ?? 0;
      }
      const openBal = acc.opening_balance ?? 0;
      const closing = openBal + totalC - totalD;

      return {
        'Account Nickname': acc.name,
        'Bank Name': acc.bank_name,
        'Account Type': acc.account_type,
        'Opening Balance (INR)': Number(openBal),
        'Total Credits (INR)': Math.round(totalC * 100) / 100,
        'Total Debits (INR)': Math.round(totalD * 100) / 100,
        'Closing Balance (INR)': Math.round(closing * 100) / 100,
      };
    });
    const sheet4 = XLSX.utils.json_to_sheet(accSummaryRows);
    sheet4['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet4, 'Account Summary');

    // Generate Excel buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="zaboraa-export-${fy}-${todayStr}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Export route error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error generating financial export.' },
      { status: 500 }
    );
  }
}
