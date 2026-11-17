// SANDBOX-ONLY MODULE — REMOVE BEFORE PRODUCTION DEPLOYMENT
// Client-safe storage helpers for temporary local sandbox authentication.

import type { User } from '@supabase/supabase-js';

export const SANDBOX_SESSION_STORAGE_KEY = 'zaboraa_sandbox_session';

export const SANDBOX_DEFAULT_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'wasimssayyed@gmail.com',
  email_confirmed_at: '2026-04-01T00:00:00.000Z',
  app_metadata: { provider: 'sandbox_local', providers: ['sandbox_local'] },
  user_metadata: {
    full_name: 'Wasim Sayyed (Sandbox)',
    name: 'Wasim Sayyed (Sandbox)',
  },
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
} as unknown as User;

export interface SandboxSessionRecord {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: User;
}

export function getSandboxSession(): SandboxSessionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SANDBOX_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SandboxSessionRecord;
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    if (parsed.expires_at && Date.now() / 1000 > parsed.expires_at) {
      window.localStorage.removeItem(SANDBOX_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSandboxSession(session: SandboxSessionRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SANDBOX_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearSandboxSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SANDBOX_SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getSandboxAccessToken(): string | null {
  return getSandboxSession()?.access_token || null;
}
