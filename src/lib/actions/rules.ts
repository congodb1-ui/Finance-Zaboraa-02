import { createClient } from '../supabase/client';
import type { TransactionRule, RuleFormData } from '../../types/transactions';
import { evaluateRuleMatch } from '../rules-engine';
import { getTransactions } from './transactions';

// Seed default rules for the rules engine
let localRulesStore: TransactionRule[] = [
  {
    id: 'rule_swiggy_food',
    user_id: 'default_owner',
    name: 'Swiggy Food & Dining',
    priority: 10,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'SWIGGY',
    set_category: 'cat_1', // Food & Dining
    set_workspace: 'ws_personal',
    set_txn_type: 'expense',
    set_tags: ['food', 'online'],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: {
      id: 'cat_1',
      name: 'Food & Dining',
      color_index: 5,
    },
    workspace: {
      id: 'ws_personal',
      name: 'Personal',
    },
  },
  {
    id: 'rule_zomato_food',
    user_id: 'default_owner',
    name: 'Zomato Dining & Delivery',
    priority: 20,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'ZOMATO',
    set_category: 'cat_1',
    set_workspace: 'ws_personal',
    set_txn_type: 'expense',
    set_tags: ['food', 'zomato'],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: {
      id: 'cat_1',
      name: 'Food & Dining',
      color_index: 5,
    },
    workspace: {
      id: 'ws_personal',
      name: 'Personal',
    },
  },
  {
    id: 'rule_client_consulting',
    user_id: 'default_owner',
    name: 'Client Consulting Income',
    priority: 30,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'CONSULT',
    set_category: 'cat_6', // Freelance / Consulting
    set_workspace: 'ws_business',
    set_txn_type: 'income',
    set_tags: ['consulting', 'business'],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: {
      id: 'cat_6',
      name: 'Freelance / Consulting',
      color_index: 0,
    },
    workspace: {
      id: 'ws_business',
      name: 'Business',
    },
  },
  {
    id: 'rule_wework_office',
    user_id: 'default_owner',
    name: 'WeWork Office Rent',
    priority: 40,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'WEWORK',
    set_category: 'cat_7',
    set_workspace: 'ws_business',
    set_txn_type: 'expense',
    set_tags: ['office', 'rent'],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: {
      id: 'cat_7',
      name: 'Client Payment',
      color_index: 0,
    },
    workspace: {
      id: 'ws_business',
      name: 'Business',
    },
  },
];

export async function getRules(): Promise<TransactionRule[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('transaction_rules')
        .select('*, categories(id, name, color_index), workspaces(id, name)')
        .order('priority', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          ...d,
          category: d.categories,
          workspace: d.workspaces,
        }));
      }
    }
  } catch {
    // local fallback
  }

  return [...localRulesStore].sort((a, b) => a.priority - b.priority);
}

export async function createRule(data: RuleFormData): Promise<TransactionRule> {
  const newRule: TransactionRule = {
    id: `rule_${Date.now()}`,
    user_id: 'default_owner',
    name: data.name.trim(),
    priority: data.priority ?? (localRulesStore.length + 1) * 10,
    match_field: data.match_field,
    match_type: data.match_type,
    match_value: data.match_value.trim(),
    set_category: data.set_category || null,
    set_workspace: data.set_workspace || null,
    set_txn_type: data.set_txn_type || null,
    set_tags: data.set_tags || null,
    is_active: data.is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: inserted, error } = await supabase
        .from('transaction_rules')
        .insert({
          user_id: user.id,
          name: newRule.name,
          priority: newRule.priority,
          match_field: newRule.match_field,
          match_type: newRule.match_type,
          match_value: newRule.match_value,
          set_category: newRule.set_category,
          set_workspace: newRule.set_workspace,
          set_txn_type: newRule.set_txn_type,
          set_tags: newRule.set_tags,
          is_active: newRule.is_active,
        })
        .select()
        .single();

      if (!error && inserted) {
        newRule.id = inserted.id;
      }
    }
  } catch {
    // Continue
  }

  localRulesStore.push(newRule);
  return newRule;
}

export async function updateRule(
  id: string,
  data: Partial<RuleFormData & { is_active: boolean }>
): Promise<TransactionRule> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('transaction_rules')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  } catch {
    // Continue
  }

  const idx = localRulesStore.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error('Rule not found');

  localRulesStore[idx] = {
    ...localRulesStore[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };

  return localRulesStore[idx];
}

export async function deleteRule(id: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from('transaction_rules').delete().eq('id', id);
    }
  } catch {
    // Continue
  }

  localRulesStore = localRulesStore.filter((r) => r.id !== id);
  return true;
}

export async function reorderRules(orderedIds: string[]): Promise<TransactionRule[]> {
  orderedIds.forEach((id, idx) => {
    const rule = localRulesStore.find((r) => r.id === id);
    if (rule) {
      rule.priority = (idx + 1) * 10;
      rule.updated_at = new Date().toISOString();
    }
  });

  try {
    const supabase = createClient();
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase
        .from('transaction_rules')
        .update({ priority: (i + 1) * 10 })
        .eq('id', orderedIds[i]);
    }
  } catch {
    // Continue
  }

  return [...localRulesStore].sort((a, b) => a.priority - b.priority);
}

/**
 * Tests how many existing transactions would match a candidate rule
 */
export async function testRulePreview(candidate: {
  match_field: TransactionRule['match_field'];
  match_type: TransactionRule['match_type'];
  match_value: string;
}): Promise<number> {
  const { transactions } = await getTransactions({ page: 1, pageSize: 500 });
  const mockRule: TransactionRule = {
    id: 'test',
    user_id: 'test',
    name: 'test',
    priority: 1,
    match_field: candidate.match_field,
    match_type: candidate.match_type,
    match_value: candidate.match_value,
    set_category: null,
    set_workspace: null,
    set_txn_type: null,
    set_tags: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  let count = 0;
  for (const t of transactions) {
    if (evaluateRuleMatch(mockRule, t)) {
      count++;
    }
  }
  return count;
}
