import { createClient } from '../supabase/client';
import type {
  Transaction,
  AuditLogEntry,
  TransactionFiltersState,
  ManualTransactionFormData,
  FinalizeImportResult,
  SelfTransferPairRow,
} from '../../types/transactions';
import { getRules } from './rules';
import { findFirstMatchingRule } from '../rules-engine';
import { getAccounts } from './accounts';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';
import { getUploadDetails } from './upload';
import { getAiSettings } from './aiSettings';
import { resolvePaytmTagCategory } from '../parsers/paytm-upi';
import { extractCrossSourceRefs } from '../parsers/utils';
import { detectAndLinkSelfTransfers } from '../self-transfer';

const TRANSACTION_SELECT =
  '*, accounts(id, name, bank_name, account_number_last4), categories(id, name, color_index, icon), workspaces(id, name, color_index), statement_uploads(id, file_name)';

function mapDbTransaction(row: any): Transaction {
  return {
    ...row,
    debit: row.debit !== null && row.debit !== undefined ? Number(row.debit) : null,
    credit: row.credit !== null && row.credit !== undefined ? Number(row.credit) : null,
    balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : null,
    balance_after:
      row.balance_after !== null && row.balance_after !== undefined
        ? Number(row.balance_after)
        : null,
    is_self_transfer: Boolean(row.is_self_transfer),
    account: row.accounts || undefined,
    category: row.categories || undefined,
    workspace: row.workspaces || undefined,
    upload: row.statement_uploads || undefined,
  };
}

/**
 * Normalizes description for multiset deduplication comparison:
 * lowercase and strip spaces & special characters.
 */
