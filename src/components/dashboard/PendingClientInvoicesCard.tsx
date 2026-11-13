import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { formatCurrency } from '../../lib/data/currencies';
import { getDisplayStatus, getTodayIsoDate } from '../../lib/invoices/displayUtils';
import type { InvoiceV2 } from '../../types/invoicing';
import { ChevronDown, ChevronUp, FileText, ArrowRight, AlertTriangle } from 'lucide-react';

export interface PendingClientInvoicesCardProps {
  invoices: InvoiceV2[];
  isLoading?: boolean;
}

export const PendingClientInvoicesCard: React.FC<PendingClientInvoicesCardProps> = ({
  invoices,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const todayIso = useMemo(() => getTodayIsoDate(), []);

  const summary = useMemo(() => {
    let totalPendingINR = 0;
    let overdueCount = 0;
    let pendingCount = 0;
    const perCurrencyMap = new Map<string, number>();

    for (const inv of invoices) {
      const displayStatus = getDisplayStatus(inv, todayIso);
      const isPendingStatus =
        displayStatus === 'sent' ||
        displayStatus === 'partial' ||
        displayStatus === 'overdue';

      if (
        inv.due_date &&
        inv.due_date < todayIso &&
        (inv.status === 'sent' || inv.status === 'partial' || inv.status === 'overdue')
      ) {
        overdueCount += 1;
      }

      if (!isPendingStatus) continue;

      pendingCount += 1;
      const currency = (inv.currency || 'INR').toUpperCase();

      if (currency === 'INR') {
        totalPendingINR += Number(inv.total || 0);
      } else if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
        totalPendingINR += Number(inv.inr_equivalent) || 0;
      }

      const amountPending = Math.max(
        0,
        Number(inv.total || 0) - Number(inv.amount_received || 0)
      );
      if (amountPending > 0) {
        perCurrencyMap.set(currency, (perCurrencyMap.get(currency) || 0) + amountPending);
      }
    }

    const perCurrency = Array.from(perCurrencyMap.entries()).map(([currency, amount]) => ({
      currency,
      amount,
      formatted: formatCurrency(amount, currency),
    }));

    return {
      totalPendingINR,
      overdueCount,
      pendingCount,
      perCurrency,
    };
  }, [invoices, todayIso]);

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
            Pending Client
          </h3>
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-3 h-3" />
              <span>{summary.overdueCount} overdue</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.hash = 'invoices';
          }}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>View invoices</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white font-tabular">
            {isLoading ? '—' : formatINR(summary.totalPendingINR)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.pendingCount === 0
              ? 'No open client invoices awaiting payment'
              : `${summary.pendingCount} open invoice${summary.pendingCount === 1 ? '' : 's'} (sent, partial, or overdue)`}
          </p>
        </div>

        {summary.perCurrency.length > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>Currency breakdown ({summary.perCurrency.length})</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {isExpanded && summary.perCurrency.length > 0 && (
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs font-tabular text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
          {summary.perCurrency.map((item, idx) => (
            <React.Fragment key={item.currency}>
              {idx > 0 && (
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                  ·
                </span>
              )}
              <span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {item.currency}
                </span>{' '}
                <span>{item.formatted}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </Card>
  );
};
