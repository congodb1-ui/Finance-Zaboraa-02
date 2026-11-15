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

type TableName = (typeof TABLES)[number];

type TableResult = {
  table: string;
  user1Rows: number;
  leakedToUser2: number;
  anonRows: number;
  crossWriteBlocked: string;
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

function createTokenClient(url: string, anonKey: string, token?: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(token
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      : {}),
  });
}

async function getOrSeedAccountId(user1Client: SupabaseClient, user1Id: string): Promise<string> {
  const existing = await user1Client
    .from('accounts')
    .select('id')
    .eq('user_id', user1Id)
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    return existing.data.id;
  }

  const created = await user1Client
    .from('accounts')
    .insert({
      user_id: user1Id,
      name: 'RLS Verify Seed Account',
      bank_name: 'Test Bank',
      account_type: 'savings',
      currency: 'INR',
    })
    .select('id')
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(`Failed to seed prerequisite account: ${created.error?.message || 'unknown'}`);
  }
  return created.data.id;
}

async function getOrSeedCategoryId(user1Client: SupabaseClient, user1Id: string): Promise<string> {
  const existing = await user1Client
    .from('categories')
    .select('id')
    .eq('user_id', user1Id)
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    return existing.data.id;
  }

  const created = await user1Client
    .from('categories')
    .insert({
      user_id: user1Id,
      name: `RLS_Seed_Cat_${Date.now()}`,
      color_index: 0,
      is_income: false,
      is_system: false,
    })
    .select('id')
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(`Failed to seed prerequisite category: ${created.error?.message || 'unknown'}`);
  }
  return created.data.id;
}

async function buildInsertPayload(
  table: TableName,
  targetUserId: string,
  deps: { accountId: string; categoryId: string; uploadId: string }
): Promise<Record<string, unknown>> {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  switch (table) {
    case 'statement_uploads':
      return {
        user_id: targetUserId,
        account_id: deps.accountId,
        file_name: `rls-seed-${suffix}.csv`,
        file_hash: `rls_seed_hash_${suffix}`,
        file_type: 'csv',
        storage_path: `${targetUserId}/rls-seed-${suffix}.csv`,
        parser_version: 'csv-generic-v1',
        status: 'pending',
      };
    case 'staged_transactions':
      return {
        user_id: targetUserId,
        upload_id: deps.uploadId,
        account_id: deps.accountId,
        txn_date: '2026-04-01',
        description: `RLS Seed Staged ${suffix}`,
      };
    case 'transactions':
      return {
        user_id: targetUserId,
        account_id: deps.accountId,
        txn_date: '2026-04-01',
        description: `RLS Seed Txn ${suffix}`,
      };
    case 'audit_log':
      return {
        user_id: targetUserId,
        table_name: 'transactions',
        record_id: '00000000-0000-0000-0000-000000000000',
        action: 'insert',
      };
    case 'transaction_rules':
      return {
        user_id: targetUserId,
        name: `RLS Seed Rule ${suffix}`,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'RLS_SEED',
      };
    case 'recurring_transactions':
      return {
        user_id: targetUserId,
        account_id: deps.accountId,
        description: `RLS Seed Recurring ${suffix}`,
        amount: 100,
        txn_type: 'expense',
        frequency: 'monthly',
        next_due_date: '2026-05-01',
      };
    case 'budgets':
      return {
        user_id: targetUserId,
        category_id: deps.categoryId,
        period: 'monthly',
        fy_year: `2026-27`,
        amount: 5000,
      };
    case 'invoices':
      return {
        user_id: targetUserId,
        invoice_number: `RLS-SEED-${suffix}`,
        client_name: 'RLS Seed Client',
        issue_date: '2026-04-01',
        status: 'draft',
        currency: 'INR',
        tax_label: 'GST',
      };
    case 'business_profiles':
      return {
        user_id: targetUserId,
        company_name: 'RLS Seed Business',
      };
    case 'clients':
      return {
        user_id: targetUserId,
        name: `RLS Seed Client ${suffix}`,
      };
    case 'payment_instructions':
      return {
        user_id: targetUserId,
        label: `RLS Seed Bank ${suffix}`,
        beneficiary_name: 'RLS Seed Beneficiary',
        currency: 'USD',
      };
    case 'ai_settings':
      return {
        user_id: targetUserId,
        ai_enabled: true,
      };
    case 'profiles':
      return {
        user_id: targetUserId,
        full_name: 'RLS Seed User',
      };
  }
}

