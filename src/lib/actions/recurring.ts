import { createClient } from '../supabase/client';
import type { RecurringTransaction, RecurringFormData, RecurringFrequency } from '../../types/recurring';
import { getAccounts } from './accounts';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';

/**
 * Advances a due date by frequency interval
 */
export function advanceDueDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const d = new Date(currentDateStr);
  if (isNaN(d.getTime())) return currentDateStr;

  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }

  return d.toISOString().split('T')[0];
}

/**
 * Simple string similarity token calculation (Dice coefficient approximation)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = (str1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = (str2 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  let common = 0;
  const set1 = new Set(s1.split(''));
  for (const char of s2) {
    if (set1.has(char)) common++;
  }
  return (2.0 * common) / (s1.length + s2.length);
}

/**
 * Match incoming imported transaction against active recurring rules
 * Match criteria:
 * - Description fuzzy match >= 80% (or substring overlap)
 * - Amount match ±5%
 * - Date within ±3 days of next_due_date
 */
export async function matchAndAdvanceRecurring(
  importedTxn: { description: string; amount: number; txn_date: string; account_id?: string }
): Promise<RecurringTransaction | null> {
  const allItems = await getRecurringTransactions();
  const activeItems = allItems.filter((r) => r.is_active);

  for (const item of activeItems) {
    // 1. Amount match ±5%
    const amtDiff = Math.abs(item.amount - importedTxn.amount);
    const amtPct = amtDiff / (item.amount || 1);
    if (amtPct > 0.05) continue;

    // 2. Date within ±3 days of next_due_date
    const dueDateMs = new Date(item.next_due_date).getTime();
    const txnDateMs = new Date(importedTxn.txn_date).getTime();
    const dayDiff = Math.abs(dueDateMs - txnDateMs) / (1000 * 60 * 60 * 24);
    if (dayDiff > 3) continue;

    // 3. Description fuzzy match >= 80%
    const similarity = calculateSimilarity(item.description, importedTxn.description);
    if (similarity >= 0.8) {
      // Matched! Advance next_due_date and record last_seen_date
      const newNextDueDate = advanceDueDate(item.next_due_date, item.frequency);

      const supabase = createClient();
      const { data: updated } = await supabase
        .from('recurring_transactions')
        .update({
          last_seen_date: importedTxn.txn_date,
          next_due_date: newNextDueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .select()
        .single();

      return updated ? { ...item, ...updated } : item;
    }
  }

  return null;
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('next_due_date', { ascending: true });

  if (error || !data) {
    console.error('Failed to get recurring transactions:', error);
    return [];
  }

  return data.map((d: any) => ({
    ...d,
    amount: Number(d.amount),
    account: accounts.find((a) => a.id === d.account_id),
    category: categories.find((c) => c.id === d.category_id),
    workspace: workspaces.find((w) => w.id === d.workspace_id),
  }));
}

export async function createRecurringTransaction(data: RecurringFormData): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: inserted, error } = await supabase
    .from('recurring_transactions')
    .insert({
      user_id: user.id,
      account_id: data.account_id,
      description: data.description.trim(),
      amount: Number(data.amount),
      txn_type: data.txn_type,
      category_id: data.category_id || null,
      workspace_id: data.workspace_id || null,
      frequency: data.frequency,
      next_due_date: data.next_due_date,
      is_active: true,
      notes: data.notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to create recurring transaction:', error);
    throw new Error(error?.message || 'Failed to create recurring transaction');
  }

  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  return {
    ...inserted,
    amount: Number(inserted.amount),
    account: accounts.find((a) => a.id === inserted.account_id),
    category: categories.find((c) => c.id === inserted.category_id),
    workspace: workspaces.find((w) => w.id === inserted.workspace_id),
  };
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>
): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('recurring_transactions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    console.error('Failed to update recurring transaction:', error);
    throw new Error(error?.message || 'Failed to update recurring item');
  }

  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  return {
    ...updated,
    amount: Number(updated.amount),
    account: accounts.find((a) => a.id === updated.account_id),
    category: categories.find((c) => c.id === updated.category_id),
    workspace: workspaces.find((w) => w.id === updated.workspace_id),
  };
}

export async function toggleRecurringActive(id: string, is_active: boolean): Promise<RecurringTransaction> {
  return updateRecurringTransaction(id, { is_active });
}

export async function deleteRecurringTransaction(id: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete recurring item:', error);
    return false;
  }

  return true;
}

export async function getUpcomingRecurring(limit: number = 5): Promise<RecurringTransaction[]> {
  const all = await getRecurringTransactions();
  return all.filter((r) => r.is_active).slice(0, limit);
}
