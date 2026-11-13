import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TABLES = [
  'statement_uploads',
  'staged_transactions',
  'transactions',
  'audit_log',
  'transaction_rules',
  'recurring_transactions',
  'budgets',
  'invoices',
  'business_profiles',
  'clients',
  'payment_instructions',
  'ai_settings',
  'profiles',
] as const;

type TableResult = {
  table: string;
  user1Rows: number;
  leakedToUser2: number;
  status: 'PASS' | 'FAIL';
  note: string;
};

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return { url, anonKey };
}

function createTokenClient(url: string, anonKey: string, token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function main() {
  const user1Token = (process.env.RLS_USER1_TOKEN || '').trim();
  const user2Token = (process.env.RLS_USER2_TOKEN || '').trim();
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey || url.includes('placeholder') || anonKey.includes('placeholder')) {
    console.error(
      'ERROR: Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    );
    process.exit(1);
  }

  if (!user1Token || !user2Token) {
    console.error(
      'ERROR: Missing RLS_USER1_TOKEN and/or RLS_USER2_TOKEN environment variables.\n' +
        'Usage: RLS_USER1_TOKEN=eyJ... RLS_USER2_TOKEN=eyJ... npx tsx scripts/rls-verify.ts'
    );
    process.exit(1);
  }

  const user1Client = createTokenClient(url, anonKey, user1Token);
  const user2Client = createTokenClient(url, anonKey, user2Token);

  const [u1Res, u2Res] = await Promise.all([
    user1Client.auth.getUser(user1Token),
    user2Client.auth.getUser(user2Token),
  ]);

  if (u1Res.error || !u1Res.data.user) {
    console.error('ERROR: Invalid RLS_USER1_TOKEN:', u1Res.error?.message || 'no user');
    process.exit(1);
    return;
  }

  if (u2Res.error || !u2Res.data.user) {
    console.error('ERROR: Invalid RLS_USER2_TOKEN:', u2Res.error?.message || 'no user');
    process.exit(1);
    return;
  }

  const user1Id = u1Res.data.user.id;
  const user2Id = u2Res.data.user.id;

  if (user1Id === user2Id) {
    console.error('ERROR: RLS_USER1_TOKEN and RLS_USER2_TOKEN resolve to the same user.');
    process.exit(1);
    return;
  }

  console.log(`Verifying RLS isolation across ${TABLES.length} tables...`);
  console.log(`User 1: ${user1Id}`);
  console.log(`User 2: ${user2Id}\n`);

  const results: TableResult[] = [];

  for (const table of TABLES) {
    // Check User 1's own row count
    const u1Query = await user1Client
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', user1Id);

    if (u1Query.error) {
      results.push({
        table,
        user1Rows: 0,
        leakedToUser2: -1,
        status: 'FAIL',
        note: `User 1 query error: ${u1Query.error.message}`,
      });
      continue;
    }

    const user1Rows = u1Query.count ?? 0;

    // Query as User 2 for any rows NOT belonging to User 2 (including User 1's rows)
    const u2Query = await user2Client
      .from(table)
      .select('user_id')
      .neq('user_id', user2Id)
      .limit(100);

    if (u2Query.error) {
      results.push({
        table,
        user1Rows,
        leakedToUser2: -1,
        status: 'FAIL',
        note: `User 2 query error: ${u2Query.error.message}`,
      });
      continue;
    }

    const leakedRows = u2Query.data?.length ?? 0;
    const passed = leakedRows === 0;

    results.push({
      table,
      user1Rows,
      leakedToUser2: leakedRows,
      status: passed ? 'PASS' : 'FAIL',
      note: passed
        ? user1Rows > 0
          ? '0 rows leaked (User 1 has data)'
          : '0 rows leaked (User 1 table empty)'
        : `LEAK DETECTED: ${leakedRows} non-User-2 row(s) readable by User 2`,
    });
  }

  console.table(results);

  const failures = results.filter((r) => r.status === 'FAIL');
  if (failures.length > 0) {
    console.error(`\nRLS VERIFICATION FAILED: ${failures.length} table(s) failed isolation checks.`);
    process.exit(1);
  }

  console.log(`\nRLS VERIFICATION PASSED: All ${results.length} tables isolated (0 leaked rows).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error in rls-verify.ts:', err);
  process.exit(1);
});
