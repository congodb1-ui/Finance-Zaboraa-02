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

export async function getQASession(userId: string, email: string) {
  // Mint a session via admin.auth.admin.generateLink (magic link),
  // then exchange the token for a real access_token.
  const { data } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const token = data?.properties?.hashed_token!;
  const { data: session } = await admin.auth.verifyOtp({
    token_hash: token,
    type: 'magiclink',
  });
  return session?.session?.access_token!;
}
