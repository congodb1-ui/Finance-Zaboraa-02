import type { User } from '@supabase/supabase-js';
import { encryptValue } from './crypto';

const OWNER_FULL_NAME = 'Wasim Salim Sayyed';
const OWNER_MOBILE = '9579662397';
const OWNER_PAN = 'EAYPS8506M';
const OWNER_ADDRESS = 'Kool Homes Solitaire, Kausar Baugh, Kondhwa Khurd, Pune-48';

const FAMILY_NAME = 'Sayyed Family';
const FAMILY_MEMBERS_SEED: Array<{ display_name: string; email: string | null; role: 'member' }> = [
  { display_name: 'Alisha Wasim Sayyed', email: null, role: 'member' },
  { display_name: 'Minaz Salim Sayyed', email: null, role: 'member' },
  { display_name: 'Salim Gaffar Sayyed', email: null, role: 'member' },
];

const ACCOUNTS_SEED = [
  {
    bank_name: 'HDFC Bank',
    account_type: 'savings',
    account_number_last4: '3597',
    name: 'HDFC Savings (3597)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Wasim Salim Sayyed',
    operated_by_owner: true,
    color_index: 0,
    icon: 'Landmark',
  },
  {
    bank_name: 'ICICI Bank',
    account_type: 'savings',
    account_number_last4: '8458',
    name: 'ICICI Savings (8458)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Wasim Salim Sayyed',
    operated_by_owner: true,
    color_index: 1,
    icon: 'Landmark',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    account_type: 'savings',
    account_number_last4: '5231',
    name: 'Kotak Savings (5231)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Wasim Salim Sayyed',
    operated_by_owner: true,
    color_index: 2,
    icon: 'Landmark',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    account_type: 'current',
    account_number_last4: '8212',
    name: 'Kotak Cifor Systems (8212)',
    purpose: 'business',
    opening_balance: 0,
    account_holder_name: 'Cifor Systems',
    operated_by_owner: true,
    color_index: 3,
    icon: 'Building2',
  },
  {
    bank_name: 'HDFC Bank',
    account_type: 'savings',
    account_number_last4: '5320',
    name: 'Alisha HDFC (5320)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Alisha Wasim Sayyed',
    operated_by_owner: true,
    color_index: 4,
    icon: 'Landmark',
  },
  {
    bank_name: 'ICICI Bank',
    account_type: 'savings',
    account_number_last4: '5244',
    name: 'Alisha ICICI (5244)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Alisha Wasim Sayyed',
    operated_by_owner: true,
    color_index: 5,
    icon: 'Landmark',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    account_type: 'savings',
    account_number_last4: '3011',
    name: 'Alisha Kotak (3011)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Alisha Wasim Sayyed',
    operated_by_owner: true,
    color_index: 6,
    icon: 'Landmark',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    account_type: 'savings',
    account_number_last4: '9735',
    name: 'Minaz Kotak (9735)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Minaz Salim Sayyed',
    operated_by_owner: false,
    color_index: 7,
    icon: 'Landmark',
  },
  {
    bank_name: 'IDFC FIRST Bank',
    account_type: 'savings',
    account_number_last4: '0553',
    name: 'Minaz IDFC (0553)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Minaz Salim Sayyed',
    operated_by_owner: false,
    color_index: 8,
    icon: 'Landmark',
  },
  {
    bank_name: 'SBI',
    account_type: 'savings',
    account_number_last4: '7904',
    name: 'Salim SBI (7904)',
    purpose: 'personal',
    opening_balance: 0,
    account_holder_name: 'Salim Gaffar Sayyed',
    operated_by_owner: false,
    color_index: 9,
    icon: 'Landmark',
  },
] as const;

/**
 * Idempotent post-login bootstrap for Batch 2b:
 * - Creates family ("Sayyed Family") + owner family_members row
 * - Seeds 3 non-login family members (Alisha, Minaz, Salim)
 * - Seeds owner profile (with ENCRYPTION_KEY-encrypted PAN) if missing
 * - Seeds business profile ("Cifor Systems") if missing
 * - Seeds all 10 accounts if the user has 0 accounts
 * - Seeds 3 starter transaction_rules if the user has 0 rules
 */
