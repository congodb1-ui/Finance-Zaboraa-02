import type { TransactionRule } from '../types/transactions';
import { normalizeMerchantKey } from './auto-categorize/merchant-grouping';

export interface RuleAccountContext {
  id?: string | null;
  purpose?: string | null;
}

/**
 * Evaluates whether a transaction or staged transaction matches a rule.
 */
export function evaluateRuleMatch(
  rule: TransactionRule,
  tx: {
    description?: string | null;
    raw_description?: string | null;
    reference_number?: string | null;
    debit?: number | null;
    credit?: number | null;
    txn_type?: string | null;
    account_id?: string | null;
  },
  accountContext?: RuleAccountContext
): boolean {
  if (!rule.is_active) return false;

  // Enforce optional rule scope ('all' | 'personal' | 'business' | 'account')
  const scope = rule.scope || 'all';
  if (scope === 'account') {
    const txAccId = accountContext?.id || tx.account_id || null;
    if (!rule.account_id || !txAccId || rule.account_id !== txAccId) {
      return false;
    }
  } else if (scope === 'personal') {
    if (accountContext?.purpose === 'business') {
      return false;
    }
  } else if (scope === 'business') {
    if (accountContext?.purpose && accountContext.purpose !== 'business') {
      return false;
    }
  }

  const matchVal = (rule.match_value || '').trim();

  switch (rule.match_field) {
    case 'description': {
      // Exact canonical merchant_key match when rule was created via Auto-Categorization
      if (rule.merchant_key) {
        const txMerchantKey = normalizeMerchantKey(tx.description, tx.raw_description);
        if (txMerchantKey === rule.merchant_key) {
          return true;
        }
      }

      const text = (tx.description || '').toLowerCase();
      const rawText = (tx.raw_description || '').toLowerCase();
      const target = matchVal.toLowerCase();
      if (!target) return false;

      if (rule.match_type === 'contains') {
        return text.includes(target) || rawText.includes(target);
      }
      if (rule.match_type === 'starts_with') {
        return text.startsWith(target);
      }
      if (rule.match_type === 'exact') {
        return text === target;
      }
      if (rule.match_type === 'regex') {
        try {
          const reg = new RegExp(matchVal, 'i');
          return reg.test(tx.description || '') || reg.test(tx.raw_description || '');
        } catch {
          return false;
        }
      }
      return false;
    }

    case 'reference_number': {
      const ref = (tx.reference_number || '').toLowerCase();
      const target = matchVal.toLowerCase();
      if (!target) return false;

      if (rule.match_type === 'contains') {
        return ref.includes(target);
      }
      if (rule.match_type === 'starts_with') {
        return ref.startsWith(target);
      }
      if (rule.match_type === 'exact') {
        return ref === target;
      }
      if (rule.match_type === 'regex') {
        try {
          const reg = new RegExp(matchVal, 'i');
          return reg.test(tx.reference_number || '');
        } catch {
          return false;
        }
      }
      return false;
    }

    case 'amount': {
      const amt = tx.debit ?? tx.credit ?? 0;
      const targetAmt = parseFloat(matchVal);
      if (isNaN(targetAmt)) return false;

      if (rule.match_type === 'gte') {
        return amt >= targetAmt;
      }
      if (rule.match_type === 'lte') {
        return amt <= targetAmt;
      }
      if (rule.match_type === 'exact') {
        return Math.abs(amt - targetAmt) < 0.001;
      }
      return false;
    }

    case 'txn_type': {
      const type = (tx.txn_type || '').toLowerCase();
      const target = matchVal.toLowerCase();
      if (!type || !target) return false;

      if (rule.match_type === 'exact' || rule.match_type === 'contains') {
        return type === target;
      }
      return false;
    }

    default:
      return false;
  }
}

/**
 * Runs a list of rules in priority order (lowest number = highest priority).
 * Returns the first matched rule or null.
 */
export function findFirstMatchingRule(
  rules: TransactionRule[],
  tx: {
    description?: string | null;
    raw_description?: string | null;
    reference_number?: string | null;
    debit?: number | null;
    credit?: number | null;
    txn_type?: string | null;
    account_id?: string | null;
  },
  accountContext?: RuleAccountContext
): TransactionRule | null {
  // Sort rules ascending by priority
  const sorted = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (evaluateRuleMatch(rule, tx, accountContext)) {
      return rule;
    }
  }

  return null;
}
