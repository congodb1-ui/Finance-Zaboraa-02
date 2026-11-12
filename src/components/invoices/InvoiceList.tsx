import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { InvoiceForm } from './InvoiceForm';
import { formatINR } from '../../types/design-system';
import {
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  markInvoicePaid,
} from '../../lib/actions/invoices';
import type { Invoice, InvoiceFormData, InvoiceStatus } from '../../types/invoices';
import {
  FileText,
  Plus,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Edit2,
  Calendar,
  AlertCircle,
  Building2,
  Search,
} from 'lucide-react';

export const InvoiceList: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getInvoices();
      setInvoices(data);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOrUpdate = async (formData: InvoiceFormData) => {
    if (editingInvoice) {
      await updateInvoice(editingInvoice.id, formData);
      setBannerMessage({ type: 'success', text: `Invoice ${formData.invoice_number} updated.` });
    } else {
      await createInvoice(formData);
      setBannerMessage({ type: 'success', text: `Invoice ${formData.invoice_number} created.` });
    }
    setTimeout(() => setBannerMessage(null), 3500);
    await loadData();
  };

  const handleDelete = async (id: string, num: string) => {
    if (!window.confirm(`Are you sure you want to delete invoice ${num}?`)) return;
    try {
      await deleteInvoice(id);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
      setBannerMessage({ type: 'success', text: `Invoice ${num} deleted.` });
      setTimeout(() => setBannerMessage(null), 3500);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to delete invoice.' });
    }
  };

  const handleMarkPaid = async (id: string, num: string) => {
    try {
      await markInvoicePaid(id);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'paid' } : inv))
      );
      setBannerMessage({ type: 'success', text: `Invoice ${num} marked as paid.` });
      setTimeout(() => setBannerMessage(null), 3500);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to update status.' });
    }
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Paid</Badge>;
      case 'sent':
        return <Badge variant="neutral">Sent</Badge>;
      case 'overdue':
        return <Badge variant="danger">Overdue</Badge>;
      case 'draft':
      default:
        return <Badge variant="warning">Draft</Badge>;
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchNum = inv.invoice_number.toLowerCase().includes(q);
      const matchClient = inv.client_name.toLowerCase().includes(q);
      const matchEmail = (inv.client_email || '').toLowerCase().includes(q);
      return matchNum || matchClient || matchEmail;
    }
    return true;
  });

  const totalOutstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + i.total, 0);

  const totalCollected = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Commercial Invoicing
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Client Invoicing & Billing
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Generate, issue, and track commercial client invoices with GST compliance and payment status.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingInvoice(null);
              setIsModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Invoice
          </Button>
        </div>
      </div>

      {bannerMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          {bannerMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Total Invoiced
          </span>
          <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white font-tabular">
            {formatINR(totalOutstanding + totalCollected)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Across {invoices.length} total records
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Outstanding / Pending
          </span>
          <div className="font-heading font-extrabold text-2xl text-amber-600 dark:text-amber-400 font-tabular">
            {formatINR(totalOutstanding)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Awaiting client settlement
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Paid & Collected
          </span>
          <div className="font-heading font-extrabold text-2xl text-emerald-600 dark:text-emerald-400 font-tabular">
            {formatINR(totalCollected)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Successfully realized into vault
          </span>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoice #, client name, or email..."
            className="w-full text-xs bg-transparent focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
              No invoices found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create your first client invoice with custom line items, GST rate, and payment due date.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingInvoice(null);
                setIsModalOpen(true);
              }}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Invoice
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">Total (incl. GST)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {inv.client_name}
                      </div>
                      {inv.client_email && (
                        <div className="text-[11px] text-slate-400 font-mono">
                          {inv.client_email}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {inv.issue_date}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {inv.due_date}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {formatINR(inv.subtotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatINR(inv.total)}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== 'paid' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[11px] py-1 px-2 text-emerald-600 hover:text-emerald-700"
                            onClick={() => handleMarkPaid(inv.id, inv.invoice_number)}
                          >
                            Mark Paid
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingInvoice(inv);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Edit invoice"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(inv.id, inv.invoice_number)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
          </div>
        )}
      </Card>

      {/* Invoice Modal */}
      <InvoiceForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOrUpdate}
        initialData={editingInvoice}
      />
    </div>
  );
};
