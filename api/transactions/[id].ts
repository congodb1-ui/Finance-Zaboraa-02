import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { updateTransaction } from '../../src/lib/actions/transactions';
import { writeAuditLog } from '../../src/lib/audit';
import { getServiceSupabase } from '../_lib/middleware';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Transaction id is required.' });
    }

    const body = req.body || {};
    if (
      body.debit !== undefined ||
      body.credit !== undefined ||
      body.balance !== undefined
    ) {
      return res.status(400).json({
        error: 'Transaction amounts are sacred and non-editable after import.',
      });
    }

    const { data: beforeTx } = await req.supabase
      .from('transactions')
      .select('category_id, workspace_id, tags, notes, txn_type, is_transfer, transfer_pair_id')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .maybeSingle();

    const updated = await updateTransaction(
      id,
      {
        category_id: body.category_id,
        workspace_id: body.workspace_id,
        tags: body.tags,
        notes: body.notes,
        txn_type: body.txn_type,
        is_transfer: body.is_transfer,
        is_self_transfer: body.is_self_transfer,
        status: body.status,
        transfer_pair_id: body.transfer_pair_id,
        transfer_target_account_id: body.transfer_target_account_id,
      },
      req.supabase
    );

    const serviceSupabase = getServiceSupabase();
    if (serviceSupabase) {
      await writeAuditLog(serviceSupabase, {
        user_id: req.user!.id,
        action: 'update',
        entity: 'transaction',
        entity_id: id,
        before_json: beforeTx || null,
        after_json: {
          category_id: updated.category_id,
          workspace_id: updated.workspace_id,
          tags: updated.tags,
          notes: updated.notes,
          txn_type: updated.txn_type,
          is_transfer: updated.is_transfer,
          transfer_pair_id: updated.transfer_pair_id,
        },
      });
    }

    return res.json(updated);
  } catch (err: any) {
    console.error('Update transaction error:', err);
    return res.status(500).json({ error: 'Internal error updating transaction.' });
  }
}
