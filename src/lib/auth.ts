import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase/client';
import { mapSupabaseUserToProfile, type UserProfile, type AuthState } from '../types/auth';

/**
 * Initiates Google OAuth login via Supabase Auth
 * Uses Google provider exclusively per PRD requirements.
 */
export async function signInWithGoogle(redirectTo?: string) {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://zaboraa.com';

  const targetRedirect = redirectTo || `${origin}/api/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: targetRedirect,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Error initiating Google OAuth:', error.message);
    throw error;
  }

  return data;
}

/**
 * Signs the user out, clears session, and redirects to landing page
 */
export async function signOut(redirectTo: string = '/') {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error.message);
  }
  if (typeof window !== 'undefined') {
    window.location.href = redirectTo;
  }
}

/**
 * Client React Hook for tracking Supabase Auth state
 */
export function useAuth(): AuthState & {
  signInWithGoogle: (redirectTo?: string) => Promise<any>;
  signOut: (redirectTo?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
} {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();

      if (sbUser) {
        setUser(mapSupabaseUserToProfile(sbUser));
      } else {
        setUser(null);
      }
    } catch (err) {
      console.warn('Failed to fetch user session:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    // Listen to real-time auth changes (sign in, token refresh, sign out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUserToProfile(session.user));
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    signInWithGoogle,
    signOut,
    refreshSession,
  };
}