export function normalizeDescription(desc: string): string {
  return (desc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Computes deduplication key for a transaction row (PRD §4.3 Layer 3):
 * - When UTR/reference_number present: account_id + txn_date + amount + utr
 * - Otherwise: account_id + txn_date + amount + normalizedDescription
 */
export function getDedupKey(
  date: string,
  desc: string,
  debit: number | null,
  credit: number | null,
  accountId: string = '',
  utr: string | null = null
): string {
  const amtVal =
    debit !== null && debit !== undefined
      ? `D:${Number(debit).toFixed(2)}`
      : credit !== null && credit !== undefined
      ? `C:${Number(credit).toFixed(2)}`
      : '0.00';

  const cleanUtr = (utr || '').trim().toLowerCase().replace(/\s+/g, '');
  if (cleanUtr) {
    return `${accountId}|${date}|${amtVal}|utr:${cleanUtr}`;
  }
  const normDesc = normalizeDescription(desc);
  return `${accountId}|${date}|${amtVal}|desc:${normDesc}`;
}

/**
 * Retrieve Audit Log for current user (SELECT-only via RLS)
 */
export async function getAuditLogs(client?: any): Promise<AuditLogEntry[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error('Error fetching audit logs:', error?.message);
    return [];
  }

  return data as AuditLogEntry[];
}

/**
 * STEP 1-10: Finalize / Commit Statement Upload Pipeline
 * Implements DB-backed PRD §4.3 Layer 3 multiset deduplication,
 * transaction rules engine, batch insert, transfer pair discovery,
 * audit log entries, and upload status commitment.
 */
export async function commitUploadTransactions(
  uploadId: string,
  replacePreviousId?: string,
  client?: any,
  aiEnabledOverride?: boolean
): Promise<FinalizeImportResult> {
  // STEP 1 — Authenticate
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // STEP 2 — Load staged rows for the given upload_id
  const details = await getUploadDetails(uploadId, supabase);
  const upload = details.upload;
  if (!upload) {
    throw new Error(`Upload not found for ID: ${uploadId}`);
  }
  const stagedRows = details.transactions;

  if (stagedRows.length === 0) {
    throw new Error('No staged transactions available to commit.');
  }

  // If replacing a previous upload: delete all transactions for that upload_id first,
  // then import all new rows without deduplicating against the deleted set.
  if (replacePreviousId) {
    const { error: delPrevErr } = await supabase
      .from('transactions')
      .delete()
      .eq('upload_id', replacePreviousId)
      .eq('user_id', user.id);

    if (delPrevErr) {
      throw new Error(`Failed to clear replaced upload transactions: ${delPrevErr.message}`);
    }

    await supabase
      .from('statement_uploads')
      .update({
        status: 'replaced',
        updated_at: new Date().toISOString(),
      })
      .eq('id', replacePreviousId)
      .eq('user_id', user.id);
  }

  // Compute date range of staged batch
  let minDate = stagedRows[0].txn_date;
  let maxDate = stagedRows[0].txn_date;
  for (const row of stagedRows) {
    if (row.txn_date < minDate) minDate = row.txn_date;
    if (row.txn_date > maxDate) maxDate = row.txn_date;
  }

  // Pre-compute cross-source refs (upi_ref_no, imps_ref_no) for incoming staged rows
  const stagedRefMap = new Map<string, { upi_ref_no: string | null; imps_ref_no: string | null }>();
  const incomingUpiRefs = new Set<string>();
  const incomingImpsRefs = new Set<string>();

  for (const staged of stagedRows) {
    const extracted = extractCrossSourceRefs({
      parserVersion: upload.parser_version,
      description: staged.description,
      rawDescription: staged.raw_description,
      referenceNumber: staged.reference_number,
    });
    const upiRef = staged.upi_ref_no || extracted.upi_ref_no || null;
    const impsRef = staged.imps_ref_no || extracted.imps_ref_no || null;
    stagedRefMap.set(staged.id, { upi_ref_no: upiRef, imps_ref_no: impsRef });
    if (upiRef) incomingUpiRefs.add(upiRef);
    if (impsRef) incomingImpsRefs.add(impsRef);
  }

  // STEP 3A — Batch 4b LAYER 4 (UPI Ref) & LAYER 5 (IMPS Ref) cross-source dedup BEFORE Layer 3
  const [upiMatchesRes, impsMatchesRes, existingTxnsRes] = await Promise.all([
    incomingUpiRefs.size > 0
      ? supabase
          .from('transactions')
          .select('id, account_id, upi_ref_no, debit, credit')
          .eq('user_id', user.id)
          .in('upi_ref_no', Array.from(incomingUpiRefs))
      : Promise.resolve({ data: [], error: null }),
    incomingImpsRefs.size > 0
      ? supabase
          .from('transactions')
          .select('id, account_id, imps_ref_no, debit, credit')
          .eq('user_id', user.id)
          .in('imps_ref_no', Array.from(incomingImpsRefs))
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('transactions')
      .select('id, account_id, txn_date, description, debit, credit, reference_number')
      .eq('user_id', user.id)
      .eq('account_id', upload.account_id)
      .neq('upload_id', uploadId)
      .gte('txn_date', minDate)
      .lte('txn_date', maxDate),
  ]);

  if (existingTxnsRes.error) {
    throw new Error(
      `Failed to query existing transactions for deduplication: ${existingTxnsRes.error.message}`
    );
  }

  const existingByUpi = new Map<
    string,
    Array<{ id: string; account_id: string; debit: number | null; credit: number | null }>
  >();
  for (const row of upiMatchesRes.data || []) {
    if (!row.upi_ref_no) continue;
    const list = existingByUpi.get(row.upi_ref_no) || [];
    list.push({
      id: row.id,
      account_id: row.account_id,
      debit: row.debit !== null ? Number(row.debit) : null,
      credit: row.credit !== null ? Number(row.credit) : null,
    });
    existingByUpi.set(row.upi_ref_no, list);
  }

  const existingByImps = new Map<
    string,
    Array<{ id: string; account_id: string; debit: number | null; credit: number | null }>
  >();
  for (const row of impsMatchesRes.data || []) {
    if (!row.imps_ref_no) continue;
    const list = existingByImps.get(row.imps_ref_no) || [];
    list.push({
      id: row.id,
      account_id: row.account_id,
      debit: row.debit !== null ? Number(row.debit) : null,
      credit: row.credit !== null ? Number(row.credit) : null,
    });
    existingByImps.set(row.imps_ref_no, list);
  }

  // STEP 3B — DB-backed Multiset pool (PRD §4.3 Layer 3)
  const existingPool = new Map<string, string[]>();
  for (const t of existingTxnsRes.data || []) {
    const key = getDedupKey(
      t.txn_date,
      t.description,
      t.debit !== null ? Number(t.debit) : null,
      t.credit !== null ? Number(t.credit) : null,
      t.account_id,
      t.reference_number
    );
    const list = existingPool.get(key) || [];
    list.push(t.id);
    existingPool.set(key, list);
  }

  let duplicateCount = 0;
  const nonDuplicateStaged: typeof stagedRows = [];
  const duplicateUpdates: Array<{ id: string; duplicate_of_id: string }> = [];

  for (const staged of stagedRows) {
    const refs = stagedRefMap.get(staged.id) || { upi_ref_no: null, imps_ref_no: null };
    const stagedIsDebit = staged.debit !== null && staged.debit !== undefined && Number(staged.debit) > 0;
    const stagedIsCredit = staged.credit !== null && staged.credit !== undefined && Number(staged.credit) > 0;

    // LAYER 4: UPI Ref cross-source dedup (same account OR same debit/credit direction across sources)
    if (refs.upi_ref_no) {
      const upiCandidates = existingByUpi.get(refs.upi_ref_no) || [];
      const matchedUpi = upiCandidates.find((e) => {
        const eIsDebit = e.debit !== null && e.debit > 0;
        const eIsCredit = e.credit !== null && e.credit > 0;
        return e.account_id === upload.account_id || (eIsDebit === stagedIsDebit && eIsCredit === stagedIsCredit);
      });
      if (matchedUpi) {
        duplicateCount++;
        duplicateUpdates.push({ id: staged.id, duplicate_of_id: matchedUpi.id });
        continue;
      }
    }

    // LAYER 5: IMPS Ref cross-source dedup (same account OR same debit/credit direction; opposite leg across accounts is self-transfer)
    if (refs.imps_ref_no) {
      const impsCandidates = existingByImps.get(refs.imps_ref_no) || [];
      const matchedImps = impsCandidates.find((e) => {
        const eIsDebit = e.debit !== null && e.debit > 0;
        const eIsCredit = e.credit !== null && e.credit > 0;
        return e.account_id === upload.account_id || (eIsDebit === stagedIsDebit && eIsCredit === stagedIsCredit);
      });
      if (matchedImps) {
        duplicateCount++;
        duplicateUpdates.push({ id: staged.id, duplicate_of_id: matchedImps.id });
        continue;
      }
    }

    // LAYER 3: Multiset dedup
    const key = getDedupKey(
      staged.txn_date,
      staged.description,
      staged.debit,
      staged.credit,
      upload.account_id,
      staged.reference_number
    );
    const existingList = existingPool.get(key);

    if (existingList && existingList.length > 0) {
      const matchedTxId = existingList.shift()!;
      duplicateCount++;
      duplicateUpdates.push({ id: staged.id, duplicate_of_id: matchedTxId });
    } else {
      nonDuplicateStaged.push(staged);
    }
  }

  // Mark duplicate staged rows in DB
  for (const dup of duplicateUpdates) {
    await supabase
      .from('staged_transactions')
      .update({ is_duplicate: true, duplicate_of_id: dup.duplicate_of_id })
      .eq('id', dup.id)
      .eq('user_id', user.id);
  }

  // STEP 4 — Apply transaction rules in priority order (+ Paytm tag fallback)
  const [activeRules, categories, workspaces] = await Promise.all([
    getRules(supabase),
    getCategories(supabase),
    getWorkspaces(supabase),
  ]);

  const personalWorkspace = workspaces.find(
    (w) => w.name.trim().toLowerCase() === 'personal'
  );
  const isPaytmUpload = Boolean(upload.parser_version?.startsWith('paytm-upi'));
  const skipAiStagedIds = new Set<string>();

  const finalInsertPayloads = nonDuplicateStaged.map((row) => {
    let determinedType: Transaction['txn_type'] = row.debit ? 'expense' : 'income';
    let assignedCategoryId: string | null = null;
    let assignedWorkspaceId: string | null = null;
    let assignedTags: string[] | null = null;

    const matchedRule = findFirstMatchingRule(activeRules, {
      description: row.description,
      reference_number: row.reference_number,
      debit: row.debit,
      credit: row.credit,
      txn_type: determinedType,
    });

    if (matchedRule) {
      if (matchedRule.set_category) assignedCategoryId = matchedRule.set_category;
      if (matchedRule.set_workspace) assignedWorkspaceId = matchedRule.set_workspace;
      if (matchedRule.set_txn_type) determinedType = matchedRule.set_txn_type;
      if (matchedRule.set_tags && matchedRule.set_tags.length > 0) {
        assignedTags = [...matchedRule.set_tags];
      }
    }

    if (isPaytmUpload && !assignedCategoryId) {
      const tagMatch = resolvePaytmTagCategory(row.raw_description || row.description);
      if (tagMatch) {
        skipAiStagedIds.add(row.id);
        const matchedCat = categories.find((c) =>
          tagMatch.aliases.some(
            (alias) => c.name.trim().toLowerCase() === alias.toLowerCase()
          )
        );
        if (matchedCat) {
          assignedCategoryId = matchedCat.id;
        }
        if (!assignedWorkspaceId && personalWorkspace) {
          assignedWorkspaceId = personalWorkspace.id;
        }
        const existingTags = assignedTags ? [...assignedTags] : [];
        if (!existingTags.includes(tagMatch.tag)) {
          existingTags.push(tagMatch.tag);
        }
        assignedTags = existingTags;
      }
    }

    const refs = stagedRefMap.get(row.id) || { upi_ref_no: null, imps_ref_no: null };

    return {
      user_id: user.id,
      account_id: upload.account_id,
      upload_id: upload.id,
      txn_date: row.txn_date,
      description: row.description,
      raw_description: row.raw_description,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      balance_after: row.balance ?? null,
      reference_number: row.reference_number,
      upi_ref_no: refs.upi_ref_no,
      imps_ref_no: refs.imps_ref_no,
      source: 'statement_import' as const,
      category_id: assignedCategoryId,
      workspace_id: assignedWorkspaceId,
      txn_type: determinedType,
      is_transfer: false,
      is_self_transfer: false,
      transfer_pair_id: null,
      status: 'confirmed' as const,
      notes: null,
      tags: assignedTags,
      is_manual: false,
      source_staged_id: row.id,
    };
  });

  // STEP 5 — Batch insert into transactions
  const newlyInsertedTransactions: Transaction[] = [];
  const CHUNK_SIZE = 500;

  for (let i = 0; i < finalInsertPayloads.length; i += CHUNK_SIZE) {
    const chunk = finalInsertPayloads.slice(i, i + CHUNK_SIZE);
    const { data: insertedRows, error: insertErr } = await supabase
      .from('transactions')
      .insert(chunk)
      .select(TRANSACTION_SELECT);

    if (insertErr) {
      throw new Error(`Failed to commit transactions: ${insertErr.message}`);
    }
    if (insertedRows) {
      for (const r of insertedRows) {
        newlyInsertedTransactions.push(mapDbTransaction(r));
      }
    }
  }

  // STEP 5b — Passive Recurring Transaction Matching
  try {
    const { matchAndAdvanceRecurring } = await import('./recurring');
    for (const newTx of newlyInsertedTransactions) {
      const amt = newTx.debit ?? newTx.credit ?? 0;
      const matchedRec = await matchAndAdvanceRecurring(
        {
          description: newTx.description,
          amount: amt,
          txn_date: newTx.txn_date,
          account_id: newTx.account_id,
        },
        supabase
      );
      if (matchedRec) {
        newTx.is_recurring = true;
        newTx.recurring_id = matchedRec.id;
      }
    }
  } catch (recErr) {
    console.warn('Recurring match notice:', recErr);
  }

  // STEP 6 — Detect & link self-transfers (IMPS ref, UPI ref, NEFT/RTGS name-match, amount+date fallback)
  let transferPairsFound = 0;
  if (newlyInsertedTransactions.length > 0) {
    const newIds = newlyInsertedTransactions.map((t) => t.id);
    const detection = await detectAndLinkSelfTransfers(supabase, user.id, newIds);
    transferPairsFound = detection.pairsLinked;

    if (transferPairsFound > 0) {
      const { data: refreshedLinks } = await supabase
        .from('transactions')
        .select('id, is_transfer, is_self_transfer, transfer_pair_id, category_id, txn_type, status')
        .eq('user_id', user.id)
        .in('id', newIds);

      const linkMap = new Map<string, any>();
      for (const r of refreshedLinks || []) {
        linkMap.set(r.id, r);
      }
      for (const tx of newlyInsertedTransactions) {
        const updated = linkMap.get(tx.id);
        if (updated) {
          tx.is_transfer = Boolean(updated.is_transfer);
          tx.is_self_transfer = Boolean(updated.is_self_transfer);
          tx.transfer_pair_id = updated.transfer_pair_id || null;
          tx.category_id = updated.category_id || null;
          tx.txn_type = updated.txn_type || tx.txn_type;
          tx.status = updated.status || tx.status;
        }
      }
    }
  }

  // STEP 7 — Update statement_uploads record
  const nowIso = new Date().toISOString();
  const { error: uploadUpdateErr } = await supabase
    .from('statement_uploads')
    .update({
      status: 'imported',
      imported_count: newlyInsertedTransactions.length,
      duplicate_count: duplicateCount,
      imported_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', upload.id)
    .eq('user_id', user.id);

  if (uploadUpdateErr) {
    throw new Error(`Failed to finalize upload record: ${uploadUpdateErr.message}`);
  }

  // STEP 9 — Optional post-import AI pipeline
  try {
    let isAiEnabled: boolean;
    if (typeof aiEnabledOverride === 'boolean') {
      isAiEnabled = aiEnabledOverride;
    } else {
      const aiSettings = await getAiSettings(supabase);
      isAiEnabled =
        typeof window !== 'undefined'
          ? aiSettings.ai_enabled
          : aiSettings.ai_enabled && Boolean(process.env.GEMINI_API_KEY);
    }

    if (isAiEnabled && newlyInsertedTransactions.length > 0) {
      const { batchCleanDescriptionsWithAI } = await import('../ai/clean-description');
      const cleanedResults = await batchCleanDescriptionsWithAI(newlyInsertedTransactions);
      for (const c of cleanedResults) {
        const tx = newlyInsertedTransactions.find((t) => t.id === c.transaction_id);
        if (tx && c.cleaned_description) {
          tx.description = c.cleaned_description;
          await supabase
            .from('transactions')
            .update({ description: c.cleaned_description })
            .eq('id', tx.id)
            .eq('user_id', user.id);
        }
      }

      const uncategorized = newlyInsertedTransactions.filter(
        (t) =>
          !t.category_id &&
          !t.is_transfer &&
          !(t.source_staged_id && skipAiStagedIds.has(t.source_staged_id))
      );
      if (uncategorized.length > 0) {
        const { categorizeTransactionsWithAI } = await import('../ai/categorize');
        const catRes = await categorizeTransactionsWithAI(uncategorized, categories);
        if (catRes.results.length > 0) {
          await applyAICategorizations(catRes.results, supabase);
        }
      }

      const { detectAnomaliesWithAI } = await import('../ai/anomalies');
      await detectAnomaliesWithAI(newlyInsertedTransactions, undefined, user.id);
    }
  } catch (aiErr) {
    console.warn('Post-import AI pipeline notice (continuing without breaking import):', aiErr);
  }

  // STEP 10 — Return Section F + UI-compatible result
  return {
    imported: newlyInsertedTransactions.length,
    duplicates_skipped: duplicateCount,
    replaced: Boolean(replacePreviousId),
    imported_count: newlyInsertedTransactions.length,
    duplicate_count: duplicateCount,
    transfer_pairs_found: transferPairsFound,
    upload_id: upload.id,
  };
}

function applyTransactionFiltersToQuery(
  query: any,
  filters: Partial<TransactionFiltersState>
) {
  let q = query;

  if (filters.startDate) {
    q = q.gte('txn_date', filters.startDate);
  }
  if (filters.endDate) {
    q = q.lte('txn_date', filters.endDate);
  }
  if (filters.accountIds && filters.accountIds.length > 0) {
    q = q.in('account_id', filters.accountIds);
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    q = q.in('category_id', filters.categoryIds);
  }
  if (filters.workspaceId && filters.workspaceId !== 'all') {
    q = q.eq('workspace_id', filters.workspaceId);
  }
  if (filters.txnType === 'transfer') {
    q = q.eq('is_self_transfer', true);
  } else {
    q = q.eq('is_self_transfer', false);
    if (filters.txnType && filters.txnType !== 'all') {
      q = q.eq('txn_type', filters.txnType);
    }
  }
  if (filters.search && filters.search.trim()) {
    const safeTerm = filters.search.trim().replace(/[(),%]/g, '');
    if (safeTerm) {
      q = q.or(
        `description.ilike.%${safeTerm}%,reference_number.ilike.%${safeTerm}%,raw_description.ilike.%${safeTerm}%`
      );
    }
  }

  return q;
}

/**
 * Query ledger with server-side Supabase filtering and pagination (50 per page default)
 */
export async function getTransactions(
  params?: {
    page?: number;
    pageSize?: number;
    filters?: Partial<TransactionFiltersState>;
  },
  client?: any
): Promise<{
  transactions: Transaction[];
  totalCount: number;
  totalPages: number;
  totalDebits: number;
  totalCredits: number;
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      transactions: [],
      totalCount: 0,
      totalPages: 1,
      totalDebits: 0,
      totalCredits: 0,
    };
  }

  const page = Math.max(1, params?.page || 1);
  const pageSize = Math.max(1, params?.pageSize || 50);
  const filters = params?.filters || {};

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let dataQuery = supabase
    .from('transactions')
    .select(TRANSACTION_SELECT, { count: 'exact' })
    .eq('user_id', user.id);

  dataQuery = applyTransactionFiltersToQuery(dataQuery, filters);
  dataQuery = dataQuery
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  let totalsQuery = supabase
    .from('transactions')
    .select('debit, credit')
    .eq('user_id', user.id);
  totalsQuery = applyTransactionFiltersToQuery(totalsQuery, filters);

  const [{ data, count, error }, { data: totalsData }] = await Promise.all([
    dataQuery,
    totalsQuery,
  ]);

  if (error) {
    console.error('Error querying transactions:', error.message);
    return {
      transactions: [],
      totalCount: 0,
      totalPages: 1,
      totalDebits: 0,
      totalCredits: 0,
    };
  }

  let totalDebits = 0;
  let totalCredits = 0;
  for (const row of totalsData || []) {
    if (row.debit) totalDebits += Number(row.debit);
    if (row.credit) totalCredits += Number(row.credit);
  }

  const totalCount = count ?? (data ? data.length : 0);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    transactions: (data || []).map(mapDbTransaction),
    totalCount,
    totalPages,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
  };
}

