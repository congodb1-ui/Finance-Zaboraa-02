import type { Category } from '../../types/categories';
import type { RuleScope } from '../../types/transactions';

export interface CanonicalCategorySpec {
  name: string;
  icon: string;
  color_index: number;
  is_income: boolean;
}

/**
 * The ONLY 13 categories allowed for Auto-Categorization.
 * The AI must never invent a new category outside this exact list.
 */
export const ALLOWED_AUTO_CATEGORIES: readonly CanonicalCategorySpec[] = [
  { name: 'Food & Groceries', icon: 'Utensils', color_index: 5, is_income: false },
  { name: 'Pharmacy / Health', icon: 'HeartPulse', color_index: 7, is_income: false },
  { name: 'Fuel / Petrol', icon: 'Fuel', color_index: 6, is_income: false },
  { name: 'Transport / Vehicle', icon: 'Car', color_index: 1, is_income: false },
  { name: 'Rent & Utilities', icon: 'Home', color_index: 2, is_income: false },
  { name: 'Shopping', icon: 'ShoppingBag', color_index: 8, is_income: false },
  { name: 'Entertainment', icon: 'Film', color_index: 9, is_income: false },
  { name: 'Business Expense', icon: 'Briefcase', color_index: 0, is_income: false },
  { name: 'Business Income', icon: 'Building2', color_index: 3, is_income: true },
  { name: 'Salary / Income', icon: 'Wallet', color_index: 4, is_income: true },
  { name: 'Family Transfer', icon: 'ArrowLeftRight', color_index: 1, is_income: false },
  { name: 'Bank Charges', icon: 'AlertCircle', color_index: 6, is_income: false },
  { name: 'Other', icon: 'MoreHorizontal', color_index: 0, is_income: false },
] as const;

export const ALLOWED_CATEGORY_NAMES = ALLOWED_AUTO_CATEGORIES.map((c) => c.name);
const ALLOWED_NAME_SET = new Set(ALLOWED_CATEGORY_NAMES.map((n) => n.toLowerCase()));

export type MerchantFrequency = 'daily' | 'weekly' | 'monthly' | 'occasional' | 'one-time';
export type AccountScopeTag = 'personal' | 'business' | 'family';
export type ReviewScopeChoice = RuleScope | 'pending';
export type DecisionReason = 'person_name' | 'mixed_personal_business' | 'low_confidence' | 'transfer_confirm';

export interface MerchantAccountSummary {
  id: string;
  name: string;
  purpose: 'personal' | 'business';
  scopeTag: AccountScopeTag;
}

export interface MerchantGroup {
  merchantKey: string;
  displayName: string;
  variants: string[];
  maskedSample: string;
  count: number;
  totalAmount: number;
  debitTotal: number;
  creditTotal: number;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  frequency: MerchantFrequency;
  predominantDirection: 'debit' | 'credit' | 'mixed';
  firstDate: string;
  lastDate: string;
  accounts: MerchantAccountSummary[];
  accountScopes: AccountScopeTag[];
  isMixedPersonalAndBusiness: boolean;
  isPersonName: boolean;
  isLikelyTransfer: boolean;
  transactionIds: string[];
  transactionAccountIds: Record<string, string>; // txId -> accountId
}

export interface AutoCategorizeItem {
  id: string; // merchantKey
  merchantKey: string;
  displayName: string;
  variants: string[];
  count: number;
  totalAmount: number;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  frequency: MerchantFrequency;
  predominantDirection: 'debit' | 'credit' | 'mixed';
  accounts: MerchantAccountSummary[];
  accountScopes: AccountScopeTag[];
  isMixedPersonalAndBusiness: boolean;
  isPersonName: boolean;
  isLikelyTransfer: boolean;
  transactionIds: string[];
  transactionAccountIds: Record<string, string>;

  // AI & safety outputs
  suggestedCategoryName: string;
  suggestedCategoryId: string | null;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  reasoning: string;
  needsDecision: boolean;
  decisionReasons: DecisionReason[];
  alreadyCoveredByRuleId?: string | null;

  // User editable review state
  selectedCategoryName: string;
  selectedCategoryId: string | null;
  selectedScope: ReviewScopeChoice;
  selectedAccountId: string | null;
  isTransfer: boolean;
  approved: boolean;
  decisionResolved: boolean;
}

export interface AutoCategorizeBatchSummary {
  id: string;
  status: 'draft' | 'applied' | 'reverted';
  rules_created: number;
  transactions_categorized: number;
  applied_at: string | null;
  reverted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategorySummaryRow {
  categoryName: string;
  categoryId: string | null;
  merchantCount: number;
  totalAmount: number;
  approvedMerchantCount: number;
}

export function isAllowedCategoryName(name: string | null | undefined): boolean {
  if (!name) return false;
  return ALLOWED_NAME_SET.has(name.trim().toLowerCase());
}

export function normalizeAllowedCategoryName(name: string | null | undefined): string {
  if (!name) return 'Other';
  const trimmed = name.trim().toLowerCase();
  const exact = ALLOWED_AUTO_CATEGORIES.find((c) => c.name.toLowerCase() === trimmed);
  if (exact) return exact.name;
  return 'Other';
}

/**
 * Ensures all 13 canonical auto-categorization categories exist for the user
 * and returns them in canonical order.
 */
export async function ensureCanonicalCategories(
  db: any,
  userId: string
): Promise<Category[]> {
  const { data: existingRows, error } = await db
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},is_system.eq.true`);

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  const allRows: Category[] = Array.isArray(existingRows) ? existingRows : [];
  const byLowerName = new Map<string, Category>();
  for (const row of allRows) {
    const key = String(row.name || '').trim().toLowerCase();
    // Prefer user-owned row if multiple exist
    if (!byLowerName.has(key) || row.user_id === userId) {
      byLowerName.set(key, row);
    }
  }

  const missingSpecs = ALLOWED_AUTO_CATEGORIES.filter(
    (spec) => !byLowerName.has(spec.name.toLowerCase())
  );

  if (missingSpecs.length > 0) {
    const insertPayload = missingSpecs.map((spec) => ({
      user_id: userId,
      name: spec.name,
      icon: spec.icon,
      color_index: spec.color_index,
      is_income: spec.is_income,
      is_system: true,
    }));

    const { data: inserted, error: insErr } = await db
      .from('categories')
      .insert(insertPayload)
      .select('*');

    if (insErr) {
      throw new Error(`Failed to seed canonical categories: ${insErr.message}`);
    }

    for (const row of inserted || []) {
      byLowerName.set(String(row.name || '').trim().toLowerCase(), row);
    }
  }

  return ALLOWED_AUTO_CATEGORIES.map((spec) => {
    const cat = byLowerName.get(spec.name.toLowerCase());
    if (!cat) {
      throw new Error(`Missing canonical category: ${spec.name}`);
    }
    return cat;
  });
}
