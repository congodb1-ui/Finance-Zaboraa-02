import { callGeminiFlash, isAIError } from '../ai/gemini-client';
import { maskForAI } from '../ai/pii-mask';
import type { Category } from '../../types/categories';
import type { TransactionRule } from '../../types/transactions';
import {
  ALLOWED_CATEGORY_NAMES,
  normalizeAllowedCategoryName,
  type AutoCategorizeItem,
  type DecisionReason,
  type MerchantGroup,
  type ReviewScopeChoice,
} from './constants';
import { normalizeMerchantKey } from './merchant-grouping';
import { evaluateRuleMatch } from '../rules-engine';

interface DeterministicHint {
  categoryName: string;
  confidence: 'high' | 'medium';
  confidenceScore: number;
  reasoning: string;
  isTransfer?: boolean;
}

function getDeterministicHint(group: MerchantGroup): DeterministicHint | null {
  const key = group.merchantKey.toUpperCase();
  const sample = `${key} ${group.variants.join(' ').toUpperCase()}`;

  // Never auto-guess person names!
  if (group.isPersonName) {
    return null;
  }

  // Self / family transfers
  if (group.isLikelyTransfer) {
    return {
      categoryName: 'Family Transfer',
      confidence: 'medium',
      confidenceScore: 0.72,
      reasoning: 'Detected transfer between own or family accounts.',
      isTransfer: true,
    };
  }

  // Pharmacy / Health
  if (/\b(RELIEF CHEMIST|CHEMIST|PHARMACY|APOLLO PHARMACY|MEDPLUS|PHARMEASY|NETMEDS|1MG|MEDICAL|CLINIC|HOSPITAL|DIAGNOSTIC)\b/.test(key)) {
    return {
      categoryName: 'Pharmacy / Health',
      confidence: 'high',
      confidenceScore: 0.96,
      reasoning: 'Pharmacy or medical healthcare merchant.',
    };
  }

  // Food & Groceries
  if (
    /\b(BHAWANI SUPER MARKET|WESTERN BAKERY|SUPER MARKET|SUPERMARKET|BAKERY|KIRANA|GROCERY|GROCERIES|DMART|D MART|RELIANCE FRESH|SMART BAZAAR|BIGBASKET|BLINKIT|ZEPTO|INSTAMART|SWIGGY|ZOMATO|DAIRY|SWEETS|RESTAURANT|HOTEL|CAFE|BIRYANI|PIZZA|STARBUCKS)\b/.test(
      key
    )
  ) {
    return {
      categoryName: 'Food & Groceries',
      confidence: 'high',
      confidenceScore: 0.95,
      reasoning: 'Supermarket, bakery, grocery, or dining merchant.',
    };
  }

  // Fuel / Petrol
  if (/\b(SHEETAL PETROLEUM|PETROL|PETROLEUM|HPCL|BPCL|IOCL|INDIAN OIL|BHARAT PETROLEUM|HINDUSTAN PETROLEUM|SHELL FUEL|NAYARA ENERGY|FUEL PUMP)\b/.test(key)) {
    return {
      categoryName: 'Fuel / Petrol',
      confidence: 'high',
      confidenceScore: 0.96,
      reasoning: 'Fuel station / petroleum pump merchant.',
    };
  }

  // Rent & Utilities
  if (/\b(MSEDCL|MAHAVITARAN|BESCOM|TATA POWER|ADANI ELECTRICITY|TORRENT POWER|MAHANAGAR GAS|MGL|IGL|ELECTRICITY|WATER BILL|AIRTEL|JIO FIBER|JIOFIBER|VODAFONE|VI POSTPAID|BSNL|ACT FIBERNET|BROADBAND|RENT|WEWORK|COWORKING)\b/.test(key)) {
    return {
      categoryName: 'Rent & Utilities',
      confidence: 'high',
      confidenceScore: 0.94,
      reasoning: 'Electricity, utility, telecom, or rent merchant.',
    };
  }

  // Bank Charges (only if debit/mixed bank fee, not income interest)
  if (
    group.predominantDirection !== 'credit' &&
    /\b(BANK CHARGES?|SMS ALERT|SMS CHARGES?|DEBIT CARD FEE|ANNUAL FEE|MIN BAL|AMB NON|SERVICE CHARGE|PENAL|BOUNCE CHARGE|IMPS CHARGE|NEFT CHARGE|RTGS CHARGE|INTEREST DEBIT|INTEREST CHARGED|GST ON)\b/.test(
      sample
    )
  ) {
    return {
      categoryName: 'Bank Charges',
      confidence: 'high',
      confidenceScore: 0.95,
      reasoning: 'Bank service charge, fee, or penalty debit.',
    };
  }

  // Transport / Vehicle
  if (/\b(UBER|OLA|RAPIDO|INDIGO|VISTARA|AIR INDIA|IRCTC|METRO|FASTAG|TOLL|PARKING|GARAGE|MOTORS|MARUTI|HYUNDAI|HONDA SERVICE|TYRE)\b/.test(key)) {
    return {
      categoryName: 'Transport / Vehicle',
      confidence: 'high',
      confidenceScore: 0.92,
      reasoning: 'Transport, commute, travel, or vehicle service merchant.',
    };
  }

  // Entertainment
  if (/\b(NETFLIX|SPOTIFY|PRIME VIDEO|HOTSTAR|PVR|INOX|CINEPOLIS|BOOKMYSHOW|SONY LIV|ZEE5|YOUTUBE PREMIUM)\b/.test(key)) {
    return {
      categoryName: 'Entertainment',
      confidence: 'high',
      confidenceScore: 0.93,
      reasoning: 'Streaming or entertainment merchant.',
    };
  }

  // Salary / Income vs Business Income for clear credit patterns
  if (group.predominantDirection === 'credit') {
    if (/\b(SALARY|PAYROLL|STIPEND)\b/.test(key)) {
      return {
        categoryName: 'Salary / Income',
        confidence: 'high',
        confidenceScore: 0.95,
        reasoning: 'Salary or payroll credit.',
      };
    }
    if (
      group.accounts.some((a) => a.purpose === 'business') &&
      /\b(STRIPE|RAZORPAY|PAYPAL|WISE|INVOICE|RETAINER|TECHNOLOGIES|SOLUTIONS|SYSTEMS|PVT|LTD|LLP|CONSULTING|SERVICES|CLIENT)\b/.test(
        key
      )
    ) {
      return {
        categoryName: 'Business Income',
        confidence: 'high',
        confidenceScore: 0.91,
        reasoning: 'Business account credit from client or payment gateway.',
      };
    }
  }

  return null;
}

