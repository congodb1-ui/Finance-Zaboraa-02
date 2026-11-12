import { supabase } from '../supabase/client';
import type { Invoice, InvoiceFormData } from '../../types/invoices';

export async function getInvoices(): Promise<Invoice[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('issue_date', { ascending: false });

  if (error) {
    console.error('Error fetching invoices from Supabase:', error.message);
    return [];
  }

  return (data || []) as Invoice[];
}

export async function createInvoice(formData: InvoiceFormData): Promise<Invoice> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      user_id: user.id,
      invoice_number: formData.invoice_number,
      client_name: formData.client_name,
      client_email: formData.client_email || null,
      issue_date: formData.issue_date,
      due_date: formData.due_date || null,
      line_items: formData.line_items || [],
      subtotal: formData.subtotal,
      tax_percent: formData.tax_percent ?? 18,
      total: formData.total,
      status: formData.status || 'draft',
      notes: formData.notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating invoice:', error.message);
    throw new Error(error.message);
  }

  return data as Invoice;
}

export async function updateInvoice(
  id: string,
  updates: Partial<InvoiceFormData>
): Promise<Invoice> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating invoice:', error.message);
    throw new Error(error.message);
  }

  return data as Invoice;
}

export async function deleteInvoice(id: string): Promise<{ success: boolean; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
  return updateInvoice(id, { status: 'paid' });
}
