import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, getServiceSupabase, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { runGmailSyncForUser } from '../../src/lib/gmail-sync-service';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const serviceSupabase = getServiceSupabase();
    if (!serviceSupabase) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to run Gmail sync.',
      });
    }

    const { data: latestLog } = await serviceSupabase
      .from('gmail_sync_log')
      .select('last_synced_at')
      .eq('user_id', userId)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestLog?.last_synced_at) {
      const elapsedMs = Date.now() - new Date(latestLog.last_synced_at).getTime();
      const cooldownMs = 5 * 60 * 1000;
      if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
        const retryAfterSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: `Gmail was synced recently. Please wait ${Math.ceil(retryAfterSec / 60)} minute(s) before syncing again.`,
          retry_after_seconds: retryAfterSec,
        });
      }
    }

    const result = await runGmailSyncForUser(serviceSupabase, userId);
    return res.json(result);
  } catch (err: any) {
    const message = err?.message || 'Failed to sync Gmail alerts.';
    console.error('Gmail sync route error:', message);
    const isClientErr =
      message.includes('not connected') ||
      message.includes('expired') ||
      message.includes('reconnect');
    return res.status(isClientErr ? 400 : 500).json({ error: message });
  }
}
