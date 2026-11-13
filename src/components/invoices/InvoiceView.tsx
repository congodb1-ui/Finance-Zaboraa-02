import React, { useEffect, useMemo, useState } from 'react';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import { getInvoiceV2, cancelInvoice, undoPayment } from '../../lib/actions/invoicesV2';
import { getLogoSignedUrl } from '../../lib/actions/businessProfile';
import { RecordPaymentModal } from './RecordPaymentModal';
import { formatCurrency, getDecimalsForCurrency } from '../../lib/data/currencies';
import { countryCodeToFlag, getCountryByCode } from '../../lib/data/countries';
import { formatINR } from '../../types/design-system';
import type { InvoiceLineItem } from '../../types/invoices';
import type {
  BankSnapshot,
  ClientSnapshot,
  InvoiceStatusV2,
  InvoiceV2,
  SellerSnapshot,
} from '../../types/invoicing';
import {
  ArrowLeft,
  Printer,
  Pencil,
  Ban,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  IndianRupee,
  RotateCcw,
  ArrowUpRight,
} from 'lucide-react';

export interface InvoiceViewProps {
  invoiceId: string;
  onNavigate?: (path: string) => void;
}

type ExtendedSellerSnapshot = SellerSnapshot & {
  city?: string | null;
  default_footer?: string | null;
};

type ExtendedLineItem = InvoiceLineItem & {
  sac_hsn?: string | null;
  hsn_sac?: string | null;
  sac?: string | null;
  hsn?: string | null;
  unit?: string | null;
};

function getLineSacHsn(item: ExtendedLineItem): string {
  return (item.sac_hsn || item.hsn_sac || item.sac || item.hsn || '').trim();
}

function getLineUnit(item: ExtendedLineItem): string {
  return (item.unit || '').trim();
}

function getMaskedAccountNumber(bank: BankSnapshot): string | null {
  if (bank.last4 && bank.last4.trim()) {
    return `••••${bank.last4.trim().slice(-4)}`;
  }
  if (bank.account_number && bank.account_number.trim()) {
    const clean = bank.account_number.replace(/\s+/g, '');
    return `••••${clean.slice(-4)}`;
  }
  return null;
}

function getMaskedIban(bank: BankSnapshot): string | null {
  const raw = bank.iban?.trim();
  if (!raw) return null;
  if (raw === '[encrypted]') return 'On file (encrypted)';
  const compact = raw.replace(/\s+/g, '');
  if (compact.length <= 8) return '••••';
  return `${compact.slice(0, 4)} ••• ${compact.slice(-4)}`;
}

