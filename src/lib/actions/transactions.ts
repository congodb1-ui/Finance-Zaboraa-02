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

// Seed initial audit log entries
let localAuditLogStore: AuditLogEntry[] = [
  {
    id: 'aud_seed_1',
    user_id: 'default_owner',
    table_name: 'transactions',
    record_id: 'tx_hdfc_01',
    action: 'insert',
    old_data: null,
    new_data: { id: 'tx_hdfc_01', description: 'Swiggy Bangalore Delivery', debit: 840.0 },
    created_at: '2026-11-01T10:30:00.000Z',
  },
  {
    id: 'aud_seed_2',
    user_id: 'default_owner',
    table_name: 'transactions',
    record_id: 'tx_hdfc_02',
    action: 'insert',
    old_data: null,
    new_data: { id: 'tx_hdfc_02', description: 'Client Consulting Retainer', credit: 125000.0 },
    created_at: '2026-11-01T10:30:00.000Z',
  },
];

// Seed initial transactions representing an authentic Indian FY ledger
let localTransactionsStore: Transaction[] = [
  {
    id: 'tx_hdfc_01',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    upload_id: 'up_hdfc_oct26',
    txn_date: '2026-10-28',
    description: 'Swiggy Bangalore Delivery',
    raw_description: 'UPI/48291048/SWIGGY/BLR/FOOD',
    debit: 840.0,
    credit: null,
    balance: 485200.0,
    reference_number: 'UPI48291048',
    category_id: 'cat_1', // Food & Dining
    workspace_id: 'ws_personal',
    txn_type: 'expense',
    is_transfer: false,
    transfer_pair_id: null,
    notes: 'Dinner order with team',
    tags: ['food', 'swiggy'],
    is_manual: false,
    source_staged_id: 'stg_1',
    created_at: '2026-11-01T10:30:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
    category: {
      id: 'cat_1',
      name: 'Food & Dining',
      color_index: 5,
      icon: 'Utensils',
    },
    workspace: {
      id: 'ws_personal',
      name: 'Personal',
      color_index: 0,
    },
  },
  {
    id: 'tx_hdfc_02',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    upload_id: 'up_hdfc_oct26',
    txn_date: '2026-10-24',
    description: 'Client Consulting Retainer',
    raw_description: 'NEFT/N102934/APEXIND/CONSULT',
    debit: null,
    credit: 125000.0,
    balance: 486040.0,
    reference_number: 'NEFT102934',
    category_id: 'cat_6', // Freelance / Consulting
    workspace_id: 'ws_business',
    txn_type: 'income',
    is_transfer: false,
    transfer_pair_id: null,
    notes: 'Monthly strategic advisory retainer Q3',
    tags: ['consulting', 'retainer'],
    is_manual: false,
    source_staged_id: 'stg_2',
    created_at: '2026-11-01T10:30:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
    category: {
      id: 'cat_6',
      name: 'Freelance / Consulting',
      color_index: 0,
      icon: 'Laptop',
    },
    workspace: {
      id: 'ws_business',
      name: 'Business',
      color_index: 1,
    },
  },
  {
    id: 'tx_hdfc_03',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    upload_id: 'up_hdfc_oct26',
    txn_date: '2026-10-18',
    description: 'WeWork Coworking Office Rent',
    raw_description: 'UPI/48910293/WEWORK/RENT',
    debit: 32000.0,
    credit: null,
    balance: 361040.0,
    reference_number: 'UPI48910293',
    category_id: 'cat_7',
    workspace_id: 'ws_business',
    txn_type: 'expense',
    is_transfer: false,
    transfer_pair_id: null,
    notes: 'Dedicated desk private suite monthly fee',
    tags: ['office', 'rent'],
    is_manual: false,
    source_staged_id: 'stg_3',
    created_at: '2026-11-01T10:30:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
    category: {
      id: 'cat_7',
      name: 'Client Payment',
      color_index: 0,
      icon: 'Building2',
    },
    workspace: {
      id: 'ws_business',
      name: 'Business',
      color_index: 1,
    },
  },
  {
    id: 'tx_transfer_leg_1',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    upload_id: 'up_hdfc_oct26',
    txn_date: '2026-10-10',
    description: 'Transfer to Kotak Card Bill',
    raw_description: 'IMPS/KOTAKCC/BILLPAY/7021',
    debit: 45000.0,
    credit: null,
    balance: 393040.0,
    reference_number: 'IMPS702100',
    category_id: null,
    workspace_id: null,
    txn_type: 'transfer',
    is_transfer: true,
    transfer_pair_id: 'pair_oct_transfer_01',
    notes: 'Self account transfer for credit card settlement',
    tags: ['transfer', 'credit-card'],
    is_manual: false,
    source_staged_id: 'stg_4',
    created_at: '2026-11-01T10:30:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
  },
  {
    id: 'tx_transfer_leg_2',
    user_id: 'default_owner',
    account_id: 'acc_kotak_04',
    upload_id: null,
    txn_date: '2026-10-10',
    description: 'Payment Received from HDFC Bank',
    raw_description: 'IMPS/INW/HDFC/BILLPAY/7021',
    debit: null,
    credit: 45000.0,
    balance: -12400.0, // Negative credit card balance or negative balance test case
    reference_number: 'IMPS702100',
    category_id: null,
    workspace_id: null,
    txn_type: 'transfer',
    is_transfer: true,
    transfer_pair_id: 'pair_oct_transfer_01',
    notes: 'Credit card bill receipt',
    tags: ['transfer', 'credit-card'],
    is_manual: false,
    source_staged_id: null,
    created_at: '2026-11-01T10:30:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_kotak_04',
      name: 'Kotak White Credit Card',
      bank_name: 'Kotak Mahindra Bank',
      account_number_last4: '7021',
    },
  },
  {
    id: 'tx_sbi_salary_01',
    user_id: 'default_owner',
    account_id: 'acc_sbi_02',
    upload_id: 'up_sbi_sep26',
    txn_date: '2026-09-30',
    description: 'Monthly Corporate Payroll Salary',
    raw_description: 'ACH/PAYROLL/CORP/SEP2026',
    debit: null,
    credit: 185000.0,
    balance: 215400.0,
    reference_number: 'ACH920194',
    category_id: 'cat_5', // Salary
    workspace_id: 'ws_personal',
    txn_type: 'income',
    is_transfer: false,
    transfer_pair_id: null,
    notes: 'September month salary credited',
    tags: ['salary', 'corporate'],
    is_manual: false,
    source_staged_id: null,
    created_at: '2026-10-02T14:15:00.000Z',
    updated_at: '2026-10-02T14:15:00.000Z',
    account: {
      id: 'acc_sbi_02',
      name: 'SBI Salary Account',
      bank_name: 'State Bank of India',
      account_number_last4: '9102',
    },
    category: {
      id: 'cat_5',
      name: 'Salary',
      color_index: 1,
      icon: 'Briefcase',
    },
    workspace: {
      id: 'ws_personal',
      name: 'Personal',
      color_index: 0,
    },
  },
  {
    id: 'tx_manual_sample',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    upload_id: null,
    txn_date: '2026-11-05',
    description: 'Cash Petty Office Supplies',
    raw_description: 'Manual cash disbursement at stationery store',
    debit: 1250.0,
    credit: null,
    balance: 483950.0,
    reference_number: 'CASH-REC-102',
    category_id: 'cat_7',
    workspace_id: 'ws_business',
    txn_type: 'expense',
    is_transfer: false,
    transfer_pair_id: null,
    notes: 'Printed client decks and spiral bindings',
    tags: ['manual', 'stationery'],
    is_manual: true,
    source_staged_id: null,
    created_at: '2026-11-05T12:00:00.000Z',
    updated_at: '2026-11-05T12:00:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
    category: {
      id: 'cat_7',
      name: 'Client Payment',
      color_index: 0,
      icon: 'Building2',
    },
    workspace: {
      id: 'ws_business',
      name: 'Business',
      color_index: 1,
    },
  },
];

