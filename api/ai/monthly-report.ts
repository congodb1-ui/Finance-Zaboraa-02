import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { generateMonthlyReportWithAI } from '../../src/lib/ai/monthly-report';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const month = req.body?.month;
    const report = await generateMonthlyReportWithAI(month, undefined, req.supabase);

    return res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error('Monthly report API route error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate monthly AI report.',
    });
  }
}
