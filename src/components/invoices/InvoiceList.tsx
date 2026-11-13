import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { InvoiceForm } from './InvoiceForm';
import { formatINR } from '../../types/design-system';
import { formatCurrency } from '../../lib/data/currencies';
import { countryCodeToFlag } from '../../lib/data/countries';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import type { InvoiceStatusV2, InvoiceV2, InvoiceV2FormData } from '../../types/invoicing';
import {
  getInvoicesV2,
  createInvoiceV2,
  updateInvoiceV2,
  cancelInvoice,
  deleteDraftInvoiceV2,
  markInvoicePaidV2,
} from '../../lib/actions/invoicesV2';
import {
  FileText,
  Plus,
  CheckCircle2,
  Trash2,
  Pencil,
  Ban,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react';

export interface InvoiceListProps {
  onViewInvoice?: (id: string) => void;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({ onViewInvoice }) => {
  const navigateToInvoice = (id: string) => {
    if (onViewInvoice) {
      onViewInvoice(id);
    } else {
      window.location.hash = `invoices/${id}`;
    }
  };
  const [invoices, setInvoices] = useState<InvoiceV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceV2 | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const list = await getInvoicesV2(supabase);
      setInvoices(list);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      setBanner({ type: 'error', text: err?.message || 'Failed to load invoices.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenCreate = () => {
    setEditingInvoice(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (inv: InvoiceV2) => {
    if (inv.status !== 'draft') return;
    setEditingInvoice(inv);
    setIsFormOpen(true);
  };

  const handleSave = async (formData: InvoiceV2FormData, isEdit: boolean) => {
    setActionLoading(true);
    try {
      const supabase = createSupabaseClient();
      if (isEdit && editingInvoice) {
        const updated = await updateInvoiceV2(supabase, editingInvoice.id, formData);
        setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
        setIsFormOpen(false);
        setEditingInvoice(null);
        setBanner({
          type: 'success',
          text: `Invoice ${updated.invoice_number} updated successfully.`,
        });
      } else {
        const created = await createInvoiceV2(supabase, formData);
        setInvoices((prev) => [created, ...prev]);
        setIsFormOpen(false);
        setEditingInvoice(null);
        setBanner({
          type: 'success',
          text: `Invoice ${created.invoice_number} created successfully.`,
        });
      }
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: `Failed to save invoice: ${err.message}` });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const supabase = createSupabaseClient();
      const updated = await markInvoicePaidV2(supabase, id);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
      setBanner({ type: 'success', text: `Invoice ${updated.invoice_number} marked as paid.` });
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: `Failed to mark invoice as paid: ${err.message}` });
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const supabase = createSupabaseClient();
      await cancelInvoice(supabase, id);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'cancelled' } : inv))
      );
      setConfirmCancelId(null);
      setBanner({ type: 'success', text: 'Invoice cancelled.' });
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to cancel invoice.' });
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      const supabase = createSupabaseClient();
      await deleteDraftInvoiceV2(supabase, id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setConfirmDeleteId(null);
      setBanner({ type: 'success', text: 'Draft invoice deleted.' });
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to delete invoice.' });
    }
  };

  const getStatusBadge = (status: InvoiceStatusV2) => {
    switch (status) {
      case 'paid':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-800">
            Paid
          </span>
        );
      case 'partial':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Partial
          </span>
        );
      case 'sent':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Sent
          </span>
        );
      case 'overdue':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800">
            Overdue
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 border border-slate-200 dark:border-slate-700 line-through">
            Cancelled
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Draft
          </span>
        );
    }
  };

  const outstandingInvoices = invoices.filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'cancelled'
  );
  const unpricedFxOutstandingCount = outstandingInvoices.filter(
    (inv) => inv.currency !== 'INR' && inv.inr_equivalent === null
  ).length;

  const totalOutstandingINR = outstandingInvoices.reduce((acc, inv) => {
    if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
      return acc + (Number(inv.inr_equivalent) || 0);
    }
    if ((inv.currency || 'INR').toUpperCase() === 'INR') {
      return acc + (Number(inv.total) || 0);
    }
    return acc;
  }, 0);

  const totalPaidINR = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((acc, inv) => {
      if (inv.inr_received !== null && inv.inr_received !== undefined) {
        return acc + (Number(inv.inr_received) || 0);
      }
      if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
        return acc + (Number(inv.inr_equivalent) || 0);
      }
      if ((inv.currency || 'INR').toUpperCase() === 'INR') {
        return acc + (Number(inv.total) || 0);
      }
      return acc;
    }, 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Client Billing</span>
          </div>
          <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
            Invoicing & Client Ledgers
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate multi-currency client invoices, track tax provisions, and match incoming receipts.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Invoice
        </Button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            banner.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
          }`}
        >
          {banner.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Outstanding (INR Eq.)</span>
          <div className="font-heading font-bold text-2xl font-tabular text-amber-600 dark:text-amber-400">
            {formatINR(totalOutstandingINR)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {unpricedFxOutstandingCount > 0
              ? `Excludes ${unpricedFxOutstandingCount} FX invoice(s) without rate`
              : 'Awaiting client payment'}
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Paid Receipts (INR)</span>
          <div className="font-heading font-bold text-2xl font-tabular text-green-600 dark:text-green-400">
            {formatINR(totalPaidINR)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Cleared client funds</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Invoices</span>
          <div className="font-heading font-bold text-2xl font-tabular text-slate-900 dark:text-white">
            {invoices.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {invoices.filter((i) => i.status === 'paid').length} paid ·{' '}
            {outstandingInvoices.length} open ·{' '}
            {invoices.filter((i) => i.status === 'cancelled').length} cancelled
          </span>
        </Card>
      </div>

      {/* Invoices Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Invoices</CardTitle>
          <span className="text-xs text-slate-500 font-mono">{invoices.length} records</span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Loading invoices...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-3">
              <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p>No client invoices created yet.</p>
              <Button size="sm" variant="secondary" onClick={handleOpenCreate}>
                Create First Invoice
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Invoice #</th>
                  <th className="py-2.5 px-4 font-medium">Client</th>
                  <th className="py-2.5 px-4 font-medium">Issue / Due Date</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total Amount</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => {
                  const flag = countryCodeToFlag(inv.country);
                  const currencyCode = (inv.currency || 'INR').toUpperCase();
                  const isForeign = currencyCode !== 'INR';

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <a
                          href={`#invoices/${inv.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateToInvoice(inv.id);
                          }}
                          className="font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          {inv.invoice_number}
                        </a>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {currencyCode}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                          {flag && <span aria-hidden="true">{flag}</span>}
                          <span>{inv.client_name}</span>
                        </div>
                        {(inv.client_email || inv.country) && (
                          <div className="text-[11px] text-slate-400">
                            {[inv.country, inv.client_email].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-tabular text-slate-600 dark:text-slate-400">
                        <div>Issued: {inv.issue_date}</div>
                        {inv.due_date && (
                          <div className="text-[11px] text-slate-400">Due: {inv.due_date}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-tabular">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {formatCurrency(inv.total, currencyCode)}
                        </div>
                        {isForeign && inv.inr_equivalent !== null && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            ≈ {formatINR(inv.inr_equivalent)}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-normal">
                          incl. {inv.tax_percent}% {inv.tax_label || 'GST'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">{getStatusBadge(inv.status)}</td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigateToInvoice(inv.id)}
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded cursor-pointer"
                            title="View / Print invoice"
                            aria-label={`View invoice ${inv.invoice_number}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {inv.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(inv)}
                              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded cursor-pointer"
                              title="Edit draft invoice"
                              aria-label={`Edit draft invoice ${inv.invoice_number}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(inv.id)}
                              className="px-2 py-1 text-[11px] font-medium rounded border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/40 cursor-pointer"
                            >
                              Mark Paid
                            </button>
                          )}

                          {inv.status !== 'paid' &&
                            inv.status !== 'cancelled' &&
                            (confirmCancelId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCancel(inv.id)}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
                                >
                                  Confirm Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelId(null)}
                                  className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setConfirmCancelId(inv.id);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-600 rounded cursor-pointer"
                                title="Cancel invoice"
                                aria-label={`Cancel invoice ${inv.invoice_number}`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            ))}

                          {inv.status === 'draft' &&
                            (confirmDeleteId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDraft(inv.id)}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmCancelId(null);
                                  setConfirmDeleteId(inv.id);
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                                title="Delete draft invoice"
                                aria-label={`Delete draft invoice ${inv.invoice_number}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {isFormOpen && (
        <InvoiceForm
          initialData={editingInvoice}
          onSave={handleSave}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingInvoice(null);
          }}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
};