/**
 * Normalizes description for multiset deduplication comparison:
 * lowercase and collapse all contiguous whitespace
 */
export function normalizeDescription(desc: string): string {
  return (desc || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Computes deduplication key for a transaction row
 */
export function getDedupKey(date: string, desc: string, debit: number | null, credit: number | null): string {
  const normDesc = normalizeDescription(desc);
  const dVal = debit !== null && debit !== undefined ? Number(debit).toFixed(2) : '';
  const cVal = credit !== null && credit !== undefined ? Number(credit).toFixed(2) : '';
  return `${date}|${normDesc}|${dVal}|${cVal}`;
}

/**
 * Append audit log entry (Append-only guarantee)
 */
export async function writeAuditLog(entry: {
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete';
  old_data?: any;
  new_data?: any;
}): Promise<AuditLogEntry> {
  const auditRow: AuditLogEntry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: 'default_owner',
    table_name: entry.table_name,
    record_id: entry.record_id,
    action: entry.action,
    old_data: entry.old_data || null,
    new_data: entry.new_data || null,
    created_at: new Date().toISOString(),
  };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      auditRow.user_id = user.id;
      await supabase.from('audit_log').insert({
        user_id: user.id,
        table_name: entry.table_name,
        record_id: entry.record_id,
        action: entry.action,
        old_data: entry.old_data || null,
        new_data: entry.new_data || null,
      });
    }
  } catch {
    // In-memory fallback
  }

  localAuditLogStore.push(auditRow);
  return auditRow;
}

/**
 * Retrieve Audit Log for auditing
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  return [...localAuditLogStore].reverse();
}

/**
 * STEP 1-9: Finalize / Commit Statement Upload Pipeline
 * Implements multiset deduplication, transaction rules engine, batch insert,
 * transfer pair discovery, audit log entries, and upload status commitment.
 */
