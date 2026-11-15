import { createClient } from '../supabase/client';
import type {
  StatementUpload,
  StagedTransaction,
  ColumnMapping,
  ParseResult,
  UploadApiResponse,
  OverlapCheckResult,
} from '../../types/uploads';
import { parseStatementCSV, parseStatementPDF } from '../parsers';
import { parseXLSX } from '../parsers/xlsx';

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

  if (diff > 1.0) {
    return { warning: true, diff: Math.round(diff * 100) / 100 };
  }

  return { warning: false, diff: 0 };
}

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

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
  accountId: string,
  client?: any
): Promise<UploadApiResponse> {
  // STEP 1 — Authenticate
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
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
  const dateFolder = new Date().toISOString().slice(0, 7);
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedName}`;

  const { error: storageError } = await supabase.storage
    .from('statements')
    .upload(storagePath, file, {
      upsert: false,
    });

  if (storageError) {
    console.warn('Storage upload notice:', storageError.message);
  }

  // STEP 5 — Detect file type and run parser
  let parseResult: ParseResult;
  if (fileType === 'csv') {
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    parseResult = await parseStatementCSV(text);
  } else if (fileType === 'xlsx') {
    parseResult = parseXLSX(arrayBuffer);
  } else {
    parseResult = await parseStatementPDF(arrayBuffer);
  }

  if (parseResult.rows.length === 0) {
    throw new Error(parseResult.parseError || 'No transaction rows could be parsed from this file.');
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

  // STEP 7 — Create statement_uploads record
  const { data: newUploadRecord, error: dbError } = await supabase
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
    })
    .select()
    .single();

  if (dbError || !newUploadRecord) {
    throw new Error(dbError?.message || 'Failed to create statement upload record.');
  }

  // STEP 8 — Stage raw parsed rows into staged_transactions (raw JSON stored in raw_description)
  const columnMapping = parseResult.suggested_mapping || null;
  const stagedPayload = parseResult.rows.map((row) => {
    const rawDate = columnMapping?.date_col ? row[columnMapping.date_col] : null;
    return {
      user_id: user.id,
      upload_id: newUploadRecord.id,
      account_id: accountId,
      raw_date: rawDate,
      txn_date: normalizeDate(rawDate || ''),
      description:
        (columnMapping?.description_col ? row[columnMapping.description_col] : null)?.trim() ||
        'Pending Mapping',
      raw_description: JSON.stringify(row),
      is_duplicate: false,
    };
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < stagedPayload.length; i += CHUNK_SIZE) {
    const chunk = stagedPayload.slice(i, i + CHUNK_SIZE);
    const { error: stageError } = await supabase.from('staged_transactions').insert(chunk);
    if (stageError) {
      throw new Error(`Failed to stage parsed transactions: ${stageError.message}`);
    }
  }

  const needsMapping = parseResult.confidence !== 'high';

  return {
    upload_id: newUploadRecord.id,
    row_count: parseResult.rows.length,
    column_mapping: columnMapping,
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
  skipBalance: boolean = false,
  client?: any
): Promise<{ success: boolean; staged_count: number; date_start?: string; date_end?: string }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: upload, error: uploadErr } = await supabase
    .from('statement_uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (uploadErr || !upload) {
    throw new Error('Upload record not found.');
  }

  const { data: existingStaged, error: stagedFetchErr } = await supabase
    .from('staged_transactions')
    .select('*')
    .eq('upload_id', uploadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (stagedFetchErr || !existingStaged || existingStaged.length === 0) {
    throw new Error('No raw rows available for this upload. Please re-upload.');
  }

  const mappedRows: Array<{
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
    is_duplicate: boolean;
    duplicate_of_id: null;
  }> = [];

  let minDate = '';
  let maxDate = '';

  for (const existing of existingStaged) {
    let rawRow: Record<string, string> | null = null;
    if (existing.raw_description) {
      try {
        const parsed = JSON.parse(existing.raw_description);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          rawRow = parsed;
        }
      } catch {
        rawRow = null;
      }
    }

    if (!rawRow) {
      // Already mapped earlier without JSON raw payload
      const txnDate = existing.txn_date;
      if (txnDate) {
        if (!minDate || txnDate < minDate) minDate = txnDate;
        if (!maxDate || txnDate > maxDate) maxDate = txnDate;
      }
      mappedRows.push({
        user_id: user.id,
        upload_id: upload.id,
        account_id: upload.account_id,
        raw_date: existing.raw_date,
        txn_date: txnDate,
        description: existing.description || 'Transaction',
        raw_description: existing.raw_description || existing.description,
        debit: existing.debit !== null ? Number(existing.debit) : null,
        credit: existing.credit !== null ? Number(existing.credit) : null,
        balance: skipBalance ? null : existing.balance !== null ? Number(existing.balance) : null,
        reference_number: existing.reference_number || null,
        is_duplicate: false,
        duplicate_of_id: null,
      });
      continue;
    }

    const rawDate = mapping.date_col ? rawRow[mapping.date_col] || null : existing.raw_date;
    const txnDate = normalizeDate(rawDate || '');
    const rawDescStr = mapping.description_col ? rawRow[mapping.description_col] || '' : '';
    const description = (rawDescStr || existing.description || 'Transaction').trim();
    const reference = mapping.reference_col ? rawRow[mapping.reference_col] : null;

    let debit: number | null = null;
    let credit: number | null = null;

    if (mapping.is_single_amount_col && mapping.amount_col) {
      const amt = parseAmount(rawRow[mapping.amount_col]);
      if (amt !== null) {
        if (amt < 0) debit = Math.abs(amt);
        else credit = amt;
      }
    } else {
      if (mapping.debit_col) debit = parseAmount(rawRow[mapping.debit_col]);
      if (mapping.credit_col) credit = parseAmount(rawRow[mapping.credit_col]);
    }

    const balance =
      !skipBalance && mapping.balance_col ? parseAmount(rawRow[mapping.balance_col]) : null;

    if (txnDate) {
      if (!minDate || txnDate < minDate) minDate = txnDate;
      if (!maxDate || txnDate > maxDate) maxDate = txnDate;
    }

    const baseRawDesc = rawDescStr.trim() || description;
    const paytmNotes = typeof rawRow['Notes & Tags'] === 'string' ? rawRow['Notes & Tags'].trim() : '';
    const preservedRawDesc =
      paytmNotes && !baseRawDesc.includes(paytmNotes)
        ? `${baseRawDesc} | ${paytmNotes}`
        : baseRawDesc;

    mappedRows.push({
      user_id: user.id,
      upload_id: upload.id,
      account_id: upload.account_id,
      raw_date: rawDate,
      txn_date: txnDate,
      description,
      raw_description: preservedRawDesc,
      debit,
      credit,
      balance,
      reference_number: reference?.trim() || null,
      is_duplicate: false,
      duplicate_of_id: null,
    });
  }

  // Replace preliminary staged rows with normalized staged rows
  const { error: delError } = await supabase
    .from('staged_transactions')
    .delete()
    .eq('upload_id', uploadId)
    .eq('user_id', user.id);

  if (delError) {
    throw new Error(`Failed to reset staged transactions: ${delError.message}`);
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
    const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
    const { error: insError } = await supabase.from('staged_transactions').insert(chunk);
    if (insError) {
      throw new Error(`Failed to insert mapped staged transactions: ${insError.message}`);
    }
  }

  const { error: updateErr } = await supabase
    .from('statement_uploads')
    .update({
      status: 'review',
      row_count: mappedRows.length,
      statement_period_start: minDate || null,
      statement_period_end: maxDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uploadId)
    .eq('user_id', user.id);

  if (updateErr) {
    throw new Error(`Failed to update upload status: ${updateErr.message}`);
  }

  return {
    success: true,
    staged_count: mappedRows.length,
    date_start: minDate,
    date_end: maxDate,
  };
}

/**
 * Checks if the statement date range overlaps by >=50% with an existing imported upload
 * for the same account.
 */
export async function checkDateOverlap(
  accountId: string,
  newStart?: string | null,
  newEnd?: string | null,
  excludeUploadId?: string,
  client?: any
): Promise<OverlapCheckResult> {
  if (!newStart || !newEnd) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  let query = supabase
    .from('statement_uploads')
    .select('*')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .in('status', ['imported', 'review']);

  if (excludeUploadId) {
    query = query.neq('id', excludeUploadId);
  }

  const { data: existingUploads, error } = await query;
  if (error || !existingUploads) {
    return { has_overlap: false, overlap_percentage: 0 };
  }

  const newStartMs = new Date(newStart).getTime();
  const newEndMs = new Date(newEnd).getTime();
  const newDuration = Math.max(newEndMs - newStartMs, 86400000);

  for (const existing of existingUploads as StatementUpload[]) {
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

/**
 * Get all statement uploads for current user
 */
export async function getUploads(client?: any): Promise<StatementUpload[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('statement_uploads')
    .select('*, accounts(id, name, bank_name, account_number_last4)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Error fetching uploads:', error?.message);
    return [];
  }

  return data.map((d: any) => ({
    ...d,
    account: d.accounts || undefined,
  }));
}

/**
 * Get single upload details and staged transactions
 */
export async function getUploadDetails(
  uploadId: string,
  client?: any
): Promise<{
  upload: StatementUpload | null;
  transactions: StagedTransaction[];
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { upload: null, transactions: [] };
  }

  const [{ data: uploadData }, { data: stagedData }] = await Promise.all([
    supabase
      .from('statement_uploads')
      .select('*, accounts(id, name, bank_name, account_number_last4)')
      .eq('id', uploadId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('staged_transactions')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('user_id', user.id)
      .order('txn_date', { ascending: false }),
  ]);

  return {
    upload: uploadData
      ? {
          ...uploadData,
          account: uploadData.accounts || undefined,
        }
      : null,
    transactions: (stagedData || []).map((t: any) => ({
      ...t,
      debit: t.debit !== null ? Number(t.debit) : null,
      credit: t.credit !== null ? Number(t.credit) : null,
      balance: t.balance !== null ? Number(t.balance) : null,
    })),
  };
}

/**
 * Finalizes import (Batch 4):
 * Commits staged transactions through the multiset dedup, rules engine, transfer
 * detection, batch insert, and audit logging pipeline.
 */
export async function finalizeImport(
  uploadId: string,
  replacePreviousId?: string,
  client?: any,
  aiEnabledOverride?: boolean
): Promise<{ success: boolean; upload: StatementUpload; result?: any }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { commitUploadTransactions } = await import('./transactions');
  const commitResult = await commitUploadTransactions(
    uploadId,
    replacePreviousId,
    supabase,
    aiEnabledOverride
  );

  const { upload } = await getUploadDetails(uploadId, supabase);
  if (!upload) {
    throw new Error('Upload not found.');
  }

  return { success: true, upload, result: commitResult };
}

/**
 * Cancels upload: deletes staged transactions and marks status as 'failed'
 */
export async function cancelUpload(
  uploadId: string,
  client?: any
): Promise<{ success: boolean }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  await supabase
    .from('staged_transactions')
    .delete()
    .eq('upload_id', uploadId)
    .eq('user_id', user.id);

  const { error } = await supabase
    .from('statement_uploads')
    .update({
      status: 'failed',
      error_message: 'Upload cancelled by user.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', uploadId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
