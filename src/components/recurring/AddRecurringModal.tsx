import React, { useState, useEffect } from 'react';
import type { RecurringFormData, RecurringFrequency } from '../../types/recurring';
import type { AccountWithBalance } from '../../types/accounts';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { X, Repeat, Calendar, AlertCircle } from 'lucide-react';

interface AddRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RecurringFormData) => Promise<void>;
  accounts: AccountWithBalance[];
  categories: Category[];
  workspaces: Workspace[];
}

export const AddRecurringModal: React.FC<AddRecurringModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  accounts,
  categories,
  workspaces,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [initialAccountId, setInitialAccountId] = useState(accounts[0]?.id || '');
  const [initialWorkspaceId, setInitialWorkspaceId] = useState(workspaces[0]?.id || '');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [txnType, setTxnType] = useState<'expense' | 'income'>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || '');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(todayStr);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const nextDefaultAcc = accounts[0]?.id || '';
      const nextDefaultWs = workspaces[0]?.id || '';
      setInitialAccountId(nextDefaultAcc);
      setInitialWorkspaceId(nextDefaultWs);
      setAccountId(nextDefaultAcc);
      setDescription('');
      setAmount('');
      setTxnType('expense');
      setCategoryId('');
      setWorkspaceId(nextDefaultWs);
      setFrequency('monthly');
      setNextDueDate(todayStr);
      setNotes('');
      setErrorMsg(null);
      setShowUnsavedConfirm(false);
    }
  }, [isOpen, accounts, workspaces]);

  const isDirty =
    accountId !== initialAccountId ||
    description !== '' ||
    amount !== '' ||
    txnType !== 'expense' ||
    categoryId !== '' ||
    workspaceId !== initialWorkspaceId ||
    frequency !== 'monthly' ||
    nextDueDate !== todayStr ||
    notes !== '';

  useEffect(() => {
    if (!isOpen || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isDirty]);

  if (!isOpen) return null;

  const handleRequestClose = () => {
    if (isLoading) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
      setErrorMsg('Description is required.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid positive amount.');
      return;
    }
    if (!accountId) {
      setErrorMsg('Please select an account.');
      return;
    }
    if (!nextDueDate) {
      setErrorMsg('Please specify next due date.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        account_id: accountId,
        description: description.trim(),
        amount: parsedAmount,
        txn_type: txnType,
        category_id: categoryId || null,
        workspace_id: workspaceId || null,
        frequency,
        next_due_date: nextDueDate,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create recurring rule.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Add Recurring Transaction
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Track expected recurring subscriptions, bills, or retainer income
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Type Toggle: Expense vs Income */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setTxnType('expense')}
              className={`py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors cursor-pointer min-h-[44px] ${
                txnType === 'expense'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Expense Outflow
            </button>
            <button
              type="button"
              onClick={() => setTxnType('income')}
              className={`py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors cursor-pointer min-h-[44px] ${
                txnType === 'income'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Income Inflow
            </button>
          </div>

          {/* Description */}
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Description / Payee Name *
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Netflix, WeWork Rent, Consulting Retainer"
              required
            />
          </div>

          {/* Amount & Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Amount (INR) *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="₹ 0.00"
                required
              />
            </div>
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Account *
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency & Next Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Frequency *
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Next Due Date *
              </label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Category & Workspace */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Workspace
              </label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full text-xs sm:text-sm py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[44px]"
              >
                <option value="">No Workspace</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Account number, contract renewal details..."
              className="w-full text-xs sm:text-sm py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
            />
          </div>

          {showUnsavedConfirm && (
            <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
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

          {/* Footer buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button type="button" variant="ghost" size="md" onClick={handleRequestClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isLoading}>
              Save Recurring Rule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
