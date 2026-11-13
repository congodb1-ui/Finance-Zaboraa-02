import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogInput {
  user_id: string;
  action: 'insert' | 'update' | 'delete' | 'import';
  entity: string;
  entity_id: string;
  before_json?: Record<string, any> | null;
  after_json?: Record<string, any> | null;
}

/**
 * Server-only audit log writer using a Supabase service-role client.
 * Never throws so audit failures never break parent ledger operations.
 */
export async function writeAuditLog(
  serviceSupabase: SupabaseClient<any, any, any> | any,
  entry: AuditLogInput
): Promise<void> {
  if (!serviceSupabase) {
    console.error('[audit] Service Supabase client unavailable; skipping audit_log write.');
    return;
  }

  try {
    // Map 'import' -> 'insert' to satisfy audit_log.action CHECK ('insert','update','delete')
    // while retaining the original event name inside new_data.
    const dbAction = entry.action === 'import' ? 'insert' : entry.action;
    const newData =
      entry.action === 'import'
        ? { ...(entry.after_json || {}), audit_action: 'import' }
        : entry.after_json ?? null;

    const { error } = await serviceSupabase.from('audit_log').insert({
      user_id: entry.user_id,
      table_name: entry.entity,
      record_id: entry.entity_id,
      action: dbAction,
      old_data: entry.before_json ?? null,
      new_data: newData,
    });

    if (error) {
      console.error('[audit] Failed to write audit_log:', error.message);
    }
  } catch (err) {
    console.error('[audit] Unexpected error writing audit_log:', err);
  }
}
