import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../../_lib/middleware';
import { getPaymentInstruction } from '../../../src/lib/actions/paymentInstructions';
import { decryptPaymentInstructionServer } from '../../../src/lib/actions/paymentInstructionsServer';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Payment instruction id is required.' });
    }
    const instruction = await getPaymentInstruction(req.supabase, id);
    if (!instruction) {
      return res.status(404).json({ error: 'Payment instruction not found.' });
    }
    const decrypted = await decryptPaymentInstructionServer(instruction);
    return res.json(decrypted);
  } catch (err: any) {
    const message = err?.message || 'Failed to decrypt payment instruction.';
    console.error('Reveal payment instruction error:', message);
    return res.status(500).json({ error: message });
  }
}
