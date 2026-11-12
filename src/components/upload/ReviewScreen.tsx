import React, { useState } from 'react';
import type { StatementUpload, StagedTransaction, OverlapCheckResult } from '../../types/uploads';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatINR } from '../../types/design-system';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Calendar,
  Building2,
  Hash,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

interface ReviewScreenProps {
  upload: StatementUpload;
  transactions: StagedTransaction[];
  overlapInfo?: OverlapCheckResult | null;
  onConfirmImport: (replacePreviousId?: string) => Promise<void>;
  onCancelUpload: () => Promise<void>;
  isReadOnly?: boolean;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  upload,
  transactions,
  overlapInfo,
  onConfirmImport,
  onCancelUpload,
  isReadOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [replaceDecision, setReplaceDecision] = useState<'keep_both' | 'replace' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageSize = 50;

  // Calculate summary metrics
  let totalDebits = 0;
  let debitCount = 0;
  let totalCredits = 0;
  let creditCount = 0;

  for (const t of transactions) {
    if (t.debit) {
      totalDebits += t.debit;
      debitCount++;
    }
    if (t.credit) {
      totalCredits += t.credit;
      creditCount++;
    }
  }

  const totalPages = Math.ceil(transactions.length / pageSize) || 1;
  const paginatedTransactions = transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const replaceId =
        replaceDecision === 'replace' && overlapInfo?.overlapping_upload_id
          ? overlapInfo.overlapping_upload_id
          : undefined;

      await onConfirmImport(replaceId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel this upload? Staged rows will be discarded.')) {
      setIsSubmitting(true);
      try {
        await onCancelUpload();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Account Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Statement Parser</span>
            <span>•</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {isReadOnly ? 'Read-only Inspection' : 'Step 4 of 4: Review Screen'}
            </span>
          </div>
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {isReadOnly ? 'Imported Statement Review' : 'Verify Staged Transactions'}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {upload.account?.name || 'Account'} ({upload.account?.bank_name})
            </span>
            <span>•</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">{upload.file_name}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Period: {upload.statement_period_start || 'N/A'} to {upload.statement_period_end || 'N/A'}
            </span>
          </div>
        </div>

        {/* Read-only status or active buttons */}
        {isReadOnly ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Imported Record
          </span>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isSubmitting}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Cancel Upload
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleConfirm}
              isLoading={isSubmitting}
              disabled={isSubmitting || (overlapInfo?.has_overlap && !replaceDecision)}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Confirm & Import
            </Button>
          </div>
        )}
      </div>

      {/* Deliverable 8: Overlap Detection Banner */}
      {overlapInfo?.has_overlap && !isReadOnly && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-sm block">Statement Period Overlap Detected ({overlapInfo.overlap_percentage}% Overlap)</span>
              <p className="mt-0.5 text-amber-800 dark:text-amber-200">
                This file overlaps with an existing import from <strong>{overlapInfo.overlapping_date}</strong> (
                <code className="text-[11px] font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100">
                  {overlapInfo.overlapping_file_name}
                </code>
                ). You can replace the previous import or keep both.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setReplaceDecision('replace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                replaceDecision === 'replace'
                  ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-500/50'
                  : 'bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100/50'
              }`}
            >
              Replace Previous
            </button>
            <button
              type="button"
              onClick={() => setReplaceDecision('keep_both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                replaceDecision === 'keep_both'
                  ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/50'
                  : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              Keep Both
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Count */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Total Transactions
            </span>
            <span className="font-heading font-bold text-2xl text-slate-900 dark:text-white font-tabular mt-1 block">
              {transactions.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {upload.row_count} rows parsed cleanly
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Hash className="w-5 h-5" />
          </div>
        </Card>

        {/* Debits Total */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 block">
              Total Debits (Outflow)
            </span>
            <span className="font-heading font-bold text-2xl text-red-600 dark:text-red-400 font-tabular mt-1 block">
              −{formatINR(totalDebits)}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {debitCount} debit transactions
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
            <span className="font-bold text-lg leading-none">−</span>
          </div>
        </Card>

        {/* Credits Total */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 block">
              Total Credits (Inflow)
            </span>
            <span className="font-heading font-bold text-2xl text-green-600 dark:text-green-400 font-tabular mt-1 block">
              +{formatINR(totalCredits)}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {creditCount} credit transactions
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/60 text-green-600 dark:text-green-400 flex items-center justify-center">
            <span className="font-bold text-lg leading-none">+</span>
          </div>
        </Card>
      </div>

      {/* Transactions Review Table */}
      <Card>
        <CardHeader className="p-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-semibold">
              Staged Transactions Ledger
            </CardTitle>
            <span className="text-xs text-slate-500">
              Showing page {currentPage} of {totalPages} ({transactions.length} total entries)
            </span>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Prev
              </Button>
              <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400 px-1">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <th className="py-2.5 px-4 w-12 text-center">#</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-4 min-w-[240px]">Description</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Reference / UTR</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Debit (−)</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Credit (+)</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedTransactions.map((tx, idx) => {
                const rowNum = (currentPage - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">
                      {rowNum}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-tabular text-slate-700 dark:text-slate-300">
                      {tx.txn_date}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {tx.description}
                      </div>
                      {tx.raw_description && tx.raw_description !== tx.description && (
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-sm mt-0.5">
                          {tx.raw_description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {tx.reference_number || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-tabular">
                      {tx.debit ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          −{formatINR(tx.debit)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-tabular">
                      {tx.credit ? (
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          +{formatINR(tx.credit)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-tabular font-medium text-slate-800 dark:text-slate-200">
                      {tx.balance !== null && tx.balance !== undefined ? (
                        formatINR(tx.balance)
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
