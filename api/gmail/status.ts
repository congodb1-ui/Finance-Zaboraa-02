import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const [{ data: profileRow }, { data: latestLog }] = await Promise.all([
      req.supabase
        .from('profiles')
        .select('gmail_connected, gmail_email, gmail_last_synced, gmail_sync_enabled')
        .eq('user_id', userId)
        .maybeSingle(),
      req.supabase
        .from('gmail_sync_log')
        .select('last_synced_at, emails_processed, transactions_added, errors_count')
        .eq('user_id', userId)
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return res.json({
      gmail_connected: Boolean(profileRow?.gmail_connected),
      gmail_email: profileRow?.gmail_email || null,
      gmail_last_synced: profileRow?.gmail_last_synced || latestLog?.last_synced_at || null,
      gmail_sync_enabled: profileRow?.gmail_sync_enabled ?? true,
      last_sync_summary: latestLog || null,
      has_offline_refresh_support: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    });
  } catch (err: any) {
    console.error('Gmail status error:', err?.message);
    return res.status(500).json({ error: 'Failed to load Gmail integration status.' });
  }
}
