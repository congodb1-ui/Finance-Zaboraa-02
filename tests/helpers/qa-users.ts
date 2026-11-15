import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local.test' });
dotenv.config({ path: '.env.local' });

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://yargpwshsycktbcxnpit.supabase.co';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function createQAUser(tag: 'a' | 'b') {
  const email = `qa-${tag}-${Date.now()}@zaboraa-test.invalid`;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'QA-test-pass-9!',
      email_confirm: true,
      user_metadata: { qa: true },
    });
    if (error) {
      return { id: `mock-qa-${tag}-id`, email };
    }
    return { id: data.user.id, email };
  } catch {
    return { id: `mock-qa-${tag}-id`, email };
  }
}

export async function deleteQAUser(id: string) {
  if (id.startsWith('mock-')) return;
  // Delete all data rows first (RLS won't apply with service role)
  for (const table of [
    'transactions', 'staged_transactions', 'statement_uploads',
    'recurring', 'budgets', 'rules', 'categories',
    'invoices', 'clients', 'payment_instructions', 'accounts',
    'profiles', 'families', 'family_members',
  ]) {
    await admin.from(table).delete().eq('user_id', id);
  }
  await admin.auth.admin.deleteUser(id);
}
