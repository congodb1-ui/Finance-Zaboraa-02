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
import { extractCrossSourceRefs, normalizeReferenceNumber } from '../parsers/utils';

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

import { parseIndianDate } from '../parsers/utils';

/**
 * Normalizes date string into ISO YYYY-MM-DD
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY, etc.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  const parsed = parseIndianDate(dateStr);
  if (parsed) return parsed;

  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
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
  clientOrPassword?: any,
  maybePassword?: string
): Promise<UploadApiResponse> {
  let client: any = undefined;
  let password: string | undefined = undefined;

  if (typeof clientOrPassword === 'string') {
    password = clientOrPassword;
  } else if (
    clientOrPassword &&
    typeof clientOrPassword === 'object' &&
    ('auth' in clientOrPassword || 'from' in clientOrPassword)
  ) {
    client = clientOrPassword;
    password = maybePassword;
  } else if (
    clientOrPassword &&
    typeof clientOrPassword === 'object' &&
    'password' in clientOrPassword
  ) {
    client = clientOrPassword.client;
    password = clientOrPassword.password;
  }

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
    .select('id, row_count, file_type, status')
    .eq('user_id', user.id)
    .eq('file_hash', fileHash)
    .maybeSingle();

  if (existingUpload) {
    if (existingUpload.status === 'completed' || existingUpload.status === 'imported') {
      return {
        upload_id: existingUpload.id,
        row_count: existingUpload.row_count || 0,
        column_mapping: null,
        needs_mapping: false,
        headers: [],
        error: 'DUPLICATE_FILE',
        needs_resume: false,
        existing_upload_id: existingUpload.id,
        existing_status: existingUpload.status,
        file_type: existingUpload.file_type,
      };
    } else {
      return {
        upload_id: existingUpload.id,
        row_count: existingUpload.row_count || 0,
        column_mapping: null,
        needs_mapping: false,
        headers: [],
        error: 'UNFINISHED_UPLOAD',
        needs_resume: true,
        existing_upload_id: existingUpload.id,
        existing_status: existingUpload.status,
        file_type: existingUpload.file_type,
      };
    }
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

  // STEP 5 — Detect file type and run parser BEFORE creating any statement_uploads DB record
  let parseResult: ParseResult;
  try {
    if (fileType === 'csv') {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      parseResult = await parseStatementCSV(text);
    } else if (fileType === 'xlsx') {
      parseResult = parseXLSX(arrayBuffer);
    } else {
      parseResult = await parseStatementPDF(arrayBuffer, { password });
    }
  } catch (err: any) {
    // If storage upload occurred, attempt clean cleanup
    await supabase.storage.from('statements').remove([storagePath]).catch(() => {});
    throw err;
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
      statement_period_start: parseResult.statement_period_start
        ? normalizeDate(parseResult.statement_period_start)
        : null,
      statement_period_end: parseResult.statement_period_end
        ? normalizeDate(parseResult.statement_period_end)
        : null,
    })
    .select()
    .single();

  if (dbError || !newUploadRecord) {
    throw new Error(dbError?.message || 'Failed to create statement upload record.');
  }

  // STEP 8 — Stage raw parsed rows into staged_transactions (raw JSON stored in raw_description)
  const columnMapping = parseResult.suggested_mapping || null;
  const stagedPayload = parseResult.rows.map((row, idx) => {
    const parsedTx = parseResult.transactions?.[idx];
    const rawDate = columnMapping?.date_col ? row[columnMapping.date_col] : parsedTx?.txn_date || null;
    const desc =
      parsedTx?.description?.trim() ||
      (columnMapping?.description_col ? row[columnMapping.description_col] : null)?.trim() ||
      'Pending Mapping';
    const rawRef =
      parsedTx?.reference_number ||
      (columnMapping?.reference_col ? row[columnMapping.reference_col] : null) ||
      null;
    const refNo = normalizeReferenceNumber(rawRef) || rawRef?.trim() || null;
    const rawNarration = (parsedTx?.raw_description || row['Raw Narration'] || '').trim();
    const enrichedRow =
      rawNarration && !row['Raw Narration']
        ? { ...row, 'Raw Narration': rawNarration }
        : row;
    const rawJson = JSON.stringify(enrichedRow);
    const { upi_ref_no, imps_ref_no } = extractCrossSourceRefs({
      parserVersion: parseResult.parser_version,
      description: desc,
      rawDescription: rawJson,
      referenceNumber: refNo,
      rawNarration,
    });

    return {
      user_id: user.id,
      upload_id: newUploadRecord.id,
      account_id: accountId,
      raw_date: rawDate,
      txn_date: normalizeDate(rawDate || ''),
      description: desc,
      raw_description: rawJson,
      reference_number: refNo,
      upi_ref_no: parsedTx?.upi_ref_no || upi_ref_no,
      imps_ref_no: parsedTx?.imps_ref_no || imps_ref_no,
      source: 'statement_import' as const,
      is_duplicate: false,
    };
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < stagedPayload.length; i += CHUNK_SIZE) {
    const chunk = stagedPayload.slice(i, i + CHUNK_SIZE);
    const { error: stageError } = await supabase.from('staged_transactions').insert(chunk);
    if (stageError) {
      // Delete upload record on staging error so no stuck import row is left
      await supabase.from('statement_uploads').delete().eq('id', newUploadRecord.id).catch(() => {});
      await supabase.storage.from('statements').remove([storagePath]).catch(() => {});
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
    detected_account_last4: parseResult.detected_account_last4 ?? null,
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
    upi_ref_no: string | null;
    imps_ref_no: string | null;
    source: 'statement_import';
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
      const existingRef = existing.reference_number || null;
      const { upi_ref_no, imps_ref_no } = extractCrossSourceRefs({
        parserVersion: upload.parser_version,
        description: existing.description || 'Transaction',
        rawDescription: existing.raw_description || existing.description,
        referenceNumber: existingRef,
      });

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
        reference_number: existingRef,
        upi_ref_no: existing.upi_ref_no || upi_ref_no,
        imps_ref_no: existing.imps_ref_no || imps_ref_no,
        source: 'statement_import',
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

    const rawNarrationStr =
      typeof rawRow['Raw Narration'] === 'string' ? rawRow['Raw Narration'].trim() : '';
    const baseRawDesc = rawNarrationStr || rawDescStr.trim() || description;
    const paytmNotes = typeof rawRow['Notes & Tags'] === 'string' ? rawRow['Notes & Tags'].trim() : '';
    const preservedRawDesc =
      paytmNotes && !baseRawDesc.includes(paytmNotes)
        ? `${baseRawDesc} | ${paytmNotes}`
        : baseRawDesc;

    const cleanRef =
      normalizeReferenceNumber(reference) ||
      normalizeReferenceNumber(existing.reference_number) ||
      reference?.trim() ||
      existing.reference_number ||
      null;
    const { upi_ref_no, imps_ref_no } = extractCrossSourceRefs({
      parserVersion: upload.parser_version,
      description,
      rawDescription: `${preservedRawDesc} ${JSON.stringify(rawRow)}`,
      referenceNumber: cleanRef,
      rawNarration: rawNarrationStr || undefined,
    });

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
      reference_number: cleanRef,
      upi_ref_no: existing.upi_ref_no || upi_ref_no,
      imps_ref_no: existing.imps_ref_no || imps_ref_no,
      source: 'statement_import',
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
/**
 * Recalculate account balance from opening_balance and sum of transactions
 */
