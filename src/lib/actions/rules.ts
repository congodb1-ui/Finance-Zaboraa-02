import { createClient } from '../supabase/client';
import type { TransactionRule, RuleFormData } from '../../types/transactions';
import { evaluateRuleMatch } from '../rules-engine';
import { getTransactions } from './transactions';

export async function getRules(): Promise<TransactionRule[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from('transaction_rules')
    .select('*, categories(id, name, color_index), workspaces(id, name)')
    .eq('user_id', user.id)
    .order('priority', { ascending: true });

  if (error || !data) {
    console.error('Failed to get transaction rules:', error);
    return [];
  }

  return data.map((d: any) => ({
    ...d,
    category: d.categories,
    workspace: d.workspaces,
  }));
}

export async function createRule(data: RuleFormData): Promise<TransactionRule> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Determine next priority if not supplied
  let priority = data.priority;
  if (priority === undefined) {
    const existing = await getRules();
    priority = (existing.length + 1) * 10;
  }

  const { data: inserted, error } = await supabase
    .from('transaction_rules')
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      priority,
      match_field: data.match_field,
      match_type: data.match_type,
      match_value: data.match_value.trim(),
      set_category: data.set_category || null,
      set_workspace: data.set_workspace || null,
      set_txn_type: data.set_txn_type || null,
      set_tags: data.set_tags || null,
      is_active: data.is_active ?? true,
    })
    .select('*, categories(id, name, color_index), workspaces(id, name)')
    .single();

  if (error || !inserted) {
    console.error('Failed to create rule:', error);
    throw new Error(error?.message || 'Failed to create rule');
  }

  return {
    ...inserted,
    category: inserted.categories,
    workspace: inserted.workspaces,
  };
}

export async function updateRule(
  id: string,
  data: Partial<RuleFormData & { is_active: boolean }>
): Promise<TransactionRule> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('transaction_rules')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, categories(id, name, color_index), workspaces(id, name)')
    .single();

  if (error || !updated) {
    console.error('Failed to update rule:', error);
    throw new Error(error?.message || 'Rule not found or update failed');
  }

  return {
    ...updated,
    category: updated.categories,
    workspace: updated.workspaces,
  };
}

export async function deleteRule(id: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('transaction_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete rule:', error);
    return false;
  }

  return true;
}

export async function reorderRules(orderedIds: string[]): Promise<TransactionRule[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase
      .from('transaction_rules')
      .update({ priority: (i + 1) * 10, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('user_id', user.id);
  }

  return getRules();
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
