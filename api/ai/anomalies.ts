import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { detectAnomaliesWithAI, getCachedAnomalies } from '../../src/lib/ai/anomalies';
import { getTransactions } from '../../src/lib/actions/transactions';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const forceRefresh = req.body?.forceRefresh === true;

    if (!forceRefresh) {
      const cached = getCachedAnomalies(userId);
      if (cached.length > 0) {
        return res.json({ success: true, anomalies: cached, fromCache: true });
      }
    }

    const ledger = await getTransactions(
      {
        page: 1,
        pageSize: 150,
        filters: {
          startDate: '2024-04-01',
          endDate: '2028-03-31',
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      },
      req.supabase
    );

    const anomalies = await detectAnomaliesWithAI(ledger.transactions, undefined, userId);

    return res.json({
      success: true,
      anomalies,
      count: anomalies.length,
    });
  } catch (err: any) {
    console.error('Anomalies API error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to run anomaly detection.',
    });
  }
}
