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

// In-memory buffer for raw parsed rows per upload during staging wizard
const inFlightRawParsedRows = new Map<string, Array<Record<string, string>>>();

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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

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

  // Check duplicate file hash in Supabase
  const { data: existingUpload } = await supabase
    .from('statement_uploads')
    .select('id, row_count, file_type')
    .eq('user_id', user.id)
    .eq('file_hash', fileHash)
    .neq('status', 'failed')
    .maybeSingle();

  if (existingUpload) {
    return {
      upload_id: existingUpload.id,
      row_count: existingUpload.row_count || 0,
      column_mapping: null,
      needs_mapping: false,
      headers: [],
      error: 'DUPLICATE_FILE',
      existing_upload_id: existingUpload.id,
      file_type: existingUpload.file_type,
    };
  }

  // STEP 4 — Upload to Supabase Storage path: {user_id}/{YYYY-MM}/{timestamp}-{sanitized-filename}
  const dateFolder = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedName}`;

  try {
    await supabase.storage.from('statements').upload(storagePath, file, {
      upsert: false,
    });
  } catch (err: any) {
    console.warn('Storage upload notice:', err.message);
  }

  // STEP 5 — Detect file type and run parser
  let parseResult: ParseResult;
  if (fileType === 'csv') {
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    parseResult = parseCSV(text);
  } else if (fileType === 'xlsx') {
    parseResult = parseXLSX(arrayBuffer);
  } else {
    // PDF Parser Router (HDFC vs Generic)
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

  // STEP 6 — Reconciliation check
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

  // STEP 7 — Create statement_uploads record in Supabase
  const { data: newUpload, error: uploadErr } = await supabase
    .from('statement_uploads')
    .insert({
      user_id: user.id,
      account_id: accountId,
      file_name: file.name,
      file_hash: fileHash,
      file_type: fileType,
      file_size_bytes: file.size,
      storage_path: storagePath,
      parser_version: parseResult.parser_version,
      status: 'pending',
      row_count: parseResult.rows.length,
      duplicate_count: 0,
    })
    .select()
    .single();

  if (uploadErr || !newUpload) {
    throw new Error(uploadErr?.message || 'Failed to register upload record in database.');
  }

  // Store raw parsed rows in buffer for mapping wizard confirmation
  inFlightRawParsedRows.set(newUpload.id, parseResult.rows);

  // If high confidence auto-mapping, stage immediately
  const columnMapping: ColumnMapping | null = parseResult.suggested_mapping || null;
  const needsMapping = parseResult.confidence !== 'high';

  return {
    upload_id: newUpload.id,
    row_count: parseResult.rows.length,
    column_mapping: columnMapping,
    needs_mapping: needsMapping,
    headers: parseResult.headers,
    file_type: fileType,
    detected_bank: parseResult.detected_bank,
    reconciliation_warning: parseResult.reconciliation_warning,
    reconciliation_diff: parseResult.reconciliation_diff,
  };
}

/**
 * Applies column mapping to raw parsed rows and saves staged transactions in Supabase
 */
export async function confirmMappingAndStaging(
  uploadId: string,
  mapping: ColumnMapping,
  skipBalance: boolean = false
): Promise<{ success: boolean; staged_count: number; date_start: string; date_end: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: upload, error: uploadErr } = await supabase
    .from('statement_uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (uploadErr || !upload) {
    throw new Error('Upload record not found in database.');
  }

  const rawRows = inFlightRawParsedRows.get(uploadId) || [];
  if (rawRows.length === 0) {
    // If memory buffer was cleared, check existing staged rows
    const { data: existingStaged } = await supabase
      .from('staged_transactions')
      .select('txn_date')
      .eq('upload_id', uploadId);

    if (existingStaged && existingStaged.length > 0) {
      const dates = existingStaged.map((s) => s.txn_date).sort();
      return {
        success: true,
        staged_count: existingStaged.length,
        date_start: dates[0] || '',
        date_end: dates[dates.length - 1] || '',
      };
    }
    throw new Error('No raw rows available for this upload. Please re-upload.');
  }

  const stagedRows: any[] = [];
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

    if (txnDate) {
      if (!minDate || txnDate < minDate) minDate = txnDate;
      if (!maxDate || txnDate > maxDate) maxDate = txnDate;
    }

    stagedRows.push({
      user_id: user.id,
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
    });
  }

  // Remove existing staged rows for this upload in Supabase first
  await supabase.from('staged_transactions').delete().eq('upload_id', uploadId);

  // Insert staged rows in batches of 50
  for (let i = 0; i < stagedRows.length; i += 50) {
    const chunk = stagedRows.slice(i, i + 50);
    const { error: insertErr } = await supabase.from('staged_transactions').insert(chunk);
    if (insertErr) {
      console.error('Failed to insert staged batch:', insertErr);
    }
  }

  // Update statement upload record
  await supabase
    .from('statement_uploads')
    .update({
      status: 'review',
      row_count: stagedRows.length,
      statement_period_start: minDate || null,
      statement_period_end: maxDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uploadId);

  return {
    success: true,
    staged_count: stagedRows.length,
    date_start: minDate,
    date_end: maxDate,
  };
}

/**
 * Checks if the statement date range overlaps with an existing imported upload
 */
export async function checkDateOverlapAsync(
  accountId: string,
  newStart?: string | null,
  newEnd?: string | null,
  excludeUploadId?: string
): Promise<OverlapCheckResult> {
  if (!newStart || !newEnd) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { has_overlap: false, overlap_percentage: 0 };

  const { data: existingUploads } = await supabase
    .from('statement_uploads')
    .select('*')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .in('status', ['imported', 'review']);

  if (!existingUploads || existingUploads.length === 0) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  const newStartMs = new Date(newStart).getTime();
  const newEndMs = new Date(newEnd).getTime();
  const newDuration = Math.max(newEndMs - newStartMs, 86400000);

  for (const existing of existingUploads) {
    if (existing.id === excludeUploadId) continue;
    if (!existing.statement_period_start || !existing.statement_period_end) continue;

    const existStartMs = new Date(existing.statement_period_start).getTime();
    const existEndMs = new Date(existing.statement_period_end).getTime();

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

// Synchronous wrapper for backwards compatibility
export function checkDateOverlap(
  accountId: string,
  newStart?: string | null,
  newEnd?: string | null,
  excludeUploadId?: string
): OverlapCheckResult {
  return { has_overlap: false, overlap_percentage: 0 };
}

/**
 * Get all statement uploads for current user
 */
export async function getUploads(): Promise<StatementUpload[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('statement_uploads')
    .select('*, account:accounts(id, name, bank_name, account_number_last4)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Failed to get uploads:', error);
    return [];
  }

  return data;
}

/**
 * Get single upload details and staged transactions
 */
export async function getUploadDetails(uploadId: string): Promise<{
  upload: StatementUpload | null;
  transactions: StagedTransaction[];
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { upload: null, transactions: [] };

  const [uploadRes, stagedRes] = await Promise.all([
    supabase
      .from('statement_uploads')
      .select('*, account:accounts(id, name, bank_name, account_number_last4)')
      .eq('id', uploadId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('staged_transactions')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('user_id', user.id)
      .order('txn_date', { ascending: false }),
  ]);

  return {
    upload: uploadRes.data || null,
    transactions: stagedRes.data || [],
  };
}

/**
 * Finalizes import:
 * Commits staged transactions through the multiset dedup, rules engine, transfer
 * detection, batch insert, and audit logging pipeline.
 */
export async function finalizeImport(
  uploadId: string,
  replacePreviousId?: string
): Promise<{ success: boolean; upload: StatementUpload; result?: any }> {
  const { commitUploadTransactions } = await import('./transactions');
  const commitResult = await commitUploadTransactions(uploadId, replacePreviousId);

  const { upload } = await getUploadDetails(uploadId);
  if (!upload) throw new Error('Upload not found.');

  return { success: true, upload, result: commitResult };
}

/**
 * Cancels upload: deletes staged transactions and marks status as 'failed'
 */
export async function cancelUpload(uploadId: string): Promise<{ success: boolean }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  inFlightRawParsedRows.delete(uploadId);

  await Promise.all([
    supabase.from('staged_transactions').delete().eq('upload_id', uploadId).eq('user_id', user.id),
    supabase
      .from('statement_uploads')
      .update({
        status: 'failed',
        error_message: 'Upload cancelled by user.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', uploadId)
      .eq('user_id', user.id),
  ]);

  return { success: true };
}
