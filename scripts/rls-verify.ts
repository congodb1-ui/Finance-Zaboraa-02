import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function verifyRLSIsolation(qaUserAToken: string, qaUserBToken: string, qaUserBId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables missing for RLS verification.');
  }

  const clientA = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${qaUserAToken}` } },
    auth: { persistSession: false },
  });

  const publicTables = [
    'accounts',
    'categories',
    'workspaces',
    'statement_uploads',
    'staged_transactions',
    'transactions',
    'audit_log',
    'transaction_rules',
    'recurring_transactions',
    'budgets',
    'profiles',
    'business_profiles',
    'clients',
    'payment_instructions',
    'invoices',
    'families',
    'family_members',
  ];

  const violations: string[] = [];

  for (const table of publicTables) {
    const { data, error } = await clientA
      .from(table)
      .select('*')
      .eq('user_id', qaUserBId);

    if (!error && data && data.length > 0) {
      violations.push(`Cross-user read violation on table '${table}': User A read User B's row.`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
