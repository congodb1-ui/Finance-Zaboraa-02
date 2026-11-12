import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { Landmark, ArrowUpRight, ArrowDownRight, CreditCard, Wallet, Building2, ShieldCheck } from 'lucide-react';

interface NetWorthCardProps {
  netWorth: number;
  breakdown: { type: string; total: number; count: number }[];
  trendPercentage?: number; // vs same date last month
}

export const NetWorthCard: React.FC<NetWorthCardProps> = ({
  netWorth,
  breakdown,
  trendPercentage = 3.8,
}) => {
  const isPositiveTrend = trendPercentage >= 0;

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'savings':
        return 'Savings Accounts';
      case 'current':
        return 'Current Accounts';
      case 'salary':
        return 'Salary Accounts';
      case 'credit_card':
        return 'Credit Cards (Liability)';
      case 'wallet':
        return 'Digital Wallets';
      default:
        return 'Other Assets';
    }
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'credit_card':
        return <CreditCard className="w-3.5 h-3.5 text-red-500" />;
      case 'wallet':
        return <Wallet className="w-3.5 h-3.5 text-indigo-500" />;
      case 'current':
        return <Building2 className="w-3.5 h-3.5 text-sky-500" />;
      default:
        return <Landmark className="w-3.5 h-3.5 text-emerald-500" />;
    }
  };

  return (
    <Card className="p-5 flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Total Net Worth
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            Consolidated
          </span>
        </div>

        {/* Large Net Worth Figure */}
        <div className="flex flex-wrap items-baseline gap-3 my-2">
          <h2 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 dark:text-white font-tabular tracking-tight">
            {formatINR(netWorth)}
          </h2>

          {/* Trend Indicator vs last month */}
          <div
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-md ${
              isPositiveTrend
                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80'
                : 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/80'
            }`}
          >
            {isPositiveTrend ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            <span>{Math.abs(trendPercentage)}% vs last month</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          Calculated across all active bank accounts, wallets, and credit liabilities.
        </p>

        {/* Asset & Liability Breakdown by Account Type */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Asset & Liability Breakdown
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {breakdown.map((item) => (
              <div
                key={item.type}
                className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {getAccountTypeIcon(item.type)}
                  <span className="text-slate-600 dark:text-slate-300 truncate">
                    {getAccountTypeLabel(item.type)}
                  </span>
                </div>
                <span
                  className={`font-tabular font-semibold shrink-0 ${
                    item.type === 'credit_card' || item.total < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {formatINR(item.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