interface AIClassificationOutput {
  id: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasoning: string;
  is_transfer?: boolean;
}

async function classifyBatchWithGemini(
  groups: MerchantGroup[],
  ownerProfileName?: string
): Promise<Map<string, AIClassificationOutput>> {
  const resultMap = new Map<string, AIClassificationOutput>();
  if (groups.length === 0) return resultMap;

  const CHUNK_SIZE = 30;
  for (let i = 0; i < groups.length; i += CHUNK_SIZE) {
    const chunk = groups.slice(i, i + CHUNK_SIZE);

    // Strictly masked merchant-level summary — NO PAN, NO account numbers, NO passwords, NO OTPs
    const maskedPayload = chunk.map((g) => ({
      id: g.merchantKey,
      merchant: maskForAI(g.displayName, ownerProfileName) || g.displayName,
      sample: maskForAI(g.maskedSample, ownerProfileName) || g.displayName,
      direction: g.predominantDirection,
      count: g.count,
      avg_inr: g.avgAmount,
      frequency: g.frequency,
      account_purposes: Array.from(new Set(g.accounts.map((a) => a.purpose))),
    }));

    const prompt = `You are categorizing Indian bank statement merchants for an owner with personal, family, and business accounts.
ONLY choose a category from this exact list (do NOT invent any other category):
${JSON.stringify(ALLOWED_CATEGORY_NAMES)}

Rules:
1. If unsure, or if the merchant looks like a person's name, MUST return category "Other" and confidence "low".
2. Credits in business accounts from clients/companies must be "Business Income" (never "Shopping").
3. Salary credits must be "Salary / Income".
4. Transfers between own/family accounts must have is_transfer: true and category "Family Transfer".
5. Bank fees/SMS/card/interest charges must be "Bank Charges".
6. MSEDCL / Mahavitaran / electricity / internet / rent must be "Rent & Utilities".

Return ONLY a valid JSON array with no markdown:
[
  { "id": "<merchant_id>", "category": "<exact_allowed_category>", "confidence": "high"|"medium"|"low", "score": 0.0_to_1.0, "is_transfer": boolean, "reasoning": "short 1-line reason" }
]

Merchants:
${JSON.stringify(maskedPayload)}`;

    try {
      const res = await callGeminiFlash(prompt, {
        responseMimeType: 'application/json',
      });

      if (isAIError(res)) {
        // Leave chunk items missing -> marked low confidence / Needs Decision safely
        continue;
      }

      const cleaned = res.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.id) continue;
          const category = normalizeAllowedCategoryName(item.category);
          const conf: 'high' | 'medium' | 'low' =
            category === 'Other' && item.confidence === 'high'
              ? 'medium'
              : item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
              ? item.confidence
              : 'low';
          const rawScore = Number(item.score);
          const score = Number.isFinite(rawScore)
            ? Math.max(0, Math.min(1, rawScore))
            : conf === 'high'
            ? 0.9
            : conf === 'medium'
            ? 0.65
            : 0.25;

          resultMap.set(String(item.id), {
            id: String(item.id),
            category,
            confidence: conf,
            score,
            reasoning: typeof item.reasoning === 'string' ? item.reasoning : 'AI merchant classification',
            is_transfer: Boolean(item.is_transfer),
          });
        }
      }
    } catch {
      // Failed chunk -> graceful low confidence Needs Decision fallback
      continue;
    }
  }

  return resultMap;
}

