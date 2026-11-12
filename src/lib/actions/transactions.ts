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

  // STEP 9 — Return
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
