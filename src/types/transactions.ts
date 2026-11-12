export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'opening';

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  upload_id: string | null;
  txn_date: string; // ISO YYYY-MM-DD
  description: string;
  raw_description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference_number: string | null;
  category_id: string | null;
  workspace_id: string | null;
  txn_type: TransactionType | null;
  is_transfer: boolean;
  transfer_pair_id: string | null;
  notes: string | null;
  tags: string[] | null;
  is_manual: boolean;
  source_staged_id: string | null;
  is_recurring?: boolean;
  recurring_id?: string | null;
  ai_suggestion?: {
    category_id: string | null;
    confidence: 'high' | 'medium' | 'low';
    score?: number;
    reasoning?: string;
    is_ai_applied?: boolean;
  } | null;
  anomaly?: {
    anomaly_type: 'large_amount' | 'possible_duplicate' | 'unusual_category' | 'unusual_timing';
    explanation: string;
    severity: 'high' | 'medium' | 'low';
  } | null;
  created_at: string;
  updated_at: string;

  // Joined metadata for UI presentation
  account?: {
    id: string;
    name: string;
    bank_name: string;
    account_number_last4: string | null;
  };
  category?: {
    id: string;
    name: string;
    color_index: number;
    icon: string | null;
  };
  workspace?: {
    id: string;
    name: string;
    color_index: number;
  };
  upload?: {
    id: string;
    file_name: string;
  };
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}

export type MatchField = 'description' | 'reference_number' | 'amount' | 'txn_type';
export type MatchType = 'contains' | 'starts_with' | 'exact' | 'regex' | 'gte' | 'lte';

export interface TransactionRule {
  id: string;
  user_id: string;
  name: string;
  priority: number;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  set_category: string | null;
  set_workspace: string | null;
  set_txn_type: 'expense' | 'income' | 'transfer' | 'refund' | null;
  set_tags: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  category?: {
    id: string;
    name: string;
    color_index?: number;
  };
  workspace?: {
    id: string;
    name: string;
  };
}

export interface RuleFormData {
  name: string;
  priority: number;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  set_category?: string | null;
  set_workspace?: string | null;
  set_txn_type?: 'expense' | 'income' | 'transfer' | 'refund' | null;
  set_tags?: string[] | null;
  is_active?: boolean;
}

export interface TransactionFiltersState {
  startDate: string;
  endDate: string;
  accountIds: string[];
  categoryIds: string[];
  workspaceId: string;
  txnType: 'all' | 'expense' | 'income' | 'transfer' | 'refund';
  search: string;
}

export interface ManualTransactionFormData {
  txn_date: string;
  description: string;
  account_id: string;
  amount: number;
  type: 'debit' | 'credit';
  category_id?: string | null;
  workspace_id?: string | null;
  tags?: string[];
  notes?: string;
  reference_number?: string;
}

export interface FinalizeImportResult {
  imported?: number;
  duplicates_skipped?: number;
  replaced?: boolean;
  imported_count: number;
  duplicate_count: number;
  transfer_pairs_found: number;
  upload_id: string;
}