/**
 * Queries self-transfer rows (`is_self_transfer = true`) and merges linked pairs
 * onto one row (`debitTx` + `creditTx`) for the Transactions "Transfers" tab.
 */
export async function getSelfTransferPairs(
  filters?: Partial<TransactionFiltersState>,
  client?: any
): Promise<{
  pairs: SelfTransferPairRow[];
  totalTransferred: number;
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { pairs: [], totalTransferred: 0 };
  }

  let query = supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .eq('user_id', user.id)
    .eq('is_self_transfer', true)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.startDate) query = query.gte('txn_date', filters.startDate);
  if (filters?.endDate) query = query.lte('txn_date', filters.endDate);
  if (filters?.accountIds && filters.accountIds.length > 0) {
    query = query.in('account_id', filters.accountIds);
  }
  if (filters?.search && filters.search.trim()) {
    const safeTerm = filters.search.trim().replace(/[(),%]/g, '');
    if (safeTerm) {
      query = query.or(
        `description.ilike.%${safeTerm}%,reference_number.ilike.%${safeTerm}%,imps_ref_no.ilike.%${safeTerm}%,upi_ref_no.ilike.%${safeTerm}%`
      );
    }
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error('Error querying self-transfer pairs:', error?.message);
    return { pairs: [], totalTransferred: 0 };
  }

  const txList: Transaction[] = data.map(mapDbTransaction);
  const byId = new Map<string, Transaction>();
  for (const tx of txList) {
    byId.set(tx.id, tx);
  }

  // Fetch any paired counterparts outside the current filter slice so pairs render complete
  const missingPairIds = Array.from(
    new Set(
      txList
        .map((t) => t.transfer_pair_id)
        .filter((pid): pid is string => Boolean(pid && !byId.has(pid)))
    )
  );
  if (missingPairIds.length > 0) {
    const { data: counterparts } = await supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('user_id', user.id)
      .in('id', missingPairIds);
    for (const c of counterparts || []) {
      byId.set(c.id, mapDbTransaction(c));
    }
  }

  const consumedIds = new Set<string>();
  const pairs: SelfTransferPairRow[] = [];
  let totalTransferred = 0;

  for (const tx of txList) {
    if (consumedIds.has(tx.id)) continue;
    consumedIds.add(tx.id);

    const partner = tx.transfer_pair_id ? byId.get(tx.transfer_pair_id) || null : null;
    if (partner) {
      consumedIds.add(partner.id);
    }

    const txIsDebit = tx.debit !== null && tx.debit !== undefined && tx.debit > 0;
    const debitTx = txIsDebit ? tx : partner && partner.debit ? partner : null;
    const creditTx = !txIsDebit ? tx : partner && partner.credit ? partner : null;

    const amount = debitTx?.debit ?? creditTx?.credit ?? tx.debit ?? tx.credit ?? 0;
    const refNo =
      tx.imps_ref_no ||
      partner?.imps_ref_no ||
      tx.upi_ref_no ||
      partner?.upi_ref_no ||
      tx.reference_number ||
      partner?.reference_number ||
      null;

    let status: SelfTransferPairRow['status'] = 'pending_pair';
    if (debitTx && creditTx) {
      status = tx.status === 'review' || partner?.status === 'review' ? 'review' : 'linked';
    } else if (tx.status === 'review') {
      status = 'review';
    }

    totalTransferred += amount;
    pairs.push({
      id: debitTx?.id || tx.id,
      txn_date: debitTx?.txn_date || tx.txn_date,
      amount,
      ref_no: refNo,
      status,
      debitTx,
      creditTx,
    });
  }

  return {
    pairs,
    totalTransferred: Math.round(totalTransferred * 100) / 100,
  };
}

