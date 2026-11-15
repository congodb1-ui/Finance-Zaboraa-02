import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from './_lib/middleware';
import { getAllTransactions, getITRSummaryData } from '../src/lib/actions/transactions';
import { getAccounts } from '../src/lib/actions/accounts';
import { getWorkspaces } from '../src/lib/actions/workspaces';
import { getCurrentFY, getFYBounds } from '../src/lib/fy-utils';
import * as XLSX from 'xlsx';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const format = (req.query.format as string) || 'xlsx';
    const fy = (req.query.fy as string) || getCurrentFY().shortLabel;
    const workspace = (req.query.workspace as string) || 'all';

    if (format === 'tally') {
      return res.status(501).json({
        error: 'TALLY_EXPORT_COMING_SOON',
        message: 'Tally XML export is coming in a future update.',
      });
    }

    const { start: startDate, end: endDate } = getFYBounds(fy);

    const [allTxns, accounts, workspaces, itrData] = await Promise.all([
      getAllTransactions(req.supabase),
      getAccounts(req.supabase),
      getWorkspaces(req.supabase),
      getITRSummaryData({ startDate, endDate }, req.supabase),
    ]);

    let filteredTxns = allTxns.filter(
      (t: any) => t.txn_date >= startDate && t.txn_date <= endDate
    );
    if (workspace && workspace !== 'all') {
      const matchedWs = workspaces.find(
        (w: any) => w.id === workspace || w.name.toLowerCase() === workspace.toLowerCase()
      );
      const wsLower = workspace.toLowerCase();
      filteredTxns = filteredTxns.filter((t: any) => {
        if (matchedWs && t.workspace_id === matchedWs.id) return true;
        if (t.workspace_id === workspace) return true;
        return (t.workspace?.name || '').toLowerCase() === wsLower;
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const csvRows = filteredTxns.map((t: any) => ({
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

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="zaboraa-transactions-${fy}-${todayStr}.csv"`
      );
      return res.send(csvContent);
    }

    const workbook = XLSX.utils.book_new();

    const txnSheetRows = filteredTxns.map((t: any) => ({
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

    const itrRows = itrData.lineItems.map((item: any) => ({
      Section: item.section,
      'Line Item': item.lineItem,
      'Amount (INR)': Number(item.amount),
    }));
    const sheet2 = XLSX.utils.json_to_sheet(itrRows);
    sheet2['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet2, 'ITR Summary');

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

    const accSummaryRows = accounts.map((acc: any) => {
      const accTxns = filteredTxns.filter((t: any) => t.account_id === acc.id);
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

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zaboraa-export-${fy}-${todayStr}.xlsx"`
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('Export route error:', err);
    return res.status(500).json({ error: 'Internal error generating financial export.' });
  }
}
