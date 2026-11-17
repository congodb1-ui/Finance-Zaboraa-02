import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { CATEGORY_PALETTE } from '../../types/design-system';
import {
  type AccountFormData,
  type AccountWithBalance,
  type AccountType,
  ACCOUNT_TYPE_LABELS,
} from '../../types/accounts';
import {
  X,
  Check,
  Landmark,
  Building2,
  CreditCard,
  Wallet,
  Briefcase,
  PiggyBank,
  AlertCircle,
} from 'lucide-react';

interface AccountFormProps {
  initialData?: AccountWithBalance | null;
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ICON_OPTIONS = [
  { id: 'Landmark', label: 'Bank', Icon: Landmark },
  { id: 'Building2', label: 'Business', Icon: Building2 },
  { id: 'CreditCard', label: 'Card', Icon: CreditCard },
  { id: 'Wallet', label: 'Wallet', Icon: Wallet },
  { id: 'Briefcase', label: 'Work', Icon: Briefcase },
  { id: 'PiggyBank', label: 'Savings', Icon: PiggyBank },
] as const;

export const AccountForm: React.FC<AccountFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const isEditing = !!initialData;

  const [name, setName] = useState(initialData?.name || '');
  const [bankName, setBankName] = useState(initialData?.bank_name || '');
  const [accountType, setAccountType] = useState<AccountType>(
    initialData?.account_type || 'savings'
  );
  const [purpose, setPurpose] = useState<string>(initialData?.purpose || 'personal');
  const [last4, setLast4] = useState(initialData?.account_number_last4 || '');
  const [ifsc, setIfsc] = useState(initialData?.ifsc || '');
  const [upiId, setUpiId] = useState(initialData?.upi_id || '');
  const [pdfPassword, setPdfPassword] = useState(initialData?.pdf_password || '');
  const [accountHolderName, setAccountHolderName] = useState(
    initialData?.account_holder_name || ''
  );
  const [operatedByOwner, setOperatedByOwner] = useState<boolean>(
    initialData?.operated_by_owner ?? true
  );
  const [openingBalance, setOpeningBalance] = useState<string>(
    initialData?.opening_balance !== undefined && initialData?.opening_balance !== null
      ? String(initialData.opening_balance)
      : '0'
  );
  const [openingDate, setOpeningDate] = useState<string>(initialData?.opening_date || '');
  const [isActive, setIsActive] = useState<boolean>(initialData ? initialData.is_active : true);
  const [icon, setIcon] = useState<string>(initialData?.icon || 'Landmark');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [colorIndex, setColorIndex] = useState<number>(initialData?.color_index ?? 0);

