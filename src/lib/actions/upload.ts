import { createClient } from '../supabase/client';
import type {
  StatementUpload,
  StagedTransaction,
  ColumnMapping,
  ParseResult,
  UploadApiResponse,
  OverlapCheckResult,
} from '../../types/uploads';
import { parseCSV } from '../parsers/csv';
import { parseXLSX } from '../parsers/xlsx';
import { extractPDFRawData } from '../parsers/pdf';
import { parsePDFHDFC, isHDFCStatement } from '../parsers/pdf-hdfc';
import { parsePDFGeneric } from '../parsers/pdf-generic';
import { getAccounts } from './accounts';

/**
 * Runs reconciliation check:
 * opening_balance + sum(credits) - sum(debits) ≈ closing_balance
 * tolerance: ±1 INR (rounding)
 */
export function checkReconciliation(
  rows: Array<Record<string, string>>,
  mapping: ColumnMapping | null | undefined,
  openingBalance?: number | null,
  closingBalance?: number | null
): { warning: boolean; diff: number } {
  if (
    openingBalance === undefined ||
    openingBalance === null ||
    closingBalance === undefined ||
    closingBalance === null
  ) {
    return { warning: false, diff: 0 };
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const r of rows) {
    if (mapping?.is_single_amount_col && mapping.amount_col) {
      const amt = parseAmount(r[mapping.amount_col]);
      if (amt !== null) {
        if (amt < 0) totalDebits += Math.abs(amt);
        else totalCredits += amt;
      }
    } else {
      if (mapping?.debit_col) {
        const d = parseAmount(r[mapping.debit_col]);
        if (d !== null) totalDebits += d;
      }
      if (mapping?.credit_col) {
        const c = parseAmount(r[mapping.credit_col]);
        if (c !== null) totalCredits += c;
      }
    }
  }

  const calculatedClosing = openingBalance + totalCredits - totalDebits;
  const diff = Math.abs(calculatedClosing - closingBalance);

  // ±1 INR tolerance
  if (diff > 1.0) {
    return { warning: true, diff: Math.round(diff * 100) / 100 };
  }

  return { warning: false, diff: 0 };
}

// In-memory store for statement uploads and staged transactions for preview / local mode
let localUploadsStore: StatementUpload[] = [
  {
    id: 'up_hdfc_nov26_pdf',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    file_name: 'HDFC_Salary_Nov2026.pdf',
    file_hash: 'c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01234b',
    file_type: 'pdf',
    file_size_bytes: 142500,
    storage_path: 'default_owner/2026-11/1731000000-HDFC_Salary_Nov2026.pdf',
    parser_version: 'hdfc-pdf-v1',
    status: 'imported',
    row_count: 42,
    imported_count: 42,
    duplicate_count: 0,
    error_message: null,
    statement_period_start: '2026-11-01',
    statement_period_end: '2026-11-15',
    imported_at: '2026-11-16T09:00:00.000Z',
    created_at: '2026-11-16T08:55:00.000Z',
    updated_at: '2026-11-16T09:00:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
  },
  {
    id: 'up_hdfc_oct26',
    user_id: 'default_owner',
    account_id: 'acc_hdfc_01',
    file_name: 'HDFC_Oct2026_Statement.csv',
    file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    file_type: 'csv',
    file_size_bytes: 48200,
    storage_path: 'default_owner/2026-10/1729000000-HDFC_Oct2026_Statement.csv',
    parser_version: 'csv-generic-v1',
    status: 'imported',
    row_count: 38,
    imported_count: 38,
    duplicate_count: 0,
    error_message: null,
    statement_period_start: '2026-10-01',
    statement_period_end: '2026-10-31',
    imported_at: '2026-11-01T10:30:00.000Z',
    created_at: '2026-11-01T10:28:00.000Z',
    updated_at: '2026-11-01T10:30:00.000Z',
    account: {
      id: 'acc_hdfc_01',
      name: 'HDFC Main Savings',
      bank_name: 'HDFC Bank',
      account_number_last4: '4819',
    },
  },
  {
    id: 'up_sbi_sep26',
    user_id: 'default_owner',
    account_id: 'acc_sbi_02',
    file_name: 'SBI_Salary_Q2_2026.xlsx',
    file_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    file_type: 'xlsx',
    file_size_bytes: 92400,
    storage_path: 'default_owner/2026-09/1726000000-SBI_Salary_Q2_2026.xlsx',
    parser_version: 'xlsx-generic-v1',
    status: 'imported',
    row_count: 24,
    imported_count: 24,
    duplicate_count: 0,
    error_message: null,
    statement_period_start: '2026-07-01',
    statement_period_end: '2026-09-30',
    imported_at: '2026-10-02T14:15:00.000Z',
    created_at: '2026-10-02T14:12:00.000Z',
    updated_at: '2026-10-02T14:15:00.000Z',
    account: {
      id: 'acc_sbi_02',
      name: 'SBI Salary Account',
      bank_name: 'State Bank of India',
      account_number_last4: '9102',
    },
  },
  {
    id: 'up_kotak_nov26_rep',
    user_id: 'default_owner',
    account_id: 'acc_kotak_04',
    file_name: 'Kotak_Card_Cycle_Nov_v1.csv',
    file_hash: 'b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01a',
    file_type: 'csv',
    file_size_bytes: 28100,
    storage_path: 'default_owner/2026-11/1730000000-Kotak_Card_Cycle_Nov_v1.csv',
    parser_version: 'csv-generic-v1',
    status: 'replaced',
    row_count: 19,
    imported_count: 0,
    duplicate_count: 0,
    error_message: null,
    statement_period_start: '2026-10-01',
    statement_period_end: '2026-10-25',
    imported_at: null,
    created_at: '2026-11-04T08:00:00.000Z',
    updated_at: '2026-11-06T11:20:00.000Z',
    account: {
      id: 'acc_kotak_04',
      name: 'Kotak White Credit Card',
      bank_name: 'Kotak Mahindra Bank',
      account_number_last4: '7021',
    },
  },
];

