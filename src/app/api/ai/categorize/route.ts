import { NextRequest, NextResponse } from 'next/server';
import { categorizeTransactionsWithAI } from '../../../../lib/ai/categorize';
import { getTransactions, applyAICategorizations } from '../../../../lib/actions/transactions';
import { getCategories } from '../../../../lib/actions/categories';
import type { Transaction } from '../../../../types/transactions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { transactionIds, uploadId } = body;

    // Fetch transactions
    const ledger = await getTransactions({
      page: 1,
      pageSize: 200,
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

    let targetTxns: Transaction[] = ledger.transactions;
    if (Array.isArray(transactionIds) && transactionIds.length > 0) {
      targetTxns = targetTxns.filter((t: Transaction) => transactionIds.includes(t.id));
    } else if (uploadId) {
      targetTxns = targetTxns.filter((t: Transaction) => t.upload_id === uploadId);
    } else {
      // Default: target uncategorized transactions
      targetTxns = targetTxns.filter((t: Transaction) => !t.category_id);
    }

    if (targetTxns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No eligible uncategorized transactions found.',
        summary: {
          totalProcessed: 0,
          autoAppliedHigh: 0,
          autoAppliedMedium: 0,
          needsReviewLow: 0,
        },
      });
    }

    const categories = await getCategories();
    const summary = await categorizeTransactionsWithAI(targetTxns, categories);

    // Apply high and medium results to the persistent / memory ledger and record audit log
    if (summary.results.length > 0) {
      await applyAICategorizations(summary.results);
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    console.error('Categorize API Route error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal server error during AI categorization.',
      },
      { status: 500 }
    );
  }
}
