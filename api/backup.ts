import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, type AuthenticatedVercelRequest } from './_lib/middleware';
import { getAccounts } from '../src/lib/actions/accounts';
import { getAllTransactions } from '../src/lib/actions/transactions';
import { getCategories } from '../src/lib/actions/categories';
import { getWorkspaces } from '../src/lib/actions/workspaces';
import { getRules } from '../src/lib/actions/rules';
import { getRecurringTransactions } from '../src/lib/actions/recurring';
import { getBudgets } from '../src/lib/actions/budgets';
import { getUploads } from '../src/lib/actions/upload';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const [
      accounts,
      transactions,
      categories,
      workspaces,
      rules,
      recurring,
      budgetData,
      uploads,
    ] = await Promise.all([
      getAccounts(req.supabase),
      getAllTransactions(req.supabase),
      getCategories(req.supabase),
      getWorkspaces(req.supabase),
      getRules(req.supabase),
      getRecurringTransactions(req.supabase),
      getBudgets('', undefined, req.supabase),
      getUploads(req.supabase),
    ]);

    const sanitizedUploads = uploads.map((u: any) => ({
      id: u.id,
      account_id: u.account_id,
      file_name: u.file_name,
      file_hash: u.file_hash,
      file_type: u.file_type,
      file_size_bytes: u.file_size_bytes,
      status: u.status,
      row_count: u.row_count,
      statement_period_start: u.statement_period_start,
      statement_period_end: u.statement_period_end,
      imported_at: u.imported_at,
      created_at: u.created_at,
    }));

    return res.json({
      backup_version: '1',
      app: 'Zaboraa Finance',
      exported_at: new Date().toISOString(),
      user_id: '[REDACTED]',
      tables: {
        accounts,
        transactions,
        categories,
        workspaces,
        transaction_rules: rules,
        recurring_transactions: recurring,
        budgets: budgetData.budgets,
        statement_uploads: sanitizedUploads,
      },
    });
  } catch (err: any) {
    console.error('Backup export API route error:', err);
    return res.status(500).json({ error: 'Failed to assemble backup data.' });
  }
}