let localStagedTransactionsStore: StagedTransaction[] = [
  {
    id: 'stg_1',
    user_id: 'default_owner',
    upload_id: 'up_hdfc_oct26',
    account_id: 'acc_hdfc_01',
    raw_date: '28/10/2026',
    txn_date: '2026-10-28',
    description: 'Swiggy Bangalore Delivery',
    raw_description: 'UPI/48291048/SWIGGY/BLR/FOOD',
    debit: 840.0,
    credit: null,
    balance: 485200.0,
    reference_number: 'UPI48291048',
    is_duplicate: false,
    duplicate_of_id: null,
    created_at: '2026-11-01T10:29:00.000Z',
  },
  {
    id: 'stg_2',
    user_id: 'default_owner',
    upload_id: 'up_hdfc_oct26',
    account_id: 'acc_hdfc_01',
    raw_date: '24/10/2026',
    txn_date: '2026-10-24',
    description: 'Client Consulting Retainer',
    raw_description: 'NEFT/N102934/APEXIND/CONSULT',
    debit: null,
    credit: 125000.0,
    balance: 486040.0,
    reference_number: 'NEFT102934',
    is_duplicate: false,
    duplicate_of_id: null,
    created_at: '2026-11-01T10:29:00.000Z',
  },
  {
    id: 'stg_3',
    user_id: 'default_owner',
    upload_id: 'up_hdfc_oct26',
    account_id: 'acc_hdfc_01',
    raw_date: '18/10/2026',
    txn_date: '2026-10-18',
    description: 'WeWork Coworking Office Rent',
    raw_description: 'UPI/48910293/WEWORK/RENT',
    debit: 32000.0,
    credit: null,
    balance: 361040.0,
    reference_number: 'UPI48910293',
    is_duplicate: false,
    duplicate_of_id: null,
    created_at: '2026-11-01T10:29:00.000Z',
  },
  {
    id: 'stg_4',
    user_id: 'default_owner',
    upload_id: 'up_hdfc_oct26',
    account_id: 'acc_hdfc_01',
    raw_date: '10/10/2026',
    txn_date: '2026-10-10',
    description: 'Transfer to Kotak Card Bill',
    raw_description: 'IMPS/KOTAKCC/BILLPAY/7021',
    debit: 45000.0,
    credit: null,
    balance: 393040.0,
    reference_number: 'IMPS702100',
    is_duplicate: false,
    duplicate_of_id: null,
    created_at: '2026-11-01T10:29:00.000Z',
  },
  {
    id: 'stg_5',
    user_id: 'default_owner',
    upload_id: 'up_hdfc_oct26',
    account_id: 'acc_hdfc_01',
    raw_date: '02/10/2026',
    txn_date: '2026-10-02',
    description: 'Apollo Pharmacy Medicines',
    raw_description: 'POS/APOLLO PHARMACY/MUMBAI',
    debit: 1420.0,
    credit: null,
    balance: 438040.0,
    reference_number: 'POS902341',
    is_duplicate: false,
    duplicate_of_id: null,
    created_at: '2026-11-01T10:29:00.000Z',
  },
];

