/**
 * Batch 3a & 3b: Statement Upload & Parsing Types
 * Defined per PRD Section 4.3 & Batch 3b Deliverables
 */

export type UploadStatus =
  | 'pending'
  | 'processing'
  | 'staged'
  | 'review'
  | 'completed'
  | 'imported'
  | 'failed'
  | 'replaced';

export type FileType = 'csv' | 'xlsx' | 'pdf';

export interface StatementUpload {
  id: string;
  user_id: string;
  account_id: string;
  file_name: string;
  file_hash: string;
  file_type: FileType;
  file_size_bytes: number;
  storage_path: string;
  parser_version: string;
  status: UploadStatus;
  row_count: number | null;
  imported_count: number | null;
  duplicate_count: number | null;
  error_message: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
  reconciliation_warning?: boolean;
  reconciliation_diff?: number;
  // Joined account details for UI rendering
  account?: {
    id: string;
    name: string;
    bank_name: string;
    account_number_last4: string | null;
  };
}

export interface StagedTransaction {
  id: string;
  user_id: string;
  upload_id: string;
  account_id: string;
  raw_date: string | null;
  txn_date: string;
  description: string;
  raw_description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference_number: string | null;
  upi_ref_no?: string | null;
  imps_ref_no?: string | null;
  source?: 'manual_upload' | 'gmail_auto' | 'statement_import';
  is_duplicate: boolean;
  duplicate_of_id: string | null;
  created_at: string;
}

export interface ColumnMapping {
  date_col: string | null;
  description_col: string | null;
  debit_col: string | null;
  credit_col: string | null;
  balance_col: string | null;
  reference_col: string | null;
  amount_col: string | null; // single-column format (positive=credit, negative=debit)
  is_single_amount_col: boolean;
}

export type MappingConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ParsedTransaction {
  txn_date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance?: number | null;
  balance_after?: number | null;
  reference_number?: string | null;
  upi_ref_no?: string | null;
  imps_ref_no?: string | null;
  source?: 'statement_import' | 'gmail_auto' | 'manual_upload';
  ai_category_skip?: boolean;
  category_name?: string | null;
  workspace?: string | null;
  paytm_tag?: string | null;
  account_hint?: string | null;
  timestamp?: string | null;
  raw_notes?: string | null;
}

export interface ParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  parser_version: string;
  detected_bank?: string;
  confidence?: MappingConfidence;
  suggested_mapping?: ColumnMapping;
  opening_balance?: number | null;
  closing_balance?: number | null;
  reconciliation_warning?: boolean;
  reconciliation_diff?: number;
  raw_text?: string;
  transactions?: ParsedTransaction[];
  parseError?: string;
}

export interface UploadApiResponse {
  upload_id: string;
  row_count: number;
  column_mapping: ColumnMapping | null;
  needs_mapping: boolean;
  headers: string[];
  detected_bank?: string;
  sample_rows?: Array<Record<string, string>>;
  error?: string;
  existing_upload_id?: string;
  file_type?: FileType;
  reconciliation_warning?: boolean;
  reconciliation_diff?: number;
}

export interface OverlapCheckResult {
  has_overlap: boolean;
  overlapping_upload_id?: string;
  overlapping_file_name?: string;
  overlapping_date?: string;
  overlap_percentage: number;
  overlapping_row_count?: number;
  overlapping_file_type?: FileType;
}
