import type { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * UserProfile type derived directly from Supabase auth.users
 * No custom profile table in Batch 1 — data comes from supabase.auth.getUser()
 */
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

/**
 * Helper to map a Supabase Auth User object to UserProfile
 */
export function mapSupabaseUserToProfile(user: SupabaseUser): UserProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? (user.user_metadata?.picture as string) ?? null,
    created_at: user.created_at,
  };
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
