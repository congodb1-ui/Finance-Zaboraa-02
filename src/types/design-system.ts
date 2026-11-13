/**
 * Zaboraa Finance — Design System Tokens & Types
 * Product Domain: https://finance.zaboraa.com
 * Document Version: v2.1.0
 */

// Fixed 10-color categorical palette (PRD §6.3)
export const CATEGORY_PALETTE = [
  '#6366F1', // 0: Indigo
  '#0EA5E9', // 1: Sky
  '#14B8A6', // 2: Teal
  '#22C55E', // 3: Green
  '#84CC16', // 4: Lime
  '#EAB308', // 5: Yellow
  '#F97316', // 6: Orange
  '#EF4444', // 7: Red
  '#EC4899', // 8: Pink
  '#A855F7', // 9: Purple
] as const;

export type CategoryColor = (typeof CATEGORY_PALETTE)[number];

// Seed category mappings with fixed, deterministic colors
export interface SeedCategory {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  color: CategoryColor;
  workspace: 'Personal' | 'Business' | 'Both';
}

export const SEED_CATEGORIES: SeedCategory[] = [
  // Income
  { id: 'client_payment', name: 'Client Payment', type: 'income', color: '#6366F1', workspace: 'Business' },
  { id: 'salary', name: 'Salary', type: 'income', color: '#0EA5E9', workspace: 'Personal' },
  { id: 'interest', name: 'Interest', type: 'income', color: '#14B8A6', workspace: 'Personal' },
  { id: 'refund', name: 'Refund', type: 'income', color: '#22C55E', workspace: 'Both' },
  { id: 'other_income', name: 'Other Income', type: 'income', color: '#84CC16', workspace: 'Both' },

  // Expense
  { id: 'food', name: 'Food & Dining', type: 'expense', color: '#EAB308', workspace: 'Personal' },
  { id: 'groceries', name: 'Groceries', type: 'expense', color: '#84CC16', workspace: 'Personal' },
  { id: 'travel', name: 'Travel', type: 'expense', color: '#0EA5E9', workspace: 'Both' },
  { id: 'fuel', name: 'Fuel', type: 'expense', color: '#F97316', workspace: 'Both' },
  { id: 'rent', name: 'Rent', type: 'expense', color: '#EF4444', workspace: 'Both' },
  { id: 'utilities', name: 'Utilities', type: 'expense', color: '#14B8A6', workspace: 'Both' },
  { id: 'subscriptions', name: 'Subscriptions', type: 'expense', color: '#A855F7', workspace: 'Both' },
  { id: 'shopping', name: 'Shopping', type: 'expense', color: '#EC4899', workspace: 'Personal' },
  { id: 'health', name: 'Health & Medical', type: 'expense', color: '#EF4444', workspace: 'Personal' },
  { id: 'business_office', name: 'Business - Office', type: 'expense', color: '#6366F1', workspace: 'Business' },
  { id: 'business_vendor', name: 'Business - Vendor', type: 'expense', color: '#0EA5E9', workspace: 'Business' },
  { id: 'business_travel', name: 'Business - Travel', type: 'expense', color: '#F97316', workspace: 'Business' },
  { id: 'tax_gst', name: 'Tax / GST', type: 'expense', color: '#EF4444', workspace: 'Business' },
  { id: 'emi_loan', name: 'EMI / Loan', type: 'expense', color: '#A855F7', workspace: 'Personal' },

  // Transfer
  { id: 'self_transfer', name: 'Self-Transfer', type: 'transfer', color: '#6366F1', workspace: 'Both' },
];

// Account Health Status Definition (PRD §4.2, §6.2)
export type AccountHealthStatus = 'updated' | 'warning' | 'stale';

export interface AccountHealthInfo {
  status: AccountHealthStatus;
  label: string;
  daysAgo: number;
  lastUpdatedDate: string;
}

export function getAccountHealth(daysAgo: number): AccountHealthInfo {
  if (daysAgo < 7) {
    return {
      status: 'updated',
      label: 'Updated (<7d)',
      daysAgo,
      lastUpdatedDate: daysAgo === 0 ? 'Today' : `${daysAgo}d ago`,
    };
  }
  if (daysAgo <= 30) {
    return {
      status: 'warning',
      label: 'Pending (7–30d)',
      daysAgo,
      lastUpdatedDate: `${daysAgo}d ago`,
    };
  }
  return {
    status: 'stale',
    label: 'Needs Update (>30d)',
    daysAgo,
    lastUpdatedDate: `${daysAgo}d ago`,
  };
}

/**
 * Currency Formatter for INR with tabular figures
 * Handles Indian Numbering system: ₹1,23,456.78
 */
export function formatINR(
  amount: number,
  options?: {
    showSign?: boolean;
    showDecimals?: boolean;
    compact?: boolean;
  }
): string {
  const { showSign = false, showDecimals = true, compact = false } = options || {};
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  let formattedNumber = '';

  if (compact && absAmount >= 10000000) {
    formattedNumber = (absAmount / 10000000).toFixed(2) + ' Cr';
  } else if (compact && absAmount >= 100000) {
    formattedNumber = (absAmount / 100000).toFixed(2) + ' L';
  } else {
    // Standard Indian number format (en-IN)
    formattedNumber = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(absAmount);
  }

  const sign = isNegative ? '− ' : showSign && amount > 0 ? '+ ' : '';
  return `${sign}₹${formattedNumber}`;
}
