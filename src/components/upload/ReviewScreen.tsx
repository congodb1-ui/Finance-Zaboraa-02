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
  X,
  AlertOctagon,
  Lock,
} from 'lucide-react';

interface ReviewScreenProps {
  upload: StatementUpload;
  transactions: StagedTransaction[];
  overlapInfo?: OverlapCheckResult | null;
  onConfirmImport: (replacePreviousId?: string) => Promise<void>;
  onCancelUpload: () => Promise<void>;
  onDeleteUpload?: (uploadId: string) => Promise<void>;
  onUploadAgain?: () => void;
  isReadOnly?: boolean;
  onUpdateStagedRow?: (stagedId: string, updates: any) => Promise<void>;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  upload,
  transactions,
  overlapInfo,
  onConfirmImport,
  onCancelUpload,
  onDeleteUpload,
  onUploadAgain,
  isReadOnly = false,
  onUpdateStagedRow,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [replaceDecision, setReplaceDecision] = useState<'keep_both' | 'replace' | null>(null);
  const [showReconWarning, setShowReconWarning] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    txn_date: string;
    description: string;
    debit: string;
    credit: string;
    reference_number: string;
  }>({ txn_date: '', description: '', debit: '', credit: '', reference_number: '' });

  // Batch 3b: Modal state for replacing PDF imports
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceConfirmationText, setReplaceConfirmationText] = useState('');

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

  const isPDF = upload.file_type === 'pdf';

  const handleInitiateReplace = () => {
    if (isPDF) {
      // PDF replacement requires explicit typing confirmation gate
      setReplaceConfirmationText('');
      setShowReplaceModal(true);
    } else {
      // CSV/XLSX: direct selection
      setReplaceDecision('replace');
    }
  };

  const handleConfirmReplaceModal = () => {
    if (replaceConfirmationText === 'REPLACE') {
      setReplaceDecision('replace');
      setShowReplaceModal(false);
    }
  };

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
            <span className="uppercase text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {upload.file_type}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Period: {upload.statement_period_start || 'N/A'} to {upload.statement_period_end || 'N/A'}
            </span>
          </div>
        </div>

        {/* Read-only status or active buttons */}
        {isReadOnly ? (
          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Imported Record
            </span>
            {onUploadAgain && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onUploadAgain}
              >
                Upload Again
              </Button>
            )}
            {onDeleteUpload && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Delete this upload and its ${transactions.length} transactions?`)) {
                    onDeleteUpload(upload.id);
                  }
                }}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete This Import
              </Button>
            )}
          </div>
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
              data-testid="confirm-import-button"
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

      {/* Deliverable 4: Reconciliation Warning Banner (dismissable) */}
      {upload.reconciliation_warning && showReconWarning && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 flex items-start justify-between gap-3 animate-in fade-in shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-sm block">⚠️ Balance Does Not Reconcile</span>
              <p className="mt-0.5 leading-relaxed text-amber-800 dark:text-amber-200">
                Parsed total differs from statement closing balance by{' '}
                <strong className="font-tabular font-bold">
                  {formatINR(upload.reconciliation_diff || 0)}
                </strong>
                . You may proceed, but verify manually.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowReconWarning(false)}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 p-1 cursor-pointer"
            aria-label="Dismiss reconciliation warning"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Deliverable 6 & 8: Overlap Detection Banner */}
      {overlapInfo?.has_overlap && !isReadOnly && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-sm block">
                Statement Period Overlap Detected ({overlapInfo.overlap_percentage}% Overlap)
              </span>
              <p className="mt-0.5 text-amber-800 dark:text-amber-200">
                This file overlaps with an import from <strong>{overlapInfo.overlapping_date}</strong> (
                <code className="text-[11px] font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100">
                  {overlapInfo.overlapping_file_name}
                </code>
                ). You can replace the previous import or keep both.
              </p>
              {replaceDecision === 'replace' && (
                <div className="mt-1 text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Configured to replace previous import on confirm.</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleInitiateReplace}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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

      {/* Deliverable 6: PDF Replace Confirmation Modal */}
      {showReplaceModal && overlapInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                  Confirm PDF Statement Replacement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Action requires explicit confirmation gate
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Replacing this import will remove{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">
                {overlapInfo.overlapping_row_count || 'all'}
              </strong>{' '}
              previously imported transactions from{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">
                {upload.statement_period_start || 'earlier'} to {upload.statement_period_end || 'current'}
              </strong>
              . This cannot be undone without re-uploading.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Type <span className="font-mono text-red-600 dark:text-red-400 font-bold">REPLACE</span> to confirm:
              </label>
              <input
                type="text"
                value={replaceConfirmationText}
                onChange={(e) => setReplaceConfirmationText(e.target.value)}
                placeholder="REPLACE"
                className="w-full text-xs font-mono py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-red-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReplaceModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmReplaceModal}
                disabled={replaceConfirmationText !== 'REPLACE'}
              >
                Confirm Replacement
              </Button>
            </div>
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
                const isEditing = editingRowId === tx.id;

                const startEditing = () => {
                  if (isReadOnly || !onUpdateStagedRow) return;
                  setEditingRowId(tx.id);
                  setEditForm({
                    txn_date: tx.txn_date || '',
                    description: tx.description || '',
                    debit: tx.debit ? String(tx.debit) : '',
                    credit: tx.credit ? String(tx.credit) : '',
                    reference_number: tx.reference_number || '',
                  });
                };

                const saveEditing = async () => {
                  if (!onUpdateStagedRow) return;
                  const dVal = editForm.debit.trim() !== '' ? parseFloat(editForm.debit) : null;
                  const cVal = editForm.credit.trim() !== '' ? parseFloat(editForm.credit) : null;

                  await onUpdateStagedRow(tx.id, {
                    txn_date: editForm.txn_date,
                    description: editForm.description,
                    debit: isNaN(dVal as number) ? null : dVal,
                    credit: isNaN(cVal as number) ? null : cVal,
                    reference_number: editForm.reference_number || null,
                  });
                  setEditingRowId(null);
                };

                if (isEditing) {
                  return (
                    <tr key={tx.id} className="bg-indigo-50/40 dark:bg-indigo-950/20">
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400">{rowNum}</td>
                      <td className="py-2 px-2">
                        <input
                          type="date"
                          value={editForm.txn_date}
                          onChange={(e) => setEditForm({ ...editForm, txn_date: e.target.value })}
                          className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.reference_number}
                          onChange={(e) => setEditForm({ ...editForm, reference_number: e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Debit"
                          value={editForm.debit}
                          onChange={(e) => setEditForm({ ...editForm, debit: e.target.value })}
                          className="w-24 px-2 py-1 text-xs text-right rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Credit"
                          value={editForm.credit}
                          onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })}
                          className="w-24 px-2 py-1 text-xs text-right rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-green-600 dark:text-green-400"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={saveEditing}
                            className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRowId(null)}
                            className="px-2 py-1 text-xs rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={tx.id}
                    onClick={startEditing}
                    className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                      !isReadOnly && onUpdateStagedRow ? 'cursor-pointer' : ''
                    }`}
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