export async function classifyMerchantGroups(
  groups: MerchantGroup[],
  existingRules: TransactionRule[],
  categories: Category[],
  ownerProfileName?: string
): Promise<AutoCategorizeItem[]> {
  const categoryByLowerName = new Map<string, Category>();
  for (const cat of categories) {
    categoryByLowerName.set(cat.name.trim().toLowerCase(), cat);
  }

  const getCategoryId = (name: string): string | null => {
    const c = categoryByLowerName.get(name.trim().toLowerCase());
    return c ? c.id : null;
  };

  const pendingForAI: MerchantGroup[] = [];
  const deterministicResults = new Map<string, DeterministicHint>();
  const existingRuleMatches = new Map<string, TransactionRule>();

  for (const g of groups) {
    // Check if an active existing rule already covers all accounts for this merchant
    const matchingRule = existingRules.find((r) => {
      if (!r.is_active) return false;
      if (r.merchant_key && r.merchant_key === g.merchantKey) {
        if (!r.scope || r.scope === 'all') return true;
        if (g.accounts.every((a) => a.purpose === r.scope)) return true;
        if (r.scope === 'account' && r.account_id && g.accounts.length === 1 && g.accounts[0].id === r.account_id) {
          return true;
        }
      }
      return evaluateRuleMatch(r, {
        description: g.variants[0] || g.displayName,
        debit: g.predominantDirection === 'credit' ? null : g.avgAmount,
        credit: g.predominantDirection === 'credit' ? g.avgAmount : null,
        txn_type: g.predominantDirection === 'credit' ? 'income' : 'expense',
      });
    });

    if (matchingRule && (!matchingRule.scope || matchingRule.scope === 'all')) {
      existingRuleMatches.set(g.merchantKey, matchingRule);
    }

    const hint = getDeterministicHint(g);
    if (hint) {
      deterministicResults.set(g.merchantKey, hint);
    } else if (!g.isPersonName) {
      pendingForAI.push(g);
    }
  }

  const aiResults = await classifyBatchWithGemini(pendingForAI, ownerProfileName);

  const items: AutoCategorizeItem[] = groups.map((g) => {
    const existingRule = existingRuleMatches.get(g.merchantKey);
    const hint = deterministicResults.get(g.merchantKey);
    const aiOut = aiResults.get(g.merchantKey);

    let suggestedCategoryName = 'Other';
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let confidenceScore = 0;
    let reasoning = 'Requires manual classification.';
    let isTransfer = g.isLikelyTransfer;

    if (g.isPersonName) {
      // NEVER auto-assign a person's name even if AI thinks it knows
      suggestedCategoryName = g.isLikelyTransfer ? 'Family Transfer' : 'Other';
      confidence = 'low';
      confidenceScore = 0.2;
      reasoning = g.isLikelyTransfer
        ? 'Counterparty appears to be a person/family member transfer.'
        : 'Counterparty looks like an individual person name — please review before applying.';
    } else if (hint) {
      suggestedCategoryName = hint.categoryName;
      confidence = hint.confidence;
      confidenceScore = hint.confidenceScore;
      reasoning = hint.reasoning;
      if (hint.isTransfer !== undefined) isTransfer = hint.isTransfer;
    } else if (aiOut) {
      suggestedCategoryName = aiOut.category;
      confidence = aiOut.confidence;
      confidenceScore = aiOut.score;
      reasoning = aiOut.reasoning;
      if (aiOut.is_transfer) {
        isTransfer = true;
        if (suggestedCategoryName === 'Other') {
          suggestedCategoryName = 'Family Transfer';
        }
      }
    } else {
      suggestedCategoryName = 'Other';
      confidence = 'low';
      confidenceScore = 0;
      reasoning = 'AI could not confidently classify this merchant — please decide.';
    }

    // Prevent Business Income from accidentally getting Shopping / expense categories on clear business credits
    if (
      !g.isPersonName &&
      !isTransfer &&
      g.predominantDirection === 'credit' &&
      g.accounts.some((a) => a.purpose === 'business') &&
      suggestedCategoryName === 'Shopping'
    ) {
      suggestedCategoryName = 'Business Income';
    }

    const decisionReasons: DecisionReason[] = [];
    if (g.isPersonName) decisionReasons.push('person_name');
    if (g.isMixedPersonalAndBusiness) decisionReasons.push('mixed_personal_business');
    if (confidence === 'low' || confidenceScore < 0.7 || suggestedCategoryName === 'Other') {
      decisionReasons.push('low_confidence');
    }
    if (isTransfer && !decisionReasons.includes('person_name')) {
      decisionReasons.push('transfer_confirm');
    }

    const needsDecision =
      g.isPersonName ||
      g.isMixedPersonalAndBusiness ||
      confidence === 'low' ||
      confidenceScore < 0.7 ||
      suggestedCategoryName === 'Other' ||
      isTransfer;

    // Default scope selection: if mixed personal & business, force explicit user decision ('pending')
    let selectedScope: ReviewScopeChoice = 'all';
    if (g.isMixedPersonalAndBusiness) {
      selectedScope = 'pending';
    } else if (g.accounts.length === 1) {
      selectedScope = g.accounts[0].purpose === 'business' ? 'business' : 'personal';
    }

    const suggestedCategoryId = getCategoryId(suggestedCategoryName);

    return {
      id: g.merchantKey,
      merchantKey: g.merchantKey,
      displayName: g.displayName,
      variants: g.variants,
      count: g.count,
      totalAmount: g.totalAmount,
      avgAmount: g.avgAmount,
      minAmount: g.minAmount,
      maxAmount: g.maxAmount,
      frequency: g.frequency,
      predominantDirection: g.predominantDirection,
      accounts: g.accounts,
      accountScopes: g.accountScopes,
      isMixedPersonalAndBusiness: g.isMixedPersonalAndBusiness,
      isPersonName: g.isPersonName,
      isLikelyTransfer: g.isLikelyTransfer,
      transactionIds: g.transactionIds,
      transactionAccountIds: g.transactionAccountIds,

      suggestedCategoryName,
      suggestedCategoryId,
      confidence,
      confidenceScore,
      reasoning,
      needsDecision,
      decisionReasons,
      alreadyCoveredByRuleId: existingRule ? existingRule.id : null,

      selectedCategoryName: suggestedCategoryName,
      selectedCategoryId: suggestedCategoryId,
      selectedScope,
      selectedAccountId: g.accounts.length === 1 ? g.accounts[0].id : null,
      isTransfer,
      // Auto-approve nothing on first load until user reviews / clicks Approve or Approve All High-Confidence!
      // Wait: user must review before Apply; non-decision high-confidence merchants can be approved in 1 click or individually.
      approved: false,
      decisionResolved: !needsDecision,
    };
  });

  return items;
}

export function deriveRuleMatchPattern(merchantKey: string, variants: string[]): string {
  const cleanKey = normalizeMerchantKey(merchantKey);
  if (cleanKey && cleanKey !== 'UNKNOWN MERCHANT') {
    return cleanKey;
  }
  return (variants[0] || merchantKey || '').trim();
}
