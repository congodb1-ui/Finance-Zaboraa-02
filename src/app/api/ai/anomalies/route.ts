import { NextRequest, NextResponse } from 'next/server';
import { detectAnomaliesWithAI, getCachedAnomalies } from '../../../../lib/ai/anomalies';
import { getTransactions } from '../../../../lib/actions/transactions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const forceRefresh = body.forceRefresh === true;

    if (!forceRefresh) {
      const cached = getCachedAnomalies();
      if (cached.length > 0) {
        return NextResponse.json({ success: true, anomalies: cached, fromCache: true });
      }
    }

    // Fetch ledger transactions for 90 days
    const ledger = await getTransactions({
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
    });

    const anomalies = await detectAnomaliesWithAI(ledger.transactions);

    return NextResponse.json({
      success: true,
      anomalies,
      count: anomalies.length,
    });
  } catch (err: any) {
    console.error('Anomalies API error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error running anomaly detection.' },
      { status: 500 }
    );
  }
}
