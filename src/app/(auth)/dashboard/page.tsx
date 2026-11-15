'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { NetWorthCard } from '../../../components/dashboard/NetWorthCard';
import { CashflowSummaryCard } from '../../../components/dashboard/CashflowSummaryCard';
import { SpendingByCategoryChart } from '../../../components/dashboard/SpendingByCategoryChart';
import { AccountBalanceList } from '../../../components/dashboard/AccountBalanceList';
import { RecentTransactions } from '../../../components/dashboard/RecentTransactions';
import { TaxProvisionCard } from '../../../components/dashboard/TaxProvisionCard';
import { ExportButtons } from '../../../components/reports/ExportButtons';
import { getDashboardMetrics } from '../../../lib/actions/transactions';
import { getAccounts } from '../../../lib/actions/accounts';
import type { AccountWithBalance } from '../../../types/accounts';
import { AnomalyBanner } from '../../../components/ai/AnomalyBanner';
import { MonthlyReport } from '../../../components/ai/MonthlyReport';
import { BudgetHealthRow } from '../../../components/dashboard/BudgetHealthRow';
import { UpcomingRecurringWidget } from '../../../components/dashboard/UpcomingRecurringWidget';
import { GmailSyncBanner } from '../../../components/dashboard/GmailSyncBanner';
import { Button } from '../../../components/ui/Button';
import { useUserPreferences } from '../../../lib/contexts/UserPreferencesContext';
import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  Filter,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface DashboardFilters {
  fy: string;
  workspace: string;
}

const DEFAULT_FILTERS: DashboardFilters = {
  fy: 'FY2026-27',
  workspace: 'all',
};

const FY_OPTIONS = [
  { value: 'FY2026-27', label: 'FY 2026-27 (Apr 2026 – Mar 2027)' },
  { value: 'FY2025-26', label: 'FY 2025-26 (Apr 2025 – Mar 2026)' },
  { value: 'FY2024-25', label: 'FY 2024-25 (Apr 2024 – Mar 2025)' },
];

