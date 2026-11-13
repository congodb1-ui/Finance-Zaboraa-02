import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CurrencyPicker } from '../ui/CurrencyPicker';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import {
  createPaymentInstruction,
  updatePaymentInstruction,
  type PaymentInstructionFormData,
} from '../../lib/actions/paymentInstructions';
import type { PaymentInstruction } from '../../types/invoicing';
import { Landmark, X, AlertCircle, Lock } from 'lucide-react';

export interface PaymentInstructionFormProps {
  isOpen: boolean;
  initialData?: PaymentInstruction | null;
  onClose: () => void;
  onSaved: (instruction: PaymentInstruction) => void;
}

interface FormValues {
  label: string;
  beneficiaryName: string;
  currency: string | null;
  isDefault: boolean;
  bankName: string;
  bankAddress: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  ifsc: string;
  intermediaryBank: string;
}

function getInitialValues(initialData?: PaymentInstruction | null): FormValues {
  return {
    label: initialData?.label || '',
    beneficiaryName: initialData?.beneficiary_name || '',
    currency: initialData?.currency || 'USD',
    isDefault: Boolean(initialData?.is_default),
    bankName: initialData?.bank_name || '',
    bankAddress: initialData?.bank_address || '',
    accountNumber: '',
    iban: '',
    swiftBic: initialData?.swift_bic || '',
    ifsc: initialData?.ifsc || '',
    intermediaryBank: initialData?.intermediary_bank || '',
  };
}