// In-memory store for raw parsed rows per upload before column mapping confirmation
const localRawParsedRows = new Map<string, Array<Record<string, string>>>();

/**
 * Computes SHA-256 hash string of raw array buffer bytes
 */
export async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes date string into ISO YYYY-MM-DD
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY, etc.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  const trimmed = dateStr.trim();
  // Check if already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Native parse fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Cleans monetary numbers from formatted Indian string (e.g. "1,25,000.50", " ₹ 4,200.00 Cr")
 */
export function parseAmount(val: any): number | null {
  if (val === undefined || val === null) return null;
  const str = String(val).replace(/[^\d.-]/g, '').trim();
  if (!str) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * STEP 1-8: Full Statement Upload & Parsing Pipeline
 */
export async function processStatementUpload(
  file: File,
  accountId: string
): Promise<UploadApiResponse> {
  // STEP 1 — Authenticate
  const supabase = createClient();
  let userId = 'default_owner';
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // Sandbox preview mode
  }

  // STEP 2 — Validate File type and size
  const maxBytes = 20 * 1024 * 1024; // 20 MB
  if (file.size > maxBytes) {
    throw new Error('File exceeds maximum size of 20 MB.');
  }

  const fileNameLower = file.name.toLowerCase();
  let fileType: 'csv' | 'xlsx' | 'pdf' | null = null;
  if (fileNameLower.endsWith('.csv')) {
    fileType = 'csv';
  } else if (fileNameLower.endsWith('.xlsx')) {
    fileType = 'xlsx';
  } else if (fileNameLower.endsWith('.pdf')) {
    fileType = 'pdf';
  } else {
    throw new Error('Invalid file format. Supported statement exports: .csv, .xlsx, .pdf.');
  }

  // STEP 3 — Compute SHA-256 hash BEFORE any parsing
  const arrayBuffer = await file.arrayBuffer();
  const fileHash = await computeSHA256(arrayBuffer);

  // Check duplicate file hash for this user
  const duplicate = localUploadsStore.find(
    (u) => u.user_id === userId && u.file_hash === fileHash && u.status !== 'failed'
  );
  if (duplicate) {
    return {
      upload_id: duplicate.id,
      row_count: duplicate.row_count || 0,
      column_mapping: null,
      needs_mapping: false,
      headers: [],
      error: 'DUPLICATE_FILE',
      existing_upload_id: duplicate.id,
      file_type: duplicate.file_type,
    };
  }

  // STEP 4 — Upload to Supabase Storage path: {user_id}/{YYYY-MM}/{timestamp}-{sanitized-filename}
  const dateFolder = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${dateFolder}/${Date.now()}-${sanitizedName}`;

  try {
    await supabase.storage.from('statements').upload(storagePath, file, {
      upsert: false,
    });
  } catch {
    // Supabase storage fallback in dev / offline mode
  }

  // STEP 5 — Detect file type and run parser
  let parseResult: ParseResult;
  if (fileType === 'csv') {
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    parseResult = parseCSV(text);
  } else if (fileType === 'xlsx') {
    parseResult = parseXLSX(arrayBuffer);
  } else {
    // Batch 3b: PDF Parser Router (HDFC vs Generic)
    const pdfData = await extractPDFRawData(arrayBuffer);
    const firstPageText = pdfData.pages[0]?.fullText || pdfData.fullDocumentText;

    if (isHDFCStatement(firstPageText)) {
      parseResult = await parsePDFHDFC(arrayBuffer, pdfData);
    } else {
      parseResult = await parsePDFGeneric(arrayBuffer, pdfData);
    }
  }

  if (parseResult.rows.length === 0) {
    throw new Error('No transaction rows could be parsed from this file.');
  }

  // STEP 6 — Reconciliation check (tolerance: ±1 INR)
  const recon = checkReconciliation(
    parseResult.rows,
    parseResult.suggested_mapping,
    parseResult.opening_balance,
    parseResult.closing_balance
  );
  if (recon.warning) {
    parseResult.reconciliation_warning = true;
    parseResult.reconciliation_diff = recon.diff;
  }

  // Fetch account info
  const accounts = await getAccounts();
  const matchedAccount = accounts.find((a) => a.id === accountId);

  // STEP 7 — Create statement_uploads record
  const uploadId = `up_${Date.now()}`;
  const newUpload: StatementUpload = {
    id: uploadId,
    user_id: userId,
    account_id: accountId,
    file_name: file.name,
    file_hash: fileHash,
    file_type: fileType,
    file_size_bytes: file.size,
    storage_path: storagePath,
    parser_version: parseResult.parser_version,
    status: 'pending',
    row_count: parseResult.rows.length,
    imported_count: null,
    duplicate_count: 0,
    error_message: null,
    statement_period_start: null,
    statement_period_end: null,
    imported_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reconciliation_warning: parseResult.reconciliation_warning,
    reconciliation_diff: parseResult.reconciliation_diff,
    account: matchedAccount
      ? {
          id: matchedAccount.id,
          name: matchedAccount.name,
          bank_name: matchedAccount.bank_name,
          account_number_last4: matchedAccount.account_number_last4,
        }
      : undefined,
  };

  localUploadsStore.unshift(newUpload);

  // Store raw parsed rows in temporary cache for mapping wizard confirmation
  localRawParsedRows.set(uploadId, parseResult.rows);

  const needsMapping = parseResult.confidence !== 'high';

  return {
    upload_id: uploadId,
    row_count: parseResult.rows.length,
    column_mapping: parseResult.suggested_mapping || null,
    needs_mapping: needsMapping,
    headers: parseResult.headers,
    detected_bank: parseResult.detected_bank,
    sample_rows: parseResult.rows.slice(0, 5),
    file_type: fileType,
    reconciliation_warning: parseResult.reconciliation_warning,
    reconciliation_diff: parseResult.reconciliation_diff,
  };
}

/**
 * STEP 8 & CONFIRMATION:
 * Applies the confirmed column mapping, transforms raw parsed rows into
 * normalized staged_transactions, calculates statement period, and advances status to 'review'.
 */
export async function confirmMappingAndStaging(
  uploadId: string,
  mapping: ColumnMapping,
  skipBalance: boolean = false
): Promise<{ success: boolean; staged_count: number; date_start?: string; date_end?: string }> {
  const upload = localUploadsStore.find((u) => u.id === uploadId);
  if (!upload) throw new Error('Upload record not found.');

  const rawRows = localRawParsedRows.get(uploadId) || [];
  if (rawRows.length === 0) {
    throw new Error('No raw rows available for this upload. Please re-upload.');
  }

  const stagedRows: StagedTransaction[] = [];
  let minDate = '';
  let maxDate = '';

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rawDate = mapping.date_col ? r[mapping.date_col] : null;
    const txnDate = normalizeDate(rawDate || '');
    const description = (mapping.description_col ? r[mapping.description_col] : '') || 'Transaction';
    const reference = mapping.reference_col ? r[mapping.reference_col] : null;

    let debit: number | null = null;
    let credit: number | null = null;

    if (mapping.is_single_amount_col && mapping.amount_col) {
      const amt = parseAmount(r[mapping.amount_col]);
      if (amt !== null) {
        if (amt < 0) {
          debit = Math.abs(amt);
        } else {
          credit = amt;
        }
      }
    } else {
      if (mapping.debit_col) debit = parseAmount(r[mapping.debit_col]);
      if (mapping.credit_col) credit = parseAmount(r[mapping.credit_col]);
    }

    const balance = !skipBalance && mapping.balance_col ? parseAmount(r[mapping.balance_col]) : null;

    // Track min / max dates for statement period
    if (txnDate) {
      if (!minDate || txnDate < minDate) minDate = txnDate;
      if (!maxDate || txnDate > maxDate) maxDate = txnDate;
    }

    stagedRows.push({
      id: `stg_${Date.now()}_${i}`,
      user_id: upload.user_id,
      upload_id: upload.id,
      account_id: upload.account_id,
      raw_date: rawDate,
      txn_date: txnDate,
      description: description.trim(),
      raw_description: description.trim(),
      debit,
      credit,
      balance,
      reference_number: reference?.trim() || null,
      is_duplicate: false,
      duplicate_of_id: null,
      created_at: new Date().toISOString(),
    });
  }

  // Remove any previous staged rows for this upload and push new
  localStagedTransactionsStore = localStagedTransactionsStore.filter((s) => s.upload_id !== uploadId);
  localStagedTransactionsStore.push(...stagedRows);

  // Update statement upload record
  upload.status = 'review';
  upload.row_count = stagedRows.length;
  upload.statement_period_start = minDate || null;
  upload.statement_period_end = maxDate || null;
  upload.updated_at = new Date().toISOString();

  return {
    success: true,
    staged_count: stagedRows.length,
    date_start: minDate,
    date_end: maxDate,
  };
}

/**
 * Checks if the statement date range overlaps by >50% with an existing imported upload
 * for the same account (Deliverable 8).
 */
export function checkDateOverlap(
  accountId: string,
  newStart?: string | null,
  newEnd?: string | null,
  excludeUploadId?: string
): OverlapCheckResult {
  if (!newStart || !newEnd) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  const newStartMs = new Date(newStart).getTime();
  const newEndMs = new Date(newEnd).getTime();
  const newDuration = Math.max(newEndMs - newStartMs, 86400000); // at least 1 day

  for (const existing of localUploadsStore) {
    if (existing.id === excludeUploadId) continue;
    if (existing.account_id !== accountId) continue;
    if (existing.status !== 'imported' && existing.status !== 'review') continue;
    if (!existing.statement_period_start || !existing.statement_period_end) continue;

    const existStartMs = new Date(existing.statement_period_start).getTime();
    const existEndMs = new Date(existing.statement_period_end).getTime();

    // Calculate overlap window
    const overlapStart = Math.max(newStartMs, existStartMs);
    const overlapEnd = Math.min(newEndMs, existEndMs);

    if (overlapEnd > overlapStart) {
      const overlapDuration = overlapEnd - overlapStart;
      const percentage = Math.round((overlapDuration / newDuration) * 100);

      if (percentage >= 50) {
        return {
          has_overlap: true,
          overlapping_upload_id: existing.id,
          overlapping_file_name: existing.file_name,
          overlapping_date: existing.imported_at
            ? new Date(existing.imported_at).toLocaleDateString('en-IN')
            : new Date(existing.created_at).toLocaleDateString('en-IN'),
          overlap_percentage: percentage,
          overlapping_row_count: existing.row_count || 0,
          overlapping_file_type: existing.file_type,
        };
      }
    }
  }

  return { has_overlap: false, overlap_percentage: 0 };
}

/**
 * Get all statement uploads for current user
 */
export async function getUploads(): Promise<StatementUpload[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('statement_uploads')
        .select('*, accounts(id, name, bank_name, account_number_last4)')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          ...d,
          account: d.accounts,
        }));
      }
    }
  } catch {
    // Return local store
  }

  return [...localUploadsStore];
}

/**
 * Get single upload details and staged transactions
 */
export async function getUploadDetails(uploadId: string): Promise<{
  upload: StatementUpload | null;
  transactions: StagedTransaction[];
}> {
  const upload = localUploadsStore.find((u) => u.id === uploadId) || null;
  const transactions = localStagedTransactionsStore.filter((t) => t.upload_id === uploadId);

  return {
    upload: upload ? { ...upload } : null,
    transactions: [...transactions],
  };
}

/**
 * Finalizes import:
 * In Batch 3a, sets status to 'review' or 'imported'.
 * If replacePreviousId is provided, marks previous upload as 'replaced'.
 */
export async function finalizeImport(
  uploadId: string,
  replacePreviousId?: string
): Promise<{ success: boolean; upload: StatementUpload }> {
  const upload = localUploadsStore.find((u) => u.id === uploadId);
  if (!upload) throw new Error('Upload not found.');

  if (replacePreviousId) {
    const prev = localUploadsStore.find((u) => u.id === replacePreviousId);
    if (prev) {
      prev.status = 'replaced';
      prev.updated_at = new Date().toISOString();
    }
  }

  upload.status = 'imported';
  upload.imported_at = new Date().toISOString();
  upload.imported_count = upload.row_count || 0;
  upload.updated_at = new Date().toISOString();

  return { success: true, upload: { ...upload } };
}

/**
 * Cancels upload: deletes staged transactions and marks status as 'failed'
 */
export async function cancelUpload(uploadId: string): Promise<{ success: boolean }> {
  localStagedTransactionsStore = localStagedTransactionsStore.filter((t) => t.upload_id !== uploadId);
  localRawParsedRows.delete(uploadId);

  const upload = localUploadsStore.find((u) => u.id === uploadId);
  if (upload) {
    upload.status = 'failed';
    upload.error_message = 'Upload cancelled by user.';
    upload.updated_at = new Date().toISOString();
  }

  return { success: true };
}
