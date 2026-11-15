import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { listAnalyticsReports } from '../../src/lib/analytics/generate';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const reports = await listAnalyticsReports(req.supabase, req.user!.id);
    return res.json({ reports });
  } catch (err: any) {
    console.error('Analytics list reports error:', err?.message);
    return res.status(500).json({
      error: err?.message || 'Failed to load analytics reports.',
    });
  }
}
