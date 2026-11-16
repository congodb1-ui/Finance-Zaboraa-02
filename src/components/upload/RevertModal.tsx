import React, { useState } from 'react';
import type { StatementUpload } from '../../types/uploads';
import { revertImport } from '../../lib/actions/upload';
import { Button } from '../ui/Button';
import { X, Undo2, AlertTriangle } from 'lucide-react';

interface RevertModalProps {
  isOpen: boolean;
  onClose: () => void;
  upload: StatementUpload;
  onReverted: () => void;
}

export const RevertModal: React.FC<RevertModalProps> = ({
  isOpen,
  onClose,
  upload,
  onReverted,
}) => {
  const [isReverting, setIsReverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRevert = async () => {
    setErrorMsg(null);
    setIsReverting(true);

    try {
      await revertImport(upload.id);
      onReverted();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to revert import.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Undo2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Revert Statement Import
              </h3>
              <p className="text-xs text-slate-500">
                Undo import and remove imported transactions
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

        {/* Content */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
              {errorMsg}
            </div>
          )}

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Are you sure you want to revert this import?</span>
            </div>
            <p>
              This will permanently delete{' '}
              <strong className="underline">{upload.row_count || 0} transactions</strong> imported from{' '}
              <span className="font-mono font-medium">{upload.file_name}</span> and restore your account balance.
            </p>
            <p className="text-[11px] opacity-80">
              The file hash lock will be removed so you can re-upload or re-map this statement immediately.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isReverting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRevert}
              isLoading={isReverting}
              leftIcon={<Undo2 className="w-3.5 h-3.5" />}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              Revert Import
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