export async function commitUploadTransactions(
  uploadId: string,
  replacePreviousId?: string
): Promise<FinalizeImportResult> {
  // STEP 1 — Authenticate
  const supabase = createClient();
  let userId = 'default_owner';
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // Local preview mode
  }

  // STEP 2 — Load staged rows for the given upload_id
  const details = await getUploadDetails(uploadId);
  const upload = details.upload;
  if (!upload) throw new Error(`Upload not found for ID: ${uploadId}`);
  const stagedRows = details.transactions;

  if (stagedRows.length === 0) {
    throw new Error('No staged transactions available to commit.');
  }

  // If replacing a previous upload: mark old as replaced and delete its transactions
  if (replacePreviousId) {
    const existingUploads = await getUploads();
    const prev = existingUploads.find((u) => u.id === replacePreviousId);
    if (prev) {
      prev.status = 'replaced';
      prev.updated_at = new Date().toISOString();
      // Remove old transactions from replaced upload
      localTransactionsStore = localTransactionsStore.filter((t) => t.upload_id !== replacePreviousId);
    }
  }

  // STEP 3 — Multiset duplicate detection
  // For each staged row, check against existing transactions for the same account_id:
  // Match criteria: same txn_date + same normalized description + same debit/credit amount
  // Multiset rule: If appears N times in statement and M times in transactions, mark (N - M) new and remainder duplicate!
  const accountExistingTxns = localTransactionsStore.filter(
    (t) => t.account_id === upload.account_id && t.upload_id !== uploadId
  );

  // Map of dedupKey -> array of matching existing transactions
  const existingPool = new Map<string, Transaction[]>();
  for (const t of accountExistingTxns) {
    const key = getDedupKey(t.txn_date, t.description, t.debit, t.credit);
    const list = existingPool.get(key) || [];
    list.push(t);
    existingPool.set(key, list);
  }

  let duplicateCount = 0;
  const nonDuplicateStaged: typeof stagedRows = [];

  for (const staged of stagedRows) {
    const key = getDedupKey(staged.txn_date, staged.description, staged.debit, staged.credit);
    const existingList = existingPool.get(key);

    if (existingList && existingList.length > 0) {
      // Consume one of the M existing matches (Multiset Dedup)
      const matchedTx = existingList.shift()!;
      staged.is_duplicate = true;
      staged.duplicate_of_id = matchedTx.id;
      duplicateCount++;
    } else {
      staged.is_duplicate = false;
      staged.duplicate_of_id = null;
      nonDuplicateStaged.push(staged);
    }
  }

  // STEP 4 — Apply transaction rules
  // For each non-duplicate staged row, run transaction_rules in priority order (lowest number = highest priority).
  // Apply first matching rule only. Set category_id, workspace_id, txn_type, tags from matched rule.
  const activeRules = await getRules();
  const accounts = await getAccounts();
  const categories = await getCategories();
  const workspaces = await getWorkspaces();

  const accountInfo = accounts.find((a) => a.id === upload.account_id);

  // STEP 5 — Insert into transactions
  // Batch insert all non-duplicate staged rows. Set source_staged_id to the staged row's id for audit trail.
  const newlyInsertedTransactions: Transaction[] = [];

  for (const row of nonDuplicateStaged) {
    // Determine default txn_type based on debit vs credit
    let determinedType: Transaction['txn_type'] = row.debit ? 'expense' : 'income';
    let assignedCategoryId: string | null = null;
    let assignedWorkspaceId: string | null = null;
    let assignedTags: string[] | null = null;

    // Check rules
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

    const matchedCat = categories.find((c) => c.id === assignedCategoryId);
    const matchedWs = workspaces.find((w) => w.id === assignedWorkspaceId);

    const newTx: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      account_id: upload.account_id,
      upload_id: upload.id,
      txn_date: row.txn_date,
      description: row.description,
      raw_description: row.raw_description,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      reference_number: row.reference_number,
      category_id: assignedCategoryId,
      workspace_id: assignedWorkspaceId,
      txn_type: determinedType,
      is_transfer: false,
      transfer_pair_id: null,
      notes: null,
      tags: assignedTags,
      is_manual: false,
      source_staged_id: row.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      account: accountInfo
        ? {
            id: accountInfo.id,
            name: accountInfo.name,
            bank_name: accountInfo.bank_name,
            account_number_last4: accountInfo.account_number_last4,
          }
        : undefined,
      category: matchedCat
        ? {
            id: matchedCat.id,
            name: matchedCat.name,
            color_index: matchedCat.color_index,
            icon: matchedCat.icon,
          }
        : undefined,
      workspace: matchedWs
        ? {
            id: matchedWs.id,
            name: matchedWs.name,
            color_index: matchedWs.color_index,
          }
        : undefined,
      upload: {
        id: upload.id,
        file_name: upload.file_name,
      },
    };

    newlyInsertedTransactions.push(newTx);
  }

  // Prepend newly inserted to local ledger
  localTransactionsStore.unshift(...newlyInsertedTransactions);

  // STEP 6 — Detect transfers
  // Match: two transactions within ±1 day, same absolute amount, one debit one credit, in different accounts
  let transferPairsFound = 0;
  const allCurrent = localTransactionsStore;

  for (const newTx of newlyInsertedTransactions) {
    if (newTx.is_transfer) continue;

    const newAmt = newTx.debit ?? newTx.credit;
    if (!newAmt) continue;
    const isNewDebit = newTx.debit !== null && newTx.debit !== undefined;
    const newDateMs = new Date(newTx.txn_date).getTime();

    // Look for complement in all transactions
    for (const otherTx of allCurrent) {
      if (otherTx.id === newTx.id) continue;
      if (otherTx.is_transfer && otherTx.transfer_pair_id) continue;
      if (otherTx.account_id === newTx.account_id) continue; // Must be in different accounts!

      const otherAmt = otherTx.debit ?? otherTx.credit;
      if (!otherAmt) continue;
      if (Math.abs(newAmt - otherAmt) > 0.01) continue; // Same absolute amount

      const isOtherDebit = otherTx.debit !== null && otherTx.debit !== undefined;
      // One debit, one credit
      if (isNewDebit === isOtherDebit) continue;

      // Within ±1 day (86,400,000 ms)
      const otherDateMs = new Date(otherTx.txn_date).getTime();
      const diffMs = Math.abs(newDateMs - otherDateMs);
      if (diffMs <= 86400000 * 1.5) {
        // Linked transfer pair found!
        const pairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        newTx.is_transfer = true;
        newTx.transfer_pair_id = pairId;
        newTx.txn_type = 'transfer';
        newTx.category_id = null; // Do not auto-categorize transfers
        newTx.category = undefined;

        otherTx.is_transfer = true;
        otherTx.transfer_pair_id = pairId;
        otherTx.txn_type = 'transfer';
        otherTx.category_id = null;
        otherTx.category = undefined;

        transferPairsFound++;
        break;
      }
    }
  }

  // STEP 7 — Update upload record
  upload.status = 'imported';
  upload.imported_count = newlyInsertedTransactions.length;
  upload.duplicate_count = duplicateCount;
  upload.imported_at = new Date().toISOString();
  upload.updated_at = new Date().toISOString();

  // STEP 8 — Write audit log
  // Insert one audit_log row per inserted transaction
  for (const insertedTx of newlyInsertedTransactions) {
    await writeAuditLog({
      table_name: 'transactions',
      record_id: insertedTx.id,
      action: 'insert',
      new_data: {
        id: insertedTx.id,
        account_id: insertedTx.account_id,
        upload_id: insertedTx.upload_id,
        txn_date: insertedTx.txn_date,
        description: insertedTx.description,
        debit: insertedTx.debit,
        credit: insertedTx.credit,
        balance: insertedTx.balance,
        reference_number: insertedTx.reference_number,
        txn_type: insertedTx.txn_type,
        is_transfer: insertedTx.is_transfer,
        source_staged_id: insertedTx.source_staged_id,
      },
    });
  }

  // STEP 9 — If AI features are enabled and key is present, run description cleaning, auto-categorization & anomaly detection
  try {
    const isAiEnabled = typeof window !== 'undefined' ? localStorage.getItem('zaboraa_ai_enabled') === 'true' : true;
    if (isAiEnabled && newlyInsertedTransactions.length > 0) {
      // 1. Clean machine-generated narrations
      const { batchCleanDescriptionsWithAI } = await import('../ai/clean-description');
      const cleanedResults = await batchCleanDescriptionsWithAI(newlyInsertedTransactions);
      for (const c of cleanedResults) {
        const tx = newlyInsertedTransactions.find((t) => t.id === c.transaction_id);
        if (tx) tx.description = c.cleaned_description;
      }

      // 2. Auto-categorize uncategorized transactions
      const uncategorized = newlyInsertedTransactions.filter((t) => !t.category_id && !t.is_transfer);
      if (uncategorized.length > 0) {
        const { categorizeTransactionsWithAI } = await import('../ai/categorize');
        const catRes = await categorizeTransactionsWithAI(uncategorized, categories);
        if (catRes.results.length > 0) {
          await applyAICategorizations(catRes.results);
        }
      }

      // 3. Scan for anomalies
      const { detectAnomaliesWithAI } = await import('../ai/anomalies');
      await detectAnomaliesWithAI(localTransactionsStore);
    }
  } catch (aiErr) {
    console.warn('Post-import AI pipeline notice (continuing without breaking import):', aiErr);
  }

  // STEP 10 — Return
  return {
    imported_count: newlyInsertedTransactions.length,
    duplicate_count: duplicateCount,
    transfer_pairs_found: transferPairsFound,
    upload_id: upload.id,
  };
}

