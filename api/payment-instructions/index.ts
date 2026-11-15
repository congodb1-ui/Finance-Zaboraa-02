import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { createPaymentInstructionServer } from '../../src/lib/actions/paymentInstructionsServer';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const created = await createPaymentInstructionServer(
      req.supabase,
      req.user!.id,
      req.body || {}
    );
    return res.json(created);
  } catch (err: any) {
    const message = err?.message || 'Failed to create payment instruction.';
    const isValidation = message.includes('required') || message.includes('3-letter ISO code');
    console.error('Create payment instruction error:', message);
    return res.status(isValidation ? 400 : 500).json({ error: message });
  }
}
