import { createClient } from '../supabase/client';
import type {
  RecurringTransaction,
  RecurringFormData,
  RecurringFrequency,
} from '../../types/recurring';
import { getAccounts } from './accounts';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';

/**
 * Advances a due date by frequency interval
 */
export function advanceDueDate(
  currentDateStr: string,
  frequency: RecurringFrequency
): string {
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
  importedTxn: {
    description: string;
    amount: number;
    txn_date: string;
    account_id?: string;
  },
  client?: any
): Promise<RecurringTransaction | null> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: activeItems, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error || !activeItems || activeItems.length === 0) {
    return null;
  }

  for (const item of activeItems as RecurringTransaction[]) {
    // 1. Amount match ±5%
    const amtDiff = Math.abs(Number(item.amount) - importedTxn.amount);
    const amtPct = amtDiff / (Number(item.amount) || 1);
    if (amtPct > 0.05) continue;

    // 2. Date within ±3 days of next_due_date
    const dueDateMs = new Date(item.next_due_date).getTime();
    const txnDateMs = new Date(importedTxn.txn_date).getTime();
    const dayDiff = Math.abs(dueDateMs - txnDateMs) / (1000 * 60 * 60 * 24);
    if (dayDiff > 3) continue;

    // 3. Description fuzzy match >= 80%
    const similarity = calculateSimilarity(item.description, importedTxn.description);
    if (similarity >= 0.8) {
      const nextDueDate = advanceDueDate(item.next_due_date, item.frequency);
      const updatedAt = new Date().toISOString();

      const { data: updated } = await supabase
        .from('recurring_transactions')
        .update({
          last_seen_date: importedTxn.txn_date,
          next_due_date: nextDueDate,
          updated_at: updatedAt,
        })
        .eq('id', item.id)
        .eq('user_id', user.id)
        .select()
        .single();

      return (
        updated || {
          ...item,
          last_seen_date: importedTxn.txn_date,
          next_due_date: nextDueDate,
          updated_at: updatedAt,
        }
      );
    }
  }

  return null;
}

export async function getRecurringTransactions(
  client?: any
): Promise<RecurringTransaction[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const [accounts, categories, workspaces, { data, error }] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase),
    getWorkspaces(supabase),
    supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('next_due_date', { ascending: true }),
  ]);

  if (error || !data) {
    console.error('Error fetching recurring transactions:', error?.message);
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

export async function createRecurringTransaction(
  data: RecurringFormData,
  client?: any
): Promise<RecurringTransaction> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase),
    getWorkspaces(supabase),
  ]);

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
    throw new Error(error?.message || 'Failed to create recurring transaction.');
  }

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
  updates: Partial<RecurringTransaction>,
  client?: any
): Promise<RecurringTransaction> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.account_id !== undefined) updatePayload.account_id = updates.account_id;
  if (updates.description !== undefined) updatePayload.description = updates.description.trim();
  if (updates.amount !== undefined) updatePayload.amount = Number(updates.amount);
  if (updates.txn_type !== undefined) updatePayload.txn_type = updates.txn_type;
  if (updates.category_id !== undefined) updatePayload.category_id = updates.category_id || null;
  if (updates.workspace_id !== undefined) updatePayload.workspace_id = updates.workspace_id || null;
  if (updates.frequency !== undefined) updatePayload.frequency = updates.frequency;
  if (updates.next_due_date !== undefined) updatePayload.next_due_date = updates.next_due_date;
  if (updates.last_seen_date !== undefined) updatePayload.last_seen_date = updates.last_seen_date;
  if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;
  if (updates.notes !== undefined) updatePayload.notes = updates.notes?.trim() || null;

  const { data: updated, error } = await supabase
    .from('recurring_transactions')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Recurring item not found');
  }

  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase),
    getWorkspaces(supabase),
  ]);

  return {
    ...updated,
    amount: Number(updated.amount),
    account: accounts.find((a) => a.id === updated.account_id),
    category: categories.find((c) => c.id === updated.category_id),
    workspace: workspaces.find((w) => w.id === updated.workspace_id),
  };
}

export async function toggleRecurringActive(
  id: string,
  is_active: boolean,
  client?: any
): Promise<RecurringTransaction> {
  return updateRecurringTransaction(id, { is_active }, client);
}

export async function deleteRecurringTransaction(
  id: string,
  client?: any
): Promise<boolean> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function getUpcomingRecurring(
  limit: number = 5,
  client?: any
): Promise<RecurringTransaction[]> {
  const all = await getRecurringTransactions(client);
  return all.filter((r) => r.is_active).slice(0, limit);
}
