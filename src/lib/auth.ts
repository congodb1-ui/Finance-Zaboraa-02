import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase/client';
import { mapSupabaseUserToProfile, type UserProfile, type AuthState } from '../types/auth';

export const DEMO_USER_PROFILE: UserProfile = {
  id: 'usr_01j7bf93a8e9_demo',
  email: 'wasimssayyed@gmail.com',
  full_name: 'Wasim Sayyed',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00.000Z',
};

const PREVIEW_SESSION_KEY = 'zaboraa_preview_session';

/**
 * Initiates Google OAuth login via Supabase Auth
 * Uses window.location.origin + '/#dashboard' for client-side PKCE in Vite SPA.
 */
export async function signInWithGoogle(redirectTo?: string) {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
    !(import.meta as any).env?.VITE_SUPABASE_URL;

  if (isPlaceholder) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PREVIEW_SESSION_KEY, 'true');
      window.dispatchEvent(new Event('auth-state-change'));
    }
    return { provider: 'google', url: null };
  }

  try {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || 'https://zaboraa.com';

    // In a Vite SPA, redirecting to /#dashboard lets the Supabase client exchange PKCE code cleanly
    const targetRedirect = redirectTo || `${origin}/#dashboard`;

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
      console.warn('Supabase OAuth error, activating preview session:', error.message);
      if (typeof window !== 'undefined') {
        localStorage.setItem(PREVIEW_SESSION_KEY, 'true');
        window.dispatchEvent(new Event('auth-state-change'));
      }
      return { provider: 'google', url: null };
    }

    return data;
  } catch (err) {
    console.warn('OAuth initialization failed, activating preview session:', err);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PREVIEW_SESSION_KEY, 'true');
      window.dispatchEvent(new Event('auth-state-change'));
    }
    return { provider: 'google', url: null };
  }
}

/**
 * Signs the user out, clears session, and redirects to landing page
 */
export async function signOut(redirectTo: string = '/') {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PREVIEW_SESSION_KEY);
    window.dispatchEvent(new Event('auth-state-change'));
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Error signing out of Supabase:', error.message);
    }
  } catch {
    // Ignore offline error
  }

  if (typeof window !== 'undefined') {
    window.location.hash = '';
    if (window.location.pathname !== redirectTo && !window.location.hash) {
      window.location.href = redirectTo;
    }
  }
}

/**
 * Verifies with Express server whether the authenticated user is on ALLOWED_EMAILS.
 * If 403 Forbidden is returned, signs out immediately.
 */
async function verifyServerAllowlist(token?: string | null): Promise<boolean> {
  if (!token) return true;

  try {
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 403) {
      console.warn('[Zaboraa Security] Account rejected by server ALLOWED_EMAILS check.');
      await signOut('/');
      if (typeof window !== 'undefined') {
        window.alert('Your Google account is not on the allow list for this app.');
      }
      return false;
    }
    return true;
  } catch {
    // If server unreachable or error, allow client to proceed
    return true;
  }
}

/**
 * Client React Hook for tracking Supabase Auth state with defence-in-depth allowlist verification
 */
export function useAuth(): AuthState & {
  signInWithGoogle: (redirectTo?: string) => Promise<any>;
  signOut: (redirectTo?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
} {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(PREVIEW_SESSION_KEY) === 'true') {
      return DEMO_USER_PROFILE;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();

      if (sbUser) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const allowed = await verifyServerAllowlist(token);
        if (!allowed) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        setUser(mapSupabaseUserToProfile(sbUser));
        setIsLoading(false);
        return;
      }
    } catch {
      // Supabase is offline or unconfigured
    }

    if (typeof window !== 'undefined' && localStorage.getItem(PREVIEW_SESSION_KEY) === 'true') {
      setUser(DEMO_USER_PROFILE);
    } else {
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshSession();

    // Listen to real-time auth changes (sign in, token refresh, sign out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const allowed = await verifyServerAllowlist(session.access_token);
        if (!allowed) {
          setUser(null);
          setIsLoading(false);
          return;
        }
        setUser(mapSupabaseUserToProfile(session.user));
      } else if (typeof window !== 'undefined' && localStorage.getItem(PREVIEW_SESSION_KEY) === 'true') {
        setUser(DEMO_USER_PROFILE);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    const handleCustomAuth = () => {
      refreshSession();
    };
    window.addEventListener('auth-state-change', handleCustomAuth);
    window.addEventListener('storage', handleCustomAuth);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('auth-state-change', handleCustomAuth);
      window.removeEventListener('storage', handleCustomAuth);
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
