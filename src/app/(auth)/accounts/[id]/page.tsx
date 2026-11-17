'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BalanceChart } from '../../../../components/accounts/BalanceChart';
import { AccountLedger } from '../../../../components/accounts/AccountLedger';
import { StatementHistory } from '../../../../components/accounts/StatementHistory';
import { AccountForm } from '../../../../components/accounts/AccountForm';
import { TransactionRow } from '../../../../components/transactions/TransactionRow';
import { Card } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { formatINR, CATEGORY_PALETTE } from '../../../../types/design-system';
import { getAccountById, updateAccount, getAccounts } from '../../../../lib/actions/accounts';
import { getAccountLedgerWithRunningBalance } from '../../../../lib/actions/transactions';
import { getCategories } from '../../../../lib/actions/categories';
import { getWorkspaces } from '../../../../lib/actions/workspaces';
import { getUploads } from '../../../../lib/actions/upload';
import { apiPatch } from '../../../../lib/api-client';
import type { AccountFormData, AccountWithBalance } from '../../../../types/accounts';
import {
  getAccountLocalPrefs,
  hasSavedAccountPdfPassword,
} from '../../../../lib/account-local-prefs';
import type { Category } from '../../../../types/categories';
import type { Workspace } from '../../../../types/workspaces';
import type { StatementUpload } from '../../../../types/uploads';
import type { Transaction } from '../../../../types/transactions';
import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface AccountDetailPageProps {
  accountId?: string;
  onBack?: () => void;
}

