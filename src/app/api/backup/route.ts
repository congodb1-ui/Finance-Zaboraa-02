import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions } from '../../../lib/actions/transactions';
import { getAccounts } from '../../../lib/actions/accounts';
import { getCategories } from '../../../lib/actions/categories';
import { getWorkspaces } from '../../../lib/actions/workspaces';
import { getRules } from '../../../lib/actions/rules';
import { getRecurringTransactions } from '../../../lib/actions/recurring';
import { getBudgets } from '../../../lib/actions/budgets';
import { getUploads } from '../../../lib/actions/upload';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
      getAccounts(),
      getAllTransactions(),
      getCategories(),
      getWorkspaces(),
      getRules(),
      getRecurringTransactions(),
      getBudgets(),
      getUploads(),
    ]);

    // Strip raw files and sensitive user credentials, store metadata only
    const sanitizedUploads = uploads.map((u) => ({
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

    const envelope = {
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
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('Backup export API route error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to assemble backup data.' },
      { status: 500 }
    );
  }
}
