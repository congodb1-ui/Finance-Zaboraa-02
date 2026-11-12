import { createClient } from '../supabase/client';
import type { RecurringTransaction, RecurringFormData, RecurringFrequency } from '../../types/recurring';
import { getAccounts } from './accounts';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';

// Seed initial authentic recurring items
let localRecurringStore: RecurringTransaction[] = [
  {
    id: 'rec_01',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    description: 'WeWork Coworking Office Rent',
    amount: 32000.0,
    txn_type: 'expense',
    category_id: 'cat_7',
    workspace_id: 'ws_business',
    frequency: 'monthly',
    next_due_date: '2026-11-18',
    last_seen_date: '2026-10-18',
    is_active: true,
    notes: 'Monthly dedicated office desk lease',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-18T00:00:00.000Z',
  },
  {
    id: 'rec_02',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    description: 'Netflix 4K Ultra Subscription',
    amount: 649.0,
    txn_type: 'expense',
    category_id: 'cat_1',
    workspace_id: 'ws_personal',
    frequency: 'monthly',
    next_due_date: '2026-11-14',
    last_seen_date: '2026-10-14',
    is_active: true,
    notes: 'Auto-debit on HDFC card',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-14T00:00:00.000Z',
  },
  {
    id: 'rec_03',
    user_id: 'default_owner',
    account_id: 'acc_sbi_02',
    description: 'JioFiber Business Broadband',
    amount: 1179.0,
    txn_type: 'expense',
    category_id: 'cat_7',
    workspace_id: 'ws_business',
    frequency: 'monthly',
    next_due_date: '2026-11-08', // Overdue test item
    last_seen_date: '2026-10-08',
    is_active: true,
    notes: 'Gigabit fiber internet connection',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
  },
  {
    id: 'rec_04',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    description: 'Client Consulting Retainer',
    amount: 125000.0,
    txn_type: 'income',
    category_id: 'cat_6',
    workspace_id: 'ws_business',
    frequency: 'monthly',
    next_due_date: '2026-11-24',
    last_seen_date: '2026-10-24',
    is_active: true,
    notes: 'Apex Industries monthly retainer billing',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
  },
  {
    id: 'rec_05',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    description: 'HDFC ERGO Health Insurance Premium',
    amount: 28500.0,
    txn_type: 'expense',
    category_id: 'cat_2',
    workspace_id: 'ws_personal',
    frequency: 'yearly',
    next_due_date: '2026-12-15',
    last_seen_date: '2025-12-15',
    is_active: true,
    notes: 'Section 80D medical coverage annual premium',
    created_at: '2025-12-15T00:00:00.000Z',
    updated_at: '2025-12-15T00:00:00.000Z',
  },
];

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
  const activeItems = localRecurringStore.filter((r) => r.is_active);

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
      item.last_seen_date = importedTxn.txn_date;
      item.next_due_date = advanceDueDate(item.next_due_date, item.frequency);
      item.updated_at = new Date().toISOString();

      try {
        const supabase = createClient();
        await supabase
          .from('recurring_transactions')
          .update({
            last_seen_date: item.last_seen_date,
            next_due_date: item.next_due_date,
            updated_at: item.updated_at,
          })
          .eq('id', item.id);
      } catch {
        // Fallback
      }

      return item;
    }
  }

  return null;
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .order('next_due_date', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        ...d,
        account: accounts.find((a) => a.id === d.account_id),
        category: categories.find((c) => c.id === d.category_id),
        workspace: workspaces.find((w) => w.id === d.workspace_id),
      }));
    }
  } catch {
    // Fallback to local
  }

  return localRecurringStore
    .map((r) => ({
      ...r,
      account: accounts.find((a) => a.id === r.account_id),
      category: categories.find((c) => c.id === r.category_id),
      workspace: workspaces.find((w) => w.id === r.workspace_id),
    }))
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
}

export async function createRecurringTransaction(data: RecurringFormData): Promise<RecurringTransaction> {
  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  const newId = `rec_${Date.now()}`;
  const now = new Date().toISOString();

  const newRec: RecurringTransaction = {
    id: newId,
    user_id: 'default_owner',
    account_id: data.account_id,
    description: data.description.trim(),
    amount: Number(data.amount),
    txn_type: data.txn_type,
    category_id: data.category_id || null,
    workspace_id: data.workspace_id || null,
    frequency: data.frequency,
    next_due_date: data.next_due_date,
    last_seen_date: null,
    is_active: true,
    notes: data.notes?.trim() || null,
    created_at: now,
    updated_at: now,
    account: accounts.find((a) => a.id === data.account_id),
    category: categories.find((c) => c.id === data.category_id),
    workspace: workspaces.find((w) => w.id === data.workspace_id),
  };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      newRec.user_id = user.id;
      await supabase.from('recurring_transactions').insert({
        user_id: user.id,
        account_id: newRec.account_id,
        description: newRec.description,
        amount: newRec.amount,
        txn_type: newRec.txn_type,
        category_id: newRec.category_id,
        workspace_id: newRec.workspace_id,
        frequency: newRec.frequency,
        next_due_date: newRec.next_due_date,
        is_active: true,
        notes: newRec.notes,
      });
    }
  } catch {
    // Local fallback
  }

  localRecurringStore.push(newRec);
  return newRec;
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>
): Promise<RecurringTransaction> {
  const index = localRecurringStore.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('Recurring item not found');

  const now = new Date().toISOString();
  const updated: RecurringTransaction = {
    ...localRecurringStore[index],
    ...updates,
    updated_at: now,
  };
  localRecurringStore[index] = updated;

  try {
    const supabase = createClient();
    await supabase.from('recurring_transactions').update(updates).eq('id', id);
  } catch {
    // Local fallback
  }

  return updated;
}

export async function toggleRecurringActive(id: string, is_active: boolean): Promise<RecurringTransaction> {
  return updateRecurringTransaction(id, { is_active });
}

export async function deleteRecurringTransaction(id: string): Promise<boolean> {
  localRecurringStore = localRecurringStore.filter((r) => r.id !== id);

  try {
    const supabase = createClient();
    await supabase.from('recurring_transactions').delete().eq('id', id);
  } catch {
    // Local fallback
  }

  return true;
}

export async function getUpcomingRecurring(limit: number = 5): Promise<RecurringTransaction[]> {
  const all = await getRecurringTransactions();
  return all.filter((r) => r.is_active).slice(0, limit);
}