export async function ensureBatch2bBootstrap(
  serviceSupabase: any,
  user: Pick<User, 'id' | 'email' | 'user_metadata'>
): Promise<void> {
  if (!serviceSupabase || !user?.id) return;

  const userEmail = (user.email || '').trim().toLowerCase() || null;
  const nowIso = new Date().toISOString();

  // 1. Ensure Family + Owner member exist
  let familyId: string | null = null;
  const { data: existingFamily } = await serviceSupabase
    .from('families')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingFamily?.id) {
    familyId = existingFamily.id;
  } else {
    const { data: existingMembership } = await serviceSupabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (existingMembership?.family_id) {
      familyId = existingMembership.family_id;
    } else {
      const { data: createdFamily, error: familyErr } = await serviceSupabase
        .from('families')
        .insert({
          name: FAMILY_NAME,
          owner_id: user.id,
        })
        .select('id')
        .single();

      if (familyErr || !createdFamily?.id) {
        console.error('[Batch 2b] Failed to create family:', familyErr?.message);
      } else {
        familyId = createdFamily.id;
      }
    }
  }

  if (familyId) {
    // Ensure owner family_members row exists
    const { data: ownerMember } = await serviceSupabase
      .from('family_members')
      .select('id')
      .eq('family_id', familyId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!ownerMember) {
      const { error: ownerMemberErr } = await serviceSupabase
        .from('family_members')
        .insert({
          family_id: familyId,
          user_id: user.id,
          display_name: OWNER_FULL_NAME,
          email: userEmail || 'wasimssayyed@gmail.com',
          role: 'owner',
          joined_at: nowIso,
        });

      if (ownerMemberErr) {
        console.error('[Batch 2b] Failed to insert owner family member:', ownerMemberErr.message);
      }
    }

    // Seed the 3 non-login family members idempotently (Postgres UNIQUE(family_id, user_id) allows multiple NULLs)
    const { data: existingMembers } = await serviceSupabase
      .from('family_members')
      .select('display_name')
      .eq('family_id', familyId);

    const existingNames = new Set(
      (existingMembers || []).map((m: any) => String(m.display_name || '').trim().toLowerCase())
    );

    const missingMembers = FAMILY_MEMBERS_SEED.filter(
      (m) => !existingNames.has(m.display_name.toLowerCase())
    ).map((m) => ({
      family_id: familyId,
      user_id: null,
      display_name: m.display_name,
      email: m.email,
      role: m.role,
      joined_at: null,
    }));

    if (missingMembers.length > 0) {
      const { error: memErr } = await serviceSupabase
        .from('family_members')
        .insert(missingMembers);
      if (memErr) {
        console.error('[Batch 2b] Failed to seed family members:', memErr.message);
      }
    }
  }

  // 2. Seed Owner Profile ONLY if no profile row exists yet for user.id
  const { data: existingProfile } = await serviceSupabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existingProfile) {
    let encryptedPan: string | null = null;
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim().length > 0) {
      try {
        encryptedPan = await encryptValue(OWNER_PAN);
      } catch (encErr: any) {
        console.error('[Batch 2b] Failed to encrypt seed PAN:', encErr?.message);
      }
    } else {
      console.warn('[Batch 2b] ENCRYPTION_KEY not set; skipping encrypted PAN on profile seed.');
    }

    const { error: profileErr } = await serviceSupabase.from('profiles').insert({
      user_id: user.id,
      full_name: OWNER_FULL_NAME,
      owner_full_name: OWNER_FULL_NAME,
      email: userEmail || 'wasimssayyed@gmail.com',
      phone: OWNER_MOBILE,
      pan_encrypted: encryptedPan,
      address: OWNER_ADDRESS,
      default_fy: '2026-27',
      dark_mode: false,
      gmail_connected: false,
      gmail_sync_enabled: true,
      timezone: 'Asia/Kolkata',
    });

    if (profileErr) {
      console.error('[Batch 2b] Failed to seed owner profile:', profileErr.message);
    }
  }

  // 3. Seed Business Profile ("Cifor Systems") ONLY if none exists yet for user.id
  const { data: existingBiz } = await serviceSupabase
    .from('business_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existingBiz) {
    const { error: bizErr } = await serviceSupabase.from('business_profiles').insert({
      user_id: user.id,
      family_id: familyId,
      company_name: 'Cifor Systems',
      address: 'Kool Homes Solitaire, Kausar Baugh, Kondhwa Khurd, Pune-411048',
      country: 'IN',
      phone: '7498624807',
      email: null,
      default_currency: 'INR',
      invoice_prefix: 'INV',
      next_invoice_no: 1,
      default_payment_terms_days: 30,
    });

    if (bizErr) {
      console.error('[Batch 2b] Failed to seed business profile:', bizErr.message);
    }
  }

  // 4. Seed all 10 accounts ONLY if count is 0 for user.id
  const { count: accountCount, error: accCountErr } = await serviceSupabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (!accCountErr && (accountCount ?? 0) === 0) {
    const accountRows = ACCOUNTS_SEED.map((acc) => ({
      user_id: user.id,
      family_id: familyId,
      name: acc.name,
      bank_name: acc.bank_name,
      account_type: acc.account_type,
      account_number_last4: acc.account_number_last4,
      currency: 'INR',
      is_active: true,
      color_index: acc.color_index,
      icon: acc.icon,
      purpose: acc.purpose,
      opening_balance: acc.opening_balance,
      account_holder_name: acc.account_holder_name,
      operated_by_owner: acc.operated_by_owner,
    }));

    const { error: accErr } = await serviceSupabase.from('accounts').insert(accountRows);
    if (accErr) {
      console.error('[Batch 2b] Failed to seed 10 accounts:', accErr.message);
    }
  }

  // 5. Seed 3 starter transaction_rules ONLY if user has 0 rules
  const { count: ruleCount, error: ruleCountErr } = await serviceSupabase
    .from('transaction_rules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (!ruleCountErr && (ruleCount ?? 0) === 0) {
    const [{ data: categories }, { data: workspaces }] = await Promise.all([
      serviceSupabase
        .from('categories')
        .select('id, name, user_id, is_system')
        .or(`user_id.eq.${user.id},is_system.eq.true`),
      serviceSupabase
        .from('workspaces')
        .select('id, name')
        .eq('user_id', user.id),
    ]);

    const findCategoryId = (name: string): string | null => {
      const target = name.toLowerCase();
      const match =
        (categories || []).find(
          (c: any) => String(c.name || '').toLowerCase() === target && c.user_id === user.id
        ) ||
        (categories || []).find(
          (c: any) => String(c.name || '').toLowerCase() === target
        );
      return match?.id || null;
    };

    const findWorkspaceId = (name: string): string | null => {
      const target = name.toLowerCase();
      const match = (workspaces || []).find(
        (w: any) => String(w.name || '').toLowerCase() === target
      );
      return match?.id || null;
    };

    const personalWsId = findWorkspaceId('Personal');
    const businessWsId = findWorkspaceId('Business');
    const fuelCatId = findCategoryId('Fuel');
    const subscriptionsCatId = findCategoryId('Subscriptions');
    const softwareCatId = findCategoryId('Software & Cloud') || subscriptionsCatId;

    const starterRules = [
      {
        user_id: user.id,
        family_id: familyId,
        name: 'Sheetal Petroleum',
        priority: 10,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'SHEETAL PETROLEUM',
        set_category: fuelCatId,
        set_workspace: personalWsId,
        set_txn_type: 'expense',
        is_active: true,
      },
      {
        user_id: user.id,
        family_id: familyId,
        name: 'Apple Media',
        priority: 20,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'APPLE MEDIA',
        set_category: subscriptionsCatId,
        set_workspace: personalWsId,
        set_txn_type: 'expense',
        is_active: true,
      },
      {
        user_id: user.id,
        family_id: familyId,
        name: 'Google Cloud',
        priority: 30,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'GOOGLE CLOUD',
        set_category: softwareCatId,
        set_workspace: businessWsId,
        set_txn_type: 'expense',
        is_active: true,
      },
    ];

    const { error: ruleInsertErr } = await serviceSupabase
      .from('transaction_rules')
      .insert(starterRules);
    if (ruleInsertErr) {
      console.error('[Batch 2b] Failed to seed starter rules:', ruleInsertErr.message);
    }
  }
}
