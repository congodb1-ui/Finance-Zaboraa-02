import React from 'react';
import { Card } from './Card';
import { formatINR } from '../../types/design-system';
import { ArrowUpRight, ArrowDownLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPICardProps {
  title: string;
  amount: number;
  type?: 'income' | 'expense' | 'balance' | 'net' | 'neutral' | 'pending';
  subtitle?: string;
  changePercentage?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  amount,
  type = 'neutral',
  subtitle,
  changePercentage,
  changeLabel,
  icon,
  className = '',
}) => {
  const isNegative = amount < 0;

  // Determine color styling based on type and value
  const getAmountStyles = () => {
    switch (type) {
      case 'income':
        return 'text-green-600 dark:text-green-400';
      case 'expense':
        return 'text-red-600 dark:text-red-400';
      case 'net':
        return amount >= 0
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400';
      case 'pending':
        return 'text-amber-600 dark:text-amber-400';
      case 'balance':
        return isNegative
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-900 dark:text-white';
      case 'neutral':
      default:
        return 'text-slate-900 dark:text-white';
    }
  };

  const formattedAmount = formatINR(amount, {
    showSign: type === 'income' || (type === 'net' && amount > 0),
    showDecimals: true,
  });

  return (
    <Card className={`p-5 flex flex-col justify-between ${className}`}>
      {/* Top row: Title and Icon */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
            {icon}
          </div>
        )}
      </div>

      {/* Main KPI Amount: Tabular numbers, 700 weight, Manrope/Inter */}
      <div className="mb-2">
        <div
          className={`font-heading font-bold text-2xl sm:text-3xl font-tabular tracking-tight ${getAmountStyles()}`}
        >
          {formattedAmount}
        </div>
        {isNegative && type === 'balance' && (
          <span className="text-xs text-red-500 dark:text-red-400 font-medium">
            (Overdrawn / Due balance)
          </span>
        )}
      </div>

      {/* Footer: Trend or Subtitle */}
      {(subtitle || changePercentage !== undefined) && (
        <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
          {changePercentage !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 font-medium font-tabular ${
                changePercentage > 0
                  ? 'text-green-600 dark:text-green-400'
                  : changePercentage < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {changePercentage > 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : changePercentage < 0 ? (
                <ArrowDownLeft className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              {Math.abs(changePercentage)}%
            </span>
          )}
          {changeLabel && <span>{changeLabel}</span>}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};
