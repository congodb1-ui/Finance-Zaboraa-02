import type { Category } from './categories';
import type { Account } from './accounts';
import type { Workspace } from './workspaces';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  description: string;
  amount: number;
  txn_type: 'expense' | 'income';
  category_id: string | null;
  workspace_id: string | null;
  frequency: RecurringFrequency;
  next_due_date: string;
  last_seen_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  category?: Category;
  workspace?: Workspace;
}

export interface RecurringFormData {
  account_id: string;
  description: string;
  amount: number;
  txn_type: 'expense' | 'income';
  category_id?: string | null;
  workspace_id?: string | null;
  frequency: RecurringFrequency;
  next_due_date: string;
  notes?: string | null;
}
