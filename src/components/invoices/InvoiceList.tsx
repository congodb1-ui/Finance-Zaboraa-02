import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { InvoiceForm } from './InvoiceForm';
import { formatINR } from '../../types/design-system';
import type { Invoice, InvoiceFormData, InvoiceStatus } from '../../types/invoices';
import {
  getInvoices,
  createInvoice,
  deleteInvoice,
  markInvoicePaid,
} from '../../lib/actions/invoices';
import {
  FileText,
  Plus,
  CheckCircle2,
  Trash2,
  Calendar,
  Mail,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const InvoiceList: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const list = await getInvoices();
      setInvoices(list);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleCreate = async (formData: InvoiceFormData) => {
    setActionLoading(true);
    try {
      const created = await createInvoice(formData);
      setInvoices([created, ...invoices]);
      setIsFormOpen(false);
      setBanner(`Invoice ${created.invoice_number} created successfully.`);
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      alert(`Failed to save invoice: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const updated = await markInvoicePaid(id);
      setInvoices(invoices.map((inv) => (inv.id === id ? updated : inv)));
    } catch (err: any) {
      alert(`Failed to mark invoice as paid: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, num: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${num}?`)) return;
    try {
      const res = await deleteInvoice(id);
      if (res.success) {
        setInvoices(invoices.filter((inv) => inv.id !== id));
      } else {
        alert(res.error || 'Failed to delete');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-800">
            Paid
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
      case 'draft':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Draft
          </span>
        );
    }
  };

  const totalOutstanding = invoices
    .filter((inv) => inv.status !== 'paid')
    .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);

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
            Generate client invoices, track GST provisions, and match incoming client receipts.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsFormOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Invoice
        </Button>
      </div>

      {banner && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{banner}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Outstanding Billed</span>
          <div className="font-heading font-bold text-2xl font-tabular text-amber-600 dark:text-amber-400">
            {formatINR(totalOutstanding)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Awaiting client payment</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Paid Receipts</span>
          <div className="font-heading font-bold text-2xl font-tabular text-green-600 dark:text-green-400">
            {formatINR(totalPaid)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Cleared client funds</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Invoices</span>
          <div className="font-heading font-bold text-2xl font-tabular text-slate-900 dark:text-white">
            {invoices.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {invoices.filter((i) => i.status === 'paid').length} paid /{' '}
            {invoices.filter((i) => i.status !== 'paid').length} pending
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
              <Button size="sm" variant="secondary" onClick={() => setIsFormOpen(true)}>
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
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {inv.client_name}
                      </div>
                      {inv.client_email && (
                        <div className="text-[11px] text-slate-400">{inv.client_email}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-tabular text-slate-600 dark:text-slate-400">
                      <div>Issued: {inv.issue_date}</div>
                      {inv.due_date && (
                        <div className="text-[11px] text-slate-400">Due: {inv.due_date}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-tabular font-bold text-sm text-slate-900 dark:text-white">
                      {formatINR(inv.total)}
                      <div className="text-[10px] text-slate-400 font-normal">
                        incl. {inv.tax_percent}% GST
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(inv.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(inv.id)}
                            className="px-2 py-1 text-[11px] font-medium rounded border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/40 cursor-pointer"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(inv.id, inv.invoice_number)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                          title="Delete invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {isFormOpen && (
        <InvoiceForm
          onSave={handleCreate}
          onCancel={() => setIsFormOpen(false)}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
};
