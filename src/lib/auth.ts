import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase/client';
import { disableGoogleAutoSelect } from './google-gis';
import { mapSupabaseUserToProfile, type UserProfile, type AuthState } from '../types/auth';
import {
  clearSandboxSession,
  getSandboxSession,
  setSandboxSession,
} from './sandbox-auth'; // SANDBOX-ONLY: remove before production

export function getGoogleClientId(): string {
  const fromVite =
    typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID : '';
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.VITE_GOOGLE_CLIENT_ID : '';
  return String(fromVite || fromProcess || '').trim();
}

export function isSupabasePlaceholder(): boolean {
  const configuredUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SUPABASE_URL : undefined);
  return !configuredUrl || String(configuredUrl).includes('placeholder');
}

export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  const viteUrl =
    typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_APP_URL : '';
  const procUrl =
    typeof process !== 'undefined'
      ? process.env?.VITE_APP_URL || process.env?.NEXT_PUBLIC_APP_URL
      : '';
  return String(viteUrl || procUrl || 'https://finance.zaboraa.com');
}

/**
 * Exchanges a Google Identity Services ID token with Express (/api/auth/google).
 * Express verifies the Google ID Token, checks ALLOWED_EMAILS, and returns a Supabase session.
 */
export async function exchangeGoogleIdToken(credential: string) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ credential }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    disableGoogleAutoSelect();
    const errorMessage =
      payload?.error ||
      `Sign-in failed with status ${res.status}`;
    throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Sign-in failed.');
  }

  const accessToken = payload?.session?.access_token;
  const refreshToken = payload?.session?.refresh_token;
  if (!accessToken || !refreshToken) {
    throw new Error('Server did not return a valid Supabase session.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw new Error(error.message || 'Failed to activate Supabase session.');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth-state-change'));
  }

  return data.user;
}

/**
 * Direct Google login entry point.
 * Always requires VITE_GOOGLE_CLIENT_ID — no preview bypass is permitted.
 */
export async function signInWithGoogle(_redirectTo?: string) {
  const clientId = getGoogleClientId();

  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not configured. Please add your Google OAuth Web Client ID.'
    );
  }

  return { provider: 'google', mode: 'gis', clientId };
}

/**
 * SANDBOX-ONLY: Authenticates with a temporary local password via /api/auth/local-login.
 * Remove this helper and endpoint before production deployment.
 */
export async function exchangeLocalPassword(password: string) {
  const res = await fetch('/api/auth/local-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMessage =
      payload?.error || `Local sign-in failed with status ${res.status}`;
    throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Local sign-in failed.');
  }

  const accessToken = payload?.session?.access_token;
  const refreshToken = payload?.session?.refresh_token;
  if (!accessToken || !refreshToken) {
    throw new Error('Server did not return a valid session.');
  }

  if (payload?.mode === 'sandbox') {
    setSandboxSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Number(payload?.session?.expires_at || Math.floor(Date.now() / 1000) + 86400),
      user: payload.user,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth-state-change'));
    }
    return payload.user;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw new Error(error.message || 'Failed to activate Supabase session.');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth-state-change'));
  }

  return data.user;
}

/**
 * Signs the user out, clears Supabase + GIS state, and redirects to landing page
 */
export async function signOut(redirectTo: string = '/') {
  disableGoogleAutoSelect();
  clearSandboxSession(); // SANDBOX-ONLY: remove before production

  if (typeof window !== 'undefined') {
    localStorage.removeItem('zaboraa_preview_session');
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
 * Client React Hook for tracking Supabase Auth state
 */
export function useAuth(): AuthState & {
  signInWithGoogle: (redirectTo?: string) => Promise<any>;
  exchangeGoogleIdToken: (credential: string) => Promise<any>;
  exchangeLocalPassword: (password: string) => Promise<any>;
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
        setIsLoading(false);
        return;
      }
    } catch {
      // Supabase is offline or unconfigured
    }

    // SANDBOX-ONLY: fallback check for local sandbox session when Supabase is placeholder
    if (isSupabasePlaceholder()) {
      const sandbox = getSandboxSession();
      if (sandbox?.user) {
        setUser(mapSupabaseUserToProfile(sandbox.user));
        setIsLoading(false);
        return;
      }
    }

    setUser(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        setUser(mapSupabaseUserToProfile(session.user));
      } else if (isSupabasePlaceholder() && getSandboxSession()?.user) {
        setUser(mapSupabaseUserToProfile(getSandboxSession()!.user));
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
    exchangeGoogleIdToken,
    exchangeLocalPassword,
    signOut,
    refreshSession,
  };
}
