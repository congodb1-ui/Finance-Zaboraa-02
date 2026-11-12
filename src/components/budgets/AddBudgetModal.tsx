import React, { useState } from 'react';
import type { BudgetFormData, BudgetPeriod } from '../../types/budgets';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Target, AlertCircle } from 'lucide-react';

interface AddBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BudgetFormData) => Promise<void>;
  categories: Category[];
  workspaces: Workspace[];
  defaultFY?: string;
}

export const AddBudgetModal: React.FC<AddBudgetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categories,
  workspaces,
  defaultFY = '2026-27',
}) => {
  if (!isOpen) return null;

  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [workspaceId, setWorkspaceId] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [fyYear, setFyYear] = useState(defaultFY);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = parseFloat(amount);
    if (!categoryId) {
      setErrorMsg('Please select a category.');
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg('Please specify a positive budget amount.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        category_id: categoryId,
        workspace_id: workspaceId || null,
        period,
        fy_year: fyYear,
        amount: parsed,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create budget.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Set Category Budget
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Define target spending limits by financial year and period
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Category selection */}
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Category *
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.is_income ? 'Income' : 'Expense'})
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Budget Amount (INR) *
            </label>
            <Input
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 15000"
              required
            />
          </div>

          {/* Period & FY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Period *
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Financial Year *
              </label>
              <select
                value={fyYear}
                onChange={(e) => setFyYear(e.target.value)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              >
                <option value="2026-27">FY 2026–27</option>
                <option value="2025-26">FY 2025–26</option>
                <option value="2024-25">FY 2024–25</option>
              </select>
            </div>
          </div>

          {/* Workspace Optional */}
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Workspace Scope (Optional)
            </label>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
            >
              <option value="">All Workspaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isLoading}>
              Set Budget
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
