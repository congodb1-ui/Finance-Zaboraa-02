import React, { useState, useEffect } from 'react';
import type { RuleFormData, MatchField, MatchType } from '../../types/transactions';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import { testRulePreview } from '../../lib/actions/rules';
import { Button } from '../ui/Button';
import { X, Sliders, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

interface AddRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RuleFormData) => Promise<void>;
  categories: Category[];
  workspaces: Workspace[];
  nextDefaultPriority?: number;
}

export const AddRuleModal: React.FC<AddRuleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categories,
  workspaces,
  nextDefaultPriority = 10,
}) => {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(nextDefaultPriority);
  const [matchField, setMatchField] = useState<MatchField>('description');
  const [matchType, setMatchType] = useState<MatchType>('contains');
  const [matchValue, setMatchValue] = useState('');
  const [setCategory, setSetCategory] = useState('');
  const [setWorkspace, setSetWorkspace] = useState('');
  const [setTxnType, setSetTxnType] = useState<any>('');
  const [setTagsInput, setSetTagsInput] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [testResultCount, setTestResultCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPriority(nextDefaultPriority);
      setMatchField('description');
      setMatchType('contains');
      setMatchValue('');
      setSetCategory('');
      setSetWorkspace('');
      setSetTxnType('');
      setSetTagsInput('');
      setTestResultCount(null);
      setErrorMsg(null);
      setShowUnsavedConfirm(false);
    }
  }, [isOpen, nextDefaultPriority]);

  const isDirty =
    name !== '' ||
    Number(priority) !== nextDefaultPriority ||
    matchField !== 'description' ||
    matchType !== 'contains' ||
    matchValue !== '' ||
    setCategory !== '' ||
    setWorkspace !== '' ||
    setTxnType !== '' ||
    setTagsInput !== '';

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
    if (isSubmitting) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  // Match types dynamically adapted based on match_field
  const availableMatchTypes: { value: MatchType; label: string }[] =
    matchField === 'amount'
      ? [
          { value: 'gte', label: 'Greater Than or Equal (>=)' },
          { value: 'lte', label: 'Less Than or Equal (<=)' },
          { value: 'exact', label: 'Exact Equal (==)' },
        ]
      : [
          { value: 'contains', label: 'Contains (case-insensitive)' },
          { value: 'starts_with', label: 'Starts with' },
          { value: 'exact', label: 'Exact match' },
          { value: 'regex', label: 'Regular Expression' },
        ];

  const handleFieldChange = (newField: MatchField) => {
    setMatchField(newField);
    if (newField === 'amount') {
      setMatchType('gte');
    } else {
      setMatchType('contains');
    }
    setTestResultCount(null);
  };

  const handleTestRule = async () => {
    if (!matchValue.trim()) {
      setErrorMsg('Please enter a match value to test.');
      return;
    }
    setErrorMsg(null);
    setIsTesting(true);
    try {
      const count = await testRulePreview({
        match_field: matchField,
        match_type: matchType,
        match_value: matchValue.trim(),
      });
      setTestResultCount(count);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to test rule.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Rule name is required.');
      return;
    }
    if (!matchValue.trim()) {
      setErrorMsg('Match value is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const parsedTags = setTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSubmit({
        name: name.trim(),
        priority: Number(priority) || 100,
        match_field: matchField,
        match_type: matchType,
        match_value: matchValue.trim(),
        set_category: setCategory || null,
        set_workspace: setWorkspace || null,
        set_txn_type: setTxnType || null,
        set_tags: parsedTags.length > 0 ? parsedTags : null,
        is_active: true,
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save rule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Create Transaction Rule
              </h2>
              <span className="text-xs text-slate-500">
                Automatically categorizes imported bank statement transactions
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Rule Name & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-slate-700 dark:text-slate-300 font-medium block">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Swiggy Food Delivery"
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-300 font-medium block" title="Lowest runs first">
                Priority Number
              </label>
              <input
                type="number"
                required
                min="1"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Condition Box: Field + Type + Value */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Match Condition (WHEN)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Field</label>
                <select
                  value={matchField}
                  onChange={(e) => handleFieldChange(e.target.value as MatchField)}
                  className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="description">Description</option>
                  <option value="reference_number">Reference Number / UTR</option>
                  <option value="amount">Amount</option>
                  <option value="txn_type">Transaction Type</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Match Operator</label>
                <select
                  value={matchType}
                  onChange={(e) => {
                    setMatchType(e.target.value as MatchType);
                    setTestResultCount(null);
                  }}
                  className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {availableMatchTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-500 text-[11px] block">Match Value String / Number</label>
              <input
                type="text"
                required
                value={matchValue}
                onChange={(e) => {
                  setMatchValue(e.target.value);
                  setTestResultCount(null);
                }}
                placeholder={matchField === 'amount' ? '1000' : 'SWIGGY'}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>

            {/* Test Rule Button & Preview Result */}
            <div className="pt-1 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestRule}
                isLoading={isTesting}
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
              >
                Test Rule against Ledger
              </Button>

              {testResultCount !== null && (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Matches {testResultCount} existing transaction{testResultCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          {/* Action Box: Set Category, Workspace, Type, Tags */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Actions to Apply (THEN)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Set Category</label>
                <select
                  value={setCategory}
                  onChange={(e) => setSetCategory(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Do not change</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Set Workspace</label>
                <select
                  value={setWorkspace}
                  onChange={(e) => setSetWorkspace(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Do not change</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Set Transaction Type</label>
                <select
                  value={setTxnType}
                  onChange={(e) => setSetTxnType(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Do not change</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                  <option value="refund">Refund</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] block">Set Tags (comma-separated)</label>
                <input
                  type="text"
                  value={setTagsInput}
                  onChange={(e) => setSetTagsInput(e.target.value)}
                  placeholder="e.g. food, delivery"
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {showUnsavedConfirm && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
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

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="ghost" size="sm" type="button" onClick={handleRequestClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Save Rule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
