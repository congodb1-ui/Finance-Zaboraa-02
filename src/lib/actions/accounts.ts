import { createClient } from '../supabase/client';
import { computeAuthoritativeAccountBalance } from '../balance-utils';
import type { Account, AccountFormData, AccountWithBalance } from '../../types/accounts';

export async function getAccountById(
  id: string,
  client?: any
): Promise<AccountWithBalance | null> {
  const accounts = await getAccounts(client);
  return accounts.find((a) => a.id === id) || null;
}

export async function getAccounts(client?: any): Promise<AccountWithBalance[]> {
  const supabase = client || createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Error fetching accounts:', error?.message);
    return [];
  }

  const accountIds = data.map((acc: Account) => acc.id);
  const txnsByAccount = new Map<string, any[]>();
  const lastImportMap = new Map<string, string>();

  if (accountIds.length > 0) {
    const fetchAllAccountTxns = async (): Promise<any[]> => {
      const collected: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const q = supabase
          .from('transactions')
          .select('account_id, txn_date, debit, credit, balance, balance_after')
          .eq('user_id', user.id)
          .in('account_id', accountIds)
          .order('txn_date', { ascending: true })
          .order('created_at', { ascending: true });
        const { data: pageRows, error: pageErr } =
          typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;
        if (pageErr || !pageRows || pageRows.length === 0) break;
        collected.push(...pageRows);
        if (typeof q.range !== 'function' || pageRows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return collected;
    };

    const [txnRows, { data: uploadRows }] = await Promise.all([
      fetchAllAccountTxns(),
      supabase
        .from('statement_uploads')
        .select('account_id, imported_at')
        .eq('user_id', user.id)
        .eq('status', 'imported')
        .in('account_id', accountIds)
        .order('imported_at', { ascending: false }),
    ]);

    for (const tx of txnRows) {
      const list = txnsByAccount.get(tx.account_id) || [];
      list.push(tx);
      txnsByAccount.set(tx.account_id, list);
    }

    if (uploadRows) {
      for (const up of uploadRows) {
        if (up.imported_at && !lastImportMap.has(up.account_id)) {
          lastImportMap.set(up.account_id, up.imported_at);
        }
      }
    }
  }

  return data.map((acc: Account) => {
    const openBal = Number(acc.opening_balance ?? 0);
    const accTxns = txnsByAccount.get(acc.id) || [];
    const computedBal = computeAuthoritativeAccountBalance(openBal, accTxns);
    const storedBal =
      acc.current_balance !== null && acc.current_balance !== undefined
        ? Number(acc.current_balance)
        : null;
    return {
      ...acc,
      opening_balance: openBal,
      opening_date: acc.opening_date ?? null,
      current_balance: storedBal !== null && Number.isFinite(storedBal) ? storedBal : computedBal,
      last_import_date: lastImportMap.get(acc.id) || null,
    };
  });
}

export async function createAccount(
  data: AccountFormData,
  client?: any
): Promise<AccountWithBalance> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

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

  const { data: inserted, error } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      bank_name: data.bank_name.trim(),
      account_type: data.account_type,
      account_number_last4: data.account_number_last4?.trim() || null,
      currency: data.currency || 'INR',
      is_active: data.is_active ?? true,
      color_index: data.color_index ?? 0,
      icon: data.icon?.trim() || null,
      notes: data.notes?.trim() || null,
      purpose: data.purpose?.trim() || 'personal',
      ifsc: data.ifsc?.trim() ? data.ifsc.trim().toUpperCase() : null,
      upi_id: data.upi_id?.trim() || null,
      account_holder_name: data.account_holder_name?.trim() || null,
      operated_by_owner: data.operated_by_owner ?? true,
      opening_balance: data.opening_balance ?? 0,
      opening_date: data.opening_date || null,
      credit_limit: data.credit_limit ?? null,
      billing_cycle_day: data.billing_cycle_day ?? null,
      payment_due_day: data.payment_due_day ?? null,
    })
    .select()
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || 'Failed to create account.');
  }

  return {
    ...inserted,
    current_balance: Number(data.opening_balance ?? 0),
    last_import_date: null,
  };
}

export async function updateAccount(
  id: string,
  data: Partial<AccountFormData>,
  client?: any
): Promise<AccountWithBalance> {
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

  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.bank_name !== undefined) updatePayload.bank_name = data.bank_name.trim();
  if (data.account_type !== undefined) updatePayload.account_type = data.account_type;
  if (data.account_number_last4 !== undefined) {
    updatePayload.account_number_last4 = data.account_number_last4?.trim() || null;
  }
  if (data.currency !== undefined) updatePayload.currency = data.currency;
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;
  if (data.color_index !== undefined) updatePayload.color_index = data.color_index;
  if (data.icon !== undefined) updatePayload.icon = data.icon?.trim() || null;
  if (data.notes !== undefined) updatePayload.notes = data.notes?.trim() || null;
  if (data.purpose !== undefined) updatePayload.purpose = data.purpose?.trim() || 'personal';
  if (data.ifsc !== undefined) {
    updatePayload.ifsc = data.ifsc?.trim() ? data.ifsc.trim().toUpperCase() : null;
  }
  if (data.upi_id !== undefined) updatePayload.upi_id = data.upi_id?.trim() || null;
  if (data.account_holder_name !== undefined) {
    updatePayload.account_holder_name = data.account_holder_name?.trim() || null;
  }
  if (data.operated_by_owner !== undefined) {
    updatePayload.operated_by_owner = Boolean(data.operated_by_owner);
  }
  if (data.opening_balance !== undefined) {
    updatePayload.opening_balance = data.opening_balance ?? 0;
  }
  if (data.opening_date !== undefined) {
    updatePayload.opening_date = data.opening_date || null;
  }
  if (data.credit_limit !== undefined) updatePayload.credit_limit = data.credit_limit;
  if (data.billing_cycle_day !== undefined) updatePayload.billing_cycle_day = data.billing_cycle_day;
  if (data.payment_due_day !== undefined) updatePayload.payment_due_day = data.payment_due_day;

  const { data: updated, error } = await supabase
    .from('accounts')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Account not found.');
  }

  const refreshed = await getAccountById(id, supabase);
  return refreshed || { ...updated, current_balance: 0, last_import_date: null };
}

export async function deleteAccount(
  id: string,
  client?: any
): Promise<{ success: boolean; error?: string }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

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

export async function toggleAccountActive(
  id: string,
  client?: any
): Promise<AccountWithBalance> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: acc, error } = await supabase
    .from('accounts')
    .select('id, is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !acc) {
    throw new Error('Account not found');
  }

  return updateAccount(id, { is_active: !acc.is_active }, supabase);
}
