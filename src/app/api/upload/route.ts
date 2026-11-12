import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { parseCSV } from '../../../lib/parsers/csv';
import { parseXLSX } from '../../../lib/parsers/xlsx';
import { extractPDFRawData } from '../../../lib/parsers/pdf';
import { parsePDFHDFC, isHDFCStatement } from '../../../lib/parsers/pdf-hdfc';
import { parsePDFGeneric } from '../../../lib/parsers/pdf-generic';
import { computeSHA256, checkReconciliation } from '../../../lib/actions/upload';
import type { ColumnMapping, ParseResult } from '../../../types/uploads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // STEP 1 — Authenticate
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Valid Supabase session required.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('account_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Target account_id is required.' }, { status: 400 });
    }

    // STEP 2 — Validate file (.csv, .xlsx, .pdf, max 20 MB)
    const maxBytes = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File size exceeds 20 MB limit.' }, { status: 400 });
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
      return NextResponse.json(
        { error: 'Invalid file type. Supported formats: .csv, .xlsx, .pdf.' },
        { status: 400 }
      );
    }

    // STEP 3 — Compute SHA-256 hash BEFORE any parsing
    const arrayBuffer = await file.arrayBuffer();
    const fileHash = await computeSHA256(arrayBuffer);

    // Check statement_uploads for (user_id, file_hash)
    const { data: existingUpload } = await supabase
      .from('statement_uploads')
      .select('id')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .neq('status', 'failed')
      .maybeSingle();

    if (existingUpload) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_FILE',
          existing_upload_id: existingUpload.id,
          message: 'This exact file has already been uploaded previously.',
        },
        { status: 409 }
      );
    }

    // STEP 4 — Upload to Supabase Storage
    const dateFolder = new Date().toISOString().slice(0, 7); // YYYY-MM
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedFilename}`;

    const { error: storageError } = await supabase.storage.from('statements').upload(storagePath, file, {
      upsert: false,
    });

    if (storageError) {
      console.warn('Storage upload notice:', storageError.message);
    }

    // STEP 5 — Detect file type and run parser
    let parseResult: ParseResult;
    if (fileType === 'csv') {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      parseResult = parseCSV(text);
    } else if (fileType === 'xlsx') {
      parseResult = parseXLSX(arrayBuffer);
    } else {
      // PDF branch
      const pdfData = await extractPDFRawData(arrayBuffer);
      const firstPageText = pdfData.pages[0]?.fullText || pdfData.fullDocumentText;
      if (isHDFCStatement(firstPageText)) {
        parseResult = await parsePDFHDFC(arrayBuffer, pdfData);
      } else {
        parseResult = await parsePDFGeneric(arrayBuffer, pdfData);
      }
    }

    if (parseResult.rows.length === 0) {
      return NextResponse.json({ error: 'Parsed file contains no transaction rows.' }, { status: 422 });
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

    // STEP 6 — Header extraction + auto-mapping result
    const columnMapping: ColumnMapping | null = parseResult.suggested_mapping || null;
    const needsMapping = parseResult.confidence !== 'high';

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
      return NextResponse.json({ error: `Database insert failed: ${dbError?.message}` }, { status: 500 });
    }

    // STEP 8 — Store raw parsed rows in staged_transactions with upload_id
    // Prepare initial raw rows (date normalized or raw)
    const stagedRows = parseResult.rows.map((row) => ({
      user_id: user.id,
      upload_id: newUploadRecord.id,
      account_id: accountId,
      raw_date: columnMapping?.date_col ? row[columnMapping.date_col] : null,
      txn_date: new Date().toISOString().split('T')[0],
      description: (columnMapping?.description_col ? row[columnMapping.description_col] : null) || 'Pending Mapping',
      raw_description: JSON.stringify(row),
      is_duplicate: false,
    }));

    await supabase.from('staged_transactions').insert(stagedRows);

    return NextResponse.json({
      upload_id: newUploadRecord.id,
      row_count: parseResult.rows.length,
      column_mapping: columnMapping,
      needs_mapping: needsMapping,
      headers: parseResult.headers,
      file_type: fileType,
      reconciliation_warning: parseResult.reconciliation_warning,
      reconciliation_diff: parseResult.reconciliation_diff,
    });
  } catch (err: any) {
    console.error('Upload API route error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error during upload.' }, { status: 500 });
  }
}