/**
 * Manual Transaction Entry
 * Validates: date not in future, amount > 0, account must exist
 * Sets is_manual = true and writes audit log on insert
 */
export async function createManualTransaction(
  data: ManualTransactionFormData,
  client?: any
): Promise<Transaction> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const today = new Date().toISOString().split('T')[0];
  if (data.txn_date > today) {
    throw new Error('Transaction date cannot be in the future.');
  }

  if (!data.amount || data.amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }

  const { data: matchedAccount, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, bank_name, account_number_last4')
    .eq('id', data.account_id)
    .eq('user_id', user.id)
    .single();

  if (accErr || !matchedAccount) {
    throw new Error('Target bank account does not exist.');
  }

  const debit = data.type === 'debit' ? Number(data.amount) : null;
  const credit = data.type === 'credit' ? Number(data.amount) : null;
  const txnType: Transaction['txn_type'] = data.type === 'debit' ? 'expense' : 'income';

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: data.account_id,
      upload_id: null,
      txn_date: data.txn_date,
      description: data.description.trim(),
      raw_description: `Manual entry: ${data.description.trim()}`,
      debit,
      credit,
      balance: null,
      reference_number: data.reference_number?.trim() || null,
      category_id: data.category_id || null,
      workspace_id: data.workspace_id || null,
      txn_type: txnType,
      is_transfer: false,
      transfer_pair_id: null,
      notes: data.notes?.trim() || null,
      tags: data.tags && data.tags.length > 0 ? data.tags : null,
      is_manual: true,
      source_staged_id: null,
    })
    .select(TRANSACTION_SELECT)
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || 'Failed to create manual transaction.');
  }

  const createdTx = mapDbTransaction(inserted);
  return createdTx;
}