export default function AccountDetailPage({
  accountId: propAccountId,
  onBack,
}: AccountDetailPageProps) {
  // Determine account ID from prop or URL hash (e.g. #account-detail?id=acc_hdfc_01)
  const [accountId, setAccountId] = useState<string>(() => {
    if (propAccountId) return propAccountId;
    if (typeof window !== 'undefined') {
      const match = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    return 'acc_hdfc_01';
  });

  useEffect(() => {
    if (propAccountId && propAccountId !== accountId) {
      setAccountId(propAccountId);
    }
  }, [propAccountId, accountId]);

  const [account, setAccount] = useState<AccountWithBalance | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [uploads, setUploads] = useState<StatementUpload[]>([]);
  const [transactions, setTransactions] = useState<
    (Transaction & { calculated_running_balance: number })[]
  >([]);
  const [dailyBalancePoints, setDailyBalancePoints] = useState<
    { date: string; balance: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [activeTransactionForDrawer, setActiveTransactionForDrawer] = useState<Transaction | null>(null);

  // Filters for the account ledger
  const [filterDates, setFilterDates] = useState({
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  });

  const loadAccountData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [acc, accs, cats, wss, allUploads, ledgerData] = await Promise.all([
        getAccountById(accountId),
        getAccounts(),
        getCategories(),
        getWorkspaces(),
        getUploads(),
        getAccountLedgerWithRunningBalance(accountId, {
          startDate: filterDates.startDate,
          endDate: filterDates.endDate,
        }),
      ]);

      setAccount(acc);
      setAllAccounts(accs);
      setCategories(cats);
      setWorkspaces(wss);
      setUploads(allUploads.filter((u) => u.account_id === accountId));
      setTransactions(ledgerData.transactions);
      setDailyBalancePoints(ledgerData.dailyBalancePoints);
    } catch (err) {
      console.error('Failed to load account detail:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, filterDates]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const handleFilterChange = async (filters: {
    startDate: string;
    endDate: string;
    categoryId: string;
    txnType: string;
    search: string;
  }) => {
    setFilterDates({ startDate: filters.startDate, endDate: filters.endDate });
    try {
      const ledgerData = await getAccountLedgerWithRunningBalance(accountId, filters);
      setTransactions(ledgerData.transactions);
      setDailyBalancePoints(ledgerData.dailyBalancePoints);
    } catch (err) {
      console.error('Filter query error:', err);
    }
  };

  const handleSaveTransaction = async (id: string, updates: any) => {
    const updatedTx = await apiPatch<Transaction>(`/api/transactions/${id}`, updates);
    await loadAccountData();
    if (updatedTx) {
      setActiveTransactionForDrawer(updatedTx);
    }
  };

  const handleEditSubmit = async (formData: AccountFormData): Promise<AccountWithBalance | void> => {
    if (!account) return;
    setIsSavingEdit(true);
    setSaveNotice(null);
    try {
      const updated = await updateAccount(account.id, formData);
      setAccount(updated);
      setIsEditOpen(false);
      await loadAccountData();
      setSaveNotice('Account details updated successfully.');
      setTimeout(() => setSaveNotice(null), 4000);
      return updated;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.hash = 'accounts';
    }
  };

  if (!account && !isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Account not found</h2>
        <Button variant="outline" size="sm" onClick={handleBackClick} className="mt-4">
          Back to Accounts
        </Button>
      </div>
    );
  }

  const isCreditCard = account?.account_type === 'credit_card';
  const colorHex = CATEGORY_PALETTE[account?.color_index ?? 0] || '#6366F1';
  const latestBalance =
    transactions.length > 0 ? transactions[0].calculated_running_balance : account?.current_balance ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-24">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            aria-label="Back to accounts list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
              <span>Accounts</span>
              <span>•</span>
              <span className="font-mono text-slate-600 dark:text-slate-400">
                {account?.bank_name}
              </span>
              {account && !account.is_active && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  Inactive
                </span>
              )}
            </div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{ backgroundColor: colorHex }}
              />
              {account?.name}
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            disabled={!account}
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAccountData}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => (window.location.hash = account ? `upload?account=${account.id}` : 'upload')}
          >
            Upload Statement
          </Button>
        </div>
      </div>

      {saveNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Account KPI Header Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Current Balance */}
        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            {isCreditCard ? 'Current Outstanding Balance' : 'Current Running Balance'}
          </span>
          <div
            className={`font-heading font-extrabold text-2xl font-tabular ${
              latestBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatINR(latestBalance)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Calculated from opening balance + ledger entries
          </span>
        </Card>

        {/* Opening Balance */}
        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Opening Balance
          </span>
          <div className="font-heading font-bold text-2xl text-slate-800 dark:text-slate-200 font-tabular">
            {formatINR(account?.opening_balance ?? 0)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {account?.opening_date
              ? `As of ${account.opening_date}`
              : 'Account initial baseline balance'}
          </span>
        </Card>

        {/* Details & Purpose */}
        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Account Metadata &amp; Local Vault
          </span>
          <div className="text-xs space-y-1 font-mono text-slate-700 dark:text-slate-300">
            <div>Holder: {account?.account_holder_name || 'Not specified'}</div>
            <div>
              Type: {account?.account_type.replace('_', ' ')} ({account?.purpose || 'personal'})
            </div>
            <div>
              Last 4: {account?.account_number_last4 ? `****${account.account_number_last4}` : 'N/A'}
              {account?.ifsc ? ` · IFSC: ${account.ifsc}` : ''}
            </div>
            {account?.upi_id && <div>UPI: {account.upi_id}</div>}
            <div>
              Self-Transfer Eligible: {account?.operated_by_owner === false ? 'No (Family Member)' : 'Yes (Owner Operated)'}
            </div>
            {account && (
              <div className="pt-1 flex items-center justify-between gap-2">
                <span>
                  PDF Password:{' '}
                  <strong
                    className={
                      hasSavedAccountPdfPassword(account.id)
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {hasSavedAccountPdfPassword(account.id) ? 'Saved Locally' : 'Not Saved'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-sans cursor-pointer"
                >
                  {hasSavedAccountPdfPassword(account.id) ? 'Update' : 'Set Password'}
                </button>
              </div>
            )}
            {account && getAccountLocalPrefs(account.id).customerIdOrCrn && (
              <div>Cust ID / CRN: {getAccountLocalPrefs(account.id).customerIdOrCrn}</div>
            )}
          </div>
        </Card>
      </div>

      {/* 1. Daily Balance Area Chart */}
      <BalanceChart
        data={dailyBalancePoints}
        accountName={account?.name || 'Account'}
      />

      {/* 2. Account Ledger with Running Balance */}
      <AccountLedger
        transactions={transactions}
        categories={categories}
        startDate={filterDates.startDate}
        endDate={filterDates.endDate}
        onFilterChange={handleFilterChange}
        onRowClick={(tx) => setActiveTransactionForDrawer(tx)}
      />

      {/* 3. Statement Upload History */}
      <StatementHistory uploads={uploads} />

      {/* Edit Account Modal */}
      {isEditOpen && account && (
        <AccountForm
          initialData={account}
          onSubmit={handleEditSubmit}
          onCancel={() => setIsEditOpen(false)}
          isLoading={isSavingEdit}
        />
      )}

      {/* Transaction Detail / Payee Edit Drawer */}
      <TransactionRow
        transaction={activeTransactionForDrawer}
        isOpen={Boolean(activeTransactionForDrawer)}
        onClose={() => setActiveTransactionForDrawer(null)}
        onSave={handleSaveTransaction}
        categories={categories}
        workspaces={workspaces}
        accounts={allAccounts}
      />
    </div>
  );
}