  // Credit card specific fields
  const [creditLimit, setCreditLimit] = useState<string>(
    initialData?.credit_limit ? String(initialData.credit_limit) : ''
  );
  const [billingCycleDay, setBillingCycleDay] = useState<string>(
    initialData?.billing_cycle_day ? String(initialData.billing_cycle_day) : ''
  );
  const [paymentDueDay, setPaymentDueDay] = useState<string>(
    initialData?.payment_due_day ? String(initialData.payment_due_day) : ''
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setBankName(initialData.bank_name);
      setAccountType(initialData.account_type);
      setPurpose(initialData.purpose || 'personal');
      setLast4(initialData.account_number_last4 || '');
      setIfsc(initialData.ifsc || '');
      setUpiId(initialData.upi_id || '');
      setPdfPassword(initialData.pdf_password || '');
      setAccountHolderName(initialData.account_holder_name || '');
      setOperatedByOwner(initialData.operated_by_owner ?? true);
      setOpeningBalance(
        initialData.opening_balance !== undefined && initialData.opening_balance !== null
          ? String(initialData.opening_balance)
          : '0'
      );
      setOpeningDate(initialData.opening_date || '');
      setIsActive(initialData.is_active);
      setIcon(initialData.icon || 'Landmark');
      setNotes(initialData.notes || '');
      setColorIndex(initialData.color_index ?? 0);
      setCreditLimit(initialData.credit_limit ? String(initialData.credit_limit) : '');
      setBillingCycleDay(
        initialData.billing_cycle_day ? String(initialData.billing_cycle_day) : ''
      );
      setPaymentDueDay(initialData.payment_due_day ? String(initialData.payment_due_day) : '');
    }
  }, [initialData]);

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!name.trim()) errs.name = 'Account nickname is required.';
    if (!bankName.trim()) errs.bankName = 'Bank or institution name is required.';

    if (last4.trim()) {
      if (!/^\d{1,4}$/.test(last4.trim())) {
        errs.last4 = 'Must be numbers only (1 to 4 digits).';
      }
    }

    if (ifsc.trim() && !/^[A-Za-z0-9]{4,15}$/.test(ifsc.trim())) {
      errs.ifsc = 'Enter a valid alphanumeric IFSC code.';
    }

    if (openingBalance.trim() && isNaN(Number(openingBalance))) {
      errs.openingBalance = 'Opening balance must be a valid number.';
    }

    if (accountType === 'credit_card') {
      if (creditLimit && isNaN(Number(creditLimit))) {
        errs.creditLimit = 'Credit limit must be a valid number.';
      }
      if (billingCycleDay) {
        const d = Number(billingCycleDay);
        if (isNaN(d) || d < 1 || d > 31) {
          errs.billingCycleDay = 'Day must be between 1 and 31.';
        }
      }
      if (paymentDueDay) {
        const d = Number(paymentDueDay);
        if (isNaN(d) || d < 1 || d > 31) {
          errs.paymentDueDay = 'Day must be between 1 and 31.';
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const formData: AccountFormData = {
      name: name.trim(),
      bank_name: bankName.trim(),
      account_type: accountType,
      purpose: purpose || 'personal',
      account_number_last4: last4.trim() ? last4.trim() : null,
      ifsc: ifsc.trim() ? ifsc.trim().toUpperCase() : null,
      upi_id: upiId.trim() ? upiId.trim() : null,
      pdf_password: pdfPassword.trim() ? pdfPassword.trim() : null,
      account_holder_name: accountHolderName.trim() ? accountHolderName.trim() : null,
      operated_by_owner: operatedByOwner,
      opening_balance: openingBalance.trim() ? Number(openingBalance) : 0,
      opening_date: openingDate.trim() ? openingDate.trim() : null,
      currency: initialData?.currency || 'INR',
      is_active: isActive,
      color_index: colorIndex,
      icon: icon || 'Landmark',
      notes: notes.trim() ? notes.trim() : null,
      credit_limit:
        accountType === 'credit_card' && creditLimit ? Number(creditLimit) : null,
      billing_cycle_day:
        accountType === 'credit_card' && billingCycleDay ? Number(billingCycleDay) : null,
      payment_due_day:
        accountType === 'credit_card' && paymentDueDay ? Number(paymentDueDay) : null,
    };

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save account.');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isLoading || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{isEditing ? 'Edit Account' : 'Register New Account'}</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditing
                  ? 'Update account metadata, ownership, and statement matching settings'
                  : 'Add a bank account, credit card, or wallet for statement mapping'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Account Name & Account Holder */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Account Nickname *"
                placeholder="e.g. HDFC Savings (3597)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                disabled={busy}
              />

              <Input
                label="Account Holder Name"
                placeholder="e.g. Wasim Salim Sayyed"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                disabled={busy}
              />
            </div>

            {/* Bank Name, Account Type, Purpose */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Bank / Provider Name *"
                placeholder="e.g. HDFC Bank, Kotak"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                error={errors.bankName}
                disabled={busy}
              />

              <Select
                label="Account Type *"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                disabled={busy}
                options={Object.entries(ACCOUNT_TYPE_LABELS).map(([val, label]) => ({
                  value: val,
                  label,
                }))}
              />

              <Select
                label="Purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={busy}
                options={[
                  { value: 'personal', label: 'Personal' },
                  { value: 'business', label: 'Business' },
                ]}
              />
            </div>

            {/* Last 4, IFSC, UPI ID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Account Number (Last 4)"
                placeholder="e.g. 3597"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value)}
                error={errors.last4}
                disabled={busy}
              />

              <Input
                label="IFSC Code"
                placeholder="e.g. HDFC0000123"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                error={errors.ifsc}
                disabled={busy}
              />

              <Input
                label="UPI ID"
                placeholder="e.g. name@okaxis"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                disabled={busy}
              />
            </div>

            {/* Default PDF Password for Statement Imports */}
            <Input
              label="Statement PDF Password (Optional)"
              type="password"
              placeholder="Saved password used to automatically unlock uploaded PDF statements"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              disabled={busy}
            />

            {/* Opening Balance, Opening Date, Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Opening Balance (₹)"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                error={errors.openingBalance}
                disabled={busy}
              />

              <Input
                label="Opening Date"
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                disabled={busy}
              />

              <Input
                label="Notes (Optional)"
                placeholder="e.g. Primary tax account"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </div>

            {/* Credit Card Conditional Section */}
            {accountType === 'credit_card' && (
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 space-y-3">
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider block">
                  Credit Card Parameters
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="Credit Limit (₹)"
                    placeholder="e.g. 300000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    error={errors.creditLimit}
                    disabled={busy}
                  />

                  <Input
                    label="Billing Cycle Day"
                    placeholder="1–31"
                    maxLength={2}
                    value={billingCycleDay}
                    onChange={(e) => setBillingCycleDay(e.target.value)}
                    error={errors.billingCycleDay}
                    disabled={busy}
                  />

                  <Input
                    label="Payment Due Day"
                    placeholder="1–31"
                    maxLength={2}
                    value={paymentDueDay}
                    onChange={(e) => setPaymentDueDay(e.target.value)}
                    error={errors.paymentDueDay}
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            {/* Toggles: Operated by Owner & Is Active */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={operatedByOwner}
                  onChange={(e) => setOperatedByOwner(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Operated by Owner
                  </span>
                  <span className="text-slate-500">
                    Include in automatic self-transfer detection
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Active Account
                  </span>
                  <span className="text-slate-500">
                    Include balance in active portfolio totals
                  </span>
                </span>
              </label>
            </div>

            {/* Icon & Categorical Color Swatch Picker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">
                  Account Icon
                </label>
                <div className="flex items-center flex-wrap gap-2">
                  {ICON_OPTIONS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setIcon(id)}
                      disabled={busy}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        icon === id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">
                  Card Color Swatch (Fixed 10-Color Palette)
                </label>
                <div className="flex items-center flex-wrap gap-2">
                  {CATEGORY_PALETTE.map((hex, idx) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setColorIndex(idx)}
                      disabled={busy}
                      className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center cursor-pointer ${
                        colorIndex === idx
                          ? 'scale-110 ring-2 ring-indigo-500 ring-offset-2'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select color swatch ${idx}`}
                    >
                      {colorIndex === idx && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={busy}>
              {isEditing ? 'Save Changes' : 'Register Account'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
