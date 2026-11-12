import { createClient } from '../supabase/client';
import type { Account, AccountFormData, AccountWithBalance } from '../../types/accounts';

export async function getAccountById(id: string): Promise<AccountWithBalance | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: acc, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !acc) return null;

  // Compute balance from transactions
  const { data: txns } = await supabase
    .from('transactions')
    .select('debit, credit, txn_date')
    .eq('account_id', id)
    .eq('user_id', user.id)
    .order('txn_date', { ascending: false });

  let totalDebits = 0;
  let totalCredits = 0;
  let lastImportDate: string | null = null;

  if (txns && txns.length > 0) {
    lastImportDate = txns[0].txn_date;
    for (const tx of txns) {
      totalDebits += Number(tx.debit || 0);
      totalCredits += Number(tx.credit || 0);
    }
  }

  const opening = Number(acc.opening_balance || 0);
  const currentBalance = opening + totalCredits - totalDebits;

  return {
    ...acc,
    current_balance: currentBalance,
    last_import_date: lastImportDate,
  };
}

export async function getAccounts(): Promise<AccountWithBalance[]> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error || !accounts) {
    console.error('Supabase accounts query error:', error?.message);
    return [];
  }

  // Fetch balances for all accounts
  const { data: txns } = await supabase
    .from('transactions')
    .select('account_id, debit, credit, txn_date')
    .eq('user_id', user.id);

  const accountBalances = new Map<string, { debits: number; credits: number; lastDate: string | null }>();
  if (txns) {
    for (const tx of txns) {
      const cur = accountBalances.get(tx.account_id) || { debits: 0, credits: 0, lastDate: null };
      cur.debits += Number(tx.debit || 0);
      cur.credits += Number(tx.credit || 0);
      if (!cur.lastDate || tx.txn_date > cur.lastDate) {
        cur.lastDate = tx.txn_date;
      }
      accountBalances.set(tx.account_id, cur);
    }
  }

  return accounts.map((acc: Account) => {
    const balData = accountBalances.get(acc.id);
    const opening = Number(acc.opening_balance || 0);
    const currentBalance = balData ? opening + balData.credits - balData.debits : opening;

    return {
      ...acc,
      current_balance: currentBalance,
      last_import_date: balData?.lastDate || null,
    };
  });
}

export async function createAccount(data: AccountFormData): Promise<AccountWithBalance> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

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

  const insertPayload = {
    user_id: user.id,
    name: data.name.trim(),
    bank_name: data.bank_name.trim(),
    account_type: data.account_type,
    account_number_last4: data.account_number_last4?.trim() || null,
    currency: data.currency || 'INR',
    is_active: data.is_active ?? true,
    color_index: data.color_index ?? 0,
    notes: data.notes?.trim() || null,
    opening_balance: Number(data.opening_balance || 0),
    purpose: data.purpose || 'Personal',
    credit_limit: data.credit_limit ?? null,
    billing_cycle_day: data.billing_cycle_day ?? null,
    payment_due_day: data.payment_due_day ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('accounts')
    .insert([insertPayload])
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to create account:', error);
    throw new Error(error?.message || 'Failed to create account');
  }

  return {
    ...inserted,
    current_balance: Number(inserted.opening_balance || 0),
    last_import_date: null,
  };
}

export async function updateAccount(
  id: string,
  data: Partial<AccountFormData>
): Promise<AccountWithBalance> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('accounts')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    console.error('Failed to update account:', error);
    throw new Error(error?.message || 'Failed to update account');
  }

  const fullAcc = await getAccountById(id);
  return fullAcc || { ...updated, current_balance: 0, last_import_date: null };
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function toggleAccountActive(id: string): Promise<AccountWithBalance> {
  const acc = await getAccountById(id);
  if (!acc) throw new Error('Account not found');
  return updateAccount(id, { is_active: !acc.is_active });
}
