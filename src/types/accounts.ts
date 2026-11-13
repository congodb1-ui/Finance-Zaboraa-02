export type AccountType =
  | 'savings'
  | 'current'
  | 'salary'
  | 'credit_card'
  | 'loan'
  | 'fd'
  | 'ppf'
  | 'nps'
  | 'wallet'
  | 'other';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  bank_name: string;
  account_type: AccountType;
  account_number_last4: string | null;
  currency: string;
  is_active: boolean;
  color_index: number;
  notes: string | null;
  opening_balance?: number | null;
  opening_date?: string | null;
  purpose?: string | null;
  credit_limit: number | null;
  billing_cycle_day: number | null;
  payment_due_day: number | null;
  created_at: string;
  updated_at: string;
}

export type AccountFormData = Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface AccountWithBalance extends Account {
  current_balance: number;
  last_import_date: string | null;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: 'Savings Account',
  current: 'Current Account',
  salary: 'Salary Account',
  credit_card: 'Credit Card',
  loan: 'Loan / EMI',
  fd: 'Fixed Deposit (FD)',
  ppf: 'Public Provident Fund (PPF)',
  nps: 'National Pension Scheme (NPS)',
  wallet: 'Digital Wallet / UPI',
  other: 'Other Account',
};
