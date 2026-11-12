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
import { X, Check } from 'lucide-react';

interface AccountFormProps {
  initialData?: AccountWithBalance | null;
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

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
  const [last4, setLast4] = useState(initialData?.account_number_last4 || '');
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

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setBankName(initialData.bank_name);
      setAccountType(initialData.account_type);
      setLast4(initialData.account_number_last4 || '');
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
    if (!validate()) return;

    const formData: AccountFormData = {
      name: name.trim(),
      bank_name: bankName.trim(),
      account_type: accountType,
      account_number_last4: last4.trim() ? last4.trim() : null,
      currency: 'INR',
      is_active: initialData ? initialData.is_active : true,
      color_index: colorIndex,
      notes: notes.trim() ? notes.trim() : null,
      credit_limit:
        accountType === 'credit_card' && creditLimit ? Number(creditLimit) : null,
      billing_cycle_day:
        accountType === 'credit_card' && billingCycleDay ? Number(billingCycleDay) : null,
      payment_due_day:
        accountType === 'credit_card' && paymentDueDay ? Number(paymentDueDay) : null,
    };

    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{isEditing ? 'Edit Account' : 'Register New Account'}</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditing
                  ? 'Update details for statement auto-matching and health monitoring'
                  : 'Add a bank account, credit card, or wallet for statement mapping'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Account Name */}
            <Input
              label="Account Nickname *"
              placeholder="e.g. HDFC Salary Main, SBI Business Current"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              helperText="How this account is labeled across your dashboard and statements"
            />

            {/* Bank Name & Account Type Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Bank / Provider Name *"
                placeholder="e.g. HDFC, SBI, ICICI, Paytm"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                error={errors.bankName}
              />

              <Select
                label="Account Type *"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                options={Object.entries(ACCOUNT_TYPE_LABELS).map(([val, label]) => ({
                  value: val,
                  label,
                }))}
              />
            </div>

            {/* Account Number Last 4 & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Account Number (Last 4 Digits Only)"
                placeholder="e.g. 4819"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value)}
                error={errors.last4}
                helperText="For security, never enter full account numbers"
              />

              <Input
                label="Notes (Optional)"
                placeholder="e.g. UPI linked, Primary tax deduction account"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
                  />

                  <Input
                    label="Billing Cycle Day"
                    placeholder="1–31"
                    maxLength={2}
                    value={billingCycleDay}
                    onChange={(e) => setBillingCycleDay(e.target.value)}
                    error={errors.billingCycleDay}
                  />

                  <Input
                    label="Payment Due Day"
                    placeholder="1–31"
                    maxLength={2}
                    value={paymentDueDay}
                    onChange={(e) => setPaymentDueDay(e.target.value)}
                    error={errors.paymentDueDay}
                  />
                </div>
              </div>
            )}

            {/* Categorical Color Swatch Picker (PRD §6.3) */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">
                Card Color Swatch (Fixed 10-Color Palette)
              </label>
              <div className="flex items-center flex-wrap gap-2.5">
                {CATEGORY_PALETTE.map((hex, idx) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColorIndex(idx)}
                    className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center cursor-pointer ${
                      colorIndex === idx ? 'scale-110 ring-2 ring-indigo-500 ring-offset-2' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                    aria-label={`Select color swatch ${idx}`}
                  >
                    {colorIndex === idx && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" size="md" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isLoading}>
              {isEditing ? 'Save Changes' : 'Register Account'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
