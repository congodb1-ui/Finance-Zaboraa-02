import { createClient } from '../supabase/client';
import type { Budget, BudgetWithSpending, BudgetFormData, BudgetPeriod } from '../../types/budgets';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';
import { getAllTransactions } from './transactions';
import { getCurrentFY, getFYBounds } from '../fy-utils';

/**
 * Calculates date range for a given FY and period
 */
export function getPeriodDateRange(fyYear: string, period: BudgetPeriod): { startDate: string; endDate: string } {
  const bounds = getFYBounds(fyYear);
  const startYear = parseInt(bounds.start.slice(0, 4), 10);
  const endYear = parseInt(bounds.end.slice(0, 4), 10);

  if (period === 'yearly') {
    return {
      startDate: bounds.start,
      endDate: bounds.end,
    };
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  if (period === 'monthly') {
    const mStr = String(currentMonth).padStart(2, '0');
    // Calculate last day of month
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    return {
      startDate: `${currentYear}-${mStr}-01`,
      endDate: `${currentYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  // Quarterly: Indian FY Quarters: Q1 (Apr-Jun), Q2 (Jul-Sep), Q3 (Oct-Dec), Q4 (Jan-Mar)
  if (currentMonth >= 4 && currentMonth <= 6) {
    return { startDate: `${startYear}-04-01`, endDate: `${startYear}-06-30` };
  } else if (currentMonth >= 7 && currentMonth <= 9) {
    return { startDate: `${startYear}-07-01`, endDate: `${startYear}-09-30` };
  } else if (currentMonth >= 10 && currentMonth <= 12) {
    return { startDate: `${startYear}-10-01`, endDate: `${startYear}-12-31` };
  } else {
    return { startDate: `${endYear}-01-01`, endDate: `${endYear}-03-31` };
  }
}

export async function getBudgets(
  fyYear?: string,
  period?: BudgetPeriod
): Promise<{
  budgets: BudgetWithSpending[];
  totalBudgeted: number;
  totalSpent: number;
  overallPercentage: number;
}> {
  const targetFY = fyYear || getCurrentFY().value;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { budgets: [], totalBudgeted: 0, totalSpent: 0, overallPercentage: 0 };
  }

  const [categories, workspaces, allTxns] = await Promise.all([
    getCategories(),
    getWorkspaces(),
    getAllTransactions(),
  ]);

  let query = supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id);

  if (targetFY) query = query.eq('fy_year', targetFY);
  if (period) query = query.eq('period', period);

  const { data: rawBudgets, error } = await query;
  if (error || !rawBudgets) {
    console.error('Failed to get budgets:', error);
    return { budgets: [], totalBudgeted: 0, totalSpent: 0, overallPercentage: 0 };
  }

  let totalBudgeted = 0;
  let totalSpent = 0;

  const enriched: BudgetWithSpending[] = rawBudgets.map((b: any) => {
    const budgetAmount = Number(b.amount || 0);
    const dateRange = getPeriodDateRange(b.fy_year, b.period);

    let spent = 0;
    for (const tx of allTxns) {
      if (tx.is_transfer || tx.txn_type === 'transfer') continue;
      if (tx.category_id !== b.category_id) continue;
      if (b.workspace_id && tx.workspace_id !== b.workspace_id) continue;
      if (tx.txn_date >= dateRange.startDate && tx.txn_date <= dateRange.endDate) {
        spent += tx.debit ?? 0;
      }
    }

    const remaining = Math.max(0, budgetAmount - spent);
    const percentage = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
    const isOverBudget = spent > budgetAmount;

    totalBudgeted += budgetAmount;
    totalSpent += spent;

    return {
      ...b,
      amount: budgetAmount,
      category: categories.find((c) => c.id === b.category_id),
      workspace: workspaces.find((w) => w.id === b.workspace_id),
      spent: Math.round(spent * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      percentage,
      isOverBudget,
    };
  });

  const overallPercentage = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  return {
    budgets: enriched,
    totalBudgeted: Math.round(totalBudgeted * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    overallPercentage,
  };
}

export async function createBudget(data: BudgetFormData): Promise<Budget> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const payload = {
    user_id: user.id,
    category_id: data.category_id,
    workspace_id: data.workspace_id || null,
    period: data.period,
    fy_year: data.fy_year,
    amount: Number(data.amount),
  };

  const { data: inserted, error } = await supabase
    .from('budgets')
    .upsert(payload, { onConflict: 'user_id,category_id,period,fy_year' })
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to create budget:', error);
    throw new Error(error?.message || 'Failed to save budget');
  }

  return {
    ...inserted,
    amount: Number(inserted.amount),
  };
}

export async function updateBudget(id: string, amount: number): Promise<Budget> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('budgets')
    .update({ amount: Number(amount), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    console.error('Failed to update budget:', error);
    throw new Error(error?.message || 'Failed to update budget');
  }

  return {
    ...updated,
    amount: Number(updated.amount),
  };
}

export async function deleteBudget(id: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete budget:', error);
    return false;
  }

  return true;
}

/**
 * Returns top 3 over-budget or near-limit categories for Dashboard
 */
export async function getBudgetHealthSummary(limit: number = 3): Promise<BudgetWithSpending[]> {
  const { budgets } = await getBudgets();
  return budgets.sort((a, b) => b.percentage - a.percentage).slice(0, limit);
}
