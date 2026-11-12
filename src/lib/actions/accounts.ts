'use server';

import { createClient } from '../supabase/server';
import type { Account, AccountFormData, AccountWithBalance } from '../../types/accounts';

// In-memory preview store for sandbox/local runs prior to database migrations
let localAccountsStore: AccountWithBalance[] = [
  {
    id: 'acc_hdfc_01',
    user_id: 'default_owner',
    name: 'HDFC Main Savings',
    bank_name: 'HDFC Bank',
    account_type: 'savings',
    account_number_last4: '4819',
    currency: 'INR',
    is_active: true,
    color_index: 0,
    notes: 'Primary personal expense & salary account',
    opening_balance: 400000.0,
    purpose: 'Personal',
    credit_limit: null,
    billing_cycle_day: null,
    payment_due_day: null,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    current_balance: 485200.0,
    last_import_date: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'acc_sbi_02',
    user_id: 'default_owner',
    name: 'SBI Salary Account',
    bank_name: 'State Bank of India',
    account_type: 'salary',
    account_number_last4: '9102',
    currency: 'INR',
    is_active: true,
    color_index: 1,
    notes: 'Direct client retainer & salary deposits',
    opening_balance: 50000.0,
    purpose: 'Personal',
    credit_limit: null,
    billing_cycle_day: null,
    payment_due_day: null,
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    current_balance: 142800.5,
    last_import_date: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'acc_icici_03',
    user_id: 'default_owner',
    name: 'ICICI Business Current',
    bank_name: 'ICICI Bank',
    account_type: 'current',
    account_number_last4: '3341',
    currency: 'INR',
    is_active: true,
    color_index: 2,
    notes: 'Professional consulting and vendor disbursements',
    opening_balance: 750000.0,
    purpose: 'Business',
    credit_limit: null,
    billing_cycle_day: null,
    payment_due_day: null,
    created_at: new Date(Date.now() - 120 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    current_balance: 854300.0,
    last_import_date: new Date(Date.now() - 16 * 86400000).toISOString(),
  },
  {
    id: 'acc_kotak_04',
    user_id: 'default_owner',
    name: 'Kotak White Credit Card',
    bank_name: 'Kotak Mahindra Bank',
    account_type: 'credit_card',
    account_number_last4: '7021',
    currency: 'INR',
    is_active: true,
    color_index: 7,
    notes: 'Business travel and SaaS subscriptions',
    opening_balance: 0.0,
    purpose: 'Business',
    credit_limit: 300000.0,
    billing_cycle_day: 1,
    payment_due_day: 20,
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    current_balance: -34500.0,
    last_import_date: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];

export async function getAccountById(id: string): Promise<AccountWithBalance | null> {
  const accounts = await getAccounts();
  return accounts.find((a) => a.id === id) || null;
}

export async function getAccounts(): Promise<AccountWithBalance[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      // In offline preview mode, return local store
      return [...localAccountsStore];
    }

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('name', { ascending: true });

    if (error || !data) {
      console.warn('Supabase accounts query error, using local fallback:', error?.message);
      return [...localAccountsStore];
    }

    // In Batch 2, current_balance and last_import_date are computed
    return data.map((acc: Account) => ({
      ...acc,
      current_balance: 0,
      last_import_date: null,
    }));
  } catch {
    return [...localAccountsStore];
  }
}

export async function createAccount(data: AccountFormData): Promise<AccountWithBalance> {
  // Field validation
  if (!data.name?.trim()) throw new Error('Account name is required.');
  if (!data.bank_name?.trim()) throw new Error('Bank name is required.');
  if (!data.account_type) throw new Error('Account type is required.');

  if (data.account_number_last4 && !/^\d{1,4}$/.test(data.account_number_last4)) {
    throw new Error('Account number last 4 must be numeric (max 4 digits).');
  }

  if (data.account_type === 'credit_card') {
    if (data.billing_cycle_day && (data.billing_cycle_day < 1 || data.billing_cycle_day > 31)) {
      throw new Error('Billing cycle day must be between 1 and 31.');
    }
    if (data.payment_due_day && (data.payment_due_day < 1 || data.payment_due_day > 31)) {
      throw new Error('Payment due day must be between 1 and 31.');
    }
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const newRecord: AccountWithBalance = {
      id: `acc_${Date.now()}`,
      user_id: user?.id || 'default_owner',
      name: data.name.trim(),
      bank_name: data.bank_name.trim(),
      account_type: data.account_type,
      account_number_last4: data.account_number_last4?.trim() || null,
      currency: data.currency || 'INR',
      is_active: data.is_active ?? true,
      color_index: data.color_index ?? 0,
      notes: data.notes?.trim() || null,
      credit_limit: data.credit_limit ?? null,
      billing_cycle_day: data.billing_cycle_day ?? null,
      payment_due_day: data.payment_due_day ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_balance: 0,
      last_import_date: null,
    };

    if (user) {
      const { data: inserted, error } = await supabase
        .from('accounts')
        .insert({
          user_id: user.id,
          name: newRecord.name,
          bank_name: newRecord.bank_name,
          account_type: newRecord.account_type,
          account_number_last4: newRecord.account_number_last4,
          currency: newRecord.currency,
          is_active: newRecord.is_active,
          color_index: newRecord.color_index,
          notes: newRecord.notes,
          credit_limit: newRecord.credit_limit,
          billing_cycle_day: newRecord.billing_cycle_day,
          payment_due_day: newRecord.payment_due_day,
        })
        .select()
        .single();

      if (!error && inserted) {
        return { ...inserted, current_balance: 0, last_import_date: null };
      }
    }

    localAccountsStore.push(newRecord);
    return newRecord;
  } catch {
    const fallback: AccountWithBalance = {
      id: `acc_${Date.now()}`,
      user_id: 'default_owner',
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_balance: 0,
      last_import_date: null,
    };
    localAccountsStore.push(fallback);
    return fallback;
  }
}

export async function updateAccount(
  id: string,
  data: Partial<AccountFormData>
): Promise<AccountWithBalance> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: updated, error } = await supabase
        .from('accounts')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (!error && updated) {
        return { ...updated, current_balance: 0, last_import_date: null };
      }
    }
  } catch {
    // Continue to local update
  }

  const idx = localAccountsStore.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Account not found.');

  localAccountsStore[idx] = {
    ...localAccountsStore[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };

  return localAccountsStore[idx];
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // In future batches, verify if transactions reference this account
      const { error } = await supabase.from('accounts').delete().eq('id', id);
      if (error) return { success: false, error: error.message };
    }
  } catch {
    // Continue to local delete
  }

  localAccountsStore = localAccountsStore.filter((a) => a.id !== id);
  return { success: true };
}

export async function toggleAccountActive(id: string): Promise<AccountWithBalance> {
  const acc = localAccountsStore.find((a) => a.id === id);
  if (!acc) throw new Error('Account not found');
  return updateAccount(id, { is_active: !acc.is_active });
}
