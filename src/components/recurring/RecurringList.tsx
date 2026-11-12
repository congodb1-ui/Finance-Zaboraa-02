import React, { useState } from 'react';
import type { RecurringTransaction } from '../../types/recurring';
import { formatINR } from '../../types/design-system';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  Repeat,
  Plus,
  Calendar,
  AlertCircle,
  Clock,
  Trash2,
  CheckCircle2,
  Building2,
  Tag,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface RecurringListProps {
  items: RecurringTransaction[];
  onToggleActive: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenAddModal: () => void;
}

export const RecurringList: React.FC<RecurringListProps> = ({
  items,
  onToggleActive,
  onDelete,
  onOpenAddModal,
}) => {
  const [filterActiveOnly, setFilterActiveOnly] = useState(true);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr).getTime();
  const sevenDaysFromNowMs = todayMs + 7 * 24 * 60 * 60 * 1000;

  const filteredItems = items.filter((item) => (filterActiveOnly ? item.is_active : true));

  const getItemDueStatus = (dueDateStr: string) => {
    const dueMs = new Date(dueDateStr).getTime();
    if (dueMs < todayMs) {
      return { status: 'overdue', label: 'Overdue', color: 'red' };
    }
    if (dueMs <= sevenDaysFromNowMs) {
      return { status: 'due_soon', label: 'Due Soon', color: 'amber' };
    }
    return { status: 'upcoming', label: 'Upcoming', color: 'slate' };
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Cashflow Engine</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Repeat className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Recurring Transactions & Bills
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track scheduled outflows and retainer income. Passive match rules auto-advance due dates upon statement import.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={filterActiveOnly}
              onChange={(e) => setFilterActiveOnly(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Active only</span>
          </label>
          <Button
            variant="primary"
            size="md"
            onClick={onOpenAddModal}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Recurring
          </Button>
        </div>
      </div>

      {/* Recurring Items Cards / List */}
      {filteredItems.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Repeat className="w-6 h-6" />
          </div>
          <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
            No recurring items found
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            Add recurring subscriptions, utility bills, rent, or consulting retainers to track upcoming cashflow obligations.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddModal}
            leftIcon={<Plus className="w-4 h-4" />}
            className="mt-2"
          >
            Add Recurring Item
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredItems.map((item) => {
            const dueInfo = getItemDueStatus(item.next_due_date);
            const isExpense = item.txn_type === 'expense';

            return (
              <div
                key={item.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  item.is_active
                    ? 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
                    : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left Column: Icon + Details */}
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isExpense
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                      }`}
                    >
                      {isExpense ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-bold text-base text-slate-900 dark:text-white">
                          {item.description}
                        </span>

                        {/* Frequency Badge */}
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.frequency}
                        </span>

                        {/* Overdue / Due Soon Badge */}
                        {item.is_active && dueInfo.status === 'overdue' && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 animate-pulse">
                            🚨 Overdue
                          </span>
                        )}
                        {item.is_active && dueInfo.status === 'due_soon' && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            ⚡ Due Soon
                          </span>
                        )}
                        {!item.is_active && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500">
                            Paused
                          </span>
                        )}
                      </div>

                      {/* Account & Category Meta */}
                      <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-500 flex-wrap">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.account?.name || 'Account'}
                        </span>
                        <span>•</span>
                        <span>{item.category?.name || 'Uncategorized'}</span>
                        {item.workspace && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {item.workspace.name}
                            </span>
                          </>
                        )}
                      </div>

                      {item.notes && (
                        <p className="text-xs text-slate-400 italic pt-0.5">
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Amount + Dates + Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-left sm:text-right space-y-0.5">
                      <div
                        className={`font-heading font-extrabold text-lg sm:text-xl font-tabular ${
                          isExpense
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isExpense ? '−' : '+'}
                        {formatINR(item.amount)}
                      </div>
                      <div className="flex items-center sm:justify-end gap-1.5 text-xs text-slate-500 font-medium font-tabular">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Due: {item.next_due_date}</span>
                      </div>
                      {item.last_seen_date && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Last seen: {item.last_seen_date}
                        </span>
                      )}
                    </div>

                    {/* Toggle and Delete Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleActive(item.id, !item.is_active)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden min-h-[44px] sm:min-h-0 flex items-center ${
                          item.is_active ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={item.is_active ? 'Pause recurring rule' : 'Activate recurring rule'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            item.is_active ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete recurring rule for "${item.description}"?`)) {
                            onDelete(item.id);
                          }
                        }}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Delete recurring rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