export async function syncAccountBalance(accountId: string, client?: any): Promise<number> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !accountId) return 0;

  const [{ data: acc }, { data: txns }] = await Promise.all([
    supabase.from('accounts').select('opening_balance').eq('id', accountId).eq('user_id', user.id).maybeSingle(),
    supabase.from('transactions').select('debit, credit').eq('account_id', accountId).eq('user_id', user.id),
  ]);

  const openBal = Number(acc?.opening_balance ?? 0);
  let delta = 0;
  if (txns) {
    for (const tx of txns) {
      delta += Number(tx.credit ?? 0) - Number(tx.debit ?? 0);
    }
  }
  const newBal = Math.round((openBal + delta) * 100) / 100;

  await supabase
    .from('accounts')
    .update({ current_balance: newBal, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', user.id);

  return newBal;
}

export interface UpdateUploadDetailsInput {
  account_id?: string;
  bank_name?: string;
  statement_period_start?: string | null;
  statement_period_end?: string | null;
  file_label?: string | null;
}

/**
 * Edit upload details (Batch 3 fix):
 * Allows re-mapping statement to another account, updating bank name, period dates, or nickname.
 */
export async function updateUploadDetails(
  uploadId: string,
  updates: UpdateUploadDetailsInput,
  client?: any
): Promise<{ success: boolean; upload: StatementUpload }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // 1. Fetch current upload
  const { data: oldUpload, error: fetchErr } = await supabase
    .from('statement_uploads')
    .select('*')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !oldUpload) {
    throw new Error('Upload record not found or access denied.');
  }

  const oldAccountId = oldUpload.account_id;
  const newAccountId = updates.account_id || oldAccountId;

  // 2. Validate new account belongs to user if changed
  if (newAccountId && newAccountId !== oldAccountId) {
    const { data: targetAccount, error: accErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', newAccountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accErr || !targetAccount) {
      throw new Error('Target account not found or access denied.');
    }
  }

  // 3. Prepare payload for statement_uploads (only updating confirmed DB columns)
  const uploadPayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.account_id) uploadPayload.account_id = updates.account_id;
  if (updates.statement_period_start !== undefined) uploadPayload.statement_period_start = updates.statement_period_start;
  if (updates.statement_period_end !== undefined) uploadPayload.statement_period_end = updates.statement_period_end;

  let { data: updatedUpload, error: upErr } = await supabase
    .from('statement_uploads')
    .update(uploadPayload)
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .select('*, accounts(id, name, bank_name, account_number_last4)')
    .single();

  if (upErr || !updatedUpload) {
    throw new Error(upErr?.message || 'Failed to update statement upload.');
  }

  // 4. If account_id changed, move transactions / staged transactions
  if (newAccountId && newAccountId !== oldAccountId) {
    // If upload was staged / pending / review
    await supabase
      .from('staged_transactions')
      .update({ account_id: newAccountId, updated_at: new Date().toISOString() })
      .eq('upload_id', uploadId)
      .eq('user_id', user.id);

    // If upload was completed / imported
    await supabase
      .from('transactions')
      .update({ account_id: newAccountId, updated_at: new Date().toISOString() })
      .eq('upload_id', uploadId)
      .eq('user_id', user.id);

    // Recalculate totals for both old and new accounts
    if (oldAccountId) await syncAccountBalance(oldAccountId, supabase);
    await syncAccountBalance(newAccountId, supabase);
  }

  // 5. Append audit log
  try {
    await supabase.from('audit_log').insert({
      user_id: user.id,
      table_name: 'statement_uploads',
      record_id: uploadId,
      action: 'update',
      old_data: {
        account_id: oldAccountId,
        statement_period_start: oldUpload.statement_period_start,
        statement_period_end: oldUpload.statement_period_end,
      },
      new_data: {
        account_id: updatedUpload.account_id,
        statement_period_start: updatedUpload.statement_period_start,
        statement_period_end: updatedUpload.statement_period_end,
      },
    });
  } catch (err) {
    console.warn('Failed to append audit log for upload update:', err);
  }

  return {
    success: true,
    upload: {
      ...updatedUpload,
      account: updatedUpload.accounts || undefined,
    },
  };
}

