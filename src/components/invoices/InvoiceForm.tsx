import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatINR } from '../../types/design-system';
import type { InvoiceFormData, InvoiceLineItem } from '../../types/invoices';
import { Plus, Trash2, X, Calculator } from 'lucide-react';

interface InvoiceFormProps {
  onSave: (data: InvoiceFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({ onSave, onCancel, isLoading }) => {
  const [invoiceNumber, setInvoiceNumber] = useState(
    `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`
  );
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<'draft' | 'sent' | 'paid'>('draft');
  const [notes, setNotes] = useState('');
  const [taxPercent, setTaxPercent] = useState<number>(18);

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    {
      id: 'item_1',
      description: 'Consulting Services',
      quantity: 1,
      rate: 25000,
      amount: 25000,
    },
  ]);

  const [error, setError] = useState<string | null>(null);

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, val: any) => {
    const updated = [...lineItems];
    const item = { ...updated[index], [field]: val };

    if (field === 'rate' || field === 'quantity') {
      const q = Number(item.quantity) || 1;
      const r = Number(item.rate) || 0;
      item.amount = q * r;
    }

    updated[index] = item;
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: `item_${Date.now()}`,
        description: '',
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  const taxAmount = (subtotal * (Number(taxPercent) || 0)) / 100;
  const total = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Client Name is required.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }

    try {
      await onSave({
        invoice_number: invoiceNumber.trim(),
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        line_items: lineItems,
        subtotal,
        tax_percent: Number(taxPercent) || 0,
        total,
        status,
        notes: notes.trim() || null,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Create Client Invoice</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate an invoice for billing and auto-matching incoming client payments
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

          <CardContent className="space-y-5 pt-3">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Invoice Number *"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
              />
              <Input
                label="Client / Business Name *"
                placeholder="e.g. Acme Corp India"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
              <Input
                label="Client Email"
                type="email"
                placeholder="billing@acme.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Issue Date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
                <Input
                  label="Due Date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Line Items
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addLineItem}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Service or item description"
                      value={item.description}
                      onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                      className="flex-1 py-1.5 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      min="1"
                      value={item.quantity || 1}
                      onChange={(e) =>
                        handleLineItemChange(idx, 'quantity', parseInt(e.target.value) || 1)
                      }
                      className="w-16 py-1.5 px-2 text-xs text-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Rate (₹)"
                      min="0"
                      value={item.rate || ''}
                      onChange={(e) =>
                        handleLineItemChange(idx, 'rate', parseFloat(e.target.value) || 0)
                      }
                      className="w-28 py-1.5 px-3 text-xs text-right font-tabular rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      required
                    />
                    <div className="w-24 text-right text-xs font-tabular font-semibold text-slate-700 dark:text-slate-300">
                      {formatINR(item.amount || 0)}
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations & Tax */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">GST / Tax (%):</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  className="w-16 py-1 px-2 text-xs text-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1 text-right font-tabular">
                <div className="text-slate-500">Subtotal: {formatINR(subtotal)}</div>
                <div className="text-slate-500">
                  Tax ({taxPercent}%): {formatINR(taxAmount)}
                </div>
                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                  Total: {formatINR(total)}
                </div>
              </div>
            </div>

            <Input
              label="Notes / Terms (Optional)"
              placeholder="e.g. Payment due within 15 days via NEFT/IMPS"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>

          <CardFooter className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" size="md" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isLoading}>
              Save Invoice
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
