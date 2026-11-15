import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, getServiceSupabase, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { parseStatementCSV, parseStatementPDF } from '../../src/lib/parsers';
import { parseXLSX } from '../../src/lib/parsers/xlsx';
import { extractCrossSourceRefs } from '../../src/lib/parsers/utils';
import { checkReconciliation, parseAmount, normalizeDate } from '../../src/lib/actions/upload';
import { writeAuditLog } from '../../src/lib/audit';
import type { ColumnMapping, ParseResult } from '../../src/types/uploads';
import crypto from 'node:crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_UPLOAD_MIMETYPES: Record<'csv' | 'xlsx' | 'pdf', string[]> = {
  csv: [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  pdf: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
};

async function parseMultipart(req: AuthenticatedVercelRequest): Promise<{
  fileBuffer: Buffer;
  filename: string;
  mimetype: string;
  accountId: string;
}> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: any) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundaryMatch) {
        return reject(new Error('Invalid multipart content type header.'));
      }
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      
      let accountId = '';
      let fileBuffer: Buffer | null = null;
      let filename = '';
      let mimetype = 'application/octet-stream';

      let start = 0;
      while (start < body.length) {
        const nextBoundary = body.indexOf(boundaryBuffer, start);
        if (nextBoundary === -1) break;

        if (start > 0) {
          const part = body.subarray(start, nextBoundary);
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const headerStr = part.subarray(0, headerEnd).toString('utf8');
            const data = part.subarray(headerEnd + 4, part.length - 2);

            const nameMatch = headerStr.match(/name="([^"]+)"/i);
            const name = nameMatch ? nameMatch[1] : '';

            if (name === 'account_id') {
              accountId = data.toString('utf8').trim();
            } else if (name === 'file') {
              const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
              filename = filenameMatch ? filenameMatch[1] : 'statement';
              const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
              if (mimeMatch) mimetype = mimeMatch[1].trim();
              fileBuffer = Buffer.from(data);
            }
          }
        }

        start = nextBoundary + boundaryBuffer.length + 2;
      }

      if (!fileBuffer) return reject(new Error('No file field in upload request.'));
      if (!accountId) return reject(new Error('Target account_id is required.'));

      resolve({ fileBuffer, filename, mimetype, accountId });
    });
    req.on('error', reject);
  });
}

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const { fileBuffer, filename, mimetype, accountId } = await parseMultipart(req);

    if (fileBuffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 20 MB limit.' });
    }

    const fileNameLower = filename.toLowerCase();
    let fileType: 'csv' | 'xlsx' | 'pdf' | null = null;
    if (fileNameLower.endsWith('.csv')) fileType = 'csv';
    else if (fileNameLower.endsWith('.xlsx')) fileType = 'xlsx';
    else if (fileNameLower.endsWith('.pdf')) fileType = 'pdf';

    if (!fileType) {
      return res.status(400).json({
        error: 'Invalid file type. Supported formats: .csv, .xlsx, .pdf.',
      });
    }

    const mime = mimetype.toLowerCase();
    if (mime && !ALLOWED_UPLOAD_MIMETYPES[fileType].includes(mime)) {
      return res.status(400).json({
        error: 'File MIME type does not match supported statement format.',
      });
    }

    const user = req.user!;
    const supabase = req.supabase;
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const { data: existingUpload } = await supabase
      .from('statement_uploads')
      .select('id')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .neq('status', 'failed')
      .maybeSingle();

    if (existingUpload) {
      return res.status(409).json({
        error: 'DUPLICATE_FILE',
        existing_upload_id: existingUpload.id,
        message: 'This exact file has already been uploaded previously.',
      });
    }

    const dateFolder = new Date().toISOString().slice(0, 7);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${dateFolder}/${Date.now()}-${sanitizedFilename}`;

    const { error: storageError } = await supabase.storage
      .from('statements')
      .upload(storagePath, fileBuffer, {
        contentType: mimetype,
        upsert: false,
      });

    if (storageError) {
      console.warn('Storage upload notice:', storageError.message);
    }

    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;

    let parseResult: ParseResult;
    if (fileType === 'csv') {
      const text = fileBuffer.toString('utf-8');
      parseResult = await parseStatementCSV(text);
    } else if (fileType === 'xlsx') {
      parseResult = parseXLSX(arrayBuffer);
    } else {
      parseResult = await parseStatementPDF(arrayBuffer);
    }

    if (parseResult.rows.length === 0) {
      return res.status(422).json({
        error: parseResult.parseError || 'Parsed file contains no transaction rows.',
      });
    }

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

    const columnMapping: ColumnMapping | null = parseResult.suggested_mapping || null;
    const needsMapping = parseResult.confidence !== 'high';

    const { data: newUploadRecord, error: dbError } = await supabase
      .from('statement_uploads')
      .insert({
        user_id: user.id,
        account_id: accountId,
        file_name: filename,
        file_hash: fileHash,
        file_type: fileType,
        file_size_bytes: fileBuffer.length,
        storage_path: storagePath,
        parser_version: parseResult.parser_version,
        status: 'pending',
        row_count: parseResult.rows.length,
      })
      .select()
      .single();

    if (dbError || !newUploadRecord) {
      console.error('Upload DB insert error:', dbError?.message);
      return res.status(500).json({ error: 'Failed to save upload record.' });
    }

    const stagedRows = parseResult.rows.map((row: any) => {
      const rawDate = columnMapping?.date_col ? row[columnMapping.date_col] : null;
      let debit: number | null = null;
      let credit: number | null = null;

      if (columnMapping?.is_single_amount_col && columnMapping.amount_col) {
        const amt = parseAmount(row[columnMapping.amount_col]);
        if (amt !== null) {
          if (amt < 0) debit = Math.abs(amt);
          else credit = amt;
        }
      } else {
        if (columnMapping?.debit_col) debit = parseAmount(row[columnMapping.debit_col]);
        if (columnMapping?.credit_col) credit = parseAmount(row[columnMapping.credit_col]);
      }

      const desc =
        (columnMapping?.description_col ? row[columnMapping.description_col] : null) ||
        'Pending Mapping';
      const refNo = columnMapping?.reference_col
        ? row[columnMapping.reference_col]?.trim() || null
        : null;
      const rawJson = JSON.stringify(row);
      const { upi_ref_no, imps_ref_no } = extractCrossSourceRefs({
        parserVersion: parseResult.parser_version,
        description: desc,
        rawDescription: rawJson,
        referenceNumber: refNo,
      });

      return {
        user_id: user.id,
        upload_id: newUploadRecord.id,
        account_id: accountId,
        raw_date: rawDate,
        txn_date: normalizeDate(rawDate || ''),
        description: desc,
        raw_description: rawJson,
        debit,
        credit,
        balance: columnMapping?.balance_col ? parseAmount(row[columnMapping.balance_col]) : null,
        reference_number: refNo,
        upi_ref_no,
        imps_ref_no,
        source: 'statement_import' as const,
        is_duplicate: false,
      };
    });

    const CHUNK_SIZE = 500;
    for (let i = 0; i < stagedRows.length; i += CHUNK_SIZE) {
      const chunk = stagedRows.slice(i, i + CHUNK_SIZE);
      const { error: stageError } = await supabase.from('staged_transactions').insert(chunk);
      if (stageError) {
        console.error('Staged transactions insert error:', stageError.message);
        return res.status(500).json({ error: 'Failed to stage parsed rows.' });
      }
    }

    const serviceSupabase = getServiceSupabase();
    if (serviceSupabase) {
      await writeAuditLog(serviceSupabase, {
        user_id: user.id,
        action: 'insert',
        entity: 'statement_upload',
        entity_id: newUploadRecord.id,
        after_json: {
          account_id: accountId,
          file_name: filename,
          file_type: fileType,
          row_count: parseResult.rows.length,
        },
      });
    }

    return res.json({
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
    });
  } catch (err: any) {
    console.error('Upload API route error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error during upload.' });
  }
}
