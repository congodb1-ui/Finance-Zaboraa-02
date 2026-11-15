import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://placeholder-project.supabase.co';

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function ensureUserBootstrap(userId: string, email: string, fullName?: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return;

  try {
    // 1. Ensure Profile row exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) {
      console.log(`[bootstrap] Creating profile for user ${userId}`);
      await supabase.from('profiles').insert({
        user_id: userId,
        email: email.toLowerCase(),
        full_name: fullName || null,
        owner_full_name: fullName || null,
      });
    }

    // 2. Ensure Family & Family Member exists
    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) {
      console.log(`[bootstrap] Creating default family for user ${userId}`);
      const familyName = fullName ? `${fullName}'s Family` : 'My Family';
      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          name: familyName,
          owner_id: userId,
        })
        .select('id')
        .single();

      if (newFamily && !famErr) {
        await supabase.from('family_members').insert({
          family_id: newFamily.id,
          user_id: userId,
          display_name: fullName || email.split('@')[0],
          email: email.toLowerCase(),
          role: 'owner',
          joined_at: new Date().toISOString(),
        });
      }
    }

    // 3. Ensure Default Categories (Trigger handle_new_user_setup handles this for new users,
    //    but we call seed_default_categories RPC if zero categories exist)
    const { count } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count === 0) {
      console.log(`[bootstrap] Calling seed_default_categories RPC for user ${userId}`);
      try {
        await supabase.rpc('seed_default_categories', { p_user_id: userId });
      } catch (rpcErr) {
        console.warn('[bootstrap] seed_default_categories RPC error:', rpcErr);
      }
    }
  } catch (err: any) {
    console.error('[bootstrap] Error during user bootstrap:', err?.message || err);
  }
}
