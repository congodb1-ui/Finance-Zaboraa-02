export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceLineItem {
  id?: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_email?: string | null;
  issue_date: string;
  due_date: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_percent: number;
  total: number;
  status: InvoiceStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceFormData {
  invoice_number: string;
  client_name: string;
  client_email?: string;
  issue_date: string;
  due_date: string;
  line_items: InvoiceLineItem[];
  tax_percent?: number;
  notes?: string;
  status?: InvoiceStatus;
}
