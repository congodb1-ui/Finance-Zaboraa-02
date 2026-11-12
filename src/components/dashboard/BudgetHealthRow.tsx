import React, { useState, useEffect } from 'react';
import type { BudgetWithSpending } from '../../types/budgets';
import { getBudgetHealthSummary } from '../../lib/actions/budgets';
import { formatINR, CATEGORY_PALETTE } from '../../types/design-system';
import { Card } from '../ui/Card';
import { Target, ArrowRight, AlertTriangle } from 'lucide-react';

export const BudgetHealthRow: React.FC = () => {
  const [budgets, setBudgets] = useState<BudgetWithSpending[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getBudgetHealthSummary(3);
        setBudgets(data);
      } catch (err) {
        console.error('Failed to load budget health summary:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || budgets.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
            Budget Health & Pace (Top Limits)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => (window.location.hash = 'budgets')}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>All budgets</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3 Categories Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {budgets.map((b) => {
          const percentage = Math.min(100, Math.max(0, b.percentage));
          const isOver = b.isOverBudget;
          let barColor = 'bg-emerald-500';
          if (isOver || b.percentage > 90) barColor = 'bg-red-500';
          else if (b.percentage >= 70) barColor = 'bg-amber-500';

          const catColor =
            b.category?.color_index !== undefined
              ? CATEGORY_PALETTE[b.category.color_index % CATEGORY_PALETTE.length]
              : '#6366F1';

          return (
            <div
              key={b.id}
              onClick={() => (window.location.hash = `transactions?category=${b.category_id || ''}`)}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: catColor }}
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {b.category?.name || 'Category'}
                  </span>
                </div>
                <span
                  className={`font-semibold font-tabular text-[11px] ${
                    isOver ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isOver ? 'Over budget' : `${b.percentage}%`}
                </span>
              </div>

              {/* Bar */}
              <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {/* Figures */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-tabular">
                <span>Spent: {formatINR(b.spent)}</span>
                <span>Limit: {formatINR(b.amount)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
