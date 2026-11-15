import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { getTransactions, applyAICategorizations } from '../../src/lib/actions/transactions';
import { getCategories } from '../../src/lib/actions/categories';
import { categorizeTransactionsWithAI } from '../../src/lib/ai/categorize';
import { writeAuditLog } from '../../src/lib/audit';
import { getServiceSupabase } from '../_lib/middleware';
import type { Transaction } from '../../src/types/transactions';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const { transactionIds, uploadId } = req.body || {};

    const ledger = await getTransactions(
      {
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
      },
      req.supabase
    );

    let targetTxns: Transaction[] = ledger.transactions;
    if (Array.isArray(transactionIds) && transactionIds.length > 0) {
      targetTxns = targetTxns.filter((t: Transaction) => transactionIds.includes(t.id));
    } else if (uploadId) {
      targetTxns = targetTxns.filter((t: Transaction) => t.upload_id === uploadId);
    } else {
      targetTxns = targetTxns.filter((t: Transaction) => !t.category_id);
    }

    if (targetTxns.length === 0) {
      return res.json({
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

    const categories = await getCategories(req.supabase);
    const summary = await categorizeTransactionsWithAI(targetTxns, categories);

    if (summary.results.length > 0) {
      const applyRes = await applyAICategorizations(summary.results, req.supabase);
      const serviceSupabase = getServiceSupabase();
      if (serviceSupabase) {
        for (const item of applyRes.applied) {
          await writeAuditLog(serviceSupabase, {
            user_id: req.user!.id,
            action: 'update',
            entity: 'transactions',
            entity_id: item.id,
            before_json: { category_id: item.old_category_id },
            after_json: {
              category_id: item.new_category_id,
              confidence: item.confidence,
              score: item.score,
            },
          });
        }
      }
    }

    return res.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    console.error('Categorize API Route error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during AI categorization.',
    });
  }
}
