import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { FileText, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ITRLineItem {
  section: string;
  lineItem: string;
  amount: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isTax?: boolean;
}

interface ITRSummaryTableProps {
  lineItems: ITRLineItem[];
  fy: string;
}

export const ITRSummaryTable: React.FC<ITRSummaryTableProps> = ({ lineItems, fy }) => {
  return (
    <Card className="p-6 space-y-5">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-0.5">
            <span>Income Tax Computation</span>
            <span>•</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{fy}</span>
          </div>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Indian ITR Schedule Summary
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400 self-start sm:self-auto">
          Rule-categorized • Transfers excluded
        </span>
      </div>

      {/* Structured Schedule Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <th className="py-2.5 px-4 w-32 uppercase tracking-wider text-[11px]">ITR Section</th>
              <th className="py-2.5 px-4 uppercase tracking-wider text-[11px]">Schedule Line Item</th>
              <th className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px]">Amount (INR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {lineItems.map((item, idx) => {
              const isHighlight = item.isTotal;
              const isTax = item.isTax;
              const isSubtotal = item.isSubtotal;

              return (
                <tr
                  key={`${item.lineItem}-${idx}`}
                  className={`transition-colors ${
                    isHighlight
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 font-bold text-slate-900 dark:text-white border-y-2 border-indigo-200 dark:border-indigo-800'
                      : isTax
                      ? 'bg-amber-50/60 dark:bg-amber-950/30 font-semibold text-amber-900 dark:text-amber-200'
                      : isSubtotal
                      ? 'font-semibold text-slate-800 dark:text-slate-200 bg-slate-50/40 dark:bg-slate-800/30'
                      : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    {item.section}
                  </td>
                  <td className="py-3 px-4">
                    <span className={isHighlight ? 'text-sm font-heading font-extrabold' : ''}>
                      {item.lineItem}
                    </span>
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-tabular ${
                      isHighlight
                        ? 'text-base font-extrabold text-indigo-700 dark:text-indigo-300'
                        : isTax
                        ? 'font-bold text-amber-700 dark:text-amber-400'
                        : ''
                    }`}
                  >
                    {formatINR(item.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Yellow Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-semibold block text-sm">
            Chartered Accountant Verification Notice
          </span>
          <p className="leading-relaxed">
            These figures are auto-calculated from imported transactions and are for reference only. Consult a Chartered Accountant (CA) before filing your ITR return with the Income Tax Department.
          </p>
        </div>
      </div>
    </Card>
  );
};
