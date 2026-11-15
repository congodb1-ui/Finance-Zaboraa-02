import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { commitUploadTransactions } from '../../src/lib/actions/transactions';
import { writeAuditLog } from '../../src/lib/audit';
import { getServiceSupabase } from '../_lib/middleware';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const { upload_id, replace_previous_id } = req.body || {};
    if (!upload_id) {
      return res.status(400).json({ error: 'upload_id is required.' });
    }

    const result = await commitUploadTransactions(
      upload_id,
      replace_previous_id,
      req.supabase
    );

    const serviceSupabase = getServiceSupabase();
    if (serviceSupabase) {
      await writeAuditLog(serviceSupabase, {
        user_id: req.user!.id,
        action: 'import',
        entity: 'statement_upload',
        entity_id: upload_id,
        after_json: {
          imported: result.imported,
          duplicates_skipped: result.duplicates_skipped,
          replaced: result.replaced,
          transfer_pairs_found: result.transfer_pairs_found,
        },
      });
    }

    return res.json(result);
  } catch (err: any) {
    console.error('Finalize upload error:', err);
    return res.status(500).json({ error: 'Internal error finalizing statement upload.' });
  }
}
