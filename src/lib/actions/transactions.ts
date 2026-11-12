import { createClient } from '../supabase/client';
import type {
  Transaction,
  AuditLogEntry,
  TransactionFiltersState,
  ManualTransactionFormData,
  FinalizeImportResult,
} from '../../types/transactions';
import { getRules } from './rules';
import { findFirstMatchingRule } from '../rules-engine';
import { getAccounts } from './accounts';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';
import { getUploadDetails, getUploads } from './upload';
import { getCurrentFY, getFYBounds } from '../fy-utils';

/**
 * Write an entry to audit_log table
 */
export async function writeAuditLog(entry: {
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete';
  old_data?: any;
  new_data?: any;
}): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_log').insert({
      user_id: user.id,
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      old_data: entry.old_data || null,
      new_data: entry.new_data || null,
    });
  } catch (err) {
    console.warn('writeAuditLog notice:', err);
  }
}

/**
 * Commits staged transactions through Layer 3 Multiset Dedup, rules engine, transfer
 * detection, batch insert, and audit logging pipeline.
 */
export async function commitUploadTransactions(
  upload_id: string,
  replace_previous_id?: string
): Promise<FinalizeImportResult & { imported: number; duplicates_skipped: number; replaced: number }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // STEP 1 — Fetch statement upload record
  const { upload, transactions: staged } = await getUploadDetails(upload_id);
  if (!upload) throw new Error('Statement upload record not found.');
  if (staged.length === 0) {
    return {
      imported: 0,
      imported_count: 0,
      duplicates_skipped: 0,
      duplicate_count: 0,
      replaced: 0,
      transfer_pairs_found: 0,
      upload_id: upload.id,
    };
  }

  // STEP 2 — Handle replacement if replace_previous_id is set
  let replacedCount = 0;
  if (replace_previous_id) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('upload_id', replace_previous_id)
      .eq('user_id', user.id);

    replacedCount = count || 0;

    await supabase
      .from('transactions')
      .delete()
      .eq('upload_id', replace_previous_id)
      .eq('user_id', user.id);

    await supabase
      .from('statement_uploads')
      .update({ status: 'replaced', updated_at: new Date().toISOString() })
      .eq('id', replace_previous_id)
      .eq('user_id', user.id);
  }

  // STEP 3 — Layer 3 Multiset Deduplication:
  // Key = account_id + txn_date + amount + utr (if UTR present), else account_id + txn_date + amount + normDesc
  const dates = staged.map((s) => s.txn_date).filter(Boolean).sort();
  const minDate = dates[0] || '2020-01-01';
  const maxDate = dates[dates.length - 1] || '2099-12-31';

  // Fetch existing transactions for this account in the date window
  const { data: existingTxns } = await supabase
    .from('transactions')
    .select('id, account_id, txn_date, debit, credit, reference_number, description')
    .eq('user_id', user.id)
    .eq('account_id', upload.account_id)
    .gte('txn_date', minDate)
    .lte('txn_date', maxDate);

  function getMultisetKey(t: {
    txn_date: string;
    debit?: number | null;
    credit?: number | null;
    reference_number?: string | null;
    description: string;
  }): string {
    const amt = Math.abs((Number(t.debit) || 0) - (Number(t.credit) || 0)).toFixed(2);
    const utr = t.reference_number?.trim().toLowerCase();
    if (utr) {
      return `${upload.account_id}_${t.txn_date}_${amt}_${utr}`;
    }
    const normDesc = (t.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${upload.account_id}_${t.txn_date}_${amt}_${normDesc}`;
  }

  // Count occurrences in DB
  const dbCounts = new Map<string, number>();
  if (existingTxns) {
    for (const ex of existingTxns) {
      const k = getMultisetKey(ex);
      dbCounts.set(k, (dbCounts.get(k) || 0) + 1);
    }
  }

  // Fetch active rules for categorization
  const rules = await getRules();
  const activeRules = rules.filter((r) => r.is_active);

  const txnsToInsert: any[] = [];
  let duplicatesSkipped = 0;
  const batchCounts = new Map<string, number>();

  for (const stg of staged) {
    const k = getMultisetKey(stg);
    const occurrence = (batchCounts.get(k) || 0) + 1;
    batchCounts.set(k, occurrence);

    const inDb = dbCounts.get(k) || 0;

    // If occurrence <= inDb, this row already exists in the database!
    if (!replace_previous_id && occurrence <= inDb) {
      duplicatesSkipped++;
      continue;
    }

    // Evaluate rules
    const netAmount = Math.abs((Number(stg.debit) || 0) - (Number(stg.credit) || 0));
    const matchedRule = findFirstMatchingRule(activeRules, {
      description: stg.description,
      reference_number: stg.reference_number || undefined,
      amount: netAmount,
      txn_type: stg.debit ? 'expense' : 'income',
    });

    txnsToInsert.push({
      user_id: user.id,
      account_id: stg.account_id,
      upload_id: upload.id,
      txn_date: stg.txn_date,
      description: stg.description,
      raw_description: stg.raw_description || stg.description,
      debit: stg.debit !== null && stg.debit !== undefined ? Number(stg.debit) : null,
      credit: stg.credit !== null && stg.credit !== undefined ? Number(stg.credit) : null,
      balance: stg.balance !== null && stg.balance !== undefined ? Number(stg.balance) : null,
      reference_number: stg.reference_number || null,
      category_id: matchedRule?.set_category || null,
      workspace_id: matchedRule?.set_workspace || null,
      txn_type: matchedRule?.set_txn_type || (stg.debit ? 'expense' : 'income'),
      tags: matchedRule?.set_tags || [],
      is_transfer: false,
      transfer_pair_id: null,
      is_manual: false,
      source_staged_id: stg.id,
    });
  }

  // STEP 4 — Inter-account transfer detection:
  // Detect transfers within newly staged transactions or against recent DB transactions
  let transferPairsCount = 0;
  for (let i = 0; i < txnsToInsert.length; i++) {
    const txA = txnsToInsert[i];
    if (txA.is_transfer) continue;

    const amtA = Math.abs((txA.debit ?? 0) - (txA.credit ?? 0));
    if (amtA <= 0.01) continue;

    for (let j = i + 1; j < txnsToInsert.length; j++) {
      const txB = txnsToInsert[j];
      if (txB.is_transfer) continue;
      if (txA.account_id === txB.account_id) continue;

      const amtB = Math.abs((txB.debit ?? 0) - (txB.credit ?? 0));
      if (Math.abs(amtA - amtB) > 0.01) continue;

      const isDebitA = txA.debit !== null && txA.debit !== undefined && txA.debit > 0;
      const isDebitB = txB.debit !== null && txB.debit !== undefined && txB.debit > 0;
      if (isDebitA === isDebitB) continue;

      const dateA = new Date(txA.txn_date).getTime();
      const dateB = new Date(txB.txn_date).getTime();
      if (Math.abs(dateA - dateB) <= 86400000 * 1.5) {
        const pairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        txA.is_transfer = true;
        txA.transfer_pair_id = pairId;
        txA.txn_type = 'transfer';
        txA.category_id = null;

        txB.is_transfer = true;
        txB.transfer_pair_id = pairId;
        txB.txn_type = 'transfer';
        txB.category_id = null;

        transferPairsCount++;
        break;
      }
    }
  }

  // STEP 5 — Batch insert transactions into Supabase
  const insertedTxns: any[] = [];
  for (let i = 0; i < txnsToInsert.length; i += 50) {
    const chunk = txnsToInsert.slice(i, i + 50);
    const { data: insertedChunk, error: insErr } = await supabase
      .from('transactions')
      .insert(chunk)
      .select();

    if (insErr) {
      console.error('Failed to insert transactions chunk:', insErr);
    } else if (insertedChunk) {
      insertedTxns.push(...insertedChunk);
    }
  }

  // STEP 6 — Write audit logs
  for (const ins of insertedTxns) {
    await writeAuditLog({
      table_name: 'transactions',
      record_id: ins.id,
      action: 'insert',
      new_data: {
        id: ins.id,
        account_id: ins.account_id,
        upload_id: ins.upload_id,
        txn_date: ins.txn_date,
        description: ins.description,
        debit: ins.debit,
        credit: ins.credit,
      },
    });
  }

  // STEP 7 — Update upload record status
  await supabase
    .from('statement_uploads')
    .update({
      status: 'imported',
      imported_count: insertedTxns.length,
      duplicate_count: duplicatesSkipped,
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', upload.id);

  return {
    imported: insertedTxns.length,
    imported_count: insertedTxns.length,
    duplicates_skipped: duplicatesSkipped,
    duplicate_count: duplicatesSkipped,
    replaced: replacedCount,
    transfer_pairs_found: transferPairsCount,
    upload_id: upload.id,
  };
}

/**
 * Query ledger with server-side filtering and pagination (50 per page default)
 * Uses .eq(), .gte(), .lte(), .ilike(), .range() directly in Supabase
 */
export async function getTransactions(params?: {
  page?: number;
  pageSize?: number;
  filters?: Partial<TransactionFiltersState>;
}): Promise<{
  transactions: Transaction[];
  totalCount: number;
  totalPages: number;
  totalDebits: number;
  totalCredits: number;
}> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 50;
  const filters = params?.filters || {};

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      transactions: [],
      totalCount: 0,
      totalPages: 1,
      totalDebits: 0,
      totalCredits: 0,
    };
  }

  // 1. Build main query
  let query = supabase
    .from('transactions')
    .select(
      '*, account:accounts(id, name, bank_name, account_number_last4), category:categories(id, name, color_index, icon), workspace:workspaces(id, name, color_index)',
      { count: 'exact' }
    )
    .eq('user_id', user.id);

  if (filters.startDate) query = query.gte('txn_date', filters.startDate);
  if (filters.endDate) query = query.lte('txn_date', filters.endDate);
  if (filters.accountIds && filters.accountIds.length > 0) {
    query = query.in('account_id', filters.accountIds);
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    query = query.in('category_id', filters.categoryIds);
  }
  if (filters.workspaceId && filters.workspaceId !== 'all') {
    query = query.eq('workspace_id', filters.workspaceId);
  }
  if (filters.txnType && filters.txnType !== 'all') {
    query = query.eq('txn_type', filters.txnType);
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(`description.ilike.%${s}%,reference_number.ilike.%${s}%`);
  }

  query = query.order('txn_date', { ascending: false }).order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: transactions, count, error } = await query;
  if (error || !transactions) {
    console.error('getTransactions query error:', error);
    return {
      transactions: [],
      totalCount: 0,
      totalPages: 1,
      totalDebits: 0,
      totalCredits: 0,
    };
  }

  // 2. Compute aggregate debits and credits for current filter set
  let sumQuery = supabase
    .from('transactions')
    .select('debit, credit')
    .eq('user_id', user.id);

  if (filters.startDate) sumQuery = sumQuery.gte('txn_date', filters.startDate);
  if (filters.endDate) sumQuery = sumQuery.lte('txn_date', filters.endDate);
  if (filters.accountIds && filters.accountIds.length > 0) {
    sumQuery = sumQuery.in('account_id', filters.accountIds);
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    sumQuery = sumQuery.in('category_id', filters.categoryIds);
  }
  if (filters.workspaceId && filters.workspaceId !== 'all') {
    sumQuery = sumQuery.eq('workspace_id', filters.workspaceId);
  }
  if (filters.txnType && filters.txnType !== 'all') {
    sumQuery = sumQuery.eq('txn_type', filters.txnType);
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    sumQuery = sumQuery.or(`description.ilike.%${s}%,reference_number.ilike.%${s}%`);
  }

  const { data: sumRows } = await sumQuery;
  let totalDebits = 0;
  let totalCredits = 0;
  if (sumRows) {
    for (const r of sumRows) {
      totalDebits += Number(r.debit || 0);
      totalCredits += Number(r.credit || 0);
    }
  }

  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    transactions: transactions.map((t: any) => ({
      ...t,
      debit: t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
      credit: t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
      balance: t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
    })),
    totalCount,
    totalPages,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
  };
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(
      '*, account:accounts(id, name, bank_name, account_number_last4), category:categories(id, name, color_index, icon), workspace:workspaces(id, name, color_index)'
    )
    .eq('user_id', user.id)
    .order('txn_date', { ascending: false });

  if (error || !data) {
    console.error('getAllTransactions query error:', error);
    return [];
  }

  return data.map((t: any) => ({
    ...t,
    debit: t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
    credit: t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
    balance: t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
  }));
}

export async function createManualTransaction(data: ManualTransactionFormData): Promise<Transaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const newTxPayload = {
    user_id: user.id,
    account_id: data.account_id,
    txn_date: data.txn_date,
    description: data.description.trim(),
    raw_description: data.description.trim(),
    debit: data.debit ?? null,
    credit: data.credit ?? null,
    balance: null,
    reference_number: data.reference_number?.trim() || null,
    category_id: data.category_id || null,
    workspace_id: data.workspace_id || null,
    txn_type: data.txn_type,
    tags: data.tags || [],
    notes: data.notes?.trim() || null,
    is_transfer: data.is_transfer ?? false,
    transfer_pair_id: data.transfer_pair_id || null,
    is_manual: true,
  };

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert(newTxPayload)
    .select(
      '*, account:accounts(id, name, bank_name, account_number_last4), category:categories(id, name, color_index, icon), workspace:workspaces(id, name, color_index)'
    )
    .single();

  if (error || !inserted) {
    console.error('Failed to create manual transaction:', error);
    throw new Error(error?.message || 'Failed to create manual transaction');
  }

  await writeAuditLog({
    table_name: 'transactions',
    record_id: inserted.id,
    action: 'insert',
    new_data: inserted,
  });

  return inserted;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Transaction>
): Promise<Transaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Prevent editing sacred amount/balance fields
  const safeUpdates: any = {};
  if (updates.category_id !== undefined) safeUpdates.category_id = updates.category_id;
  if (updates.workspace_id !== undefined) safeUpdates.workspace_id = updates.workspace_id;
  if (updates.tags !== undefined) safeUpdates.tags = updates.tags;
  if (updates.notes !== undefined) safeUpdates.notes = updates.notes;
  if (updates.txn_type !== undefined) safeUpdates.txn_type = updates.txn_type;
  if (updates.is_transfer !== undefined) safeUpdates.is_transfer = updates.is_transfer;
  if (updates.transfer_pair_id !== undefined) safeUpdates.transfer_pair_id = updates.transfer_pair_id;
  safeUpdates.updated_at = new Date().toISOString();

  // Get old data for audit
  const { data: oldTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { data: updated, error } = await supabase
    .from('transactions')
    .update(safeUpdates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(
      '*, account:accounts(id, name, bank_name, account_number_last4), category:categories(id, name, color_index, icon), workspace:workspaces(id, name, color_index)'
    )
    .single();

  if (error || !updated) {
    console.error('Failed to update transaction:', error);
    throw new Error(error?.message || 'Failed to update transaction');
  }

  await writeAuditLog({
    table_name: 'transactions',
    record_id: id,
    action: 'update',
    old_data: oldTx,
    new_data: updated,
  });

  return updated;
}

export async function bulkUpdateTransactions(
  ids: string[],
  updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    append_tags?: string[];
  }
): Promise<{ updatedCount: number }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  if (!ids || ids.length === 0) return { updatedCount: 0 };

  const patch: any = { updated_at: new Date().toISOString() };
  if (updates.category_id !== undefined) patch.category_id = updates.category_id;
  if (updates.workspace_id !== undefined) patch.workspace_id = updates.workspace_id;

  const { error } = await supabase
    .from('transactions')
    .update(patch)
    .in('id', ids)
    .eq('user_id', user.id);

  if (error) {
    console.error('bulkUpdateTransactions error:', error);
    throw new Error(error.message);
  }

  for (const id of ids) {
    await writeAuditLog({
      table_name: 'transactions',
      record_id: id,
      action: 'update',
      new_data: patch,
    });
  }

  return { updatedCount: ids.length };
}

export async function applyAICategorizations(
  results: Array<{
    transaction_id: string;
    suggested_category_id: string;
    confidence: 'high' | 'medium' | 'low';
  }>
): Promise<{ appliedCount: number }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  let appliedCount = 0;
  for (const res of results) {
    if (res.confidence === 'high' || res.confidence === 'medium') {
      const { error } = await supabase
        .from('transactions')
        .update({
          category_id: res.suggested_category_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', res.transaction_id)
        .eq('user_id', user.id);

      if (!error) appliedCount++;
    }
  }

  return { appliedCount };
}

/**
 * Returns ledger for a specific account with running balance calculation
 */
export async function getAccountLedgerWithRunningBalance(
  accountId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    txnType?: string;
    search?: string;
  }
): Promise<{
  transactions: (Transaction & { calculated_running_balance: number })[];
  dailyBalancePoints: { date: string; balance: number }[];
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { transactions: [], dailyBalancePoints: [] };
  }

  // Get account opening balance
  const { data: acc } = await supabase
    .from('accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  const openingBalance = Number(acc?.opening_balance || 0);

  // Fetch all transactions for account to compute true chronological running balance
  let query = supabase
    .from('transactions')
    .select(
      '*, account:accounts(id, name, bank_name, account_number_last4), category:categories(id, name, color_index, icon), workspace:workspaces(id, name, color_index)'
    )
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });

  const { data: allAccountTxns, error } = await query;
  if (error || !allAccountTxns) {
    return { transactions: [], dailyBalancePoints: [] };
  }

  let running = openingBalance;
  const withRunningBal = allAccountTxns.map((t: any) => {
    const deb = Number(t.debit || 0);
    const cred = Number(t.credit || 0);
    running = running + cred - deb;
    return {
      ...t,
      calculated_running_balance: Math.round(running * 100) / 100,
    };
  });

  // Daily points for chart
  const dailyMap = new Map<string, number>();
  dailyMap.set('Opening', openingBalance);
  for (const t of withRunningBal) {
    dailyMap.set(t.txn_date, t.calculated_running_balance);
  }

  const dailyBalancePoints = Array.from(dailyMap.entries()).map(([date, balance]) => ({
    date,
    balance,
  }));

  // Apply filters on the list returned to UI
  let filtered = withRunningBal;
  if (filters?.startDate) filtered = filtered.filter((t) => t.txn_date >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((t) => t.txn_date <= filters.endDate!);
  if (filters?.categoryId && filters.categoryId !== 'all') {
    filtered = filtered.filter((t) => t.category_id === filters.categoryId);
  }
  if (filters?.txnType && filters.txnType !== 'all') {
    filtered = filtered.filter((t) => t.txn_type === filters.txnType);
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        (t.reference_number && t.reference_number.toLowerCase().includes(q))
    );
  }

  // Reverse so latest is first
  return {
    transactions: filtered.reverse(),
    dailyBalancePoints,
  };
}

/**
 * Aggregates Indian ITR schedule breakdown
 */
export async function getITRSummaryData(dateRange: { startDate: string; endDate: string }): Promise<{
  lineItems: Array<{ section: string; lineItem: string; amount: number }>;
  workspaces: Array<{ name: string; income: number; expenses: number; net: number; count: number }>;
}> {
  const txns = await getAllTransactions();
  const inRange = txns.filter(
    (t) => t.txn_date >= dateRange.startDate && t.txn_date <= dateRange.endDate
  );

  let salaryIncome = 0;
  let professionalIncome = 0;
  let otherIncome = 0;
  let businessExpenses = 0;
  let medicalInsurance80D = 0;
  let taxSavings80C = 0;

  for (const t of inRange) {
    if (t.is_transfer || t.txn_type === 'transfer') continue;

    const catName = t.category?.name || '';
    const isCredit = t.credit !== null && t.credit !== undefined && t.credit > 0;
    const isDebit = t.debit !== null && t.debit !== undefined && t.debit > 0;

    if (isCredit) {
      if (catName.toLowerCase().includes('salary')) {
        salaryIncome += t.credit || 0;
      } else if (
        catName.toLowerCase().includes('freelance') ||
        catName.toLowerCase().includes('consult') ||
        catName.toLowerCase().includes('client')
      ) {
        professionalIncome += t.credit || 0;
      } else {
        otherIncome += t.credit || 0;
      }
    } else if (isDebit) {
      if (t.workspace?.name === 'Business') {
        businessExpenses += t.debit || 0;
      }
      if (catName.toLowerCase().includes('insurance') || catName.toLowerCase().includes('health')) {
        medicalInsurance80D += t.debit || 0;
      }
      if (catName.toLowerCase().includes('invest') || catName.toLowerCase().includes('ppf') || catName.toLowerCase().includes('elss')) {
        taxSavings80C += t.debit || 0;
      }
    }
  }

  const grossTotal = salaryIncome + professionalIncome + otherIncome;
  const standardDeduction = salaryIncome > 0 ? 75000 : 0; // Updated Section 16(ia) limit
  const deductions80C = Math.min(150000, taxSavings80C);
  const deductions80D = Math.min(25000, medicalInsurance80D);
  const netTaxable = Math.max(0, grossTotal - standardDeduction - deductions80C - deductions80D - businessExpenses);

  const lineItems = [
    { section: 'Income from Salary (ITR-1/2)', lineItem: 'Gross Salary Receipts', amount: salaryIncome },
    { section: 'Income from Salary (ITR-1/2)', lineItem: 'Standard Deduction u/s 16(ia)', amount: standardDeduction },
    { section: 'Profits & Gains from Business (ITR-3/4)', lineItem: 'Gross Professional Receipts', amount: professionalIncome },
    { section: 'Profits & Gains from Business (ITR-3/4)', lineItem: 'Allowable Business Expenses u/s 37', amount: businessExpenses },
    { section: 'Income from Other Sources', lineItem: 'Interest, Dividends & Sundry Inflows', amount: otherIncome },
    { section: 'Chapter VI-A Deductions', lineItem: 'Section 80C (PPF, ELSS, EPF)', amount: deductions80C },
    { section: 'Chapter VI-A Deductions', lineItem: 'Section 80D (Health Insurance Premium)', amount: deductions80D },
    { section: 'Total Taxable Income', lineItem: 'Computed Net Taxable Income', amount: netTaxable },
  ];

  // Workspaces aggregation
  const wsMap = new Map<string, { income: number; expenses: number; count: number }>();
  for (const t of inRange) {
    if (t.is_transfer || t.txn_type === 'transfer') continue;
    const wsName = t.workspace?.name || 'Personal';
    const cur = wsMap.get(wsName) || { income: 0, expenses: 0, count: 0 };
    cur.count++;
    if (t.credit) cur.income += t.credit;
    if (t.debit) cur.expenses += t.debit;
    wsMap.set(wsName, cur);
  }

  const workspaces = Array.from(wsMap.entries()).map(([name, data]) => ({
    name,
    income: Math.round(data.income * 100) / 100,
    expenses: Math.round(data.expenses * 100) / 100,
    net: Math.round((data.income - data.expenses) * 100) / 100,
    count: data.count,
  }));

  return { lineItems, workspaces };
}

/**
 * Computes dashboard financial KPIs
 */
export async function getDashboardMetrics(
  dateBounds: { startDate: string; endDate: string },
  workspaceFilter: string = 'all'
): Promise<any> {
  const [accounts, allTxns, categories] = await Promise.all([
    getAccounts(),
    getAllTransactions(),
    getCategories(),
  ]);

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    const bal = acc.current_balance;
    if (acc.account_type === 'credit_card' || bal < 0) {
      totalLiabilities += Math.abs(bal);
    } else {
      totalAssets += bal;
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  // Filter transactions for period and workspace
  let filtered = allTxns.filter(
    (t) => t.txn_date >= dateBounds.startDate && t.txn_date <= dateBounds.endDate
  );
  if (workspaceFilter && workspaceFilter !== 'all') {
    filtered = filtered.filter((t) => t.workspace?.name === workspaceFilter);
  }

  let totalIncome = 0;
  let totalExpenses = 0;

  const categorySpendingMap = new Map<string, number>();

  for (const t of filtered) {
    if (t.is_transfer || t.txn_type === 'transfer') continue;

    if (t.credit) totalIncome += t.credit;
    if (t.debit) {
      totalExpenses += t.debit;
      const catName = t.category?.name || 'Uncategorized';
      categorySpendingMap.set(catName, (categorySpendingMap.get(catName) || 0) + t.debit);
    }
  }

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  const spendingByCategory = Array.from(categorySpendingMap.entries())
    .map(([category, amount], idx) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      color: categories.find((c) => c.name === category)?.color_index ?? idx % 10,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    netWorth: Math.round(netWorth * 100) / 100,
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netSavings: Math.round(netSavings * 100) / 100,
    savingsRate,
    spendingByCategory,
    recentTransactions: filtered.slice(0, 10),
  };
}
