import { supabase } from '../supabase/client';
import type { Invoice, InvoiceFormData } from '../../types/invoices';

export async function getInvoices(): Promise<Invoice[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get invoices:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    subtotal: Number(row.subtotal || 0),
    tax_percent: Number(row.tax_percent || 0),
    total: Number(row.total || 0),
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
  }));
}

export async function createInvoice(formData: InvoiceFormData): Promise<Invoice> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const lineItems = (formData.line_items || []).filter(
    (item) => item.description.trim() || item.amount > 0
  );
  const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const taxPercent = formData.tax_percent !== undefined ? Number(formData.tax_percent) : 18;
  const taxAmount = (subtotal * taxPercent) / 100;
  const total = subtotal + taxAmount;

  const newRecord = {
    user_id: user.id,
    invoice_number: formData.invoice_number.trim(),
    client_name: formData.client_name.trim(),
    client_email: formData.client_email?.trim() || null,
    issue_date: formData.issue_date,
    due_date: formData.due_date,
    line_items: lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_percent: taxPercent,
    total: Math.round(total * 100) / 100,
    status: formData.status || 'draft',
    notes: formData.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from('invoices')
    .insert([newRecord])
    .select()
    .single();

  if (error) {
    console.error('Failed to create invoice:', error);
    throw new Error(error.message || 'Failed to create invoice');
  }

  return {
    ...data,
    subtotal: Number(data.subtotal),
    tax_percent: Number(data.tax_percent),
    total: Number(data.total),
    line_items: Array.isArray(data.line_items) ? data.line_items : [],
  };
}

export async function updateInvoice(
  id: string,
  updates: Partial<InvoiceFormData>
): Promise<Invoice> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const patchData: any = {};
  if (updates.invoice_number !== undefined) patchData.invoice_number = updates.invoice_number.trim();
  if (updates.client_name !== undefined) patchData.client_name = updates.client_name.trim();
  if (updates.client_email !== undefined) patchData.client_email = updates.client_email.trim() || null;
  if (updates.issue_date !== undefined) patchData.issue_date = updates.issue_date;
  if (updates.due_date !== undefined) patchData.due_date = updates.due_date;
  if (updates.status !== undefined) patchData.status = updates.status;
  if (updates.notes !== undefined) patchData.notes = updates.notes?.trim() || null;

  if (updates.line_items !== undefined || updates.tax_percent !== undefined) {
    const lineItems = updates.line_items || [];
    const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const taxPercent = updates.tax_percent !== undefined ? Number(updates.tax_percent) : 18;
    const total = subtotal + (subtotal * taxPercent) / 100;

    patchData.line_items = lineItems;
    patchData.subtotal = Math.round(subtotal * 100) / 100;
    patchData.tax_percent = taxPercent;
    patchData.total = Math.round(total * 100) / 100;
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(patchData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update invoice:', error);
    throw new Error(error.message || 'Failed to update invoice');
  }

  return {
    ...data,
    subtotal: Number(data.subtotal),
    tax_percent: Number(data.tax_percent),
    total: Number(data.total),
    line_items: Array.isArray(data.line_items) ? data.line_items : [],
  };
}

export async function deleteInvoice(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete invoice:', error);
    throw new Error(error.message || 'Failed to delete invoice');
  }
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
  return updateInvoice(id, { status: 'paid' });
}