/**
 * Revert / Undo a statement import completely.
 * Deletes transactions, staged transactions, storage file, and statement_uploads record.
 * Frees SHA-256 hash so file can be immediately re-uploaded. Recalculates account balance.
 */
export async function revertImport(
  uploadId: string,
  client?: any
): Promise<{ success: boolean; deletedTxnCount: number }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // 1. Fetch upload record
  const { data: upload, error: fetchErr } = await supabase
    .from('statement_uploads')
    .select('id, file_name, file_hash, account_id, storage_path, row_count')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr || !upload) {
    return { success: true, deletedTxnCount: 0 };
  }

  const accountId = upload.account_id;

  // 2. Count and delete transactions
  const { data: txns } = await supabase
    .from('transactions')
    .select('id')
    .eq('upload_id', uploadId)
    .eq('user_id', user.id);

  const deletedTxnCount = txns?.length || 0;

  if (deletedTxnCount > 0) {
    const { error: txErr } = await supabase
      .from('transactions')
      .delete()
      .eq('upload_id', uploadId)
      .eq('user_id', user.id);

    if (txErr) {
      throw new Error(`Failed to delete transactions: ${txErr.message}`);
    }
  }

  // 3. Delete staged transactions
  await supabase
    .from('staged_transactions')
    .delete()
    .eq('upload_id', uploadId)
    .eq('user_id', user.id);

  // 4. Remove storage file if present
  if (upload.storage_path) {
    try {
      await supabase.storage.from('statements').remove([upload.storage_path]);
    } catch {
      // Ignore storage remove errors
    }
  }

  // 5. Delete statement_uploads record (clears file_hash deduplication)
  const { error: uploadErr } = await supabase
    .from('statement_uploads')
    .delete()
    .eq('id', uploadId)
    .eq('user_id', user.id);

  if (uploadErr) {
    throw new Error(`Failed to delete upload record: ${uploadErr.message}`);
  }

  // 6. Recalculate account balance
  if (accountId) {
    await syncAccountBalance(accountId, supabase);
  }

  // 7. Write to audit_log
  try {
    await supabase.from('audit_log').insert({
      user_id: user.id,
      table_name: 'statement_uploads',
      record_id: uploadId,
      action: 'delete',
      old_data: {
        file_name: upload.file_name,
        deleted_transactions: deletedTxnCount,
        account_id: accountId,
      },
      new_data: null,
    });
  } catch (err) {
    console.warn('Failed to append audit log for upload revert:', err);
  }

  return { success: true, deletedTxnCount };
}

