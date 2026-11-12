import React from 'react';
import type { BudgetWithSpending } from '../../types/budgets';
import { formatINR, CATEGORY_PALETTE } from '../../types/design-system';
import { Card } from '../ui/Card';
import { AlertTriangle, ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';

interface BudgetCardProps {
  budget: BudgetWithSpending;
  onClick?: () => void;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onClick }) => {
  const percentage = Math.min(100, Math.max(0, budget.percentage));
  const isOver = budget.isOverBudget;

  // Threshold colors: green 0-70%, amber 70-90%, red >90%
  let barColor = 'bg-emerald-500';
  let badgeColor = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300';

  if (isOver || budget.percentage > 90) {
    barColor = 'bg-red-500';
    badgeColor = 'text-red-700 bg-red-50 dark:bg-red-950/60 dark:text-red-300';
  } else if (budget.percentage >= 70) {
    barColor = 'bg-amber-500';
    badgeColor = 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300';
  }

  const categoryColor =
    budget.category?.color_index !== undefined
      ? CATEGORY_PALETTE[budget.category.color_index % CATEGORY_PALETTE.length]
      : '#6366F1';

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (budget.category_id) {
      window.location.hash = `transactions?category=${budget.category_id}`;
    }
  };

  return (
    <Card
      onClick={handleClick}
      className="p-5 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all cursor-pointer group shadow-2xs space-y-4"
    >
      {/* Card Header: Category + Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ backgroundColor: categoryColor }}
          />
          <div>
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {budget.category?.name || 'Uncategorized'}
            </h3>
            <span className="text-[11px] font-mono text-slate-500 capitalize">
              {budget.period} • FY {budget.fy_year}
            </span>
          </div>
        </div>

        {isOver ? (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-900 shrink-0">
            Over budget
          </span>
        ) : (
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${badgeColor}`}>
            {budget.percentage}% spent
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Spending Figures Breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs">
        <div>
          <span className="text-[11px] text-slate-400 block mb-0.5">Budget</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 font-tabular">
            {formatINR(budget.amount)}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-slate-400 block mb-0.5">Spent</span>
          <span
            className={`font-semibold font-tabular ${
              isOver ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            {formatINR(budget.spent)}
          </span>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-400 block mb-0.5">Remaining</span>
          <span
            className={`font-semibold font-tabular ${
              isOver
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isOver ? `−${formatINR(budget.spent - budget.amount)}` : formatINR(budget.remaining)}
          </span>
        </div>
      </div>
    </Card>
  );
};