/**
 * Updates editable transaction fields
 * Non-editable: amounts, date, description (Amounts are sacred — never editable after import)
 */
export async function updateTransaction(
  id: string,
  updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    tags?: string[] | null;
    notes?: string | null;
    txn_type?: Transaction['txn_type'];
    is_transfer?: boolean;
    is_self_transfer?: boolean;
    status?: 'confirmed' | 'review';
    transfer_pair_id?: string | null;
    transfer_target_account_id?: string | null;
  },
  client?: any
): Promise<Transaction> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: oldTx, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !oldTx) {
    throw new Error('Transaction not found');
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.category_id !== undefined) updatePayload.category_id = updates.category_id;
  if (updates.workspace_id !== undefined) updatePayload.workspace_id = updates.workspace_id;
  if (updates.tags !== undefined) updatePayload.tags = updates.tags;
  if (updates.notes !== undefined) updatePayload.notes = updates.notes;
  if (updates.txn_type !== undefined) updatePayload.txn_type = updates.txn_type;
  if (updates.is_transfer !== undefined) updatePayload.is_transfer = updates.is_transfer;
  if (updates.is_self_transfer !== undefined) {
    updatePayload.is_self_transfer = updates.is_self_transfer;
  }
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
    if (updates.status === 'confirmed' && oldTx.transfer_pair_id) {
      await supabase
        .from('transactions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', oldTx.transfer_pair_id)
        .eq('user_id', user.id);
    }
  }

  if (updates.is_transfer === false || updates.is_self_transfer === false) {
    updatePayload.is_transfer = false;
    updatePayload.is_self_transfer = false;
    updatePayload.transfer_pair_id = null;
    updatePayload.status = 'confirmed';
    if (updates.txn_type === undefined && oldTx.txn_type === 'transfer') {
      updatePayload.txn_type = oldTx.debit ? 'expense' : 'income';
    }
    if (oldTx.transfer_pair_id) {
      await supabase
        .from('transactions')
        .update({
          is_transfer: false,
          is_self_transfer: false,
          transfer_pair_id: null,
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', oldTx.transfer_pair_id)
        .eq('user_id', user.id);
    }
  } else if (updates.transfer_pair_id !== undefined) {
    updatePayload.transfer_pair_id = updates.transfer_pair_id;
  } else if (updates.is_transfer && updates.transfer_target_account_id) {
    // Attempt to find a complementary opposite-leg transaction in the selected account within ±3 days
    const txDebit = oldTx.debit !== null && oldTx.debit !== undefined ? Number(oldTx.debit) : null;
    const txCredit =
      oldTx.credit !== null && oldTx.credit !== undefined ? Number(oldTx.credit) : null;
    const txAmt = txDebit ?? txCredit ?? 0;

    if (txAmt > 0) {
      const baseDate = new Date(oldTx.txn_date);
      const minDate = new Date(baseDate);
      minDate.setDate(minDate.getDate() - 3);
      const maxDate = new Date(baseDate);
      maxDate.setDate(maxDate.getDate() + 3);

      const { data: candidates } = await supabase
        .from('transactions')
        .select('id, txn_date, debit, credit, transfer_pair_id')
        .eq('user_id', user.id)
        .eq('account_id', updates.transfer_target_account_id)
        .neq('id', id)
        .gte('txn_date', minDate.toISOString().split('T')[0])
        .lte('txn_date', maxDate.toISOString().split('T')[0]);

      const isSourceDebit = txDebit !== null;
      const matched = (candidates || []).find((c: any) => {
        const cDebit = c.debit !== null && c.debit !== undefined ? Number(c.debit) : null;
        const cCredit = c.credit !== null && c.credit !== undefined ? Number(c.credit) : null;
        const cAmt = isSourceDebit ? cCredit : cDebit;
        return cAmt !== null && Math.abs(cAmt - txAmt) <= 0.01;
      });

      if (matched) {
        updatePayload.transfer_pair_id = matched.id;
        await supabase
          .from('transactions')
          .update({
            is_transfer: true,
            txn_type: 'transfer',
            category_id: null,
            transfer_pair_id: id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matched.id)
          .eq('user_id', user.id);
      }
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('transactions')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(TRANSACTION_SELECT)
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message || 'Failed to update transaction.');
  }

  return mapDbTransaction(updated);
}

/**
 * Bulk Edit Transactions
 * Writes one audit_log row per changed transaction!
 */
export async function bulkUpdateTransactions(
  ids: string[],
  updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    append_tags?: string[];
  },
  client?: any
): Promise<{ updatedCount: number }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!ids || ids.length === 0) {
    return { updatedCount: 0 };
  }

  const { data: existingRows } = await supabase
    .from('transactions')
    .select('id, tags')
    .eq('user_id', user.id)
    .in('id', ids);

  let updatedCount = 0;

  for (const tx of existingRows || []) {
    const newTags = tx.tags ? [...tx.tags] : [];
    if (updates.append_tags && updates.append_tags.length > 0) {
      for (const t of updates.append_tags) {
        const clean = t.trim();
        if (clean && !newTags.includes(clean)) {
          newTags.push(clean);
        }
      }
    }

    await updateTransaction(
      tx.id,
      {
        category_id: updates.category_id !== undefined ? updates.category_id : undefined,
        workspace_id: updates.workspace_id !== undefined ? updates.workspace_id : undefined,
        tags: updates.append_tags ? newTags : undefined,
      },
      supabase
    );

    updatedCount++;
  }

  return { updatedCount };
}

/**
 * Helper to fetch all transactions for the current user without pagination truncation
 */
