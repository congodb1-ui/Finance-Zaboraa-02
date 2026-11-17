import {
  ALLOWED_AUTO_CATEGORIES,
  ensureCanonicalCategories,
  normalizeAllowedCategoryName,
  type AutoCategorizeBatchSummary,
  type AutoCategorizeItem,
  type CategorySummaryRow,
} from './constants';
import {
  classifyMerchantGroups,
  deriveRuleMatchPattern,
} from './ai-classify';
import {
  groupTransactionsByMerchant,
  normalizeMerchantKey,
} from './merchant-grouping';
import { findFirstMatchingRule } from '../rules-engine';
import type { Category } from '../../types/categories';
import type { RuleScope, TransactionRule } from '../../types/transactions';

function isIncomeCategorySpec(name: string): boolean {
  const found = ALLOWED_AUTO_CATEGORIES.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  return Boolean(found?.is_income);
}

async function fetchAllUserTransactions(db: any, userId: string): Promise<any[]> {
  const collected: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    let q = db
      .from('transactions')
      .select(
        'id, user_id, account_id, txn_date, description, raw_description, debit, credit, category_id, txn_type, is_transfer, is_self_transfer, is_manual, category_source, ai_batch_id, created_at'
      )
      .eq('user_id', userId);

    if (typeof q.order === 'function') {
      q = q.order('txn_date', { ascending: false }).order('id', { ascending: true });
    }

    const { data, error } =
      typeof q.range === 'function' ? await q.range(from, from + PAGE_SIZE - 1) : await q;

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    collected.push(...data);
    if (typeof q.range !== 'function' || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected;
}

async function fetchUserEditedTransactionIds(db: any, userId: string): Promise<Set<string>> {
  const editedIds = new Set<string>();
  try {
    const { data } = await db
      .from('audit_log')
      .select('record_id, new_data')
      .eq('user_id', userId)
      .eq('table_name', 'transactions')
      .eq('action', 'update');

    for (const row of data || []) {
      if (row?.record_id && (row.new_data as any)?.category_id !== undefined) {
        editedIds.add(row.record_id);
      }
    }
  } catch {
    // audit_log query is best-effort
  }
  return editedIds;
}

async function fetchFamilyMemberNames(db: any, userId: string): Promise<string[]> {
  try {
    const { data, error } = await db
      .from('family_members')
      .select('name, full_name')
      .eq('user_id', userId);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r: any) => String(r.full_name || r.name || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function computeCategorySummary(items: AutoCategorizeItem[]): CategorySummaryRow[] {
  const map = new Map<string, CategorySummaryRow>();
  for (const spec of ALLOWED_AUTO_CATEGORIES) {
    map.set(spec.name, {
      categoryName: spec.name,
      categoryId: null,
      merchantCount: 0,
      totalAmount: 0,
      approvedMerchantCount: 0,
    });
  }

  for (const item of items) {
    const catName = normalizeAllowedCategoryName(
      item.isTransfer && (!item.selectedCategoryName || item.selectedCategoryName === 'Other')
        ? 'Family Transfer'
        : item.selectedCategoryName || item.suggestedCategoryName
    );
    const entry = map.get(catName) || {
      categoryName: catName,
      categoryId: item.selectedCategoryId || item.suggestedCategoryId || null,
      merchantCount: 0,
      totalAmount: 0,
      approvedMerchantCount: 0,
    };
    if (!entry.categoryId) {
      entry.categoryId = item.selectedCategoryId || item.suggestedCategoryId || null;
    }
    entry.merchantCount += 1;
    entry.totalAmount = Math.round((entry.totalAmount + Number(item.totalAmount || 0)) * 100) / 100;
    if (item.approved) entry.approvedMerchantCount += 1;
    map.set(catName, entry);
  }

  return Array.from(map.values()).filter((r) => r.merchantCount > 0);
}

function hydrateItemCategoryIds(
  items: AutoCategorizeItem[],
  categories: Category[]
): AutoCategorizeItem[] {
  const catByLower = new Map<string, Category>();
  for (const c of categories) {
    catByLower.set(c.name.trim().toLowerCase(), c);
  }

  return items.map((item) => {
    const suggestedName = normalizeAllowedCategoryName(item.suggestedCategoryName);
    const selectedName = normalizeAllowedCategoryName(item.selectedCategoryName || suggestedName);
    const suggestedCat = catByLower.get(suggestedName.toLowerCase());
    const selectedCat = catByLower.get(selectedName.toLowerCase());
    return {
      ...item,
      suggestedCategoryName: suggestedName,
      suggestedCategoryId: suggestedCat ? suggestedCat.id : item.suggestedCategoryId,
      selectedCategoryName: selectedName,
      selectedCategoryId: selectedCat ? selectedCat.id : item.selectedCategoryId,
    };
  });
}

function normalizeBatchRow(row: any): AutoCategorizeBatchSummary {
  return {
    id: row.id,
    status: row.status,
    rules_created: Number(row.rules_created || 0),
    transactions_categorized: Number(row.transactions_categorized || 0),
    applied_at: row.applied_at || null,
    reverted_at: row.reverted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function resolveEligibleIdsForScope(
  item: AutoCategorizeItem,
  accountPurposeById: Map<string, 'personal' | 'business'>
): string[] {
  const txIds = Array.isArray(item.transactionIds) ? item.transactionIds : [];
  if (!item.selectedScope || item.selectedScope === 'all') {
    return txIds;
  }
  if (item.selectedScope === 'pending') {
    return [];
  }
  if (item.selectedScope === 'account') {
    if (!item.selectedAccountId) return [];
    return txIds.filter(
      (id) => item.transactionAccountIds?.[id] === item.selectedAccountId
    );
  }
  if (item.selectedScope === 'personal') {
    return txIds.filter((id) => {
      const accId = item.transactionAccountIds?.[id];
      const purpose = accId ? accountPurposeById.get(accId) : 'personal';
      return purpose !== 'business';
    });
  }
  if (item.selectedScope === 'business') {
    return txIds.filter((id) => {
      const accId = item.transactionAccountIds?.[id];
      const purpose = accId ? accountPurposeById.get(accId) : 'personal';
      return purpose === 'business';
    });
  }
  return txIds;
}

export async function getAutoCategorizeStatus(db: any, userId: string) {
  const categories = await ensureCanonicalCategories(db, userId);
  const [transactions, { data: batches, error: batchErr }] = await Promise.all([
    fetchAllUserTransactions(db, userId),
    db
      .from('auto_categorization_batches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (batchErr) {
    throw new Error(`Failed to load auto-categorization batches: ${batchErr.message}`);
  }

  const totalTransactions = transactions.length;
  const uncategorizedTransactions = transactions.filter(
    (tx) =>
      !tx.category_id &&
      tx.category_source !== 'manual' &&
      !(tx.is_manual && tx.category_id) &&
      !tx.is_self_transfer &&
      tx.txn_type !== 'opening'
  ).length;

  const batchList = Array.isArray(batches) ? batches : [];
  const draftRow = batchList.find((b: any) => b.status === 'draft') || null;
  const appliedRow = batchList.find((b: any) => b.status === 'applied') || null;
  const revertedRow = batchList.find((b: any) => b.status === 'reverted') || null;

  let draftItems: AutoCategorizeItem[] = [];
  if (draftRow?.draft_state?.items && Array.isArray(draftRow.draft_state.items)) {
    draftItems = hydrateItemCategoryIds(draftRow.draft_state.items, categories);
  }

  return {
    totalTransactions,
    uncategorizedTransactions,
    categories,
    draftBatch: draftRow ? normalizeBatchRow(draftRow) : null,
    draftItems,
    categorySummary: draftItems.length > 0 ? computeCategorySummary(draftItems) : [],
    appliedBatch: appliedRow ? normalizeBatchRow(appliedRow) : null,
    lastRevertedBatch: revertedRow ? normalizeBatchRow(revertedRow) : null,
  };
}

export async function runAutoCategorizeAnalysis(db: any, userId: string) {
  const categories = await ensureCanonicalCategories(db, userId);

  const [transactions, { data: accounts }, { data: rules }, { data: profile }, familyNames, userEditedTxIds] =
    await Promise.all([
      fetchAllUserTransactions(db, userId),
      db.from('accounts').select('*').eq('user_id', userId),
      db
        .from('transaction_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('priority', { ascending: true }),
      db
        .from('profiles')
        .select('full_name, owner_full_name')
        .eq('user_id', userId)
        .maybeSingle(),
      fetchFamilyMemberNames(db, userId),
      fetchUserEditedTransactionIds(db, userId),
    ]);

  if (transactions.length === 0) {
    return {
      empty: true,
      message: 'Upload your bank statements first, then run analysis',
      categories,
      items: [] as AutoCategorizeItem[],
      categorySummary: [] as CategorySummaryRow[],
      batch: null,
      totalTransactions: 0,
      uncategorizedTransactions: 0,
    };
  }

  const ownerName: string | null =
    profile?.owner_full_name || profile?.full_name || null;

  const groups = groupTransactionsByMerchant(transactions, accounts || [], {
    ownerName,
    familyNames,
    userEditedTxIds,
    includeAlreadyCategorized: false,
  });

  const items = await classifyMerchantGroups(
    groups,
    (rules || []) as TransactionRule[],
    categories,
    ownerName || undefined
  );

  const categorySummary = computeCategorySummary(items);
  const nowIso = new Date().toISOString();

  // Reuse or replace existing draft batch cleanly so re-running never creates clutter
  const { data: existingDraft } = await db
    .from('auto_categorization_batches')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let savedBatch: any = null;
  if (existingDraft?.id) {
    const { data: updatedDraft, error: updErr } = await db
      .from('auto_categorization_batches')
      .update({
        draft_state: { items, analyzedAt: nowIso },
        updated_at: nowIso,
      })
      .eq('id', existingDraft.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updErr) {
      throw new Error(`Failed to save analysis draft: ${updErr.message}`);
    }
    savedBatch = updatedDraft;
  } else {
    const { data: insertedDraft, error: insErr } = await db
      .from('auto_categorization_batches')
      .insert({
        user_id: userId,
        status: 'draft',
        rules_created: 0,
        transactions_categorized: 0,
        draft_state: { items, analyzedAt: nowIso },
      })
      .select('*')
      .single();

    if (insErr) {
      throw new Error(`Failed to create analysis draft: ${insErr.message}`);
    }
    savedBatch = insertedDraft;
  }

  const uncategorizedTransactions = transactions.filter(
    (tx) =>
      !tx.category_id &&
      tx.category_source !== 'manual' &&
      !(tx.is_manual && tx.category_id) &&
      !tx.is_self_transfer &&
      tx.txn_type !== 'opening'
  ).length;

  return {
    empty: false,
    batch: normalizeBatchRow(savedBatch),
    items,
    categories,
    categorySummary,
    totalTransactions: transactions.length,
    uncategorizedTransactions,
  };
}

export async function saveAutoCategorizeDraft(
  db: any,
  userId: string,
  batchId: string,
  items: AutoCategorizeItem[]
) {
  const nowIso = new Date().toISOString();
  const { data: existing, error: fetchErr } = await db
    .from('auto_categorization_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !existing) {
    throw new Error('Draft batch not found.');
  }
  if (existing.status !== 'draft') {
    throw new Error('Only draft batches can be modified.');
  }

  const { data: updated, error: updErr } = await db
    .from('auto_categorization_batches')
    .update({
      draft_state: { items, savedAt: nowIso },
      updated_at: nowIso,
    })
    .eq('id', batchId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Failed to save draft.');
  }

  return {
    batch: normalizeBatchRow(updated),
    items,
    categorySummary: computeCategorySummary(items),
  };
}

export async function applyAutoCategorizeBatch(
  db: any,
  userId: string,
  batchId: string,
  items: AutoCategorizeItem[]
) {
  const categories = await ensureCanonicalCategories(db, userId);
  const catByName = new Map<string, Category>();
  for (const c of categories) {
    catByName.set(c.name.trim().toLowerCase(), c);
  }

  const { data: batchRow, error: batchErr } = await db
    .from('auto_categorization_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .single();

  if (batchErr || !batchRow) {
    throw new Error('Auto-categorization batch not found.');
  }
  if (batchRow.status === 'applied') {
    throw new Error('This batch has already been applied.');
  }

  // Validate Needs Your Decision gate strictly on the server as well
  for (const item of items) {
    if (item.needsDecision) {
      if (!item.decisionResolved) {
        throw new Error(
          `Please resolve "${item.displayName}" in Needs Your Decision before applying.`
        );
      }
      if (item.selectedScope === 'pending') {
        throw new Error(
          `Please select an account scope (Personal Only, Business Only, or All Accounts) for "${item.displayName}".`
        );
      }
    }
  }

  const approvedItems = items.filter((item) => item.approved === true);
  if (approvedItems.length === 0) {
    throw new Error('Please approve at least one merchant before applying.');
  }

  const [{ data: accounts }, { data: existingRules }, userEditedTxIds] = await Promise.all([
    db.from('accounts').select('id, purpose').eq('user_id', userId),
    db
      .from('transaction_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true }),
    fetchUserEditedTransactionIds(db, userId),
  ]);

  const accountPurposeById = new Map<string, 'personal' | 'business'>();
  for (const a of accounts || []) {
    accountPurposeById.set(a.id, a.purpose === 'business' ? 'business' : 'personal');
  }

  const activeRules: TransactionRule[] = Array.isArray(existingRules) ? [...existingRules] : [];
  let maxPriority = activeRules.reduce((max, r) => Math.max(max, Number(r.priority || 0)), 0);

  let rulesCreated = 0;
  const categorizedTxIds = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const item of approvedItems) {
    const targetCategoryName = normalizeAllowedCategoryName(
      item.isTransfer && (!item.selectedCategoryName || item.selectedCategoryName === 'Other')
        ? 'Family Transfer'
        : item.selectedCategoryName || item.suggestedCategoryName
    );
    const targetCat = catByName.get(targetCategoryName.toLowerCase());
    if (!targetCat) continue;

    const effectiveScope: RuleScope =
      item.selectedScope === 'pending' ? 'all' : item.selectedScope || 'all';
    const targetAccountId =
      effectiveScope === 'account' ? item.selectedAccountId || null : null;
    const isTransfer = Boolean(item.isTransfer || targetCategoryName === 'Family Transfer');
    const targetTxnType: 'expense' | 'income' | 'transfer' = isTransfer
      ? 'transfer'
      : isIncomeCategorySpec(targetCategoryName)
      ? 'income'
      : 'expense';

    const normKey = normalizeMerchantKey(item.merchantKey, item.displayName);
    const matchPattern = deriveRuleMatchPattern(item.merchantKey, item.variants);

    // Never create duplicate rules on re-runs
    const duplicateRule = activeRules.find(
      (r) =>
        r.is_active &&
        (r.merchant_key === normKey ||
          (r.match_field === 'description' &&
            r.match_value.trim().toUpperCase() === matchPattern.toUpperCase())) &&
        (r.scope || 'all') === effectiveScope &&
        (r.account_id || null) === targetAccountId &&
        (r.set_category || null) === targetCat.id &&
        Boolean(r.is_transfer) === isTransfer
    );

    if (!duplicateRule) {
      maxPriority += 10;
      const rulePayload = {
        user_id: userId,
        name: `${item.displayName} → ${targetCategoryName}`,
        priority: maxPriority,
        is_active: true,
        match_field: 'description' as const,
        match_type: 'contains' as const,
        match_value: matchPattern,
        set_category: targetCat.id,
        set_workspace: null,
        set_txn_type: targetTxnType,
        set_tags: null,
        scope: effectiveScope,
        account_id: targetAccountId,
        is_transfer: isTransfer,
        merchant_key: normKey,
        ai_batch_id: batchId,
        source: 'ai_batch' as const,
      };

      const { data: insertedRule, error: ruleErr } = await db
        .from('transaction_rules')
        .insert(rulePayload)
        .select('*')
        .single();

      if (ruleErr) {
        throw new Error(`Failed to create rule for "${item.displayName}": ${ruleErr.message}`);
      }
      if (insertedRule) {
        activeRules.push(insertedRule as TransactionRule);
        rulesCreated += 1;
      }
    }

    // Determine eligible transactions matching the chosen scope
    const scopedCandidateIds = resolveEligibleIdsForScope(item, accountPurposeById);
    if (scopedCandidateIds.length === 0) continue;

    // Fetch live DB state of candidate transactions to guarantee manual categories are never touched
    const CHUNK = 150;
    for (let i = 0; i < scopedCandidateIds.length; i += CHUNK) {
      const idSlice = scopedCandidateIds.slice(i, i + CHUNK);
      const { data: currentRows, error: fetchTxErr } = await db
        .from('transactions')
        .select('id, category_id, is_manual, category_source, is_self_transfer')
        .eq('user_id', userId)
        .in('id', idSlice);

      if (fetchTxErr) {
        throw new Error(`Failed to verify transactions before update: ${fetchTxErr.message}`);
      }

      const safeIdsToUpdate = (currentRows || [])
        .filter((tx: any) => {
          if (tx.category_source === 'manual') return false;
          if (tx.is_manual && tx.category_id) return false;
          if (userEditedTxIds.has(tx.id)) return false;
          if (tx.is_self_transfer) return false;
          if (tx.category_id) return false;
          return true;
        })
        .map((tx: any) => tx.id as string);

      if (safeIdsToUpdate.length === 0) continue;

      const { error: updTxErr } = await db
        .from('transactions')
        .update({
          category_id: targetCat.id,
          txn_type: targetTxnType,
          is_transfer: isTransfer,
          category_source: 'ai_batch',
          ai_batch_id: batchId,
          updated_at: nowIso,
        })
        .eq('user_id', userId)
        .in('id', safeIdsToUpdate);

      if (updTxErr) {
        throw new Error(`Failed to apply category to transactions: ${updTxErr.message}`);
      }

      for (const txId of safeIdsToUpdate) {
        categorizedTxIds.add(txId);
      }
    }
  }

  const transactionsCategorized = categorizedTxIds.size;

  const { data: updatedBatch, error: batchUpdErr } = await db
    .from('auto_categorization_batches')
    .update({
      status: 'applied',
      rules_created: rulesCreated,
      transactions_categorized: transactionsCategorized,
      applied_at: nowIso,
      draft_state: { items, appliedAt: nowIso },
      updated_at: nowIso,
    })
    .eq('id', batchId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (batchUpdErr || !updatedBatch) {
    throw new Error(batchUpdErr?.message || 'Failed to finalize auto-categorization batch.');
  }

  try {
    await db.from('audit_log').insert({
      user_id: userId,
      table_name: 'auto_categorization_batches',
      record_id: batchId,
      action: 'apply',
      new_data: {
        rules_created: rulesCreated,
        transactions_categorized: transactionsCategorized,
      },
    });
  } catch {
    // Best-effort audit logging
  }

  return {
    batch: normalizeBatchRow(updatedBatch),
    rulesCreated,
    transactionsCategorized,
  };
}

export async function revertAutoCategorizeBatch(
  db: any,
  userId: string,
  batchId: string
) {
  const { data: batchRow, error: batchErr } = await db
    .from('auto_categorization_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .single();

  if (batchErr || !batchRow) {
    throw new Error('Applied batch not found.');
  }
  if (batchRow.status === 'reverted') {
    throw new Error('This batch has already been reverted.');
  }

  const nowIso = new Date().toISOString();
  const userEditedTxIds = await fetchUserEditedTransactionIds(db, userId);

  // Fetch all transactions tagged with this ai_batch_id
  const { data: batchTxns, error: fetchTxErr } = await db
    .from('transactions')
    .select('id, debit, credit, category_id, is_manual, category_source')
    .eq('user_id', userId)
    .eq('ai_batch_id', batchId);

  if (fetchTxErr) {
    throw new Error(`Failed to fetch batch transactions: ${fetchTxErr.message}`);
  }

  let resetTransactions = 0;
  for (const tx of batchTxns || []) {
    // Never lose manual categories even if the user later manually overrode a batch tx
    if (tx.category_source === 'manual' || tx.is_manual || userEditedTxIds.has(tx.id)) {
      continue;
    }

    const restoredTxnType =
      tx.debit !== null && tx.debit !== undefined && Number(tx.debit) > 0 ? 'expense' : 'income';

    const { error: resetErr } = await db
      .from('transactions')
      .update({
        category_id: null,
        category_source: null,
        ai_batch_id: null,
        is_transfer: false,
        txn_type: restoredTxnType,
        updated_at: nowIso,
      })
      .eq('id', tx.id)
      .eq('user_id', userId);

    if (!resetErr) {
      resetTransactions += 1;
    }
  }

  // Count and delete rules created by this batch
  const { data: batchRules } = await db
    .from('transaction_rules')
    .select('id')
    .eq('user_id', userId)
    .eq('ai_batch_id', batchId);

  const deletedRules = Array.isArray(batchRules) ? batchRules.length : 0;

  if (deletedRules > 0) {
    const { error: delRuleErr } = await db
      .from('transaction_rules')
      .delete()
      .eq('user_id', userId)
      .eq('ai_batch_id', batchId);

    if (delRuleErr) {
      throw new Error(`Failed to delete AI-suggested rules: ${delRuleErr.message}`);
    }
  }

  const { data: revertedBatch, error: updBatchErr } = await db
    .from('auto_categorization_batches')
    .update({
      status: 'reverted',
      reverted_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', batchId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updBatchErr || !revertedBatch) {
    throw new Error(updBatchErr?.message || 'Failed to mark batch as reverted.');
  }

  try {
    await db.from('audit_log').insert({
      user_id: userId,
      table_name: 'auto_categorization_batches',
      record_id: batchId,
      action: 'revert',
      new_data: {
        reset_transactions: resetTransactions,
        deleted_rules: deletedRules,
      },
    });
  } catch {
    // Best-effort
  }

  return {
    batch: normalizeBatchRow(revertedBatch),
    resetTransactions,
    deletedRules,
  };
}

export async function previewUploadCategorization(
  db: any,
  userId: string,
  uploadId: string
) {
  const categories = await ensureCanonicalCategories(db, userId);
  const { data: allCategoriesData } = await db
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},is_system.eq.true`);
  const allCategories: Category[] =
    Array.isArray(allCategoriesData) && allCategoriesData.length > 0
      ? allCategoriesData
      : categories;

  const { data: upload, error: upErr } = await db
    .from('statement_uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .single();

  if (upErr || !upload) {
    throw new Error('Upload not found.');
  }

  const [
    { data: account },
    { data: stagedRows, error: stErr },
    { data: rules },
    { data: profile },
    familyNames,
  ] = await Promise.all([
    db.from('accounts').select('*').eq('id', upload.account_id).maybeSingle(),
    db
      .from('staged_transactions')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('user_id', userId)
      .order('row_index', { ascending: true }),
    db
      .from('transaction_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: true }),
    db
      .from('profiles')
      .select('full_name, owner_full_name')
      .eq('user_id', userId)
      .maybeSingle(),
    fetchFamilyMemberNames(db, userId),
  ]);

  if (stErr) {
    throw new Error(`Failed to fetch staged transactions: ${stErr.message}`);
  }

  const activeRules: TransactionRule[] = Array.isArray(rules) ? rules : [];
  const accountContext = account
    ? { id: account.id, purpose: account.purpose || 'personal' }
    : undefined;
  const ownerName: string | null =
    profile?.owner_full_name || profile?.full_name || null;

  const patches = new Map<
    string,
    {
      suggested_category_id: string | null;
      suggestion_source: 'rule' | 'ai' | 'manual' | null;
      suggestion_confidence: number | null;
      is_transfer_suggestion: boolean;
    }
  >();

  const unmatchedStaged: any[] = [];

  // STEP 1: Evaluate persistent rules FIRST — rule-matched rows NEVER call AI
  for (const row of stagedRows || []) {
    if (row.suggestion_source === 'manual' && row.suggested_category_id) {
      patches.set(row.id, {
        suggested_category_id: row.suggested_category_id,
        suggestion_source: 'manual',
        suggestion_confidence: row.suggestion_confidence ?? 1,
        is_transfer_suggestion: Boolean(row.is_transfer_suggestion),
      });
      continue;
    }

    const debit = row.debit !== null && row.debit !== undefined ? Number(row.debit) : null;
    const credit = row.credit !== null && row.credit !== undefined ? Number(row.credit) : null;
    const matchedRule = findFirstMatchingRule(
      activeRules,
      {
        description: row.description,
        raw_description: row.raw_description,
        reference_number: row.reference_number,
        debit,
        credit,
        txn_type: debit ? 'expense' : 'income',
      },
      accountContext
    );

    if (matchedRule && matchedRule.set_category) {
      patches.set(row.id, {
        suggested_category_id: matchedRule.set_category,
        suggestion_source: 'rule',
        suggestion_confidence: 1,
        is_transfer_suggestion: Boolean(
          matchedRule.is_transfer || matchedRule.set_txn_type === 'transfer'
        ),
      });
    } else {
      unmatchedStaged.push(row);
    }
  }

  // STEP 2: For remaining unmatched rows only, group by merchant and classify
  if (unmatchedStaged.length > 0) {
    const groups = groupTransactionsByMerchant(
      unmatchedStaged,
      account ? [account] : [],
      {
        ownerName,
        familyNames,
        includeAlreadyCategorized: true,
      }
    );

    const classifiedItems = await classifyMerchantGroups(
      groups,
      activeRules,
      categories,
      ownerName || undefined
    );

    const itemByTxId = new Map<string, AutoCategorizeItem>();
    for (const item of classifiedItems) {
      for (const txId of item.transactionIds) {
        itemByTxId.set(txId, item);
      }
    }

    for (const row of unmatchedStaged) {
      const item = itemByTxId.get(row.id);
      if (item && item.suggestedCategoryId) {
        patches.set(row.id, {
          suggested_category_id: item.suggestedCategoryId,
          suggestion_source: 'ai',
          suggestion_confidence: item.confidenceScore,
          is_transfer_suggestion: Boolean(item.isTransfer),
        });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const updatedRows: any[] = [];
  for (const row of stagedRows || []) {
    const patch = patches.get(row.id);
    if (!patch) {
      updatedRows.push(row);
      continue;
    }

    const { data: upd, error: updErr } = await db
      .from('staged_transactions')
      .update({
        ...patch,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (!updErr && upd) {
      updatedRows.push(upd);
    } else {
      updatedRows.push({ ...row, ...patch });
    }
  }

  return {
    transactions: updatedRows,
    categories: allCategories,
  };
}

export async function updateStagedCategoryChoice(
  db: any,
  userId: string,
  stagedId: string,
  params: {
    category_id: string | null;
    is_transfer?: boolean;
    apply_to_future?: boolean;
  }
) {
  const { data: stagedRow, error: fetchErr } = await db
    .from('staged_transactions')
    .select('*')
    .eq('id', stagedId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !stagedRow) {
    throw new Error('Staged transaction not found.');
  }

  const nowIso = new Date().toISOString();
  const isTransfer = Boolean(params.is_transfer);

  const { data: updatedRow, error: updErr } = await db
    .from('staged_transactions')
    .update({
      suggested_category_id: params.category_id,
      suggestion_source: 'manual',
      suggestion_confidence: 1,
      is_transfer_suggestion: isTransfer,
      updated_at: nowIso,
    })
    .eq('id', stagedId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updErr || !updatedRow) {
    throw new Error(updErr?.message || 'Failed to update staged transaction category.');
  }

  let ruleCreated = false;
  let updatedSiblingCount = 0;

  if (params.apply_to_future && params.category_id) {
    const merchantKey = normalizeMerchantKey(
      stagedRow.description,
      stagedRow.raw_description
    );
    const matchPattern = deriveRuleMatchPattern(merchantKey, [
      stagedRow.description || stagedRow.raw_description || '',
    ]);

    const [{ data: existingRules }, { data: categoryRow }] = await Promise.all([
      db
        .from('transaction_rules')
        .select('*')
        .eq('user_id', userId)
        .order('priority', { ascending: true }),
      db
        .from('categories')
        .select('id, name, is_income')
        .eq('id', params.category_id)
        .maybeSingle(),
    ]);

    const ruleList: TransactionRule[] = Array.isArray(existingRules) ? existingRules : [];
    const maxPriority = ruleList.reduce(
      (max, r) => Math.max(max, Number(r.priority || 0)),
      0
    );

    const dupRule = ruleList.find(
      (r) =>
        r.is_active &&
        (r.merchant_key === merchantKey ||
          (r.match_field === 'description' &&
            r.match_value.trim().toUpperCase() === matchPattern.toUpperCase())) &&
        (r.scope || 'all') === 'all' &&
        r.set_category === params.category_id
    );

    if (!dupRule) {
      const targetTxnType = isTransfer
        ? 'transfer'
        : categoryRow?.is_income
        ? 'income'
        : 'expense';

      const { error: ruleInsErr } = await db.from('transaction_rules').insert({
        user_id: userId,
        name: `${matchPattern} → ${categoryRow?.name || 'Category'}`,
        priority: maxPriority + 10,
        is_active: true,
        match_field: 'description',
        match_type: 'contains',
        match_value: matchPattern,
        set_category: params.category_id,
        set_workspace: null,
        set_txn_type: targetTxnType,
        set_tags: null,
        scope: 'all',
        account_id: null,
        is_transfer: isTransfer,
        merchant_key: merchantKey,
        ai_batch_id: null,
        source: 'manual',
      });

      if (!ruleInsErr) {
        ruleCreated = true;
      }
    }

    // Apply immediately to sibling rows in this upload with the same merchantKey (that aren't manually set)
    const { data: siblingRows } = await db
      .from('staged_transactions')
      .select('id, description, raw_description, suggestion_source')
      .eq('upload_id', stagedRow.upload_id)
      .eq('user_id', userId);

    for (const sib of siblingRows || []) {
      if (sib.id === stagedId) continue;
      if (sib.suggestion_source === 'manual') continue;
      const sibKey = normalizeMerchantKey(sib.description, sib.raw_description);
      if (sibKey === merchantKey) {
        const { error: sibErr } = await db
          .from('staged_transactions')
          .update({
            suggested_category_id: params.category_id,
            suggestion_source: 'rule',
            suggestion_confidence: 1,
            is_transfer_suggestion: isTransfer,
            updated_at: nowIso,
          })
          .eq('id', sib.id)
          .eq('user_id', userId);
        if (!sibErr) {
          updatedSiblingCount += 1;
        }
      }
    }
  }

  return {
    transaction: updatedRow,
    ruleCreated,
    updatedSiblingCount,
  };
}
