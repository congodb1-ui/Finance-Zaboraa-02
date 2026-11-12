import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { Calculator, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';

interface TaxProvisionCardProps {
  businessIncome: number;
  businessExpense: number;
  taxableProfit: number;
  taxProvision: number;
  onViewITRReport?: () => void;
}

export const TaxProvisionCard: React.FC<TaxProvisionCardProps> = ({
  businessIncome,
  businessExpense,
  taxableProfit,
  taxProvision,
  onViewITRReport,
}) => {
  return (
    <Card className="p-5 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Calculator className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Tax Provision (Running FY)
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            30% Flat Estimate
          </span>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Auto-computed from Business workspace receipts and allowable expense disbursements.
        </p>
      </div>

      {/* Main Tax Provision Figure */}
      <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
          Estimated Advance Tax Liability (FY Running)
        </span>
        <div className="font-heading font-extrabold text-2xl sm:text-3xl text-indigo-600 dark:text-indigo-400 font-tabular">
          {formatINR(taxProvision)}
        </div>
        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
          Taxable Base Profit: {formatINR(taxableProfit)} @ 30%
        </span>
      </div>

      {/* Calculation Formula Breakdown */}
      <div className="space-y-2 text-xs pt-1">
        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span>Gross Business Receipts:</span>
          <span className="font-semibold font-tabular text-emerald-600 dark:text-emerald-400">
            +{formatINR(businessIncome)}
          </span>
        </div>

        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span>Allowable Business Expenses:</span>
          <span className="font-semibold font-tabular text-red-600 dark:text-red-400">
            −{formatINR(businessExpense)}
          </span>
        </div>

        <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-800 font-semibold">
          <span>Net Taxable Business Profit:</span>
          <span className="font-tabular text-indigo-600 dark:text-indigo-400">
            {formatINR(taxableProfit)}
          </span>
        </div>
      </div>

      {/* Disclaimer and ITR Report link */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-200 border border-amber-200/60 dark:border-amber-900/40">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Estimated guideline figure only, not certified tax advice. Review deductions with your Chartered Accountant.
          </span>
        </div>

        {onViewITRReport && (
          <button
            type="button"
            onClick={onViewITRReport}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>View Full ITR Schedule Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Card>
  );
};