async function seedMissingRowsAsUser1(
  user1Client: SupabaseClient,
  user1Id: string
): Promise<{ accountId: string; categoryId: string; uploadId: string }> {
  console.log('--seed enabled: seeding minimal User 1 rows (using RLS_USER1_TOKEN only)...');
  const accountId = await getOrSeedAccountId(user1Client, user1Id);
  const categoryId = await getOrSeedCategoryId(user1Client, user1Id);

  let uploadId = '';
  const existingUpload = await user1Client
    .from('statement_uploads')
    .select('id')
    .eq('user_id', user1Id)
    .limit(1)
    .maybeSingle();

  if (existingUpload.data?.id) {
    uploadId = existingUpload.data.id;
  } else {
    const payload = await buildInsertPayload('statement_uploads', user1Id, {
      accountId,
      categoryId,
      uploadId: '',
    });
    const insertedUpload = await user1Client
      .from('statement_uploads')
      .insert(payload)
      .select('id')
      .single();
    if (insertedUpload.error || !insertedUpload.data?.id) {
      console.warn(`  [seed] statement_uploads insert notice: ${insertedUpload.error?.message}`);
    } else {
      uploadId = insertedUpload.data.id;
    }
  }

  for (const table of TABLES) {
    if (table === 'statement_uploads') continue;
    const countRes = await user1Client
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', user1Id);

    if ((countRes.count ?? 0) > 0) {
      continue;
    }

    const payload = await buildInsertPayload(table, user1Id, {
      accountId,
      categoryId,
      uploadId: uploadId || '00000000-0000-0000-0000-000000000000',
    });

    const ins = await user1Client.from(table).insert(payload).select('user_id').maybeSingle();
    if (ins.error) {
      if (table === 'audit_log') {
        console.warn(
          `  [seed] audit_log: SELECT-only RLS prevents direct client insert (${ins.error.message}). Trigger an app event to populate audit_log for User 1.`
        );
      } else {
        console.warn(`  [seed] ${table} insert failed: ${ins.error.message}`);
      }
    } else {
      console.log(`  [seed] ${table}: seeded 1 row for User 1`);
    }
  }

  console.log('');
  return {
    accountId,
    categoryId,
    uploadId: uploadId || '00000000-0000-0000-0000-000000000000',
  };
}

function getUpdateFieldForTable(table: TableName): Record<string, unknown> {
  switch (table) {
    case 'statement_uploads':
      return { file_name: 'tampered.csv' };
    case 'staged_transactions':
      return { description: 'tampered' };
    case 'transactions':
      return { description: 'tampered' };
    case 'audit_log':
      return { table_name: 'tampered' };
    case 'transaction_rules':
      return { name: 'tampered' };
    case 'recurring_transactions':
      return { description: 'tampered' };
    case 'budgets':
      return { amount: 999999 };
    case 'invoices':
      return { client_name: 'tampered' };
    case 'business_profiles':
      return { company_name: 'tampered' };
    case 'clients':
      return { name: 'tampered' };
    case 'payment_instructions':
      return { label: 'tampered' };
    case 'ai_settings':
      return { ai_enabled: false };
    case 'profiles':
      return { full_name: 'tampered' };
  }
}

