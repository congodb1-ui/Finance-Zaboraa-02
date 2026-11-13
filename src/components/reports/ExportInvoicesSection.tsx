import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { formatCurrency } from '../../lib/data/currencies';
import { getDisplayStatus, getTodayIsoDate } from '../../lib/invoices/displayUtils';
import type { InvoiceStatusV2, InvoiceV2 } from '../../types/invoicing';
import { Globe2 } from 'lucide-react';

export interface ExportInvoicesSectionProps {
  invoices: InvoiceV2[];
  fyLabel: string;
  startDate: string;
  endDate: string;
}

interface CurrencyRowStats {
  currency: string;
  invoiced: number;
  received: number;
  pending: number;
  avgRate: number | null;
}

const STATUS_ORDER: { key: InvoiceStatusV2; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'partial', label: 'Partial' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const ExportInvoicesSection: React.FC<ExportInvoicesSectionProps> = ({
  invoices,
  fyLabel,
  startDate,
  endDate,
}) => {
  const todayIso = useMemo(() => getTodayIsoDate(), []);

  const stats = useMemo(() => {
    const foreignInFy = invoices.filter((inv) => {
      const currency = (inv.currency || 'INR').toUpperCase();
      if (currency === 'INR') return false;
      const issueDate = (inv.issue_date || '').slice(0, 10);
      return issueDate >= startDate && issueDate <= endDate;
    });

    let totalInvoicedINR = 0;
    let totalReceivedINR = 0;

    const statusCounts: Record<InvoiceStatusV2, number> = {
      draft: 0,
      sent: 0,
      partial: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };

    const byCurrency = new Map<
      string,
      {
        invoiced: number;
        received: number;
        pending: number;
        rateSum: number;
        rateCount: number;
      }
    >();

    for (const inv of foreignInFy) {
      const displayStatus = getDisplayStatus(inv, todayIso);
      statusCounts[displayStatus] = (statusCounts[displayStatus] || 0) + 1;

      if (displayStatus === 'cancelled') continue;

      const currency = (inv.currency || 'USD').toUpperCase();
      const invTotal = Number(inv.total || 0);
      const invReceivedNative =
        inv.amount_received !== null && inv.amount_received !== undefined
          ? Number(inv.amount_received)
          : inv.status === 'paid'
          ? invTotal
          : 0;
      const invPendingNative = Math.max(0, invTotal - invReceivedNative);

      totalInvoicedINR += Number(inv.inr_equivalent || 0);

      if (inv.status === 'paid' || inv.status === 'partial') {
        totalReceivedINR += Number(inv.inr_received || 0);
      }

      const existing = byCurrency.get(currency) || {
        invoiced: 0,
        received: 0,
        pending: 0,
        rateSum: 0,
        rateCount: 0,
      };

      existing.invoiced += invTotal;
      existing.received += invReceivedNative;
      existing.pending += invPendingNative;

      if (inv.exchange_rate !== null && inv.exchange_rate !== undefined && Number(inv.exchange_rate) > 0) {
        existing.rateSum += Number(inv.exchange_rate);
        existing.rateCount += 1;
      } else if (
        inv.inr_received &&
        invReceivedNative > 0
      ) {
        existing.rateSum += Number(inv.inr_received) / invReceivedNative;
        existing.rateCount += 1;
      }

      byCurrency.set(currency, existing);
    }

    const currencyRows: CurrencyRowStats[] = Array.from(byCurrency.entries()).map(
      ([currency, row]) => ({
        currency,
        invoiced: row.invoiced,
        received: row.received,
        pending: row.pending,
        avgRate: row.rateCount > 0 ? row.rateSum / row.rateCount : null,
      })
    );

    const totalPendingINR = Math.max(0, totalInvoicedINR - totalReceivedINR);

    return {
      hasExportInvoices: foreignInFy.length > 0,
      totalCount: foreignInFy.length,
      totalInvoicedINR,
      totalReceivedINR,
      totalPendingINR,
      currencyRows,
      statusCounts,
    };
  }, [invoices, startDate, endDate, todayIso]);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-0.5">
            <span>Business Income · Export Billing</span>
            <span>•</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
              {fyLabel}
            </span>
          </div>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Export / Foreign Invoices</span>
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Bucketed by invoice issue date ({startDate} to {endDate})
        </span>
      </div>

      {!stats.hasExportInvoices ? (
        <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No export invoices in this financial year.
        </div>
      ) : (
        <div className="space-y-5">
          {/* INR Equivalent Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                Total Invoiced (INR Equivalent)
              </span>
              <div className="font-heading font-bold text-xl font-tabular text-slate-900 dark:text-white">
                {formatINR(stats.totalInvoicedINR)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                Total Received (INR Equivalent)
              </span>
              <div className="font-heading font-bold text-xl font-tabular text-green-600 dark:text-green-400">
                {formatINR(stats.totalReceivedINR)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                Total Pending (INR Equivalent)
              </span>
              <div className="font-heading font-bold text-xl font-tabular text-amber-600 dark:text-amber-400">
                {formatINR(stats.totalPendingINR)}
              </div>
            </div>
          </div>

          {/* Per-Currency Breakdown Table */}
          {stats.currencyRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                    <th className="py-2.5 px-4 uppercase tracking-wider text-[11px]">Currency</th>
                    <th className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px]">
                      Invoiced
                    </th>
                    <th className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px]">
                      Received
                    </th>
                    <th className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px]">
                      Pending
                    </th>
                    <th className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px]">
                      Avg Exchange Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.currencyRows.map((row) => (
                    <tr
                      key={row.currency}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                        {row.currency}
                      </td>
                      <td className="py-2.5 px-4 text-right font-tabular text-slate-900 dark:text-white">
                        {formatCurrency(row.invoiced, row.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-tabular text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(row.received, row.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-tabular text-amber-600 dark:text-amber-400 font-medium">
                        {formatCurrency(row.pending, row.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-tabular text-slate-600 dark:text-slate-300">
                        {row.avgRate !== null ? `₹${row.avgRate.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Invoice Status Counts in FY */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 font-tabular">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              FY Status Counts ({stats.totalCount} total):
            </span>
            {STATUS_ORDER.filter((s) => stats.statusCounts[s.key] > 0).map((s) => (
              <span key={s.key}>
                {s.label}: <strong className="text-slate-900 dark:text-white">{stats.statusCounts[s.key]}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
