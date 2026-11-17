import React, { useState, useEffect } from 'react';
import type { Transaction } from '../../types/transactions';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import type { AccountWithBalance } from '../../types/accounts';
import { formatINR } from '../../types/design-system';
import { Button } from '../ui/Button';
import {
  X,
  Lock,
  Edit3,
  CheckCircle2,
  Calendar,
  Building2,
  Tag,
  Briefcase,
  Hash,
  ArrowRightLeft,
  FileSpreadsheet,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface TransactionRowProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: any) => Promise<void>;
  categories: Category[];
  workspaces: Workspace[];
  accounts: AccountWithBalance[];
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  isOpen,
  onClose,
  onSave,
  categories,
  workspaces,
  accounts,
}) => {
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [workspaceId, setWorkspaceId] = useState(transaction?.workspace_id || '');
  const [txnType, setTxnType] = useState(transaction?.txn_type || 'expense');
  const [notes, setNotes] = useState(transaction?.notes || '');
  const [tagsInput, setTagsInput] = useState((transaction?.tags || []).join(', '));
  const [isTransfer, setIsTransfer] = useState(transaction?.is_transfer || false);
  const [transferTargetAccountId, setTransferTargetAccountId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Editable fields
  const [dateInput, setDateInput] = useState(transaction?.txn_date || '');
  const [descriptionInput, setDescriptionInput] = useState(transaction?.description || '');
  const [amountInput, setAmountInput] = useState(
    transaction?.debit ? String(transaction.debit) : transaction?.credit ? String(transaction.credit) : '0'
  );

  // Sync state if transaction changes
  useEffect(() => {
    if (!transaction) return;
    setDateInput(transaction.txn_date || '');
    setDescriptionInput(transaction.description || '');
    setAmountInput(
      transaction.debit ? String(transaction.debit) : transaction.credit ? String(transaction.credit) : '0'
    );
    setCategoryId(transaction.category_id || '');
    setWorkspaceId(transaction.workspace_id || '');
    setTxnType(transaction.txn_type || 'expense');
    setNotes(transaction.notes || '');
    setTagsInput((transaction.tags || []).join(', '));
    setIsTransfer(transaction.is_transfer || false);
    setTransferTargetAccountId('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setShowUnsavedConfirm(false);
  }, [transaction]);

  const isDirty = Boolean(
    transaction &&
      (descriptionInput.trim() !== (transaction.description || '').trim() ||
        categoryId !== (transaction.category_id || '') ||
        workspaceId !== (transaction.workspace_id || '') ||
        txnType !== (transaction.txn_type || 'expense') ||
        notes !== (transaction.notes || '') ||
        tagsInput !== (transaction.tags || []).join(', ') ||
        isTransfer !== Boolean(transaction.is_transfer) ||
        transferTargetAccountId !== '')
  );

  useEffect(() => {
    if (!isOpen || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isDirty]);

  if (!isOpen || !transaction) return null;

  const isUnreadablePayee = transaction.description === 'UNREADABLE PAYEE - CHECK PDF';

  const handleRequestClose = () => {
    if (isSaving) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    const trimmedDescription = descriptionInput.trim();
    if (!trimmedDescription) {
      setErrorMsg('Description cannot be empty.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updates = {
        description: trimmedDescription,
        category_id: isTransfer ? null : categoryId || null,
        workspace_id: workspaceId || null,
        txn_type: isTransfer ? 'transfer' : txnType,
        notes: notes.trim() || null,
        tags: parsedTags,
        is_transfer: isTransfer,
        transfer_pair_id: isTransfer ? transaction.transfer_pair_id ?? undefined : null,
        transfer_target_account_id:
          isTransfer && transferTargetAccountId ? transferTargetAccountId : null,
      };

      await onSave(transaction.id, updates);
      setShowUnsavedConfirm(false);
      setTransferTargetAccountId('');
      setSuccessMsg('Changes saved and logged to immutable audit trail.');
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update transaction.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#0F172A] border-l border-slate-200 dark:border-slate-800 shadow-2xl h-full flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-0.5">
              <span>Transaction Detail</span>
              <span>•</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {transaction.id.slice(0, 12)}
              </span>
            </div>
            <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">
              {transaction.description}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {isUnreadablePayee && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Unreadable / Masked Payee</span>
                <span className="text-[11px] leading-relaxed block mt-0.5">
                  Check your PDF/bank statement using the Reference / UTR below, replace the Description field, and click Save Changes.
                </span>
              </div>
            </div>
          )}

          {/* 1. Core Financial Ledger Fields */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Ledger Entry Fields
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Payee Editable</span>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-slate-700 dark:text-slate-300 font-medium block text-xs mb-1">
                  Description / Payee
                </label>
                <input
                  type="text"
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Enter payee or merchant description..."
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1 text-xs mb-1">
                    <span>Date</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </label>
                  <input
                    type="date"
                    value={dateInput}
                    readOnly
                    disabled
                    className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1 text-xs mb-1">
                    <span>Amount (₹)</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amountInput}
                    readOnly
                    disabled
                    className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-tabular font-semibold cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Account</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate block">
                    {transaction.account?.name || 'Bank Account'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Reference / UTR</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {transaction.reference_number || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw Statement Description */}
            {transaction.raw_description && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                <span className="text-slate-400 block mb-0.5">Raw Bank String:</span>
                <code className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px] break-all block">
                  {transaction.raw_description}
                </code>
              </div>
            )}
          </div>

          {/* 2. Editable Classification Fields */}
          <div className="space-y-4">
            <h3 className="font-heading font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Edit3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Categorization & Metadata
            </h3>

            {/* AI Insights & Anomaly Diagnostics */}
            {(transaction.ai_suggestion || transaction.anomaly) && (
              <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-200">
                  <span className="text-base">🤖</span>
                  <span>Gemini AI Intelligence Insights</span>
                </div>

                {transaction.ai_suggestion && (
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>AI Confidence Score:</span>
                    <span
                      className={`font-semibold uppercase tracking-wider px-2 py-0.5 rounded text-[10px] ${
                        transaction.ai_suggestion.confidence === 'high'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : transaction.ai_suggestion.confidence === 'medium'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {transaction.ai_suggestion.confidence} (
                      {Math.round((transaction.ai_suggestion.score || 0.7) * 100)}%)
                    </span>
                  </div>
                )}

                {transaction.anomaly && (
                  <div className="p-2 rounded-lg bg-amber-100/60 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5">
                    <span className="font-semibold block">
                      ⚠️ Anomaly Detected ({transaction.anomaly.severity} severity):
                    </span>
                    <p>{transaction.anomaly.explanation}</p>
                  </div>
                )}
              </div>
            )}

            {/* Transfer Toggle */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-white block">
                  Mark as Internal Transfer
                </span>
                <span className="text-[11px] text-slate-500">
                  Transfers are excluded from income and expense calculations
                </span>
              </div>
              <input
                type="checkbox"
                checked={isTransfer}
                onChange={(e) => setIsTransfer(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* Transfer Match Account Selection if toggled */}
            {isTransfer && (
              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                <label className="text-[11px] font-medium text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Complementary Account (Opposite Leg)
                </label>
                <select
                  value={transferTargetAccountId}
                  onChange={(e) => setTransferTargetAccountId(e.target.value)}
                  className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Select destination / source account...</option>
                  {accounts
                    .filter((a) => a.id !== transaction.account_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.bank_name})
                      </option>
                    ))}
                </select>
                {transaction.transfer_pair_id && (
                  <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 block">
                    Linked Pair ID: {transaction.transfer_pair_id}
                  </span>
                )}
              </div>
            )}

            {/* Category (if not transfer) */}
            {!isTransfer && (
              <div className="space-y-1.5">
                <label className="text-slate-700 dark:text-slate-300 font-medium block">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.is_income ? 'Income' : 'Expense'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Workspace */}
            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-300 font-medium block">
                Workspace
              </label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">No Workspace</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Transaction Type */}
            {!isTransfer && (
              <div className="space-y-1.5">
                <label className="text-slate-700 dark:text-slate-300 font-medium block">
                  Transaction Type
                </label>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as any)}
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="refund">Refund</option>
                  <option value="opening">Opening Balance</option>
                </select>
              </div>
            )}

            {/* Tags (comma separated) */}
            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-300 font-medium block">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. food, dinner, client-work"
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-300 font-medium block">
                Notes & Commentary
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add context or tax commentary..."
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
              />
            </div>
          </div>

          {/* 3. Audit & Lineage Trace */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
            <span className="font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Audit & Provenance
            </span>
            <div className="flex justify-between">
              <span>Source:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {transaction.is_manual ? 'Manual Entry' : transaction.upload?.file_name || 'Statement Import'}
              </span>
            </div>
            {transaction.source_staged_id && (
              <div className="flex justify-between">
                <span>Staged ID:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {transaction.source_staged_id}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Imported / Created:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {transaction?.created_at && !isNaN(new Date(transaction.created_at).getTime())
                  ? new Date(transaction.created_at).toLocaleString('en-IN')
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Unsaved Changes Inline Confirmation */}
        {showUnsavedConfirm && (
          <div className="px-4 py-3 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-amber-900 dark:text-amber-200">
              You have unsaved changes. Leave anyway?
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowUnsavedConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowUnsavedConfirm(false);
                  onClose();
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={handleRequestClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};