function roundToDecimals(value: number, decimals: number): number {
  const safe = Math.max(0, Math.min(6, decimals));
  const factor = Math.pow(10, safe);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getStatusBadgeInfo(status: InvoiceStatusV2): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'paid':
      return {
        label: 'Paid',
        className: 'bg-green-50 text-green-700 border-green-200',
      };
    case 'partial':
      return {
        label: 'Partial',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'sent':
      return {
        label: 'Sent',
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    case 'overdue':
      return {
        label: 'Overdue',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-slate-100 text-slate-600 border-slate-300 line-through',
      };
    case 'draft':
    default:
      return {
        label: 'Draft',
        className: 'bg-slate-100 text-slate-700 border-slate-300',
      };
  }
}

export const InvoiceView: React.FC<InvoiceViewProps> = ({ invoiceId, onNavigate }) => {
  const [invoice, setInvoice] = useState<InvoiceV2 | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [undoingPayment, setUndoingPayment] = useState(false);
  const [linkedTxn, setLinkedTxn] = useState<{
    id: string;
    txn_date: string;
    description: string;
    credit: number;
  } | null>(null);

  const goTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.hash = path.replace(/^\//, '');
    }
  };

  useEffect(() => {
    let active = true;

    async function loadInvoice() {
      setLoading(true);
      setNotFound(false);
      setErrorMsg(null);
      setLogoUrl(null);
      setShowCancelConfirm(false);
      setStatusNotice(null);

      try {
        const supabase = createSupabaseClient();
        const data = await getInvoiceV2(supabase, invoiceId);
        if (!active) return;

        if (!data) {
          setNotFound(true);
          setInvoice(null);
          return;
        }

        setInvoice(data);

        const seller = data.seller_snapshot as ExtendedSellerSnapshot | null;
        if (seller?.logo_path) {
          try {
            const signed = await getLogoSignedUrl(supabase, seller.logo_path);
            if (active) setLogoUrl(signed);
          } catch {
            // Non-fatal: fall back to company name text if signed URL cannot load
            if (active) setLogoUrl(null);
          }
        }
      } catch (err: any) {
        if (!active) return;
        const msg = err?.message || 'Failed to load invoice.';
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('invalid input')) {
          setNotFound(true);
        } else {
          setErrorMsg(msg);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (invoiceId) {
      loadInvoice();
    } else {
      setNotFound(true);
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [invoiceId]);

  useEffect(() => {
    let active = true;
    async function loadLinkedTransaction() {
      if (!invoice?.linked_transaction_id) {
        setLinkedTxn(null);
        return;
      }
      try {
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !active) return;

        const { data } = await supabase
          .from('transactions')
          .select('id, txn_date, description, credit')
          .eq('id', invoice.linked_transaction_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!active) return;
        if (data) {
          setLinkedTxn({
            id: data.id,
            txn_date: data.txn_date,
            description: data.description || '',
            credit: Number(data.credit) || 0,
          });
        } else {
          setLinkedTxn(null);
        }
      } catch {
        if (active) setLinkedTxn(null);
      }
    }
    loadLinkedTransaction();
    return () => {
      active = false;
    };
  }, [invoice?.linked_transaction_id]);

  const handlePrint = () => {
    window.print();
  };

  const handleConfirmCancel = async () => {
    if (!invoice) return;
    setCancelling(true);
    setErrorMsg(null);
    try {
      const supabase = createSupabaseClient();
      await cancelInvoice(supabase, invoice.id);
      setInvoice((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
      setShowCancelConfirm(false);
      setStatusNotice(`Invoice ${invoice.invoice_number} has been cancelled.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to cancel invoice.');
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmUndoPayment = async () => {
    if (!invoice) return;
    setUndoingPayment(true);
    setErrorMsg(null);
    try {
      const supabase = createSupabaseClient();
      const updated = await undoPayment(supabase, invoice.id);
      setInvoice(updated);
      setLinkedTxn(null);
      setShowUndoConfirm(false);
      setStatusNotice(`Payment record reset. Invoice ${updated.invoice_number} is marked Sent.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to undo payment.');
    } finally {
      setUndoingPayment(false);
    }
  };

  const lineItems = useMemo(
    () => ((invoice?.line_items as ExtendedLineItem[]) || []),
    [invoice]
  );

  const showSacColumn = useMemo(
    () => lineItems.some((item) => getLineSacHsn(item).length > 0),
    [lineItems]
  );

  const showUnitColumn = useMemo(
    () => lineItems.some((item) => getLineUnit(item).length > 0),
    [lineItems]
  );

  const showDiscountColumn = useMemo(
    () => lineItems.some((item) => Number(item.discount || 0) > 0),
    [lineItems]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span>Loading invoice document...</span>
        </div>
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-9 h-9 text-slate-400 mx-auto" />
          <div>
            <h1 className="font-heading font-bold text-lg text-slate-900">
              Invoice not found
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {errorMsg ||
                'The requested invoice does not exist or you do not have permission to view it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => goTo('/invoices')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Invoices</span>
          </button>
        </div>
      </div>
    );
  }

  const seller = (invoice.seller_snapshot || {}) as ExtendedSellerSnapshot;
  const client = (invoice.client_snapshot || null) as ClientSnapshot | null;
  const bank = (invoice.bank_snapshot || null) as BankSnapshot | null;

  const currencyCode = (invoice.currency || 'INR').toUpperCase();
  const decimals = getDecimalsForCurrency(currencyCode);
  const taxPercent = Number(invoice.tax_percent || 0);
  const taxAmount = roundToDecimals(
    Number(invoice.total || 0) - Number(invoice.subtotal || 0),
    decimals
  );

  const sellerCountryObj = seller.country ? getCountryByCode(seller.country) : undefined;
  const sellerLocationLine = [seller.city, sellerCountryObj?.name || seller.country]
    .filter(Boolean)
    .join(', ');

  const effectiveClientName = client?.name || invoice.client_name;
  const effectiveClientCompany =
    client?.company_name && client.company_name !== effectiveClientName
      ? client.company_name
      : null;
  const effectiveClientAddress = client?.address || null;
  const effectiveClientCity = client?.city || null;
  const effectiveClientCountryCode = client?.country || invoice.country || null;
  const clientCountryObj = effectiveClientCountryCode
    ? getCountryByCode(effectiveClientCountryCode)
    : undefined;
  const clientFlag = countryCodeToFlag(effectiveClientCountryCode);
  const effectiveClientEmail = client?.email || invoice.client_email || null;
  const effectiveClientPhone = client?.phone || null;
  const effectiveClientTaxId = client?.tax_id || null;

  const maskedAccount = bank ? getMaskedAccountNumber(bank) : null;
  const maskedIban = bank ? getMaskedIban(bank) : null;

  const statusBadge = getStatusBadgeInfo(invoice.status);
  const canEdit = invoice.status === 'draft';
  const canCancel =
    invoice.status !== 'draft' &&
    invoice.status !== 'cancelled' &&
    invoice.status !== 'paid';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-6 px-4 sm:px-6 print:bg-white print:p-0">
      {/* Dedicated Print CSS */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
          }

          .screen-only {
            display: none !important;
          }

          #invoice-print-area {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          table {
            page-break-inside: avoid;
          }

          tr {
            page-break-inside: avoid;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Screen-Only Top Bar */}
      <div className="screen-only max-w-[210mm] mx-auto mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs">
          <button
            type="button"
            onClick={() => goTo('/invoices')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Invoices</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => goTo(`/invoices/${invoice.id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Cancel Invoice</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>

        {/* Inline Cancel Confirmation */}
        {showCancelConfirm && (
          <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-medium">
              Cancel invoice {invoice.invoice_number}? Its number remains reserved and status will be marked cancelled.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelConfirm(false)}
                className="px-3 py-1 rounded border border-amber-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Keep Invoice
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancel}
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 font-medium cursor-pointer disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Draft Warning Banner */}
        {invoice.status === 'draft' && (
          <div className="p-3 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-900 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0" />
            <span className="font-medium">
              This is a draft. Issue the invoice before sharing.
            </span>
          </div>
        )}

        {statusNotice && (
          <div className="p-3 rounded-xl border border-green-300 bg-green-50 text-green-800 flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Screen-Only Payment Section */}
        {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment
                </h2>
                {invoice.status === 'sent' && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    Awaiting payment realization in {currencyCode}.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(invoice.status === 'sent' || invoice.status === 'partial') && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUndoConfirm(false);
                      setIsPaymentModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                  >
                    <IndianRupee className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}

                {(invoice.status === 'partial' || invoice.status === 'paid') && (
                  <button
                    type="button"
                    onClick={() => setShowUndoConfirm((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Undo Payment</span>
                  </button>
                )}
              </div>
            </div>

            {invoice.status === 'partial' && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-tabular">
                  <span className="text-slate-700">
                    Received:{' '}
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(Number(invoice.amount_received || 0), currencyCode)}
                    </span>{' '}
                    of {formatCurrency(Number(invoice.total || 0), currencyCode)}
                  </span>
                  {invoice.inr_received !== null && (
                    <span className="text-slate-600">
                      INR credited:{' '}
                      <span className="font-semibold text-slate-900">
                        {formatINR(Number(invoice.inr_received || 0))}
                      </span>
                    </span>
                  )}
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{
                      width: `${
                        Number(invoice.total || 0) > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (Number(invoice.amount_received || 0) /
                                  Number(invoice.total || 1)) *
                                  100
                              )
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {invoice.status === 'paid' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs font-tabular">
                <div>
                  <span className="text-slate-500 block">Paid Amount</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(
                      Number(invoice.amount_received ?? invoice.total ?? 0),
                      currencyCode
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">INR Received</span>
                  <span className="font-semibold text-green-700">
                    {invoice.inr_received !== null && invoice.inr_received !== undefined
                      ? formatINR(Number(invoice.inr_received))
                      : invoice.inr_equivalent !== null
                      ? formatINR(Number(invoice.inr_equivalent))
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Date Paid</span>
                  <span className="font-semibold text-slate-900">
                    {invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : '—'}
                  </span>
                </div>
              </div>
            )}

            {invoice.linked_transaction_id && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-slate-700 font-tabular">
                  {linkedTxn ? (
                    <span>
                      Linked transaction: {linkedTxn.txn_date} {linkedTxn.description}{' '}
                      <span className="font-semibold text-green-700">
                        {formatINR(linkedTxn.credit)}
                      </span>
                    </span>
                  ) : (
                    <span>Linked transaction: {invoice.linked_transaction_id}</span>
                  )}
                </div>
                <a
                  href="#transactions"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo('/transactions');
                  }}
                  className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline cursor-pointer"
                >
                  <span>View in Transactions</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {showUndoConfirm && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-medium">
                  This will reset the payment record. Continue?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={undoingPayment}
                    onClick={() => setShowUndoConfirm(false)}
                    className="px-3 py-1 rounded border border-amber-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={undoingPayment}
                    onClick={handleConfirmUndoPayment}
                    className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 font-medium cursor-pointer disabled:opacity-50"
                  >
                    {undoingPayment ? 'Resetting...' : 'Confirm Reset'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Printable A4 Invoice Document */}
      <div
        id="invoice-print-area"
        className="max-w-[210mm] mx-auto bg-white text-black border border-slate-200 rounded-xl shadow-sm p-8 sm:p-12 space-y-8"
      >
        {/* HEADER ROW */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-300">
          <div className="space-y-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={seller.company_name || 'Company Logo'}
                className="max-w-[160px] max-h-[80px] object-contain"
              />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-black">
                {seller.company_name || 'Zaboraa Finance'}
              </div>
            )}
          </div>

          <div className="sm:text-right space-y-1.5">
            <div className="flex sm:justify-end items-center gap-2.5">
              <h1 className="text-3xl font-bold tracking-wider uppercase text-black">
                INVOICE
              </h1>
              <span
                className={`screen-only px-2 py-0.5 rounded text-[11px] font-medium border ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <div className="text-sm font-mono font-semibold text-black">
              {invoice.invoice_number}
            </div>
            <div className="text-xs text-slate-700 font-tabular space-y-0.5">
              <div>
                <span className="text-slate-500">Issue Date:</span>{' '}
                <span className="font-medium text-black">{invoice.issue_date}</span>
              </div>
              {invoice.due_date && (
                <div>
                  <span className="text-slate-500">Due Date:</span>{' '}
                  <span className="font-medium text-black">{invoice.due_date}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SELLER & CLIENT BLOCKS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs leading-relaxed">
          {/* Seller Block (Left, always LTR) */}
          <div className="space-y-1 text-slate-800" dir="ltr">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              From
            </div>
            {seller.company_name && (
              <div className="text-sm font-bold text-black">{seller.company_name}</div>
            )}
            {seller.address && (
              <div className="whitespace-pre-line">{seller.address}</div>
            )}
            {sellerLocationLine && <div>{sellerLocationLine}</div>}
            <div className="space-y-0.5 pt-1">
              {seller.email && <div>Email: {seller.email}</div>}
              {seller.phone && <div>Phone: {seller.phone}</div>}
              {seller.website && <div>Website: {seller.website}</div>}
            </div>
            {(seller.gstin || seller.iec || seller.lut_number) && (
              <div className="space-y-0.5 pt-1.5 text-slate-900">
                {seller.gstin && (
                  <div>
                    <span className="font-semibold">GSTIN:</span>{' '}
                    <span className="font-mono">{seller.gstin}</span>
                  </div>
                )}
                {seller.iec && (
                  <div>
                    <span className="font-semibold">IEC:</span>{' '}
                    <span className="font-mono">{seller.iec}</span>
                  </div>
                )}
                {seller.lut_number && (
                  <div>
                    Supply under LUT No.{' '}
                    <span className="font-mono font-semibold">{seller.lut_number}</span>
                    {seller.lut_date ? ` valid until ${seller.lut_date}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Client Block (Right, dir="auto" for Arabic/RTL name & address safety) */}
          <div className="space-y-1 text-slate-800 sm:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Bill To:
            </div>
            <div className="text-sm font-bold text-black">
              <span dir="auto">{effectiveClientName}</span>
            </div>
            {effectiveClientCompany && (
              <div className="font-medium text-black">
                <span dir="auto">{effectiveClientCompany}</span>
              </div>
            )}
            {effectiveClientAddress && (
              <div className="whitespace-pre-line">
                <span dir="auto">{effectiveClientAddress}</span>
              </div>
            )}
            {(effectiveClientCity || effectiveClientCountryCode) && (
              <div>
                {effectiveClientCity && (
                  <span dir="auto">{effectiveClientCity}</span>
                )}
                {effectiveClientCity && effectiveClientCountryCode ? ', ' : ''}
                {effectiveClientCountryCode && (
                  <span>
                    {clientFlag ? `${clientFlag} ` : ''}
                    {clientCountryObj?.name || effectiveClientCountryCode}
                  </span>
                )}
              </div>
            )}
            <div className="space-y-0.5 pt-1">
              {effectiveClientEmail && (
                <div>
                  <span dir="auto">{effectiveClientEmail}</span>
                </div>
              )}
              {effectiveClientPhone && (
                <div>
                  <span dir="auto">{effectiveClientPhone}</span>
                </div>
              )}
              {effectiveClientTaxId && (
                <div className="pt-1 text-slate-900">
                  <span className="font-semibold">VAT No.:</span>{' '}
                  <span dir="auto" className="font-mono">
                    {effectiveClientTaxId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-400 bg-slate-100 text-black font-semibold">
                <th className="py-2.5 px-2.5 text-left w-10">#</th>
                <th className="py-2.5 px-2.5 text-left">Description</th>
                {showSacColumn && (
                  <th className="py-2.5 px-2.5 text-left">SAC/HSN</th>
                )}
                <th className="py-2.5 px-2.5 text-right">Qty</th>
                {showUnitColumn && <th className="py-2.5 px-2.5 text-left">Unit</th>}
                <th className="py-2.5 px-2.5 text-right">Unit Price</th>
                {showDiscountColumn && (
                  <th className="py-2.5 px-2.5 text-right">Discount</th>
                )}
                <th className="py-2.5 px-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => {
                const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
                const unitPrice =
                  item.unit_price !== undefined && item.unit_price !== null
                    ? Number(item.unit_price)
                    : Number(item.rate) || 0;
                const discount = Number(item.discount || 0);
                const amount = Number(item.amount || 0);
                const sacCode = getLineSacHsn(item);
                const unitLabel = getLineUnit(item);

                return (
                  <tr
                    key={item.id || idx}
                    className={`border-b border-slate-200 ${
                      idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-2.5 px-2.5 font-tabular text-slate-600 align-top">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-2.5 text-black align-top">
                      <span dir="auto" className="whitespace-pre-line">
                        {item.description}
                      </span>
                    </td>
                    {showSacColumn && (
                      <td className="py-2.5 px-2.5 font-mono text-slate-700 align-top">
                        {sacCode || '—'}
                      </td>
                    )}
                    <td className="py-2.5 px-2.5 text-right font-tabular text-black align-top">
                      {qty}
                    </td>
                    {showUnitColumn && (
                      <td className="py-2.5 px-2.5 text-slate-700 align-top">
                        {unitLabel || '—'}
                      </td>
                    )}
                    <td className="py-2.5 px-2.5 text-right font-tabular text-black align-top whitespace-nowrap">
                      {formatCurrency(unitPrice, currencyCode)}
                    </td>
                    {showDiscountColumn && (
                      <td className="py-2.5 px-2.5 text-right font-tabular text-slate-700 align-top whitespace-nowrap">
                        {discount > 0 ? formatCurrency(discount, currencyCode) : '—'}
                      </td>
                    )}
                    <td className="py-2.5 px-2.5 text-right font-tabular font-semibold text-black align-top whitespace-nowrap">
                      {formatCurrency(amount, currencyCode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* TOTALS BLOCK (Right-Aligned) */}
        <div className="flex justify-end">
          <div className="w-full sm:w-80 space-y-2 text-xs font-tabular">
            <div className="flex items-center justify-between text-slate-700">
              <span>Subtotal</span>
              <span className="font-medium text-black">
                {formatCurrency(Number(invoice.subtotal || 0), currencyCode)}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>
                {taxPercent === 0
                  ? 'Export — 0% (LUT)'
                  : `${invoice.tax_label || 'GST'} ${taxPercent}%`}
              </span>
              <span className="font-medium text-black">
                {formatCurrency(taxAmount, currencyCode)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t-2 border-slate-900 text-base font-bold text-black">
              <span>Total</span>
              <span>
                {formatCurrency(Number(invoice.total || 0), currencyCode, {
                  includeCode: true,
                })}
              </span>
            </div>

            {currencyCode !== 'INR' &&
              invoice.exchange_rate !== null &&
              invoice.inr_equivalent !== null && (
                <div className="text-[11px] text-slate-600 text-right pt-1">
                  ≈ {formatINR(Number(invoice.inr_equivalent))} (at{' '}
                  {invoice.exchange_rate} {currencyCode}/INR on {invoice.issue_date})
                </div>
              )}
          </div>
        </div>

        {/* PAYMENT INSTRUCTIONS BLOCK */}
        {bank && (
          <div className="p-4 rounded-lg border border-slate-300 bg-slate-50/70 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
              <h2 className="font-bold uppercase tracking-wider text-[11px] text-black">
                Payment Details
              </h2>
              <span className="px-2 py-0.5 rounded border border-slate-300 bg-white font-mono text-[11px] font-semibold text-black">
                {bank.currency || currencyCode}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-slate-800">
              {bank.beneficiary_name && (
                <div>
                  <span className="text-slate-500">Beneficiary:</span>{' '}
                  <span className="font-semibold text-black">
                    {bank.beneficiary_name}
                  </span>
                </div>
              )}
              {bank.bank_name && (
                <div>
                  <span className="text-slate-500">Bank Name:</span>{' '}
                  <span className="font-medium text-black">{bank.bank_name}</span>
                </div>
              )}
              {bank.bank_address && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Bank Address:</span>{' '}
                  <span>{bank.bank_address}</span>
                </div>
              )}
              {maskedAccount && (
                <div>
                  <span className="text-slate-500">Account No.:</span>{' '}
                  <span className="font-mono font-semibold text-black">
                    {maskedAccount}
                  </span>
                </div>
              )}
              {maskedIban && (
                <div>
                  <span className="text-slate-500">IBAN:</span>{' '}
                  <span className="font-mono font-semibold text-black">
                    {maskedIban}
                  </span>
                </div>
              )}
              {bank.swift_bic && (
                <div>
                  <span className="text-slate-500">SWIFT/BIC:</span>{' '}
                  <span className="font-mono font-semibold text-black">
                    {bank.swift_bic}
                  </span>
                </div>
              )}
              {bank.ifsc && (
                <div>
                  <span className="text-slate-500">IFSC:</span>{' '}
                  <span className="font-mono font-semibold text-black">{bank.ifsc}</span>
                </div>
              )}
              {bank.intermediary_bank && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Intermediary Bank:</span>{' '}
                  <span>{bank.intermediary_bank}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NOTES */}
        {invoice.notes && (
          <div className="space-y-1 text-xs pt-2">
            <div className="font-semibold text-black">Notes:</div>
            <div className="text-slate-700 whitespace-pre-line">{invoice.notes}</div>
          </div>
        )}

        {/* FOOTER */}
        <div className="pt-6 border-t border-slate-200 space-y-2 text-center">
          {seller.default_footer && (
            <div className="text-xs text-slate-700 whitespace-pre-line">
              {seller.default_footer}
            </div>
          )}
          <div className="text-[11px] text-slate-500">
            This invoice was generated by Zaboraa Finance.
          </div>
        </div>
      </div>

      <div className="screen-only">
        <RecordPaymentModal
          isOpen={isPaymentModalOpen}
          invoice={invoice}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={(updated) => {
            setInvoice(updated);
            setIsPaymentModalOpen(false);
            setStatusNotice(
              updated.status === 'paid'
                ? `Payment recorded. Invoice ${updated.invoice_number} is now marked Paid.`
                : `Partial payment recorded for invoice ${updated.invoice_number}.`
            );
          }}
        />
      </div>
    </div>
  );
};
