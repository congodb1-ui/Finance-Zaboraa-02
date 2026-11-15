import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, getServiceSupabase, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { deleteGmailTokenFromVault } from '../../src/lib/gmail-vault';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const serviceSupabase = getServiceSupabase();
    if (serviceSupabase) {
      await deleteGmailTokenFromVault(serviceSupabase, userId);
      await serviceSupabase
        .from('profiles')
        .update({
          gmail_connected: false,
          gmail_email: null,
        })
        .eq('user_id', userId);
    } else {
      await req.supabase
        .from('profiles')
        .update({
          gmail_connected: false,
          gmail_email: null,
        })
        .eq('user_id', userId);
    }

    return res.json({ gmail_connected: false });
  } catch (err: any) {
    console.error('Gmail disconnect error:', err?.message);
    return res.status(500).json({ error: err?.message || 'Failed to disconnect Gmail.' });
  }
}
