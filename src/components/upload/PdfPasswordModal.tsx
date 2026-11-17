import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, KeyRound, HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface PdfPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string, saveLocally?: boolean) => Promise<void> | void;
  fileName?: string;
  accountName?: string;
  error?: string | null;
  isLoading?: boolean;
}

export const PdfPasswordModal: React.FC<PdfPasswordModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  fileName,
  accountName,
  error,
  isLoading = false,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveLocally, setSaveLocally] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setSaveLocally(true);
      // Auto-focus password input after modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    onSubmit(password.trim(), saveLocally);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      data-testid="pdf-password-modal"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-password-title"
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center ring-4 ring-amber-50/50 dark:ring-amber-950/30 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="pdf-password-title"
                className="font-heading font-bold text-base text-slate-900 dark:text-white leading-tight"
              >
                Password-Protected Statement
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[260px]">
                {fileName || 'PDF Statement'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            This PDF statement is encrypted by your bank. Please enter the password to decrypt and parse your transactions.
          </p>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 flex items-start gap-2.5 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {/* Password Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="pdf-statement-password"
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between"
            >
              <span>PDF Password</span>
              <button
                type="button"
                onClick={() => setShowHints(!showHints)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-normal cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Common bank formats</span>
              </button>
            </label>

            <div className="relative">
              <input
                ref={inputRef}
                id="pdf-statement-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                disabled={isLoading}
                required
                className="w-full px-3.5 py-2.5 pr-10 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Save Locally Option */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 cursor-pointer">
            <input
              type="checkbox"
              checked={saveLocally}
              onChange={(e) => setSaveLocally(e.target.checked)}
              disabled={isLoading}
              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100 block">
                Save PDF password locally for {accountName || 'this account'}
              </span>
              Stored only in this browser&apos;s local storage so future PDF uploads auto-unlock without prompting.
            </span>
          </label>

          {/* Hints Accordion */}
          {showHints && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 animate-in fade-in">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                <span>Typical Bank Password Formats:</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-500 dark:text-slate-400">
                <li><strong className="text-slate-700 dark:text-slate-200">HDFC:</strong> Customer ID or DOB (<code className="font-mono">DDMMYYYY</code>)</li>
                <li><strong className="text-slate-700 dark:text-slate-200">SBI:</strong> 11-digit Account No. or DOB + Last 5 mobile digits</li>
                <li><strong className="text-slate-700 dark:text-slate-200">ICICI:</strong> DOB (<code className="font-mono">DDMMYYYY</code>) + Last 4 digits of Account/Debit Card</li>
                <li><strong className="text-slate-700 dark:text-slate-200">Kotak:</strong> CRN (Customer Relationship Number) or DOB</li>
                <li><strong className="text-slate-700 dark:text-slate-200">Axis:</strong> First 4 letters of name (UPPERCASE) + DOB (<code className="font-mono">DDMM</code>)</li>
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isLoading}
              disabled={!password.trim()}
              leftIcon={<KeyRound className="w-3.5 h-3.5" />}
            >
              Unlock & Parse
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
