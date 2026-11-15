import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { updatePaymentInstructionServer } from '../../src/lib/actions/paymentInstructionsServer';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Payment instruction id is required.' });
    }
    const updated = await updatePaymentInstructionServer(
      req.supabase,
      req.user!.id,
      id,
      req.body || {}
    );
    return res.json(updated);
  } catch (err: any) {
    const message = err?.message || 'Failed to update payment instruction.';
    const status = message.includes('not found')
      ? 404
      : message.includes('required') || message.includes('3-letter ISO code')
      ? 400
      : 500;
    console.error('Update payment instruction error:', message);
    return res.status(status).json({ error: message });
  }
}
