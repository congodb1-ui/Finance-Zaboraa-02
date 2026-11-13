import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TransactionPicker } from './TransactionPicker';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import { recordPayment } from '../../lib/actions/invoicesV2';
import { formatCurrency, getDecimalsForCurrency } from '../../lib/data/currencies';
import { formatINR } from '../../types/design-system';
import type { InvoiceV2 } from '../../types/invoicing';
import { X, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export interface RecordPaymentModalProps {
  isOpen: boolean;
  invoice: InvoiceV2;
  onClose: () => void;
  onSuccess: (updatedInvoice: InvoiceV2) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  invoice,
  onClose,
  onSuccess,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const currencyCode = (invoice.currency || 'INR').toUpperCase();
  const decimals = getDecimalsForCurrency(currencyCode);
  const stepValue = decimals === 3 ? '0.001' : decimals === 0 ? '1' : '0.01';

  const [amountReceived, setAmountReceived] = useState('');
  const [inrReceived, setInrReceived] = useState('');
  const [bankCharges, setBankCharges] = useState('0');
  const [paidAt, setPaidAt] = useState(todayIso);
  const [linkedTransactionId, setLinkedTransactionId] = useState<string | null>(
    invoice.linked_transaction_id || null
  );
  const [notes, setNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const initialSnapshotRef = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    const defaultPaidAt = new Date().toISOString().slice(0, 10);
    const defaultLinkedTxn = invoice.linked_transaction_id || null;
    setAmountReceived('');
    setInrReceived('');
    setBankCharges('0');
    setPaidAt(defaultPaidAt);
    setLinkedTransactionId(defaultLinkedTxn);
    setNotes('');
    setErrorMsg(null);
    setShowUnsavedConfirm(false);

    initialSnapshotRef.current = JSON.stringify({
      amountReceived: '',
      inrReceived: '',
      bankCharges: '0',
      paidAt: defaultPaidAt,
      linkedTransactionId: defaultLinkedTxn,
      notes: '',
    });
  }, [isOpen, invoice.id, invoice.linked_transaction_id]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    return (
      JSON.stringify({
        amountReceived,
        inrReceived,
        bankCharges,
        paidAt,
        linkedTransactionId,
        notes,
      }) !== initialSnapshotRef.current
    );
  }, [isOpen, amountReceived, inrReceived, bankCharges, paidAt, linkedTransactionId, notes]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleRequestClose = () => {
    if (isSaving) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const existingReceived = Number(invoice.amount_received ?? 0) || 0;
  const parsedAmount = parseFloat(amountReceived);
  const enteredAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const projectedTotalReceived = existingReceived + enteredAmount;
  const invoiceTotal = Number(invoice.total || 0);
  const percentReceived =
    invoiceTotal > 0 ? Math.min(100, Math.round((projectedTotalReceived / invoiceTotal) * 100)) : 0;
  const willBePaid = projectedTotalReceived >= invoiceTotal && invoiceTotal > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const amt = parseFloat(amountReceived);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMsg(`Please enter a valid Amount Received in ${currencyCode}.`);
      return;
    }

    const inr = parseFloat(inrReceived);
    if (!Number.isFinite(inr) || inr < 0) {
      setErrorMsg('Please enter a valid Amount Credited to Bank (₹).');
      return;
    }

    const charges = bankCharges.trim() === '' ? 0 : parseFloat(bankCharges);
    if (!Number.isFinite(charges) || charges < 0) {
      setErrorMsg('Bank charges must be zero or positive.');
      return;
    }

    if (!paidAt) {
      setErrorMsg('Date Received is required.');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createSupabaseClient();
      const updated = await recordPayment(supabase, invoice.id, {
        amount_received: amt,
        inr_received: inr,
        bank_charges: charges,
        paid_at: paidAt,
        linked_transaction_id: linkedTransactionId || undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record payment.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <Card className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <CardTitle>Record Payment</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-tabular">
                Invoice {invoice.invoice_number} · Total {formatCurrency(invoiceTotal, currencyCode)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close payment modal"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="space-y-4 pt-5">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={`Amount Received (${currencyCode}) *`}
                type="number"
                step={stepValue}
                min="0"
                placeholder={String(invoice.total)}
                value={amountReceived}
                onChange={(e) => {
                  const val = e.target.value;
                  setAmountReceived(val);
                  if (currencyCode === 'INR' && inrReceived === '') {
                    setInrReceived(val);
                  }
                }}
                className="font-tabular"
                required
              />

              <Input
                label="Amount Credited to Bank (₹) *"
                type="number"
                step="0.01"
                min="0"
                placeholder={
                  invoice.inr_equivalent
                    ? String(invoice.inr_equivalent)
                    : 'e.g. 125000.00'
                }
                value={inrReceived}
                onChange={(e) => setInrReceived(e.target.value)}
                className="font-tabular"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Bank / Transfer Charges (₹)"
                type="number"
                step="0.01"
                min="0"
                value={bankCharges}
                onChange={(e) => setBankCharges(e.target.value)}
                className="font-tabular"
                helperText="Deducted by the bank. For records only — does not affect invoice total."
              />

              <Input
                label="Date Received *"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="font-tabular"
                required
              />
            </div>

            <TransactionPicker
              value={linkedTransactionId}
              onChange={setLinkedTransactionId}
              helperText="Match this payment to an INR credit in your accounts."
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="payment-notes"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Notes (Optional)
              </label>
              <textarea
                id="payment-notes"
                rows={2}
                placeholder="e.g. Wire reference / FIRC number"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Summary Line */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-tabular text-slate-700 dark:text-slate-300">
                Total received so far:{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(projectedTotalReceived, currencyCode)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(invoiceTotal, currencyCode)}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">({percentReceived}%)</span>
              </div>

              {willBePaid ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Invoice will be marked Paid</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <Clock className="w-3 h-3" />
                  <span>Invoice will be marked Partial</span>
                </span>
              )}
            </div>

            {invoice.inr_equivalent !== null && Number(inrReceived) > 0 && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-tabular">
                Indicative invoice INR estimate: {formatINR(Number(invoice.inr_equivalent))}
              </div>
            )}
          </CardContent>

          {showUnsavedConfirm && (
            <div className="mx-6 mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
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

          <CardFooter className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
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
              Save Payment
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
