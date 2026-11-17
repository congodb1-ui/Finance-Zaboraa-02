// SANDBOX-ONLY MODULE — REMOVE BEFORE PRODUCTION DEPLOYMENT
// Server-side local password verification & HMAC token signing for sandbox verification.

import crypto from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { SANDBOX_DEFAULT_USER } from './sandbox-auth';

const DEFAULT_SANDBOX_PASSWORD = 'zaboraa-sandbox-2026';

// Ephemeral per-process fallback secret when ENCRYPTION_KEY / SUPABASE_SERVICE_ROLE_KEY are unset
const EPHEMERAL_SERVER_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return (
    process.env.SANDBOX_TOKEN_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    EPHEMERAL_SERVER_SECRET
  );
}

export function isSandboxPasswordEnabled(): boolean {
  // Disabled in production unless explicitly opted in via SANDBOX_LOCAL_PASSWORD
  if (process.env.NODE_ENV === 'production' && !process.env.SANDBOX_LOCAL_PASSWORD) {
    return false;
  }
  return process.env.DISABLE_SANDBOX_LOGIN !== 'true';
}

export function getExpectedSandboxPassword(): string {
  const configured = (process.env.SANDBOX_LOCAL_PASSWORD || '').trim();
  return configured || DEFAULT_SANDBOX_PASSWORD;
}

export function verifySandboxPassword(candidate: string): boolean {
  if (!isSandboxPasswordEnabled()) return false;
  const expected = getExpectedSandboxPassword();
  const a = Buffer.from(String(candidate || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getSandboxAuthUser(): User {
  const allowedRaw = process.env.ALLOWED_EMAILS || '';
  const firstAllowed = allowedRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0];

  if (!firstAllowed) {
    return SANDBOX_DEFAULT_USER;
  }

  return {
    ...SANDBOX_DEFAULT_USER,
    email: firstAllowed,
  } as User;
}

export function signSandboxToken(user: User, ttlSeconds = 24 * 60 * 60): {
  token: string;
  expiresAt: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadObj = {
    sub: user.id,
    email: user.email,
    exp: expiresAt,
    mode: 'sandbox',
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return {
    token: `sandbox.${payloadB64}.${sig}`,
    expiresAt,
  };
}

export function verifySandboxToken(token: string): { valid: boolean; user?: User } {
  if (!isSandboxPasswordEnabled()) return { valid: false };
  if (!token || !token.startsWith('sandbox.')) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const [, payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { valid: false };

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload?.exp || Math.floor(Date.now() / 1000) > Number(payload.exp)) {
      return { valid: false };
    }
    return { valid: true, user: getSandboxAuthUser() };
  } catch {
    return { valid: false };
  }
}
