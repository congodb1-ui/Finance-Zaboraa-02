import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { generateAnalyticsReport } from '../../src/lib/analytics/generate';

const ANALYTICS_COOLDOWN_MS = 60 * 60 * 1000;

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  const userId = req.user!.id;

  try {
    const { data: latestReport } = await req.supabase
      .from('analytics_reports')
      .select('generated_at')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.generated_at) {
      const dbTs = new Date(latestReport.generated_at).getTime();
      if (Number.isFinite(dbTs)) {
        const elapsed = Date.now() - dbTs;
        if (elapsed >= 0 && elapsed < ANALYTICS_COOLDOWN_MS) {
          const retryAfterSec = Math.ceil((ANALYTICS_COOLDOWN_MS - elapsed) / 1000);
          const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
          res.setHeader('Retry-After', String(retryAfterSec));
          return res.status(429).json({
            error: `Analytics report can only be generated once per hour. Please try again in ${retryAfterMin} minute${retryAfterMin === 1 ? '' : 's'}.`,
            retry_after_seconds: retryAfterSec,
            retry_after_minutes: retryAfterMin,
          });
        }
      }
    }

    const { data: profileRow } = await req.supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const { report } = await generateAnalyticsReport({
      supabase: req.supabase,
      userId,
      profileName: profileRow?.full_name || undefined,
    });

    return res.json({ report });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    const message = err?.message || 'Failed to generate AI analytics report.';
    console.error('Analytics generate error:', message);
    return res.status(status).json({ error: message });
  }
}
