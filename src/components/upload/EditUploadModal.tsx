import React, { useState, useEffect } from 'react';
import type { StatementUpload } from '../../types/uploads';
import type { AccountWithBalance } from '../../types/accounts';
import { getAccounts } from '../../lib/actions/accounts';
import { updateUploadDetails } from '../../lib/actions/upload';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { X, Edit3, Save, AlertCircle } from 'lucide-react';

interface EditUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  upload: StatementUpload;
  onSaved: (updatedUpload: StatementUpload) => void;
}

export const EditUploadModal: React.FC<EditUploadModalProps> = ({
  isOpen,
  onClose,
  upload,
  onSaved,
}) => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [accountId, setAccountId] = useState(upload.account_id || '');
  const [bankName, setBankName] = useState(
    upload.bank_name || upload.account?.bank_name || ''
  );
  const [periodStart, setPeriodStart] = useState(upload.statement_period_start || '');
  const [periodEnd, setPeriodEnd] = useState(upload.statement_period_end || '');
  const [fileLabel, setFileLabel] = useState(upload.file_label || upload.file_name || '');

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAccountId(upload.account_id || '');
      setBankName(upload.bank_name || upload.account?.bank_name || '');
      setPeriodStart(upload.statement_period_start || '');
      setPeriodEnd(upload.statement_period_end || '');
      setFileLabel(upload.file_label || upload.file_name || '');
      setErrorMsg(null);

      getAccounts()
        .then((accs) => {
          setAccounts(accs);
          if (!upload.account_id && accs.length > 0) {
            setAccountId(accs[0].id);
          }
        })
        .catch((err) => {
          console.error('Failed to load accounts in edit modal:', err);
        })
        .finally(() => {
          setIsLoadingAccounts(false);
        });
    }
  }, [isOpen, upload]);

  if (!isOpen) return null;

  const accountOptions = accounts.map((acc) => ({
    value: acc.id,
    label: `${acc.name} (${acc.bank_name || 'Bank'} · ${acc.account_number_last4 || '••••'})`,
  }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);

    try {
      const res = await updateUploadDetails(upload.id, {
        account_id: accountId,
        bank_name: bankName,
        statement_period_start: periodStart || null,
        statement_period_end: periodEnd || null,
        file_label: fileLabel || null,
      });

      onSaved(res.upload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update statement upload.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Edit Upload Details
              </h3>
              <p className="text-xs text-slate-500">
                Remap account or adjust metadata for this statement upload
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Select
            label="Mapped Bank Account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accountOptions}
            disabled={isLoadingAccounts || isSaving}
            helperText="Changing account moves all associated transactions automatically."
          />

          <Input
            label="Bank Name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. HDFC Bank, ICICI Bank"
            disabled={isSaving}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Statement Period From"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              disabled={isSaving}
            />
            <Input
              label="Statement Period To"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <Input
            label="File Label / Nickname"
            value={fileLabel}
            onChange={(e) => setFileLabel(e.target.value)}
            placeholder="e.g. FY26 HDFC Savings Account"
            disabled={isSaving}
          />

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Details
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