async function main() {
  const shouldSeed = process.argv.includes('--seed');
  const user1Token = (process.env.RLS_USER1_TOKEN || '').trim();
  const user2Token = (process.env.RLS_USER2_TOKEN || '').trim();
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey || url.includes('placeholder') || anonKey.includes('placeholder')) {
    console.error(
      'ERROR: Missing Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    );
    process.exit(1);
    return;
  }

  if (!user1Token || !user2Token) {
    console.error(
      'ERROR: Missing RLS_USER1_TOKEN and/or RLS_USER2_TOKEN environment variables.\n' +
        'Usage: RLS_USER1_TOKEN=eyJ... RLS_USER2_TOKEN=eyJ... npx tsx scripts/rls-verify.ts [--seed]'
    );
    process.exit(1);
    return;
  }

  const user1Client = createTokenClient(url, anonKey, user1Token);
  const user2Client = createTokenClient(url, anonKey, user2Token);
  const anonClient = createTokenClient(url, anonKey);

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

  let deps = {
    accountId: '00000000-0000-0000-0000-000000000000',
    categoryId: '00000000-0000-0000-0000-000000000000',
    uploadId: '00000000-0000-0000-0000-000000000000',
  };

  if (shouldSeed) {
    deps = await seedMissingRowsAsUser1(user1Client, user1Id);
  } else {
    const [acc, cat, up] = await Promise.all([
      user1Client.from('accounts').select('id').eq('user_id', user1Id).limit(1).maybeSingle(),
      user1Client.from('categories').select('id').eq('user_id', user1Id).limit(1).maybeSingle(),
      user1Client.from('statement_uploads').select('id').eq('user_id', user1Id).limit(1).maybeSingle(),
    ]);
    deps = {
      accountId: acc.data?.id || deps.accountId,
      categoryId: cat.data?.id || deps.categoryId,
      uploadId: up.data?.id || deps.uploadId,
    };
  }

  const results: TableResult[] = [];

  for (const table of TABLES) {
    const failures: string[] = [];

    // 1. Positive control: User 1 must see > 0 rows
    const u1Query = await user1Client
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', user1Id);

    const user1Rows = u1Query.error ? 0 : u1Query.count ?? 0;
    if (u1Query.error) {
      failures.push(`User 1 query error: ${u1Query.error.message}`);
    } else if (user1Rows === 0) {
      failures.push('no seed data');
    }

    // 2. Cross-user read: User 2 querying non-User-2 rows must return 0
    const u2Query = await user2Client
      .from(table)
      .select('user_id')
      .neq('user_id', user2Id)
      .limit(100);

    let leakedToUser2 = 0;
    if (u2Query.error) {
      failures.push(`User 2 read error: ${u2Query.error.message}`);
    } else {
      leakedToUser2 = u2Query.data?.length ?? 0;
      if (leakedToUser2 > 0) {
        failures.push(`LEAK: ${leakedToUser2} non-User-2 row(s) readable by User 2`);
      }
    }

    // 3. Unauthenticated (anon key, no user token) read must return 0 rows
    const anonQuery = await anonClient.from(table).select('user_id').limit(10);
    const anonRows = anonQuery.data?.length ?? 0;
    if (anonRows > 0) {
      failures.push(`ANON LEAK: ${anonRows} row(s) readable without user token`);
    }

    // 4. Cross-user write tests: User 2 INSERT with User 1's user_id, UPDATE, DELETE on User 1's rows
    const forgedPayload = await buildInsertPayload(table, user1Id, deps);
    const u2Insert = await user2Client.from(table).insert(forgedPayload).select('user_id');
    const insertSucceeded = !u2Insert.error && (u2Insert.data?.length ?? 0) > 0;
    if (insertSucceeded) {
      failures.push('CROSS-WRITE: User 2 inserted row with User 1 user_id');
    }

    const updateFields = getUpdateFieldForTable(table);
    const u2Update = await user2Client
      .from(table)
      .update(updateFields)
      .eq('user_id', user1Id)
      .select('user_id');
    const updateAffected = u2Update.data?.length ?? 0;
    if (updateAffected > 0) {
      failures.push(`CROSS-WRITE: User 2 updated ${updateAffected} User 1 row(s)`);
    }

    const u2Delete = await user2Client
      .from(table)
      .delete()
      .eq('user_id', user1Id)
      .select('user_id');
    const deleteAffected = u2Delete.data?.length ?? 0;
    if (deleteAffected > 0) {
      failures.push(`CROSS-WRITE: User 2 deleted ${deleteAffected} User 1 row(s)`);
    }

    const crossWriteBlocked =
      !insertSucceeded && updateAffected === 0 && deleteAffected === 0 ? 'BLOCKED' : 'LEAKED';

    results.push({
      table,
      user1Rows,
      leakedToUser2,
      anonRows,
      crossWriteBlocked,
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      note: failures.length === 0 ? 'Positive + Read/Write/Anon isolated' : failures.join('; '),
    });
  }

  console.table(results);

  const failedTables = results.filter((r) => r.status === 'FAIL');
  if (failedTables.length > 0) {
    console.error(
      `\nRLS VERIFICATION FAILED: ${failedTables.length} table(s) failed isolation/control checks.`
    );
    process.exit(1);
    return;
  }

  console.log(
    `\nRLS VERIFICATION PASSED: All ${results.length} tables passed positive control, cross-user read/write, and anon read checks.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error in rls-verify.ts:', err);
  process.exit(1);
});
