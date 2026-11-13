import type { InvoiceStatusV2, InvoiceV2 } from '../../types/invoicing';

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Pure client-side display rule:
 * If status === 'sent' and due_date < today, display as 'overdue'.
 * Never persists to Supabase.
 */
export function getDisplayStatus(
  invoice: Pick<InvoiceV2, 'status' | 'due_date'>,
  todayIso: string = getTodayIsoDate()
): InvoiceStatusV2 {
  if (invoice.status === 'sent' && invoice.due_date && invoice.due_date < todayIso) {
    return 'overdue';
  }
  return invoice.status;
}

export function isInvoicePastDue(
  invoice: Pick<InvoiceV2, 'status' | 'due_date'>,
  todayIso: string = getTodayIsoDate()
): boolean {
  return Boolean(
    invoice.due_date &&
      invoice.due_date < todayIso &&
      (invoice.status === 'sent' || invoice.status === 'partial' || invoice.status === 'overdue')
  );
}
