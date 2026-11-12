'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BalanceChart } from '../../../../components/accounts/BalanceChart';
import { AccountLedger } from '../../../../components/accounts/AccountLedger';
import { StatementHistory } from '../../../../components/accounts/StatementHistory';
import { Card } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { formatINR, CATEGORY_PALETTE } from '../../../../types/design-system';
import { getAccountById, getAccounts } from '../../../../lib/actions/accounts';
import { getAccountLedgerWithRunningBalance } from '../../../../lib/actions/transactions';
import { getCategories } from '../../../../lib/actions/categories';
import { getUploads } from '../../../../lib/actions/upload';
import type { AccountWithBalance } from '../../../../types/accounts';
import type { Category } from '../../../../types/categories';
import type { StatementUpload } from '../../../../types/uploads';
import type { Transaction } from '../../../../types/transactions';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Landmark,
  Wallet,
  RefreshCw,
  Clock,
  ShieldCheck,
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

  const [account, setAccount] = useState<AccountWithBalance | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uploads, setUploads] = useState<StatementUpload[]>([]);
  const [transactions, setTransactions] = useState<
    (Transaction & { calculated_running_balance: number })[]
  >([]);
  const [dailyBalancePoints, setDailyBalancePoints] = useState<
    { date: string; balance: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters for the account ledger
  const [filterDates, setFilterDates] = useState({
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  });

  const loadAccountData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [acc, cats, allUploads, ledgerData] = await Promise.all([
        getAccountById(accountId),
        getCategories(),
        getUploads(),
        getAccountLedgerWithRunningBalance(accountId, {
          startDate: filterDates.startDate,
          endDate: filterDates.endDate,
        }),
      ]);

      setAccount(acc);
      setCategories(cats);
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
            onClick={loadAccountData}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => (window.location.hash = 'upload')}
          >
            Upload Statement
          </Button>
        </div>
      </div>

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
            Account initial baseline balance
          </span>
        </Card>

        {/* Details & Purpose */}
        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Account Metadata
          </span>
          <div className="text-xs space-y-1 font-mono text-slate-700 dark:text-slate-300">
            <div>Type: {account?.account_type.replace('_', ' ')}</div>
            <div>Account Last 4: {account?.account_number_last4 ? `****${account.account_number_last4}` : 'N/A'}</div>
            <div>Purpose: {account?.purpose || 'General Financial'}</div>
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
      />

      {/* 3. Statement Upload History */}
      <StatementHistory uploads={uploads} />
    </div>
  );
}
