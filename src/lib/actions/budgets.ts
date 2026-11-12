import { createClient } from '../supabase/client';
import type { Budget, BudgetWithSpending, BudgetFormData, BudgetPeriod } from '../../types/budgets';
import { getCategories } from './categories';
import { getWorkspaces } from './workspaces';
import { getAllTransactions } from './transactions';

// Seed initial authentic budgets
let localBudgetsStore: Budget[] = [
  {
    id: 'bgt_01',
    user_id: 'default_owner',
    category_id: 'cat_1', // Food & Dining
    workspace_id: 'ws_personal',
    period: 'monthly',
    fy_year: '2026-27',
    amount: 15000.0,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bgt_02',
    user_id: 'default_owner',
    category_id: 'cat_7', // Business Client / Office Expenses
    workspace_id: 'ws_business',
    period: 'monthly',
    fy_year: '2026-27',
    amount: 40000.0,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bgt_03',
    user_id: 'default_owner',
    category_id: 'cat_2', // Healthcare & Insurance
    workspace_id: 'ws_personal',
    period: 'yearly',
    fy_year: '2026-27',
    amount: 35000.0,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bgt_04',
    user_id: 'default_owner',
    category_id: 'cat_3', // Investments / Tax Savings
    workspace_id: 'ws_personal',
    period: 'quarterly',
    fy_year: '2026-27',
    amount: 75000.0,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
];

/**
 * Calculates date range for a given FY and period
 */
export function getPeriodDateRange(fyYear: string, period: BudgetPeriod): { startDate: string; endDate: string } {
  // fyYear format: "2026-27" -> startYear 2026, endYear 2027
  const startYear = parseInt(fyYear.split('-')[0], 10) || 2026;
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
    // Current active month
    const mStr = String(currentMonth).padStart(2, '0');
    return {
      startDate: `${currentYear}-${mStr}-01`,
      endDate: `${currentYear}-${mStr}-31`,
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
  fyYear: string = '2026-27',
  period?: BudgetPeriod
): Promise<{
  budgets: BudgetWithSpending[];
  totalBudgeted: number;
  totalSpent: number;
  overallPercentage: number;
}> {
  const [categories, workspaces, allTxns] = await Promise.all([
    getCategories(),
    getWorkspaces(),
    getAllTransactions(),
  ]);

  // Read budgets from Supabase if available
  let rawBudgets = [...localBudgetsStore];
  try {
    const supabase = createClient();
    const query = supabase.from('budgets').select('*');
    if (fyYear) query.eq('fy_year', fyYear);
    if (period) query.eq('period', period);
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      rawBudgets = data;
    }
  } catch {
    // Fallback
  }

  // Filter local store by fyYear and period if supplied
  let filtered = rawBudgets.filter((b) => !fyYear || b.fy_year === fyYear);
  if (period) {
    filtered = filtered.filter((b) => b.period === period);
  }

  let totalBudgeted = 0;
  let totalSpent = 0;

  const enriched: BudgetWithSpending[] = filtered.map((b) => {
    const dateRange = getPeriodDateRange(b.fy_year, b.period);

    // Calculate actual spending for this budget's category in the period
    let spent = 0;
    for (const tx of allTxns) {
      if (tx.is_transfer || tx.txn_type === 'transfer') continue;
      if (tx.category_id !== b.category_id) continue;
      if (b.workspace_id && tx.workspace_id !== b.workspace_id) continue;
      if (tx.txn_date >= dateRange.startDate && tx.txn_date <= dateRange.endDate) {
        spent += tx.debit ?? 0;
      }
    }

    const remaining = Math.max(0, b.amount - spent);
    const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    const isOverBudget = spent > b.amount;

    totalBudgeted += b.amount;
    totalSpent += spent;

    return {
      ...b,
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
  const existingIdx = localBudgetsStore.findIndex(
    (b) =>
      b.category_id === data.category_id &&
      b.period === data.period &&
      b.fy_year === data.fy_year
  );

  const now = new Date().toISOString();
  if (existingIdx !== -1) {
    // Update existing budget if duplicate key
    localBudgetsStore[existingIdx].amount = Number(data.amount);
    localBudgetsStore[existingIdx].workspace_id = data.workspace_id || null;
    localBudgetsStore[existingIdx].updated_at = now;
    return localBudgetsStore[existingIdx];
  }

  const newBudget: Budget = {
    id: `bgt_${Date.now()}`,
    user_id: 'default_owner',
    category_id: data.category_id,
    workspace_id: data.workspace_id || null,
    period: data.period,
    fy_year: data.fy_year,
    amount: Number(data.amount),
    created_at: now,
    updated_at: now,
  };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      newBudget.user_id = user.id;
      await supabase.from('budgets').upsert({
        user_id: user.id,
        category_id: newBudget.category_id,
        workspace_id: newBudget.workspace_id,
        period: newBudget.period,
        fy_year: newBudget.fy_year,
        amount: newBudget.amount,
      });
    }
  } catch {
    // Fallback
  }

  localBudgetsStore.push(newBudget);
  return newBudget;
}

export async function updateBudget(id: string, amount: number): Promise<Budget> {
  const idx = localBudgetsStore.findIndex((b) => b.id === id);
  if (idx === -1) throw new Error('Budget not found');

  localBudgetsStore[idx].amount = Number(amount);
  localBudgetsStore[idx].updated_at = new Date().toISOString();

  try {
    const supabase = createClient();
    await supabase.from('budgets').update({ amount }).eq('id', id);
  } catch {
    // Fallback
  }

  return localBudgetsStore[idx];
}

export async function deleteBudget(id: string): Promise<boolean> {
  localBudgetsStore = localBudgetsStore.filter((b) => b.id !== id);

  try {
    const supabase = createClient();
    await supabase.from('budgets').delete().eq('id', id);
  } catch {
    // Fallback
  }

  return true;
}

/**
 * Returns top 3 over-budget or near-limit categories for Dashboard
 */
export async function getBudgetHealthSummary(limit: number = 3): Promise<BudgetWithSpending[]> {
  const { budgets } = await getBudgets('2026-27');
  // Sort by highest percentage spent descending
  return budgets.sort((a, b) => b.percentage - a.percentage).slice(0, limit);
}
