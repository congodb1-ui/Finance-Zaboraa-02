import { createClient } from '../supabase/client';
import type { TransactionRule, RuleFormData } from '../../types/transactions';
import { evaluateRuleMatch } from '../rules-engine';
import { getTransactions } from './transactions';

export async function getRules(client?: any): Promise<TransactionRule[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('transaction_rules')
    .select('*, categories(id, name, color_index), workspaces(id, name)')
    .eq('user_id', user.id)
    .order('priority', { ascending: true });

  if (error || !data) {
    console.error('Error fetching rules:', error?.message);
    return [];
  }

  return data.map((d: any) => ({
    ...d,
    category: d.categories || undefined,
    workspace: d.workspaces || undefined,
  }));
}

export async function createRule(
  data: RuleFormData,
  client?: any
): Promise<TransactionRule> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  let priority = data.priority;
  if (priority === undefined || priority === null) {
    const existing = await getRules(supabase);
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
    throw new Error(error?.message || 'Failed to create rule.');
  }

  return {
    ...inserted,
    category: inserted.categories || undefined,
    workspace: inserted.workspaces || undefined,
  };
}

export async function updateRule(
  id: string,
  data: Partial<RuleFormData & { is_active: boolean }>,
  client?: any
): Promise<TransactionRule> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.priority !== undefined) updatePayload.priority = data.priority;
  if (data.match_field !== undefined) updatePayload.match_field = data.match_field;
  if (data.match_type !== undefined) updatePayload.match_type = data.match_type;
  if (data.match_value !== undefined) updatePayload.match_value = data.match_value.trim();
  if (data.set_category !== undefined) updatePayload.set_category = data.set_category || null;
  if (data.set_workspace !== undefined) updatePayload.set_workspace = data.set_workspace || null;
  if (data.set_txn_type !== undefined) updatePayload.set_txn_type = data.set_txn_type || null;
  if (data.set_tags !== undefined) updatePayload.set_tags = data.set_tags || null;
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;

  const { data: updated, error } = await supabase
    .from('transaction_rules')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, categories(id, name, color_index), workspaces(id, name)')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Rule not found');
  }

  return {
    ...updated,
    category: updated.categories || undefined,
    workspace: updated.workspaces || undefined,
  };
}

export async function deleteRule(id: string, client?: any): Promise<boolean> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase
    .from('transaction_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function reorderRules(
  orderedIds: string[],
  client?: any
): Promise<TransactionRule[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('transaction_rules')
      .update({ priority: (i + 1) * 10, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  return getRules(supabase);
}

/**
 * Tests how many existing transactions would match a candidate rule
 */
export async function testRulePreview(
  candidate: {
    match_field: TransactionRule['match_field'];
    match_type: TransactionRule['match_type'];
    match_value: string;
  },
  client?: any
): Promise<number> {
  const { transactions } = await getTransactions({ page: 1, pageSize: 500 }, client);
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
