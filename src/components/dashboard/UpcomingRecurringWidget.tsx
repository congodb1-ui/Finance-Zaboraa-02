import React, { useState, useEffect } from 'react';
import type { RecurringTransaction } from '../../types/recurring';
import { getUpcomingRecurring } from '../../lib/actions/recurring';
import { formatINR } from '../../types/design-system';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Repeat, Calendar, ArrowRight, Clock } from 'lucide-react';

export const UpcomingRecurringWidget: React.FC = () => {
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr).getTime();
  const sevenDaysMs = todayMs + 7 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    async function load() {
      try {
        const data = await getUpcomingRecurring(5);
        setItems(data);
      } catch (err) {
        console.error('Failed to load upcoming recurring:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <CardTitle className="text-sm font-bold">Upcoming Recurring Bills</CardTitle>
        </div>
        <button
          type="button"
          onClick={() => (window.location.hash = 'recurring')}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>View all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </CardHeader>

      <CardContent className="flex-1 space-y-2.5 pt-0">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading scheduled obligations...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No upcoming recurring transactions found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {items.map((item) => {
              const dueMs = new Date(item.next_due_date).getTime();
              const isOverdue = dueMs < todayMs;
              const isDueSoon = !isOverdue && dueMs <= sevenDaysMs;

              return (
                <div
                  key={item.id}
                  onClick={() => (window.location.hash = 'recurring')}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 rounded-lg px-1 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[170px] sm:max-w-[220px]">
                        {item.description}
                      </span>
                      {isOverdue && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                          Overdue
                        </span>
                      )}
                      {isDueSoon && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          Due soon
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{item.account?.name || 'Account'}</span>
                      <span>•</span>
                      <span className="font-mono text-[10px]">{item.next_due_date}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-semibold font-tabular text-xs sm:text-sm ${
                        item.txn_type === 'expense'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {item.txn_type === 'expense' ? '−' : '+'}
                      {formatINR(item.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 block capitalize">
                      {item.frequency}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
