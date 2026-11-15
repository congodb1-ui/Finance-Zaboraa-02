import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const enabled = Boolean(req.body?.gmail_sync_enabled);

    const { data: updated, error } = await req.supabase
      .from('profiles')
      .update({ gmail_sync_enabled: enabled })
      .eq('user_id', userId)
      .select('gmail_sync_enabled')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ gmail_sync_enabled: Boolean(updated?.gmail_sync_enabled) });
  } catch (err: any) {
    console.error('Gmail settings update error:', err?.message);
    return res.status(500).json({ error: 'Failed to update Gmail auto-sync setting.' });
  }
}