export const PaymentInstructionForm: React.FC<PaymentInstructionFormProps> = ({
  isOpen,
  initialData,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialData?.id);

  const [initialValues, setInitialValues] = useState<FormValues>(() =>
    getInitialValues(initialData)
  );
  const [label, setLabel] = useState(initialValues.label);
  const [beneficiaryName, setBeneficiaryName] = useState(initialValues.beneficiaryName);
  const [currency, setCurrency] = useState<string | null>(initialValues.currency);
  const [isDefault, setIsDefault] = useState(initialValues.isDefault);
  const [bankName, setBankName] = useState(initialValues.bankName);
  const [bankAddress, setBankAddress] = useState(initialValues.bankAddress);
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swiftBic, setSwiftBic] = useState(initialValues.swiftBic);
  const [ifsc, setIfsc] = useState(initialValues.ifsc);
  const [intermediaryBank, setIntermediaryBank] = useState(
    initialValues.intermediaryBank
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const next = getInitialValues(initialData);
    setInitialValues(next);
    setLabel(next.label);
    setBeneficiaryName(next.beneficiaryName);
    setCurrency(next.currency);
    setIsDefault(next.isDefault);
    setBankName(next.bankName);
    setBankAddress(next.bankAddress);
    setAccountNumber('');
    setIban('');
    setSwiftBic(next.swiftBic);
    setIfsc(next.ifsc);
    setIntermediaryBank(next.intermediaryBank);
    setErrorMsg(null);
    setShowUnsavedConfirm(false);
  }, [isOpen, initialData]);

  // Clear sensitive plaintext inputs on unmount
  useEffect(() => {
    return () => {
      setAccountNumber('');
      setIban('');
    };
  }, []);

  const isDirty =
    label !== initialValues.label ||
    beneficiaryName !== initialValues.beneficiaryName ||
    currency !== initialValues.currency ||
    isDefault !== initialValues.isDefault ||
    bankName !== initialValues.bankName ||
    bankAddress !== initialValues.bankAddress ||
    accountNumber !== '' ||
    iban !== '' ||
    swiftBic !== initialValues.swiftBic ||
    ifsc !== initialValues.ifsc ||
    intermediaryBank !== initialValues.intermediaryBank;

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
    if (isSaving) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrorMsg('Instruction label is required.');
      return;
    }

    const trimmedBeneficiary = beneficiaryName.trim();
    if (!trimmedBeneficiary) {
      setErrorMsg('Beneficiary name is required.');
      return;
    }

    const normalizedCurrency = (currency || '').trim().toUpperCase();
    if (normalizedCurrency.length !== 3) {
      setErrorMsg('Please select a 3-letter currency.');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createSupabaseClient();

      if (isEditing && initialData?.id) {
        const updatePayload: Partial<PaymentInstructionFormData> = {
          label: trimmedLabel,
          beneficiary_name: trimmedBeneficiary,
          currency: normalizedCurrency,
          is_default: isDefault,
          bank_name: bankName.trim() || null,
          bank_address: bankAddress.trim() || null,
          swift_bic: swiftBic.trim().toUpperCase() || null,
          ifsc: ifsc.trim().toUpperCase() || null,
          intermediary_bank: intermediaryBank.trim() || null,
        };

        if (accountNumber.trim().length > 0) {
          updatePayload.account_number = accountNumber.trim();
        }
        if (iban.trim().length > 0) {
          updatePayload.iban = iban.trim();
        }

        const updated = await updatePaymentInstruction(
          supabase,
          initialData.id,
          updatePayload
        );
        setAccountNumber('');
        setIban('');
        onSaved(updated);
      } else {
        const createPayload: PaymentInstructionFormData = {
          label: trimmedLabel,
          beneficiary_name: trimmedBeneficiary,
          currency: normalizedCurrency,
          is_default: isDefault,
          bank_name: bankName.trim() || null,
          bank_address: bankAddress.trim() || null,
          account_number: accountNumber.trim() || null,
          iban: iban.trim() || null,
          swift_bic: swiftBic.trim().toUpperCase() || null,
          ifsc: ifsc.trim().toUpperCase() || null,
          intermediary_bank: intermediaryBank.trim() || null,
        };

        const created = await createPaymentInstruction(supabase, createPayload);
        setAccountNumber('');
        setIban('');
        onSaved(created);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save payment instruction.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-instruction-form-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="payment-instruction-form-title"
                className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white"
              >
                {isEditing ? 'Edit Payment Instruction' : 'New Payment Instruction'}
              </h2>
              <p className="text-xs text-slate-500">
                Account numbers and IBANs are AES-256-GCM encrypted on the server before storage.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Close modal"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Label *"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. HDFC EEFC USD / NBK KWD"
              required
              disabled={isSaving}
            />

            <Input
              label="Beneficiary Name *"
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Account holder legal name"
              required
              disabled={isSaving}
            />

            <CurrencyPicker
              label="Currency"
              required
              value={currency}
              onChange={setCurrency}
              disabled={isSaving}
              placeholder="Search currency..."
            />

            <Input
              label="Bank Name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. HDFC Bank / National Bank of Kuwait"
              disabled={isSaving}
            />

            <div>
              <Input
                label="Account Number (Encrypted)"
                type="password"
                autoComplete="off"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={
                  isEditing && initialData?.account_number_encrypted
                    ? `••••${initialData.last4 || '••••'} (enter to replace)`
                    : 'Enter bank account number'
                }
                disabled={isSaving}
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3 shrink-0" />
                <span>
                  {isEditing && initialData?.account_number_encrypted
                    ? 'Leave blank to preserve existing encrypted number.'
                    : 'Encrypted on the server (AES-256-GCM); only last 4 digits stored unmasked.'}
                </span>
              </p>
            </div>

            <div>
              <Input
                label="IBAN (Encrypted)"
                type="password"
                autoComplete="off"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder={
                  isEditing && initialData?.iban_encrypted
                    ? '•••••••••••• (enter to replace)'
                    : 'e.g. KW81CBKU0000000000001234560101'
                }
                disabled={isSaving}
              />
              {isEditing && initialData?.iban_encrypted && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Leave blank to preserve existing encrypted IBAN.
                </p>
              )}
            </div>

            <Input
              label="SWIFT / BIC"
              value={swiftBic}
              onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
              placeholder="e.g. HDFCINBBXXX"
              disabled={isSaving}
            />

            <Input
              label="IFSC Code"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="e.g. HDFC0000123"
              disabled={isSaving}
            />
          </div>

          <Input
            label="Bank Address"
            value={bankAddress}
            onChange={(e) => setBankAddress(e.target.value)}
            placeholder="Branch address, city, country"
            disabled={isSaving}
          />

          <Input
            label="Intermediary / Correspondent Bank"
            value={intermediaryBank}
            onChange={(e) => setIntermediaryBank(e.target.value)}
            placeholder="Optional correspondent bank name & SWIFT code for wire transfers"
            disabled={isSaving}
          />

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              disabled={isSaving}
              className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-medium text-slate-900 dark:text-white block">
                Set as default instruction for {currency || 'selected currency'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Automatically selected when generating new invoices in this currency. Replaces any previous default for the same currency.
              </span>
            </div>
          </label>

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

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleRequestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSaving}>
              {isEditing ? 'Save Changes' : 'Save Instruction'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