/**
 * Query ledger with server-side / in-memory filtering and pagination (50 per page default)
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

  // Enrich any missing account/category/workspace relations
  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  let filtered = localTransactionsStore.map((t) => {
    const acc = t.account || accounts.find((a) => a.id === t.account_id);
    const cat = t.category || categories.find((c) => c.id === t.category_id);
    const ws = t.workspace || workspaces.find((w) => w.id === t.workspace_id);
    return {
      ...t,
      account: acc
        ? {
            id: acc.id,
            name: acc.name,
            bank_name: acc.bank_name,
            account_number_last4: acc.account_number_last4,
          }
        : undefined,
      category: cat
        ? {
            id: cat.id,
            name: cat.name,
            color_index: cat.color_index,
            icon: cat.icon,
          }
        : undefined,
      workspace: ws
        ? {
            id: ws.id,
            name: ws.name,
            color_index: ws.color_index,
          }
        : undefined,
    };
  });

  // 1. Date Range Filter
  if (filters.startDate) {
    filtered = filtered.filter((t) => t.txn_date >= filters.startDate!);
  }
  if (filters.endDate) {
    filtered = filtered.filter((t) => t.txn_date <= filters.endDate!);
  }

  // 2. Account IDs Multi-Select Filter
  if (filters.accountIds && filters.accountIds.length > 0) {
    filtered = filtered.filter((t) => filters.accountIds!.includes(t.account_id));
  }

  // 3. Category IDs Multi-Select Filter
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    filtered = filtered.filter((t) => t.category_id && filters.categoryIds!.includes(t.category_id));
  }

  // 4. Workspace Filter
  if (filters.workspaceId && filters.workspaceId !== 'all') {
    filtered = filtered.filter((t) => t.workspace_id === filters.workspaceId);
  }

  // 5. Txn Type Filter
  if (filters.txnType && filters.txnType !== 'all') {
    filtered = filtered.filter((t) => t.txn_type === filters.txnType);
  }

  // 6. Search Filter: searches description + reference_number
  if (filters.search && filters.search.trim()) {
    const query = filters.search.trim().toLowerCase();
    filtered = filtered.filter((t) => {
      const descMatch = (t.description || '').toLowerCase().includes(query);
      const refMatch = (t.reference_number || '').toLowerCase().includes(query);
      const rawMatch = (t.raw_description || '').toLowerCase().includes(query);
      return descMatch || refMatch || rawMatch;
    });
  }

  // Sort descending by txn_date
  filtered.sort((a, b) => (b.txn_date > a.txn_date ? 1 : b.txn_date < a.txn_date ? -1 : 0));

  // Compute ledger sum totals
  let totalDebits = 0;
  let totalCredits = 0;
  for (const t of filtered) {
    if (t.debit) totalDebits += t.debit;
    if (t.credit) totalCredits += t.credit;
  }

  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  return {
    transactions: paginated,
    totalCount,
    totalPages,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
  };
}

/**
 * Manual Transaction Entry (Deliverable 4)
 * Validates: date not in future, amount > 0, account must exist
 * Sets is_manual = true and writes audit log on insert
 */
