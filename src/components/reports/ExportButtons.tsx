import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../ui/Button';
import { FileSpreadsheet, Download, FileText, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { getAllTransactions, getITRSummaryData } from '../../lib/actions/transactions';
import { getAccounts } from '../../lib/actions/accounts';
import { getFYBounds } from '../../lib/fy-utils';

interface ExportButtonsProps {
  fy: string;
  workspace: string;
  className?: string;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ fy, workspace, className = '' }) => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Determine FY date bounds using dynamic utils
  const getFYDates = (fyString: string) => {
    const bounds = getFYBounds(fyString);
    return { startDate: bounds.start, endDate: bounds.end };
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const dates = getFYDates(fy);
      const [allTxns, accounts, itrData] = await Promise.all([
        getAllTransactions(),
        getAccounts(),
        getITRSummaryData(dates),
      ]);

      let filteredTxns = allTxns.filter(
        (t) => t.txn_date >= dates.startDate && t.txn_date <= dates.endDate
      );

      if (workspace && workspace !== 'all') {
        filteredTxns = filteredTxns.filter((t) => {
          if (workspace === 'Personal') return t.workspace_id === 'ws_personal';
          if (workspace === 'Business') return t.workspace_id === 'ws_business';
          if (workspace === 'Mixed') return t.workspace_id === 'ws_mixed';
          return t.workspace_id === workspace;
        });
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Transactions
      const txnRows = filteredTxns.map((t) => ({
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
      const sheet1 = XLSX.utils.json_to_sheet(txnRows);
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

      // Trigger client download
      XLSX.writeFile(workbook, `zaboraa-export-${fy}-${todayStr}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const dates = getFYDates(fy);
      const allTxns = await getAllTransactions();

      let filteredTxns = allTxns.filter(
        (t) => t.txn_date >= dates.startDate && t.txn_date <= dates.endDate
      );

      if (workspace && workspace !== 'all') {
        filteredTxns = filteredTxns.filter((t) => {
          if (workspace === 'Personal') return t.workspace_id === 'ws_personal';
          if (workspace === 'Business') return t.workspace_id === 'ws_business';
          if (workspace === 'Mixed') return t.workspace_id === 'ws_mixed';
          return t.workspace_id === workspace;
        });
      }

      const todayStr = new Date().toISOString().split('T')[0];
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
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `zaboraa-transactions-${fy}-${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setIsExportingCSV(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Excel Export (4 sheets) */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportExcel}
        isLoading={isExportingExcel}
        leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
        title="Download complete Excel workbook with Transactions, ITR Summary, Category Breakdown, and Account Summary"
      >
        Export Excel
      </Button>

      {/* CSV Export */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCSV}
        isLoading={isExportingCSV}
        leftIcon={<Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
        title="Download CSV of filtered transactions"
      >
        Export CSV
      </Button>

      {/* Tally XML Export (stubbed disabled with tooltip) */}
      <div className="relative group inline-block">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 cursor-not-allowed opacity-60"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Export Tally</span>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap p-2 rounded-lg bg-slate-900 text-white text-[11px] shadow-xl border border-slate-700">
          Tally export — coming in a future update
        </div>
      </div>
    </div>
  );
};
