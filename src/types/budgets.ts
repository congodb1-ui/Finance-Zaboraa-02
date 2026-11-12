import type { Category } from './categories';
import type { Workspace } from './workspaces';

export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly';

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  workspace_id: string | null;
  period: BudgetPeriod;
  fy_year: string;
  amount: number;
  created_at: string;
  updated_at: string;
  category?: Category;
  workspace?: Workspace;
}

export interface BudgetWithSpending extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
}

export interface BudgetFormData {
  category_id: string;
  workspace_id?: string | null;
  period: BudgetPeriod;
  fy_year: string;
  amount: number;
}