export default function DashboardPage() {
  const { aiEnabled } = useUserPreferences();
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  // Load persisted filters or defaults
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('zaboraa_dashboard_filters'); // UI-ONLY, safe to keep local — not synced
        if (saved) return JSON.parse(saved);
      } catch {
        // Fallback
      }
    }
    return DEFAULT_FILTERS;
  });

  const [metrics, setMetrics] = useState<any>(null);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Persist filter changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zaboraa_dashboard_filters', JSON.stringify(filters)); // UI-ONLY, safe to keep local — not synced
      } catch {
        // Ignore
      }
    }
  }, [filters]);

  // Determine FY date bounds
  const getFYDates = (fyString: string) => {
    if (fyString === 'FY2025-26') return { startDate: '2025-04-01', endDate: '2026-03-31' };
    if (fyString === 'FY2024-25') return { startDate: '2024-04-01', endDate: '2025-03-31' };
    return { startDate: '2026-04-01', endDate: '2027-03-31' };
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const dates = getFYDates(filters.fy);
      const [m, accs] = await Promise.all([
        getDashboardMetrics(dates, filters.workspace),
        getAccounts(),
      ]);
      setMetrics(m);
      setAccounts(accs);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigation handlers
  const handleNavigateToTransactionsWithCategory = (catId: string) => {
    window.location.hash = `transactions?category=${catId}`;
  };

  const handleNavigateToAccountDetail = (accId: string) => {
    window.location.hash = `account-detail?id=${accId}`;
  };

  const handleNavigateToAllTransactions = () => {
    window.location.hash = 'transactions';
  };

  const handleNavigateToITR = () => {
    window.location.hash = 'reports-itr';
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Monthly Report Modal Dialog */}
      {isMonthlyReportOpen && (
        <MonthlyReport
          isOpen={isMonthlyReportOpen}
          onClose={() => setIsMonthlyReportOpen(false)}
          aiEnabled={aiEnabled}
        />
      )}

      {/* Sticky Global FY & Workspace Filter Bar */}
      <div className="sticky top-11 md:top-0 z-20 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-3 px-4 sm:px-6 transition-colors shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Title & Batch Indicator */}
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-heading font-bold text-slate-900 dark:text-white text-sm">
              Financial Overview
            </span>
            <span className="hidden sm:inline text-slate-400">•</span>
            <span className="hidden sm:inline text-slate-500 font-mono text-[11px]">
              India Private Vault
            </span>
          </div>

          {/* Filter Dropdowns + Monthly Report + Export Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Monthly Report Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMonthlyReportOpen(true)}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
            >
              Monthly Report
            </Button>

            {/* FY Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filters.fy}
                onChange={(e) => setFilters((prev) => ({ ...prev, fy: e.target.value }))}
                className="bg-transparent text-xs font-semibold focus:outline-hidden cursor-pointer"
                aria-label="Select Financial Year"
              >
                {FY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Workspace Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filters.workspace}
                onChange={(e) => setFilters((prev) => ({ ...prev, workspace: e.target.value }))}
                className="bg-transparent text-xs font-semibold focus:outline-hidden cursor-pointer"
                aria-label="Filter by Workspace"
              >
                <option value="all">All Workspaces</option>
                <option value="Personal">Personal Workspace</option>
                <option value="Business">Business Workspace</option>
                <option value="Mixed">Mixed / Both</option>
              </select>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Refresh dashboard data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Export Component */}
            <ExportButtons fy={filters.fy} workspace={filters.workspace} />
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Anomaly Detection Banner */}
        <AnomalyBanner aiEnabled={aiEnabled} />

        {/* Row 1: Two Column Grid (Desktop) / Single Column (Mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Net Worth Card */}
          <NetWorthCard
            netWorth={metrics?.netWorth ?? 0}
            breakdown={metrics?.accountBreakdown ?? []}
            trendPercentage={3.8}
          />

          {/* Tax Provision Card */}
          <TaxProvisionCard
            businessIncome={metrics?.taxProvision?.businessIncome ?? 0}
            businessExpense={metrics?.taxProvision?.businessExpense ?? 0}
            taxableProfit={metrics?.taxProvision?.taxableProfit ?? 0}
            taxProvision={metrics?.taxProvision?.taxProvision ?? 0}
            onViewITRReport={handleNavigateToITR}
          />
        </div>

        {/* Dismissable Gmail Auto-Import Sync Banner */}
        <GmailSyncBanner />

        {/* Compact Budget Health Row */}
        <BudgetHealthRow />

        {/* Row 2: Cashflow Summary Card (Full width or Two Column) */}
        <CashflowSummaryCard
          totalIncome={metrics?.totalIncome ?? 0}
          totalExpenses={metrics?.totalExpenses ?? 0}
          netCashflow={metrics?.netCashflow ?? 0}
          monthlyData={metrics?.monthlyCashflow ?? []}
        />

        {/* Row 3: Two Column Grid for Spending by Category Donut & Upcoming Recurring Bills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spending by Category Donut Chart */}
          <SpendingByCategoryChart
            categories={metrics?.spendingByCategory ?? []}
            onSelectCategory={handleNavigateToTransactionsWithCategory}
          />

          {/* Upcoming Recurring Bills Widget */}
          <UpcomingRecurringWidget />
        </div>

        {/* Row 4: Account Health & Balance List */}
        <AccountBalanceList
          accounts={accounts}
          onSelectAccount={handleNavigateToAccountDetail}
        />

        {/* Row 5: Recent Transactions */}
        <RecentTransactions
          transactions={metrics?.recentTransactions ?? []}
          onViewAll={handleNavigateToAllTransactions}
          onSelectTransaction={() => handleNavigateToAllTransactions()}
        />
      </div>
    </div>
  );
}