export async function getAllTransactions(client?: any): Promise<Transaction[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const PAGE_SIZE = 1000;
  const allRows: Transaction[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('user_id', user.id)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching all transactions:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      allRows.push(mapDbTransaction(row));
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Calculates running balance for an account starting from opening_balance
 * Ordered chronologically (txn_date ASC, created_at ASC)
 */
export async function getAccountLedgerWithRunningBalance(
  accountId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    txnType?: string;
    search?: string;
  },
  client?: any
): Promise<{
  account: any;
  transactions: (Transaction & { calculated_running_balance: number })[];
  dailyBalancePoints: { date: string; balance: number }[];
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const accounts = await getAccounts(supabase);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Account not found');

  const openingBalance = Number(account.opening_balance ?? 0);

  const { data: rawTxns, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch account ledger: ${error.message}`);
  }

  const allAccountTxns = (rawTxns || []).map(mapDbTransaction);

  let running = openingBalance;
  const chronologicalWithBalance: (Transaction & {
    calculated_running_balance: number;
  })[] = [];
  const balanceByDate = new Map<string, number>();

  for (const tx of allAccountTxns) {
    const debit = tx.debit ?? 0;
    const credit = tx.credit ?? 0;
    running = running + credit - debit;
    const rounded = Math.round(running * 100) / 100;
    chronologicalWithBalance.push({
      ...tx,
      calculated_running_balance: rounded,
    });
    balanceByDate.set(tx.txn_date, rounded);
  }

  const dailyBalancePoints: { date: string; balance: number }[] = [];
  if (options?.startDate && options?.endDate) {
    const cur = new Date(options.startDate);
    const end = new Date(options.endDate);
    let lastKnownBalance = openingBalance;

    while (cur <= end) {
      const dStr = cur.toISOString().split('T')[0];
      if (balanceByDate.has(dStr)) {
        lastKnownBalance = balanceByDate.get(dStr)!;
      }
      dailyBalancePoints.push({
        date: dStr,
        balance: lastKnownBalance,
      });
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    for (const [date, bal] of balanceByDate.entries()) {
      dailyBalancePoints.push({ date, balance: bal });
    }
  }

  let displayList = [...chronologicalWithBalance];

  if (options?.startDate) {
    displayList = displayList.filter((t) => t.txn_date >= options.startDate!);
  }
  if (options?.endDate) {
    displayList = displayList.filter((t) => t.txn_date <= options.endDate!);
  }
  if (options?.categoryId) {
    displayList = displayList.filter((t) => t.category_id === options.categoryId);
  }
  if (options?.txnType && options.txnType !== 'all') {
    displayList = displayList.filter((t) => t.txn_type === options.txnType);
  }
  if (options?.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    displayList = displayList.filter(
      (t) =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.reference_number || '').toLowerCase().includes(q)
    );
  }

  displayList.sort((a, b) => {
    if (a.txn_date !== b.txn_date) return b.txn_date.localeCompare(a.txn_date);
    return b.created_at.localeCompare(a.created_at);
  });

  return {
    account,
    transactions: displayList,
    dailyBalancePoints,
  };
}

/**
 * Compute high-performance Dashboard metrics from real Supabase data
 */
export async function getDashboardMetrics(
  fyRange: { startDate: string; endDate: string },
  workspaceFilter: string = 'all',
  client?: any
) {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fyMonths = [
    { label: 'Apr', monthNum: '04' },
    { label: 'May', monthNum: '05' },
    { label: 'Jun', monthNum: '06' },
    { label: 'Jul', monthNum: '07' },
    { label: 'Aug', monthNum: '08' },
    { label: 'Sep', monthNum: '09' },
    { label: 'Oct', monthNum: '10' },
    { label: 'Nov', monthNum: '11' },
    { label: 'Dec', monthNum: '12' },
    { label: 'Jan', monthNum: '01' },
    { label: 'Feb', monthNum: '02' },
    { label: 'Mar', monthNum: '03' },
  ];

  if (!user) {
    return {
      netWorth: 0,
      accountBreakdown: [],
      totalIncome: 0,
      totalExpenses: 0,
      netCashflow: 0,
      monthlyCashflow: fyMonths.map((m) => ({
        month: m.label,
        income: 0,
        expense: 0,
        net: 0,
      })),
      spendingByCategory: [],
      taxProvision: {
        businessIncome: 0,
        businessExpense: 0,
        taxableProfit: 0,
        taxProvision: 0,
      },
      recentTransactions: [],
    };
  }

  const [accounts, categories, workspaces, periodRes, recentRes] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase),
    getWorkspaces(supabase),
    supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('user_id', user.id)
      .eq('is_self_transfer', false)
      .gte('txn_date', fyRange.startDate)
      .lte('txn_date', fyRange.endDate)
      .order('txn_date', { ascending: false }),
    supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('user_id', user.id)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // Net Worth Calculation using computed current_balance on active accounts
  let netWorth = 0;
  const accountBreakdown: { type: string; total: number; count: number }[] = [];
  const typeMap = new Map<string, number>();
  const typeCount = new Map<string, number>();

  for (const acc of accounts) {
    if (!acc.is_active) continue;
    const bal = acc.current_balance ?? 0;

    if (acc.account_type === 'credit_card') {
      const liability = bal < 0 ? bal : -bal;
      netWorth += liability;
      typeMap.set('credit_card', (typeMap.get('credit_card') || 0) + liability);
      typeCount.set('credit_card', (typeCount.get('credit_card') || 0) + 1);
    } else {
      netWorth += bal;
      typeMap.set(acc.account_type, (typeMap.get(acc.account_type) || 0) + bal);
      typeCount.set(acc.account_type, (typeCount.get(acc.account_type) || 0) + 1);
    }
  }

  for (const [t, total] of typeMap.entries()) {
    accountBreakdown.push({
      type: t,
      total: Math.round(total * 100) / 100,
      count: typeCount.get(t) || 0,
    });
  }

  let periodTxns: Transaction[] = (periodRes.data || []).map(mapDbTransaction);

  if (workspaceFilter && workspaceFilter !== 'all') {
    const matchedWs = workspaces.find(
      (w) =>
        w.id === workspaceFilter ||
        w.name.toLowerCase() === workspaceFilter.toLowerCase()
    );
    const filterLower = workspaceFilter.toLowerCase();
    periodTxns = periodTxns.filter((t) => {
      if (matchedWs && t.workspace_id === matchedWs.id) return true;
      if (t.workspace_id === workspaceFilter) return true;
      const wsName = t.workspace?.name?.toLowerCase() || '';
      return wsName === filterLower;
    });
  }

  let totalIncome = 0;
  let totalExpenses = 0;

  const monthMap = new Map<string, { income: number; expense: number }>();
  for (const m of fyMonths) {
    monthMap.set(m.label, { income: 0, expense: 0 });
  }

  const categorySpendMap = new Map<string, number>();
  let businessIncome = 0;
  let businessExpense = 0;

  const businessWsIds = new Set(
    workspaces
      .filter((w) => w.name.toLowerCase().includes('business'))
      .map((w) => w.id)
  );

  for (const tx of periodTxns) {
    if (tx.is_self_transfer || tx.is_transfer || tx.txn_type === 'transfer') continue;

    const isBusiness =
      (tx.workspace_id ? businessWsIds.has(tx.workspace_id) : false) ||
      tx.workspace?.name?.toLowerCase().includes('business') ||
      false;

    if (tx.credit && tx.credit > 0 && tx.txn_type !== 'refund') {
      totalIncome += tx.credit;
      if (isBusiness) businessIncome += tx.credit;

      const mStr = tx.txn_date.slice(5, 7);
      const matchMonth = fyMonths.find((m) => m.monthNum === mStr);
      if (matchMonth) {
        const cur = monthMap.get(matchMonth.label)!;
        cur.income += tx.credit;
      }
    }

    if (tx.debit && tx.debit > 0) {
      totalExpenses += tx.debit;
      if (isBusiness) businessExpense += tx.debit;

      const mStr = tx.txn_date.slice(5, 7);
      const matchMonth = fyMonths.find((m) => m.monthNum === mStr);
      if (matchMonth) {
        const cur = monthMap.get(matchMonth.label)!;
        cur.expense += tx.debit;
      }

      const catId = tx.category_id || 'uncategorized';
      categorySpendMap.set(catId, (categorySpendMap.get(catId) || 0) + tx.debit);
    }
  }

  const monthlyCashflow = fyMonths.map((m) => {
    const data = monthMap.get(m.label)!;
    return {
      month: m.label,
      income: Math.round(data.income),
      expense: Math.round(data.expense),
      net: Math.round(data.income - data.expense),
    };
  });

  const PRD_PALETTE = [
    '#6366F1',
    '#0EA5E9',
    '#14B8A6',
    '#22C55E',
    '#84CC16',
    '#EAB308',
    '#F97316',
    '#EF4444',
    '#EC4899',
    '#A855F7',
  ];

  const sortedCategories = Array.from(categorySpendMap.entries())
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        id: catId,
        name:
          cat?.name ||
          (catId === 'uncategorized' ? 'Uncategorized' : 'General Expense'),
        amount: Math.round(amount * 100) / 100,
        colorIndex: cat?.color_index ?? 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const top8 = sortedCategories.slice(0, 8);
  const remaining = sortedCategories.slice(8);
  const finalCategoryList: {
    id: string;
    name: string;
    amount: number;
    percentage: number;
    color: string;
  }[] = [];

  const totalCatSpend = sortedCategories.reduce((sum, c) => sum + c.amount, 0) || 1;

  top8.forEach((item) => {
    finalCategoryList.push({
      id: item.id,
      name: item.name,
      amount: item.amount,
      percentage: Math.round((item.amount / totalCatSpend) * 100),
      color: PRD_PALETTE[item.colorIndex % PRD_PALETTE.length],
    });
  });

  if (remaining.length > 0) {
    const otherSum = remaining.reduce((sum, c) => sum + c.amount, 0);
    finalCategoryList.push({
      id: 'other',
      name: 'Other',
      amount: Math.round(otherSum * 100) / 100,
      percentage: Math.round((otherSum / totalCatSpend) * 100),
      color: '#64748B',
    });
  }

  const taxableProfit = Math.max(0, businessIncome - businessExpense);
  const taxProvision30 = Math.round(taxableProfit * 0.3 * 100) / 100;
  const recentTransactions = (recentRes.data || []).map(mapDbTransaction);

  return {
    netWorth: Math.round(netWorth * 100) / 100,
    accountBreakdown,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netCashflow: Math.round((totalIncome - totalExpenses) * 100) / 100,
    monthlyCashflow,
    spendingByCategory: finalCategoryList,
    taxProvision: {
      businessIncome: Math.round(businessIncome * 100) / 100,
      businessExpense: Math.round(businessExpense * 100) / 100,
      taxableProfit: Math.round(taxableProfit * 100) / 100,
      taxProvision: taxProvision30,
    },
    recentTransactions,
  };
}

/**
 * Generates ITR Summary data matching Indian ITR Schedule from Supabase
 */
export async function getITRSummaryData(
  fyRange: { startDate: string; endDate: string },
  client?: any
) {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emptyResult = {
    lineItems: [
      { section: 'Income', lineItem: 'Business Income (Gross Receipts)', amount: 0 },
      { section: 'Income', lineItem: 'Other Income (Personal & Investments)', amount: 0 },
      { section: 'Income', lineItem: 'Total Gross Income', amount: 0, isSubtotal: true },
      { section: 'Deductions', lineItem: 'Business Expenses (Allowable deductions)', amount: 0 },
      { section: 'Deductions', lineItem: 'Total Deductions', amount: 0, isSubtotal: true },
      { section: 'Taxable Income', lineItem: 'Net Taxable Income (Estimated)', amount: 0, isTotal: true },
      { section: 'Tax', lineItem: 'Tax @ 30% (Estimated, reference only)', amount: 0, isTax: true },
    ],
    workspaces: [
      {
        name: 'Personal',
        income: 0,
        expenses: 0,
        net: 0,
        topCategories: [],
        sparkline: Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, val: 0 })),
      },
      {
        name: 'Business',
        income: 0,
        expenses: 0,
        net: 0,
        topCategories: [],
        sparkline: Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, val: 0 })),
      },
      {
        name: 'Mixed / Both',
        income: 0,
        expenses: 0,
        net: 0,
        topCategories: [],
        sparkline: Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, val: 0 })),
      },
    ],
  };

  if (!user) {
    return emptyResult;
  }

  const [categories, workspaces, { data: rawTxns }] = await Promise.all([
    getCategories(supabase),
    getWorkspaces(supabase),
    supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('user_id', user.id)
      .gte('txn_date', fyRange.startDate)
      .lte('txn_date', fyRange.endDate)
      .eq('is_transfer', false)
      .eq('is_self_transfer', false)
      .neq('txn_type', 'transfer'),
  ]);

  const txns = (rawTxns || []).map(mapDbTransaction);

  const businessWsIds = new Set(
    workspaces
      .filter((w) => w.name.toLowerCase().includes('business'))
      .map((w) => w.id)
  );
  const mixedWsIds = new Set(
    workspaces
      .filter((w) => w.name.toLowerCase().includes('mixed'))
      .map((w) => w.id)
  );

  let businessIncome = 0;
  let otherPersonalIncome = 0;
  let mixedIncome = 0;
  let businessExpenses = 0;
  let personalExpenses = 0;
  let mixedExpenses = 0;

  const workspaceMonthMap = {
    Personal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Business: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Mixed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  const wsSpendCategories = {
    Personal: new Map<string, number>(),
    Business: new Map<string, number>(),
    Mixed: new Map<string, number>(),
  };

  for (const t of txns) {
    if (t.is_self_transfer || t.is_transfer || t.txn_type === 'transfer') continue;

    const isBusiness =
      (t.workspace_id ? businessWsIds.has(t.workspace_id) : false) ||
      t.workspace?.name?.toLowerCase().includes('business') ||
      false;
    const isMixed =
      !isBusiness &&
      ((t.workspace_id ? mixedWsIds.has(t.workspace_id) : false) ||
        t.workspace?.name?.toLowerCase().includes('mixed') ||
        false);

    const mIdx = Math.max(0, Math.min(11, parseInt(t.txn_date.slice(5, 7), 10) - 1));

    if (t.credit && t.credit > 0) {
      if (isBusiness) {
        businessIncome += t.credit;
        workspaceMonthMap.Business[mIdx] += t.credit;
      } else if (isMixed) {
        mixedIncome += t.credit;
        workspaceMonthMap.Mixed[mIdx] += t.credit;
      } else {
        otherPersonalIncome += t.credit;
        workspaceMonthMap.Personal[mIdx] += t.credit;
      }
    }

    if (t.debit && t.debit > 0) {
      const catName =
        t.category?.name ||
        categories.find((c) => c.id === t.category_id)?.name ||
        'General';

      if (isBusiness) {
        businessExpenses += t.debit;
        workspaceMonthMap.Business[mIdx] -= t.debit;
        wsSpendCategories.Business.set(
          catName,
          (wsSpendCategories.Business.get(catName) || 0) + t.debit
        );
      } else if (isMixed) {
        mixedExpenses += t.debit;
        workspaceMonthMap.Mixed[mIdx] -= t.debit;
        wsSpendCategories.Mixed.set(
          catName,
          (wsSpendCategories.Mixed.get(catName) || 0) + t.debit
        );
      } else {
        personalExpenses += t.debit;
        workspaceMonthMap.Personal[mIdx] -= t.debit;
        wsSpendCategories.Personal.set(
          catName,
          (wsSpendCategories.Personal.get(catName) || 0) + t.debit
        );
      }
    }
  }

  const totalGrossIncome = businessIncome + otherPersonalIncome + mixedIncome;
  const totalDeductions = businessExpenses;
  const netTaxableIncome = Math.max(0, totalGrossIncome - totalDeductions);
  const estimatedTax30 = Math.round(netTaxableIncome * 0.3 * 100) / 100;

  const formatTop5 = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

  return {
    lineItems: [
      { section: 'Income', lineItem: 'Business Income (Gross Receipts)', amount: businessIncome },
      {
        section: 'Income',
        lineItem: 'Other Income (Personal & Investments)',
        amount: otherPersonalIncome + mixedIncome,
      },
      { section: 'Income', lineItem: 'Total Gross Income', amount: totalGrossIncome, isSubtotal: true },
      {
        section: 'Deductions',
        lineItem: 'Business Expenses (Allowable deductions)',
        amount: businessExpenses,
      },
      { section: 'Deductions', lineItem: 'Total Deductions', amount: totalDeductions, isSubtotal: true },
      {
        section: 'Taxable Income',
        lineItem: 'Net Taxable Income (Estimated)',
        amount: netTaxableIncome,
        isTotal: true,
      },
      {
        section: 'Tax',
        lineItem: 'Tax @ 30% (Estimated, reference only)',
        amount: estimatedTax30,
        isTax: true,
      },
    ],
    workspaces: [
      {
        name: 'Personal',
        income: otherPersonalIncome,
        expenses: personalExpenses,
        net: otherPersonalIncome - personalExpenses,
        topCategories: formatTop5(wsSpendCategories.Personal),
        sparkline: workspaceMonthMap.Personal.map((val, idx) => ({ month: idx + 1, val })),
      },
      {
        name: 'Business',
        income: businessIncome,
        expenses: businessExpenses,
        net: businessIncome - businessExpenses,
        topCategories: formatTop5(wsSpendCategories.Business),
        sparkline: workspaceMonthMap.Business.map((val, idx) => ({ month: idx + 1, val })),
      },
      {
        name: 'Mixed / Both',
        income: mixedIncome,
        expenses: mixedExpenses,
        net: mixedIncome - mixedExpenses,
        topCategories: formatTop5(wsSpendCategories.Mixed),
        sparkline: workspaceMonthMap.Mixed.map((val, idx) => ({ month: idx + 1, val })),
      },
    ],
  };
}

/**
 * Applies 3-tier AI categorization suggestions to ledger transactions
 * Strictly checks audit log: never overrides user edits or rule-defined categories.
 * Writes audit log entry for every category change.
 */
export async function applyAICategorizations(
  results: Array<{
    transaction_id: string;
    category_id: string | null;
    confidence: 'high' | 'medium' | 'low';
    score?: number;
    reasoning?: string;
  }>,
  client?: any
): Promise<{
  updatedCount: number;
  applied: Array<{
    id: string;
    old_category_id: string | null;
    new_category_id: string;
    confidence: string;
    score?: number;
  }>;
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!results || results.length === 0) {
    return { updatedCount: 0, applied: [] };
  }

  const targetIds = results.map((r) => r.transaction_id);
  const [{ data: txRows }, { data: auditRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, category_id, is_manual')
      .eq('user_id', user.id)
      .in('id', targetIds),
    supabase
      .from('audit_log')
      .select('record_id, new_data')
      .eq('user_id', user.id)
      .eq('table_name', 'transactions')
      .eq('action', 'update')
      .in('record_id', targetIds),
  ]);

  const txMap = new Map<string, any>();
  for (const row of txRows || []) {
    txMap.set(row.id, row);
  }

  const userEditedIds = new Set<string>();
  for (const aud of auditRows || []) {
    if ((aud.new_data as any)?.category_id) {
      userEditedIds.add(aud.record_id);
    }
  }

  let updatedCount = 0;
  const applied: Array<{
    id: string;
    old_category_id: string | null;
    new_category_id: string;
    confidence: string;
    score?: number;
  }> = [];

  for (const res of results) {
    const tx = txMap.get(res.transaction_id);
    if (!tx) continue;
    if (tx.is_manual || userEditedIds.has(tx.id)) continue;

    if ((res.confidence === 'high' || res.confidence === 'medium') && res.category_id) {
      const oldCat = tx.category_id;
      const { error: updateErr } = await supabase
        .from('transactions')
        .update({
          category_id: res.category_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id)
        .eq('user_id', user.id);

      if (!updateErr) {
        applied.push({
          id: tx.id,
          old_category_id: oldCat ?? null,
          new_category_id: res.category_id,
          confidence: res.confidence,
          score: res.score,
        });
        updatedCount++;
      }
    }
  }

  return { updatedCount, applied };
}
