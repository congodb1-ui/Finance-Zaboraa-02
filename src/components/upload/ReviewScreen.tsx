import React, { useState } from 'react';
import type { StatementUpload, StagedTransaction, OverlapCheckResult } from '../../types/uploads';
import type { Category } from '../../types/categories';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatINR } from '../../types/design-system';
import { orderTransactionsChronologically } from '../../lib/balance-utils';
import { formatTransactionSubtitle } from '../../lib/parsers/bank-transaction';
import { EditUploadModal } from './EditUploadModal';
import { RevertModal } from './RevertModal';
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
  Edit3,
  Undo2,
  Sparkles,
} from 'lucide-react';

interface ReviewScreenProps {
  upload: StatementUpload;
  transactions: StagedTransaction[];
  categories?: Category[];
  overlapInfo?: OverlapCheckResult | null;
  onConfirmImport: (replacePreviousId?: string) => Promise<void>;
  onCancelUpload: () => Promise<void>;
  onDeleteUpload?: (uploadId: string) => Promise<void>;
  onUploadAgain?: () => void;
  isReadOnly?: boolean;
  onUpdateStagedRow?: (stagedId: string, updates: any) => Promise<void>;
  onUpdateStagedCategory?: (
    stagedId: string,
    categoryId: string | null,
    options: { is_transfer?: boolean; apply_to_future?: boolean }
  ) => Promise<void>;
  onUploadUpdated?: (upload: StatementUpload) => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  upload,
  transactions,
  categories = [],
  overlapInfo,
  onConfirmImport,
  onCancelUpload,
  onDeleteUpload,
  onUploadAgain,
  isReadOnly = false,
  onUpdateStagedRow,
  onUpdateStagedCategory,
  onUploadUpdated,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [replaceDecision, setReplaceDecision] = useState<'keep_both' | 'replace' | null>(null);
  const [showReconWarning, setShowReconWarning] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [rowEditError, setRowEditError] = useState<string | null>(null);
  const [showOnlyUnreadable, setShowOnlyUnreadable] = useState(false);
  const [editForm, setEditForm] = useState<{
    txn_date: string;
    description: string;
    debit: string;
    credit: string;
    reference_number: string;
  }>({ txn_date: '', description: '', debit: '', credit: '', reference_number: '' });

  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceConfirmationText, setReplaceConfirmationText] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [acknowledgeClosingMismatch, setAcknowledgeClosingMismatch] = useState(false);
  const [updatingCatRowId, setUpdatingCatRowId] = useState<string | null>(null);
  const [futureRulePrompt, setFutureRulePrompt] = useState<{
    stagedId: string;
    description: string;
    categoryId: string;
    categoryName: string;
    isTransfer: boolean;
  } | null>(null);

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

  // Reconstruct true chronological balance sequence and detect genuine breaks (tolerance 0.01)
  const {
    orderedChronological,
    displayTransactions,
    balanceDiscontinuity,
    mismatchRowIds,
    derivedOpeningBalance,
    lastChronologicalBalance,
  } = React.useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return {
        orderedChronological: [] as StagedTransaction[],
        displayTransactions: [] as StagedTransaction[],
        balanceDiscontinuity: null as { count: number } | null,
        mismatchRowIds: new Set<string>(),
        derivedOpeningBalance: null as number | null,
        lastChronologicalBalance: null as number | null,
      };
    }

    const { ordered, originalDirection } = orderTransactionsChronologically(transactions);
    const rowsWithBalance = ordered.filter(
      (t) => t.balance !== null && t.balance !== undefined && Number.isFinite(Number(t.balance))
    );

    const mismatches = new Set<string>();
    let prevBal: number | null =
      upload.opening_balance !== undefined && upload.opening_balance !== null
        ? Number(upload.opening_balance)
        : null;

    for (const row of ordered) {
      const bal =
        row.balance !== null && row.balance !== undefined && Number.isFinite(Number(row.balance))
          ? Number(row.balance)
          : null;
      if (prevBal !== null && bal !== null) {
        const expected = prevBal + Number(row.credit ?? 0) - Number(row.debit ?? 0);
        if (Math.abs(expected - bal) > 0.01) {
          mismatches.add(row.id);
        }
      }
      if (bal !== null) {
        prevBal = bal;
      }
    }

    const displayList =
      originalDirection === 'descending' ? [...ordered].reverse() : ordered;
    const firstWithBal = rowsWithBalance.length > 0 ? rowsWithBalance[0] : null;
    const derivedOpening =
      firstWithBal !== null
        ? Math.round(
            (Number(firstWithBal.balance) +
              Number(firstWithBal.debit ?? 0) -
              Number(firstWithBal.credit ?? 0)) *
              100
          ) / 100
        : null;
    const lastBal =
      rowsWithBalance.length > 0 ? Number(rowsWithBalance[rowsWithBalance.length - 1].balance) : null;

    return {
      orderedChronological: ordered,
      displayTransactions: displayList,
      balanceDiscontinuity: mismatches.size > 0 ? { count: mismatches.size } : null,
      mismatchRowIds: mismatches,
      derivedOpeningBalance: derivedOpening,
      lastChronologicalBalance: lastBal,
    };
  }, [transactions, upload.opening_balance]);

  const hasExplicitOpeningBalance =
    upload.opening_balance !== undefined && upload.opening_balance !== null;
  const effectiveOpeningBalance = hasExplicitOpeningBalance
    ? upload.opening_balance!
    : derivedOpeningBalance;
  const effectiveClosingBalance =
    upload.summary_closing_balance !== undefined && upload.summary_closing_balance !== null
      ? upload.summary_closing_balance
      : upload.closing_balance !== undefined && upload.closing_balance !== null
        ? upload.closing_balance
        : lastChronologicalBalance;
  const hasClosingMismatch = Boolean(upload.closing_balance_mismatch);

  const unreadableCount = React.useMemo(
    () =>
      displayTransactions.filter(
        (t) => t.description === 'UNREADABLE PAYEE - CHECK PDF'
      ).length,
    [displayTransactions]
  );

  const visibleTransactions = React.useMemo(
    () =>
      showOnlyUnreadable
        ? displayTransactions.filter(
            (t) => t.description === 'UNREADABLE PAYEE - CHECK PDF' || editingRowId === t.id
          )
        : displayTransactions,
    [displayTransactions, showOnlyUnreadable, editingRowId]
  );

  const totalPages = Math.ceil(visibleTransactions.length / pageSize) || 1;
  const paginatedTransactions = visibleTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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

  const handleStagedCategorySelect = async (tx: StagedTransaction, newCatId: string) => {
    if (!onUpdateStagedCategory) return;
    const normalizedId = newCatId || null;
    const chosenCat = categories.find((c) => c.id === normalizedId);
    const isTransfer = chosenCat?.name === 'Family Transfer';

    if (tx.suggestion_source === 'ai' && normalizedId) {
      setFutureRulePrompt({
        stagedId: tx.id,
        description: tx.description,
        categoryId: normalizedId,
        categoryName: chosenCat?.name || 'Selected Category',
        isTransfer,
      });
      return;
    }

    setUpdatingCatRowId(tx.id);
    try {
      await onUpdateStagedCategory(tx.id, normalizedId, {
        is_transfer: isTransfer,
        apply_to_future: false,
      });
    } finally {
      setUpdatingCatRowId(null);
    }
  };

  const handleConfirmFuturePrompt = async (applyToFuture: boolean) => {
    if (!futureRulePrompt || !onUpdateStagedCategory) return;
    const target = futureRulePrompt;
    setFutureRulePrompt(null);
    setUpdatingCatRowId(target.stagedId);
    try {
      await onUpdateStagedCategory(target.stagedId, target.categoryId, {
        is_transfer: target.isTransfer,
        apply_to_future: applyToFuture,
      });
    } finally {
      setUpdatingCatRowId(null);
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
              Period: {(() => {
                const formatToDMY = (val?: string | null) => {
                  if (!val) return '';
                  const trimmed = val.trim();
                  const isoM = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  if (isoM) return `${isoM[3]}/${isoM[2]}/${isoM[1]}`;
                  return trimmed;
                };

                const start = formatToDMY(upload.statement_period_start);
                const end = formatToDMY(upload.statement_period_end);

                if (start && end) {
                  return `${start} to ${end}`;
                }

                if (orderedChronological.length > 0) {
                  const txStart = formatToDMY(
                    orderedChronological[0]?.raw_date || orderedChronological[0]?.txn_date
                  );
                  const txEnd = formatToDMY(
                    orderedChronological[orderedChronological.length - 1]?.raw_date ||
                      orderedChronological[orderedChronological.length - 1]?.txn_date
                  );
                  return `${txStart} to ${txEnd}`;
                }

                return 'N/A';
              })()}
            </span>
          </div>
        </div>

        {/* Read-only status or active buttons */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowEditModal(true)}
            leftIcon={<Edit3 className="w-3.5 h-3.5 text-slate-500" />}
          >
            Edit Upload Details
          </Button>

          {isReadOnly ? (
            <>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Imported Record
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setShowRevertModal(true)}
                leftIcon={<Undo2 className="w-3.5 h-3.5 text-red-500" />}
              >
                Revert This Import
              </Button>
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
            </>
          ) : (
            <>
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
                disabled={
                  isSubmitting ||
                  (overlapInfo?.has_overlap && !replaceDecision) ||
                  (hasClosingMismatch && !acknowledgeClosingMismatch)
                }
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Confirm & Import
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Closing Balance vs Last Row Balance Mismatch Guard (FIX 2) */}
      {hasClosingMismatch && (
        <div
          data-testid="closing-balance-mismatch-banner"
          className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-100 space-y-2.5 animate-in fade-in shadow-2xs"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-sm block">
                Closing Balance Mismatch Detected
              </span>
              <p className="mt-0.5 leading-relaxed text-red-800 dark:text-red-200">
                Statement Summary Closing Balance (
                <strong className="font-tabular">
                  {effectiveClosingBalance !== null ? formatINR(effectiveClosingBalance) : 'N/A'}
                </strong>
                ) differs from the last transaction row balance (
                <strong className="font-tabular">
                  {lastChronologicalBalance !== null ? formatINR(lastChronologicalBalance) : 'N/A'}
                </strong>
                ) by{' '}
                <strong className="font-tabular">{formatINR(upload.closing_balance_diff || 0)}</strong>.
                Review highlighted rows before saving.
              </p>
            </div>
          </div>
          {!isReadOnly && (
            <label className="flex items-center gap-2 text-xs font-medium text-red-900 dark:text-red-100 pl-8 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledgeClosingMismatch}
                onChange={(e) => setAcknowledgeClosingMismatch(e.target.checked)}
                className="rounded border-red-400 text-red-600 focus:ring-red-500"
              />
              <span>I have verified the closing balance mismatch and want to import anyway</span>
            </label>
          )}
        </div>
      )}

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

      {/* Balance Continuity Warning Banner */}
      {balanceDiscontinuity && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex items-start gap-3 animate-in fade-in shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-sm block">⚠️ Balance Continuity Warning</span>
            <p className="mt-0.5 text-amber-800 dark:text-amber-200 leading-relaxed">
              Discontinuous balance sequence detected across {balanceDiscontinuity.count} transaction(s). Please verify row order and values before confirming.
            </p>
          </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

        {/* Opening Balance */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Opening Balance
            </span>
            <span
              data-testid="review-opening-balance"
              className="font-heading font-bold text-xl text-slate-900 dark:text-white font-tabular mt-1 block"
            >
              {effectiveOpeningBalance !== null && effectiveOpeningBalance !== undefined
                ? formatINR(effectiveOpeningBalance)
                : '—'}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {hasExplicitOpeningBalance
                ? 'From statement summary'
                : effectiveOpeningBalance !== null
                  ? 'Derived from statement'
                  : 'Not available'}
            </span>
          </div>
        </Card>

        {/* Debits Total */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 block">
              Total Debits (Outflow)
            </span>
            <span className="font-heading font-bold text-xl text-red-600 dark:text-red-400 font-tabular mt-1 block">
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
            <span className="font-heading font-bold text-xl text-green-600 dark:text-green-400 font-tabular mt-1 block">
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

        {/* Closing Balance */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Closing Balance
            </span>
            <span
              data-testid="review-closing-balance"
              className={`font-heading font-bold text-xl font-tabular mt-1 block ${
                hasClosingMismatch
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {effectiveClosingBalance !== null && effectiveClosingBalance !== undefined
                ? formatINR(effectiveClosingBalance)
                : '—'}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {hasClosingMismatch ? 'Mismatch vs last row' : 'Summary verified'}
            </span>
          </div>
        </Card>
      </div>

      {/* Transactions Review Table */}
      <Card>
        <CardHeader className="p-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-semibold">
              Staged Transactions Ledger
            </CardTitle>
            <span className="text-xs text-slate-500">
              Showing page {currentPage} of {totalPages} ({visibleTransactions.length} entries{showOnlyUnreadable ? ' needing payee check' : ''})
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {unreadableCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowOnlyUnreadable((v) => !v);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  showOnlyUnreadable
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                }`}
              >
                {showOnlyUnreadable ? `Showing ${unreadableCount} Check PDF` : `Check PDF (${unreadableCount})`}
              </button>
            )}

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
          </div>
        </CardHeader>

        {rowEditError && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-2">
            <span>{rowEditError}</span>
            <button
              type="button"
              onClick={() => setRowEditError(null)}
              className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <th className="py-2.5 px-4 w-12 text-center">#</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-4 min-w-[240px]">Description</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Reference / UTR</th>
                <th className="py-2.5 px-3 whitespace-nowrap min-w-[180px]">Category</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Debit (−)</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Credit (+)</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedTransactions.map((tx, idx) => {
                const rowNum = (currentPage - 1) * pageSize + idx + 1;
                const isEditing = editingRowId === tx.id;
                const isRowSaving = savingRowId === tx.id;

                const startEditing = () => {
                  if (isReadOnly || !onUpdateStagedRow) return;
                  setRowEditError(null);
                  setEditingRowId(tx.id);
                  setEditForm({
                    txn_date: tx.txn_date || '',
                    description: tx.description || '',
                    debit: tx.debit ? String(tx.debit) : '',
                    credit: tx.credit ? String(tx.credit) : '',
                    reference_number: tx.reference_number || '',
                  });
                };

                const saveEditing = async (e?: React.MouseEvent) => {
                  e?.stopPropagation();
                  if (!onUpdateStagedRow || isRowSaving) return;
                  const cleanDesc = editForm.description.trim();
                  if (!cleanDesc) {
                    setRowEditError('Description cannot be empty.');
                    return;
                  }
                  const dVal = editForm.debit.trim() !== '' ? parseFloat(editForm.debit) : null;
                  const cVal = editForm.credit.trim() !== '' ? parseFloat(editForm.credit) : null;

                  setSavingRowId(tx.id);
                  setRowEditError(null);
                  try {
                    await onUpdateStagedRow(tx.id, {
                      txn_date: editForm.txn_date,
                      description: cleanDesc,
                      debit: isNaN(dVal as number) ? null : dVal,
                      credit: isNaN(cVal as number) ? null : cVal,
                      reference_number: editForm.reference_number.trim() || null,
                    });
                    setEditingRowId(null);
                  } catch (err: any) {
                    setRowEditError(err?.message || 'Failed to save transaction changes.');
                  } finally {
                    setSavingRowId(null);
                  }
                };

                const handleInputKeyDown = (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveEditing();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingRowId(null);
                    setRowEditError(null);
                  }
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
                          onKeyDown={handleInputKeyDown}
                          className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          onKeyDown={handleInputKeyDown}
                          autoFocus
                          className="w-full px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.reference_number}
                          onChange={(e) => setEditForm({ ...editForm, reference_number: e.target.value })}
                          onKeyDown={handleInputKeyDown}
                          className="w-full px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                        />
                      </td>
                      <td className="py-2 px-2 text-[11px] text-slate-400">
                        —
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Debit"
                          value={editForm.debit}
                          onChange={(e) => setEditForm({ ...editForm, debit: e.target.value })}
                          onKeyDown={handleInputKeyDown}
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
                          onKeyDown={handleInputKeyDown}
                          className="w-24 px-2 py-1 text-xs text-right rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-green-600 dark:text-green-400"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={saveEditing}
                            disabled={isRowSaving}
                            className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-50 cursor-pointer"
                          >
                            {isRowSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRowId(null);
                              setRowEditError(null);
                            }}
                            disabled={isRowSaving}
                            className="px-2 py-1 text-xs rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const isUnreadablePayee = tx.description === 'UNREADABLE PAYEE - CHECK PDF';
                const hasBalanceMismatch = mismatchRowIds.has(tx.id);

                return (
                  <tr
                    key={tx.id}
                    onClick={startEditing}
                    className={`transition-colors ${
                      isUnreadablePayee
                        ? 'bg-amber-50/80 dark:bg-amber-950/30 border-l-4 border-l-amber-500 hover:bg-amber-100/70 dark:hover:bg-amber-950/40'
                        : hasBalanceMismatch
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    } ${!isReadOnly && onUpdateStagedRow ? 'cursor-pointer' : ''}`}
                  >
                    <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">
                      {rowNum}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-tabular text-slate-700 dark:text-slate-300">
                      {tx.txn_date}
                    </td>
                    <td className="py-3 px-4">
                      <div
                        title={tx.raw_description || undefined}
                        className={`font-medium flex items-center gap-2 flex-wrap ${
                          isUnreadablePayee
                            ? 'text-amber-800 dark:text-amber-300 font-semibold'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        <span>{tx.description}</span>
                        {isUnreadablePayee && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                            CHECK PDF
                          </span>
                        )}
                        {hasBalanceMismatch && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                            BALANCE_MISMATCH
                          </span>
                        )}
                      </div>
                      {(() => {
                        const subtitle = formatTransactionSubtitle(
                          tx.description,
                          tx.raw_description,
                          tx.reference_number
                        );
                        return subtitle ? (
                          <div className="text-[11px] text-slate-400 break-words mt-0.5">
                            {subtitle}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {tx.reference_number || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                    <td
                      className="py-2.5 px-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1">
                        {tx.suggestion_source === 'rule' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Auto (Rule)
                          </span>
                        )}
                        {tx.suggestion_source === 'ai' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Sparkles className="w-2.5 h-2.5" />
                            Suggested (AI)
                            {tx.suggestion_confidence !== null && tx.suggestion_confidence !== undefined
                              ? ` ${Math.round(tx.suggestion_confidence * 100)}%`
                              : ''}
                          </span>
                        )}
                        {tx.suggestion_source === 'manual' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Manual
                          </span>
                        )}

                        {!isReadOnly && onUpdateStagedCategory && categories.length > 0 ? (
                          <select
                            aria-label={`Category for ${tx.description}`}
                            disabled={updatingCatRowId === tx.id}
                            value={tx.suggested_category_id || ''}
                            onChange={(e) => handleStagedCategorySelect(tx, e.target.value)}
                            className="block w-full px-2 py-1 text-[11px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          >
                            <option value="">Uncategorized</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {categories.find((c) => c.id === tx.suggested_category_id)?.name || (
                              <span className="text-slate-400">Uncategorized</span>
                            )}
                          </div>
                        )}
                      </div>
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

      {/* Edit Upload Modal */}
      <EditUploadModal
        upload={upload}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSaved={(updated) => {
          if (onUploadUpdated) onUploadUpdated(updated);
        }}
      />

      {/* Revert Modal */}
      <RevertModal
        upload={upload}
        isOpen={showRevertModal}
        onClose={() => setShowRevertModal(false)}
        onReverted={() => {
          if (onDeleteUpload) {
            onDeleteUpload(upload.id);
          } else if (onUploadAgain) {
            onUploadAgain();
          }
        }}
      />

      {/* Apply to Future Transactions Prompt when correcting an AI suggestion */}
      {futureRulePrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Apply this category for this merchant to future transactions too?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Merchant: <strong className="text-slate-900 dark:text-white">{futureRulePrompt.description}</strong>
                <br />
                New Category: <strong className="text-indigo-600 dark:text-indigo-400">{futureRulePrompt.categoryName}</strong>
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFutureRulePrompt(null)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfirmFuturePrompt(false)}
              >
                Just this one
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleConfirmFuturePrompt(true)}
              >
                Yes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
