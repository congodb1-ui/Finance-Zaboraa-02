import { createClient } from '../supabase/client';
import type {
  Budget,
  BudgetWithSpending,
  BudgetFormData,
  BudgetPeriod,
} from '../../types/budgets';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';
import { getCurrentFY } from '../fy-utils';

/**
 * Calculates date range for a given FY and period
 */
export function getPeriodDateRange(
  fyYear: string,
  period: BudgetPeriod
): { startDate: string; endDate: string } {
  // fyYear format: "2026-27" -> startYear 2026, endYear 2027
  const startYear = parseInt(fyYear.split('-')[0], 10) || getCurrentFY().yearStart;
  const endYear = startYear + 1;

  if (period === 'yearly') {
    return {
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
    };
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  if (period === 'monthly') {
    const mStr = String(currentMonth).padStart(2, '0');
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
  fyYear: string = getCurrentFY().shortLabel,
  period?: BudgetPeriod,
  client?: any
): Promise<{
  budgets: BudgetWithSpending[];
  totalBudgeted: number;
  totalSpent: number;
  overallPercentage: number;
}> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      budgets: [],
      totalBudgeted: 0,
      totalSpent: 0,
      overallPercentage: 0,
    };
  }

  let query = supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id);

  if (fyYear) {
    query = query.eq('fy_year', fyYear);
  }
  if (period) {
    query = query.eq('period', period);
  }

  const [categories, workspaces, { data: rawBudgets, error }] = await Promise.all([
    getCategories(supabase),
    getWorkspaces(supabase),
    query,
  ]);

  if (error || !rawBudgets || rawBudgets.length === 0) {
    if (error) console.error('Error fetching budgets:', error.message);
    return {
      budgets: [],
      totalBudgeted: 0,
      totalSpent: 0,
      overallPercentage: 0,
    };
  }

  // Compute min/max date window across all returned budgets to fetch only relevant transactions
  let minStart = '';
  let maxEnd = '';
  const ranges = new Map<string, { startDate: string; endDate: string }>();

  for (const b of rawBudgets as Budget[]) {
    const r = getPeriodDateRange(b.fy_year, b.period);
    ranges.set(b.id, r);
    if (!minStart || r.startDate < minStart) minStart = r.startDate;
    if (!maxEnd || r.endDate > maxEnd) maxEnd = r.endDate;
  }

  let txQuery = supabase
    .from('transactions')
    .select('category_id, workspace_id, debit, txn_date, is_transfer, txn_type')
    .eq('user_id', user.id)
    .eq('is_transfer', false);

  if (minStart) txQuery = txQuery.gte('txn_date', minStart);
  if (maxEnd) txQuery = txQuery.lte('txn_date', maxEnd);

  const { data: relevantTxns } = await txQuery;
  const txns = relevantTxns || [];

  let totalBudgeted = 0;
  let totalSpent = 0;

  const enriched: BudgetWithSpending[] = (rawBudgets as Budget[]).map((b) => {
    const dateRange = ranges.get(b.id) || getPeriodDateRange(b.fy_year, b.period);
    const budgetAmount = Number(b.amount);

    let spent = 0;
    for (const tx of txns) {
      if (tx.is_transfer || tx.txn_type === 'transfer') continue;
      if (tx.category_id !== b.category_id) continue;
      if (b.workspace_id && tx.workspace_id !== b.workspace_id) continue;
      if (tx.txn_date >= dateRange.startDate && tx.txn_date <= dateRange.endDate) {
        spent += Number(tx.debit ?? 0);
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

  const overallPercentage =
    totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  return {
    budgets: enriched,
    totalBudgeted: Math.round(totalBudgeted * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    overallPercentage,
  };
}

export async function createBudget(
  data: BudgetFormData,
  client?: any
): Promise<Budget> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: upserted, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: user.id,
        category_id: data.category_id,
        workspace_id: data.workspace_id || null,
        period: data.period,
        fy_year: data.fy_year,
        amount: Number(data.amount),
      },
      { onConflict: 'user_id,category_id,period,fy_year' }
    )
    .select()
    .single();

  if (error || !upserted) {
    throw new Error(error?.message || 'Failed to save budget.');
  }

  return {
    ...upserted,
    amount: Number(upserted.amount),
  };
}

export async function updateBudget(
  id: string,
  amount: number,
  client?: any
): Promise<Budget> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: updated, error } = await supabase
    .from('budgets')
    .update({
      amount: Number(amount),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Budget not found');
  }

  return {
    ...updated,
    amount: Number(updated.amount),
  };
}

export async function deleteBudget(id: string, client?: any): Promise<boolean> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

/**
 * Returns top 3 over-budget or near-limit categories for Dashboard
 */
export async function getBudgetHealthSummary(
  limit: number = 3,
  client?: any
): Promise<BudgetWithSpending[]> {
  const { budgets } = await getBudgets(getCurrentFY().shortLabel, undefined, client);
  return budgets.sort((a, b) => b.percentage - a.percentage).slice(0, limit);
}