/**
 * Completely deletes an upload and all associated records.
 */
export async function deleteUpload(
  uploadId: string,
  client?: any
): Promise<{ success: boolean; deletedTxnCount: number }> {
  return revertImport(uploadId, client);
}

/**
 * Clear all transactions and statement uploads for a specific account
 */
export async function clearAccountTransactions(
  accountId: string,
  client?: any
): Promise<{ success: boolean; clearedUploads: number; clearedTransactions: number }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: uploads } = await supabase
    .from('statement_uploads')
    .select('id')
    .eq('account_id', accountId)
    .eq('user_id', user.id);

  let clearedUploads = 0;
  let clearedTransactions = 0;

  if (uploads && uploads.length > 0) {
    for (const u of uploads) {
      const res = await deleteUpload(u.id, supabase);
      clearedUploads++;
      clearedTransactions += res.deletedTxnCount;
    }
  }

  // Also clean up any manual or non-upload transactions on this account
  const { data: remainingTxns } = await supabase
    .from('transactions')
    .select('id')
    .eq('account_id', accountId)
    .eq('user_id', user.id);

  if (remainingTxns && remainingTxns.length > 0) {
    clearedTransactions += remainingTxns.length;
    await supabase
      .from('transactions')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', user.id);
  }

  return { success: true, clearedUploads, clearedTransactions };
}

/**
 * Delete account along with all its transactions and uploads
 */
export async function deleteAccountWithTransactions(
  accountId: string,
  client?: any
): Promise<{ success: boolean }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  // 1. Clear account transactions & uploads
  await clearAccountTransactions(accountId, supabase);

  // 2. Delete the account row
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(`Failed to delete account: ${error.message}`);
  }

  return { success: true };
}
export async function updateStagedTransaction(
  stagedId: string,
  updates: {
    txn_date?: string;
    description?: string;
    debit?: number | null;
    credit?: number | null;
    reference_number?: string | null;
  },
  client?: any
): Promise<{ success: boolean }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('staged_transactions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagedId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