export async function createManualTransaction(data: ManualTransactionFormData): Promise<Transaction> {
  const today = new Date().toISOString().split('T')[0];
  if (data.txn_date > today) {
    throw new Error('Transaction date cannot be in the future.');
  }

  if (!data.amount || data.amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }

  const accounts = await getAccounts();
  const matchedAccount = accounts.find((a) => a.id === data.account_id);
  if (!matchedAccount) {
    throw new Error('Target bank account does not exist.');
  }

  const debit = data.type === 'debit' ? data.amount : null;
  const credit = data.type === 'credit' ? data.amount : null;
  const txnType: Transaction['txn_type'] = data.type === 'debit' ? 'expense' : 'income';

  const [categories, workspaces] = await Promise.all([getCategories(), getWorkspaces()]);
  const matchedCat = categories.find((c) => c.id === data.category_id);
  const matchedWs = workspaces.find((w) => w.id === data.workspace_id);

  const newTx: Transaction = {
    id: `tx_man_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user_id: 'default_owner',
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    account: {
      id: matchedAccount.id,
      name: matchedAccount.name,
      bank_name: matchedAccount.bank_name,
      account_number_last4: matchedAccount.account_number_last4,
    },
    category: matchedCat
      ? {
          id: matchedCat.id,
          name: matchedCat.name,
          color_index: matchedCat.color_index,
          icon: matchedCat.icon,
        }
      : undefined,
    workspace: matchedWs
      ? {
          id: matchedWs.id,
          name: matchedWs.name,
          color_index: matchedWs.color_index,
        }
      : undefined,
  };

  localTransactionsStore.unshift(newTx);

  // Write Audit Log on insert
  await writeAuditLog({
    table_name: 'transactions',
    record_id: newTx.id,
    action: 'insert',
    new_data: {
      id: newTx.id,
      is_manual: true,
      txn_date: newTx.txn_date,
      description: newTx.description,
      amount: data.amount,
      type: data.type,
      account_id: newTx.account_id,
      category_id: newTx.category_id,
      workspace_id: newTx.workspace_id,
    },
  });

  return newTx;
}

/**
 * Updates editable transaction fields (Deliverable 3)
 * Non-editable: amounts, date, description (Amounts are sacred — never editable after import)
 * Writes audit log on change!
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
    transfer_pair_id?: string | null;
  }
): Promise<Transaction> {
  const index = localTransactionsStore.findIndex((t) => t.id === id);
  if (index === -1) throw new Error('Transaction not found');

  const oldTx = localTransactionsStore[index];
  const oldDataSnapshot = {
    category_id: oldTx.category_id,
    workspace_id: oldTx.workspace_id,
    tags: oldTx.tags,
    notes: oldTx.notes,
    txn_type: oldTx.txn_type,
    is_transfer: oldTx.is_transfer,
    transfer_pair_id: oldTx.transfer_pair_id,
  };

  const [categories, workspaces] = await Promise.all([getCategories(), getWorkspaces()]);

  const newCatId = updates.category_id !== undefined ? updates.category_id : oldTx.category_id;
  const newWsId = updates.workspace_id !== undefined ? updates.workspace_id : oldTx.workspace_id;
  const matchedCat = categories.find((c) => c.id === newCatId);
  const matchedWs = workspaces.find((w) => w.id === newWsId);

  const updatedTx: Transaction = {
    ...oldTx,
    category_id: newCatId,
    workspace_id: newWsId,
    tags: updates.tags !== undefined ? updates.tags : oldTx.tags,
    notes: updates.notes !== undefined ? updates.notes : oldTx.notes,
    txn_type: updates.txn_type !== undefined ? updates.txn_type : oldTx.txn_type,
    is_transfer: updates.is_transfer !== undefined ? updates.is_transfer : oldTx.is_transfer,
    transfer_pair_id: updates.transfer_pair_id !== undefined ? updates.transfer_pair_id : oldTx.transfer_pair_id,
    category: matchedCat
      ? {
          id: matchedCat.id,
          name: matchedCat.name,
          color_index: matchedCat.color_index,
          icon: matchedCat.icon,
        }
      : undefined,
    workspace: matchedWs
      ? {
          id: matchedWs.id,
          name: matchedWs.name,
          color_index: matchedWs.color_index,
        }
      : undefined,
    updated_at: new Date().toISOString(),
  };

  localTransactionsStore[index] = updatedTx;

  // STEP: Write Audit Log on change
  await writeAuditLog({
    table_name: 'transactions',
    record_id: id,
    action: 'update',
    old_data: oldDataSnapshot,
    new_data: {
      category_id: updatedTx.category_id,
      workspace_id: updatedTx.workspace_id,
      tags: updatedTx.tags,
      notes: updatedTx.notes,
      txn_type: updatedTx.txn_type,
      is_transfer: updatedTx.is_transfer,
      transfer_pair_id: updatedTx.transfer_pair_id,
    },
  });

  return updatedTx;
}

/**
 * Bulk Edit Transactions (Deliverable 6)
 * When >=1 row selected, updates category, workspace, or appends tags.
 * Writes one audit_log row per changed transaction!
 */
export async function bulkUpdateTransactions(
  ids: string[],
  updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    append_tags?: string[];
  }
): Promise<{ updatedCount: number }> {
  let updatedCount = 0;

  for (const id of ids) {
    const tx = localTransactionsStore.find((t) => t.id === id);
    if (!tx) continue;

    let newTags = tx.tags ? [...tx.tags] : [];
    if (updates.append_tags && updates.append_tags.length > 0) {
      for (const t of updates.append_tags) {
        const clean = t.trim();
        if (clean && !newTags.includes(clean)) {
          newTags.push(clean);
        }
      }
    }

    await updateTransaction(id, {
      category_id: updates.category_id !== undefined ? updates.category_id : undefined,
      workspace_id: updates.workspace_id !== undefined ? updates.workspace_id : undefined,
      tags: updates.append_tags ? newTags : undefined,
    });

    updatedCount++;
  }

  return { updatedCount };
}

/**
 * Helper to fetch all transactions without pagination
 */
export async function getAllTransactions(): Promise<Transaction[]> {
  const { transactions } = await getTransactions({ page: 1, pageSize: 10000 });
  return transactions;
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
  }
): Promise<{
  account: any;
  transactions: (Transaction & { calculated_running_balance: number })[];
  dailyBalancePoints: { date: string; balance: number }[];
}> {
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Account not found');

  const openingBalance = account.opening_balance ?? 0;

  // Fetch all transactions for this account ordered chronologically ASC
  const allAccountTxns = localTransactionsStore
    .filter((t) => t.account_id === accountId)
    .sort((a, b) => {
      if (a.txn_date !== b.txn_date) return a.txn_date.localeCompare(b.txn_date);
      return a.created_at.localeCompare(b.created_at);
    });

  let running = openingBalance;
  const chronologicalWithBalance: (Transaction & { calculated_running_balance: number })[] = [];
  const balanceByDate = new Map<string, number>();

  for (const tx of allAccountTxns) {
    const debit = tx.debit ?? 0;
    const credit = tx.credit ?? 0;
    running = running + credit - debit;
    chronologicalWithBalance.push({
      ...tx,
      calculated_running_balance: Math.round(running * 100) / 100,
    });
    balanceByDate.set(tx.txn_date, Math.round(running * 100) / 100);
  }

  // Daily balance points for BalanceChart
  const dailyBalancePoints: { date: string; balance: number }[] = [];
  if (options?.startDate && options?.endDate) {
    let cur = new Date(options.startDate);
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
    // Collect from chronological points
    for (const [date, bal] of balanceByDate.entries()) {
      dailyBalancePoints.push({ date, balance: bal });
    }
  }

  // Now apply filters for display, then order DESC (newest first for ledger UI)
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
 * Compute high-performance Dashboard metrics
 */
export async function getDashboardMetrics(
  fyRange: { startDate: string; endDate: string },
  workspaceFilter: string = 'all'
) {
  const [accounts, categories, workspaces] = await Promise.all([
    getAccounts(),
    getCategories(),
    getWorkspaces(),
  ]);

  // Net Worth Calculation: sum of current balances across all active accounts
  // Credit card balances are liabilities (negative)
  let netWorth = 0;
  const accountBreakdown: { type: string; total: number; count: number }[] = [];
  const typeMap = new Map<string, number>();
  const typeCount = new Map<string, number>();

  for (const acc of accounts) {
    if (!acc.is_active) continue;
    // Calculate current balance from opening balance + credits - debits
    const accTxns = localTransactionsStore.filter((t) => t.account_id === acc.id);
    let bal = acc.opening_balance ?? 0;
    for (const tx of accTxns) {
      bal += (tx.credit ?? 0) - (tx.debit ?? 0);
    }

    // For credit card, if balance is positive, it's either an overpayment or liability
    // Outstanding credit card balance represents a liability
    if (acc.account_type === 'credit_card') {
      const liability = bal < 0 ? bal : -bal;
      netWorth += liability;
      const cur = typeMap.get('credit_card') || 0;
      typeMap.set('credit_card', cur + liability);
      typeCount.set('credit_card', (typeCount.get('credit_card') || 0) + 1);
    } else {
      netWorth += bal;
      const cur = typeMap.get(acc.account_type) || 0;
      typeMap.set(acc.account_type, cur + bal);
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

  // Filter transactions by FY date range and Workspace filter
  let periodTxns = localTransactionsStore.filter(
    (t) => t.txn_date >= fyRange.startDate && t.txn_date <= fyRange.endDate
  );

  if (workspaceFilter && workspaceFilter !== 'all') {
    periodTxns = periodTxns.filter((t) => {
      if (workspaceFilter === 'Personal') return t.workspace_id === 'ws_personal';
      if (workspaceFilter === 'Business') return t.workspace_id === 'ws_business';
      if (workspaceFilter === 'Mixed') return t.workspace_id === 'ws_mixed';
      return t.workspace_id === workspaceFilter;
    });
  }

  // Cashflow: Exclude internal transfers!
  // Income: sum of credits where not transfer and (txn_type = 'income' or credit > 0)
  // Expenses: sum of debits where not transfer and txn_type = 'expense'
  let totalIncome = 0;
  let totalExpenses = 0;

  // Month-by-month breakdown (12 months of Indian FY: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar)
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

  const monthMap = new Map<string, { income: number; expense: number }>();
  for (const m of fyMonths) {
    monthMap.set(m.label, { income: 0, expense: 0 });
  }

  // Category breakdown map for spending donut
  const categorySpendMap = new Map<string, number>();

  // Business income and expense running totals for Tax Provision
  let businessIncome = 0;
  let businessExpense = 0;

  for (const tx of periodTxns) {
    // Exclude transfers from income, expenses, and tax calculations
    if (tx.is_transfer || tx.txn_type === 'transfer') continue;

    // Track Business Workspace specifically for Tax Provision
    const isBusiness = tx.workspace_id === 'ws_business' || tx.workspace?.name?.toLowerCase() === 'business';

    if (tx.credit && tx.credit > 0 && tx.txn_type !== 'refund') {
      totalIncome += tx.credit;
      if (isBusiness) businessIncome += tx.credit;

      // Assign to month
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

      // Assign to month
      const mStr = tx.txn_date.slice(5, 7);
      const matchMonth = fyMonths.find((m) => m.monthNum === mStr);
      if (matchMonth) {
        const cur = monthMap.get(matchMonth.label)!;
        cur.expense += tx.debit;
      }

      // Track Category Spend
      const catId = tx.category_id || 'uncategorized';
      const curSpend = categorySpendMap.get(catId) || 0;
      categorySpendMap.set(catId, curSpend + tx.debit);
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

  // Fixed 10-color categorical palette from PRD §6.3
  const PRD_PALETTE = [
    '#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16',
    '#EAB308', '#F97316', '#EF4444', '#EC4899', '#A855F7',
  ];

  // Spending by Category (Top 8 categories, rest as "Other")
  const sortedCategories = Array.from(categorySpendMap.entries())
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        id: catId,
        name: cat?.name || (catId === 'uncategorized' ? 'Uncategorized' : 'General Expense'),
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

  top8.forEach((item, idx) => {
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

  // Tax Provision calculation
  const taxableProfit = Math.max(0, businessIncome - businessExpense);
  const taxProvision30 = Math.round(taxableProfit * 0.3 * 100) / 100;

  // Recent 10 transactions
  const recentTransactions = localTransactionsStore
    .slice(0, 10)
    .map((t) => {
      const acc = t.account || accounts.find((a) => a.id === t.account_id);
      return {
        ...t,
        account: acc
          ? {
              id: acc.id,
              name: acc.name,
              bank_name: acc.bank_name,
              account_number_last4: acc.account_number_last4,
            }
          : undefined,
      };
    });

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
 * Generates ITR Summary data matching Indian ITR Schedule
 */
export async function getITRSummaryData(fyRange: { startDate: string; endDate: string }) {
  const [categories, workspaces] = await Promise.all([getCategories(), getWorkspaces()]);

  const txns = localTransactionsStore.filter(
    (t) =>
      t.txn_date >= fyRange.startDate &&
      t.txn_date <= fyRange.endDate &&
      !t.is_transfer &&
      t.txn_type !== 'transfer'
  );

  let businessIncome = 0;
  let otherPersonalIncome = 0;
  let businessExpenses = 0;
  let personalExpenses = 0;

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
    const isBusiness = t.workspace_id === 'ws_business';
    const isPersonal = t.workspace_id === 'ws_personal' || (!t.workspace_id && !isBusiness);
    const mIdx = Math.max(0, parseInt(t.txn_date.slice(5, 7), 10) - 1);

    if (t.credit && t.credit > 0) {
      if (isBusiness) {
        businessIncome += t.credit;
        workspaceMonthMap.Business[mIdx] += t.credit;
      } else {
        otherPersonalIncome += t.credit;
        workspaceMonthMap.Personal[mIdx] += t.credit;
      }
    }

    if (t.debit && t.debit > 0) {
      const catName = categories.find((c) => c.id === t.category_id)?.name || 'General';
      if (isBusiness) {
        businessExpenses += t.debit;
        workspaceMonthMap.Business[mIdx] -= t.debit;
        const cur = wsSpendCategories.Business.get(catName) || 0;
        wsSpendCategories.Business.set(catName, cur + t.debit);
      } else {
        personalExpenses += t.debit;
        workspaceMonthMap.Personal[mIdx] -= t.debit;
        const cur = wsSpendCategories.Personal.get(catName) || 0;
        wsSpendCategories.Personal.set(catName, cur + t.debit);
      }
    }
  }

  const totalGrossIncome = businessIncome + otherPersonalIncome;
  const totalDeductions = businessExpenses; // Standard business expense deductions
  const netTaxableIncome = Math.max(0, totalGrossIncome - totalDeductions);
  const estimatedTax30 = Math.round(netTaxableIncome * 0.3 * 100) / 100;

  // Format top 5 spend categories for workspace cards
  const formatTop5 = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

  return {
    lineItems: [
      { section: 'Income', lineItem: 'Business Income (Gross Receipts)', amount: businessIncome },
      { section: 'Income', lineItem: 'Other Income (Personal & Investments)', amount: otherPersonalIncome },
      { section: 'Income', lineItem: 'Total Gross Income', amount: totalGrossIncome, isSubtotal: true },
      { section: 'Deductions', lineItem: 'Business Expenses (Allowable deductions)', amount: businessExpenses },
      { section: 'Deductions', lineItem: 'Total Deductions', amount: totalDeductions, isSubtotal: true },
      { section: 'Taxable Income', lineItem: 'Net Taxable Income (Estimated)', amount: netTaxableIncome, isTotal: true },
      { section: 'Tax', lineItem: 'Tax @ 30% (Estimated, reference only)', amount: estimatedTax30, isTax: true },
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
        income: 0,
        expenses: 0,
        net: 0,
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
  }>
): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  const categories = await getCategories();

  for (const res of results) {
    const tx = localTransactionsStore.find((t) => t.id === res.transaction_id);
    if (!tx) continue;

    // NEVER re-categorize if already set by user or rule
    if (tx.is_manual) continue;
    const hasUserEdit = localAuditLogStore.some(
      (a) => a.record_id === tx.id && a.action === 'update' && (a.new_data as any)?.category_id
    );
    if (hasUserEdit) continue;

    const matchedCat = categories.find((c) => c.id === res.category_id);

    if (res.confidence === 'high' && res.category_id) {
      const oldCat = tx.category_id;
      tx.category_id = res.category_id;
      tx.category = matchedCat
        ? {
            id: matchedCat.id,
            name: matchedCat.name,
            color_index: matchedCat.color_index,
            icon: matchedCat.icon,
          }
        : undefined;
      tx.ai_suggestion = {
        category_id: res.category_id,
        confidence: 'high',
        score: res.score || 0.9,
        is_ai_applied: true,
      };
      tx.updated_at = new Date().toISOString();

      localAuditLogStore.push({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: tx.user_id,
        table_name: 'transactions',
        record_id: tx.id,
        action: 'update',
        old_data: { category_id: oldCat },
        new_data: { category_id: res.category_id, confidence: res.confidence, score: res.score },
        created_at: new Date().toISOString(),
      });
      updatedCount++;
    } else if (res.confidence === 'medium' && res.category_id) {
      const oldCat = tx.category_id;
      tx.category_id = res.category_id;
      tx.category = matchedCat
        ? {
            id: matchedCat.id,
            name: matchedCat.name,
            color_index: matchedCat.color_index,
            icon: matchedCat.icon,
          }
        : undefined;
      tx.ai_suggestion = {
        category_id: res.category_id,
        confidence: 'medium',
        score: res.score || 0.7,
        is_ai_applied: true,
      };
      tx.updated_at = new Date().toISOString();

      localAuditLogStore.push({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: tx.user_id,
        table_name: 'transactions',
        record_id: tx.id,
        action: 'update',
        old_data: { category_id: oldCat },
        new_data: { category_id: res.category_id, confidence: res.confidence, score: res.score },
        created_at: new Date().toISOString(),
      });
      updatedCount++;
    } else {
      // Low confidence (< 0.5): Do NOT apply — leave category_id null, show in Needs Review queue
      tx.ai_suggestion = {
        category_id: res.category_id,
        confidence: 'low',
        score: res.score || 0.3,
        is_ai_applied: false,
      };
    }
  }

  return { updatedCount };
}

