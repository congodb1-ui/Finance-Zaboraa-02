import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatINR } from '../../types/design-system';
import type { Invoice, InvoiceFormData, InvoiceLineItem } from '../../types/invoices';
import { X, Plus, Trash2, FileText, Calendar, User, Mail, Percent } from 'lucide-react';

interface InvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  initialData?: Invoice | null;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taxPercent, setTaxPercent] = useState<number>(18);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue'>('draft');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { description: 'Consulting & Financial Services', amount: 50000 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setInvoiceNumber(initialData.invoice_number);
      setClientName(initialData.client_name);
      setClientEmail(initialData.client_email || '');
      setIssueDate(initialData.issue_date);
      setDueDate(initialData.due_date);
      setTaxPercent(initialData.tax_percent ?? 18);
      setNotes(initialData.notes || '');
      setStatus(initialData.status);
      setLineItems(
        initialData.line_items.length > 0
          ? initialData.line_items
          : [{ description: '', amount: 0 }]
      );
    } else {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const dueStr = due.toISOString().split('T')[0];
      const randomNum = Math.floor(1000 + Math.random() * 9000);

      setInvoiceNumber(`INV-${today.getFullYear()}-${randomNum}`);
      setClientName('');
      setClientEmail('');
      setIssueDate(todayStr);
      setDueDate(dueStr);
      setTaxPercent(18);
      setNotes('');
      setStatus('draft');
      setLineItems([{ description: 'Professional Services', amount: 25000 }]);
    }
    setErrorMsg(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', amount: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) {
      setLineItems([{ description: '', amount: 0 }]);
      return;
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: 'description' | 'amount', value: any) => {
    const updated = [...lineItems];
    if (field === 'amount') {
      updated[index].amount = Math.max(0, Number(value) || 0);
    } else {
      updated[index].description = value;
    }
    setLineItems(updated);
  };

  const subtotal = lineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const taxAmount = (subtotal * (Number(taxPercent) || 0)) / 100;
  const total = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setErrorMsg('Client name is required.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice number is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit({
        invoice_number: invoiceNumber,
        client_name: clientName,
        client_email: clientEmail,
        issue_date: issueDate,
        due_date: dueDate,
        line_items: lineItems,
        tax_percent: taxPercent,
        notes,
        status,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                {initialData ? 'Edit Invoice' : 'Create New Invoice'}
              </h2>
              <p className="text-xs text-slate-500">
                GST-compliant commercial invoicing with automatic tax & subtotal computation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Invoice Number *
              </label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-001"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client Name *
              </label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Technologies Pvt Ltd"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client Email
              </label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="accounts@acme.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Issue Date *
              </label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Due Date *
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Line Items
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLineItem}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Item
              </Button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.description}
                    onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                    placeholder="Description of item or service..."
                    className="flex-1 text-xs"
                  />
                  <div className="w-32">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={item.amount || ''}
                      onChange={(e) => handleLineItemChange(idx, 'amount', e.target.value)}
                      placeholder="Amount ₹"
                      className="text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLineItem(idx)}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax & Summary Calculation */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatINR(subtotal)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span>GST Tax Rate (%):</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-center"
                />
              </div>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                +{formatINR(taxAmount)}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
              <span>Grand Total:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400 text-base">
                {formatINR(total)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notes / Payment Details
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Bank: HDFC Bank, IFSC: HDFC0001234, Account: 50100987654321"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              {initialData ? 'Update Invoice' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
