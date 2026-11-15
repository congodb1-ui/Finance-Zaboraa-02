import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { ensureUserBootstrap } from '../_lib/bootstrap';

// --- Inlined Google JWKS verification ---
interface GoogleJwk extends crypto.JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface JwksCache {
  keys: GoogleJwk[];
  expiresAt: number;
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
let cachedJwks: JwksCache | null = null;

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 300;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 300;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

async function fetchGoogleJwks(forceRefresh = false): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const res = await fetch(GOOGLE_JWKS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google JWKS (${res.status})`);
  }

  const body = (await res.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (keys.length === 0) {
    throw new Error('Google JWKS returned no public keys');
  }

  const maxAgeSec = parseMaxAgeSeconds(res.headers.get('cache-control'));
  cachedJwks = {
    keys,
    expiresAt: now + maxAgeSec * 1000,
  };
  return keys;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

async function verifyGoogleIdToken(idToken: string, expectedClientId: string) {
  if (!expectedClientId) {
    throw new Error('Google Client ID is not configured.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Google ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(headerB64);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Google ID token algorithm or missing key ID.');
  }

  let keys = await fetchGoogleJwks(false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchGoogleJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('Matching Google public signing key not found.');
  }

  const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64url');

  const isSignatureValid = crypto.verify('RSA-SHA256', signingInput, publicKey, signature);
  if (!isSignatureValid) {
    throw new Error('Google ID token signature verification failed.');
  }

  const payload = decodeBase64UrlJson<{
    iss?: string;
    aud?: string | string[];
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
    exp?: number;
    iat?: number;
  }>(payloadB64);

  if (!payload.iss || !VALID_ISSUERS.has(payload.iss)) {
    throw new Error('Invalid Google ID token issuer.');
  }

  const audMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedClientId)
    : payload.aud === expectedClientId;
  if (!audMatches) {
    throw new Error('Google ID token audience mismatch.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + 30 < nowSec) {
    throw new Error('Google ID token has expired.');
  }

  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified || !payload.email) {
    throw new Error('Google account email is missing or unverified.');
  }

  return {
    sub: payload.sub || payload.email,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    fullName: payload.name ? String(payload.name).trim() : null,
    avatarUrl: payload.picture ? String(payload.picture).trim() : null,
  };
}

// --- Env setup ---
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://placeholder-project.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not configured on server.');
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('[auth/google] Env check - SUPABASE_URL present:', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL));
    console.log('[auth/google] Env check - SUPABASE_SERVICE_ROLE_KEY present:', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));

    const credential =
      typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';

    if (!credential) {
      return res.status(400).json({ error: 'Missing Google ID token credential.' });
    }

    const googleClientId = (
      process.env.GOOGLE_CLIENT_ID ||
      process.env.VITE_GOOGLE_CLIENT_ID ||
      ''
    ).trim();

    if (!googleClientId) {
      return res.status(500).json({
        error: 'Google Client ID (GOOGLE_CLIENT_ID) is not configured on the server.',
      });
    }

    if (
      !SUPABASE_URL ||
      SUPABASE_URL.includes('placeholder') ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_ANON_KEY.includes('placeholder')
    ) {
      return res.status(500).json({
        error: 'Supabase URL and anon key are not configured on the server.',
      });
    }

    let verifiedUser;
    try {
      verifiedUser = await verifyGoogleIdToken(credential, googleClientId);
    } catch (verifyErr: any) {
      console.warn('Google ID token verification failed:', verifyErr?.message);
      return res.status(401).json({
        error: 'Invalid or expired Google sign-in token. Please try again.',
      });
    }

    const allowedRaw = process.env.ALLOWED_EMAILS || '';
    const allowedEmails = allowedRaw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowedEmails.length > 0 && !allowedEmails.includes(verifiedUser.email)) {
      return res.status(403).json({
        error: 'Your Google account is not on the allow list for this app.',
      });
    }

    const serviceSupabase = getServiceSupabase();
    if (!serviceSupabase) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to issue sessions.',
      });
    }

    // Step 1: Ensure user exists in Supabase Auth before generateLink
    const { data: userListData } = await serviceSupabase.auth.admin.listUsers();
    const existingUser = (userListData?.users || []).find(
      (u) => u.email?.toLowerCase() === verifiedUser.email
    );

    if (!existingUser) {
      console.log(`[auth/google] Creating new user for email: ${verifiedUser.email}`);
      const { error: createErr } = await serviceSupabase.auth.admin.createUser({
        email: verifiedUser.email,
        email_confirm: true,
        user_metadata: {
          full_name: verifiedUser.fullName || undefined,
          avatar_url: verifiedUrl(verifiedUser.avatarUrl),
          name: verifiedUser.fullName || undefined,
          picture: verifiedUrl(verifiedUser.avatarUrl),
        },
      });

      if (createErr) {
        console.error('[auth/google] Supabase admin.createUser error:', {
          message: createErr.message,
          status: createErr.status,
          code: (createErr as any).code,
        });
        return res.status(500).json({ error: createErr.message || 'Failed to create user.' });
      }
    }

    // Step 2: Generate magic link token for session exchange
    const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: verifiedUser.email,
      options: {
        redirectTo: 'https://finance.zaboraa.com',
        data: {
          full_name: verifiedUser.fullName || undefined,
          avatar_url: verifiedUrl(verifiedUser.avatarUrl),
          name: verifiedUser.fullName || undefined,
          picture: verifiedUrl(verifiedUser.avatarUrl),
        },
      },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[auth/google] Supabase generateLink error:', {
        message: linkError?.message,
        status: linkError?.status,
        code: (linkError as any)?.code,
      });
      return res.status(500).json({ error: linkError?.message || 'Failed to create Supabase magic link.' });
    }

    if (linkData.user?.id && (verifiedUser.fullName || verifiedUser.avatarUrl)) {
      const existingMeta = (linkData.user.user_metadata || {}) as Record<string, any>;
      const needsUpdate =
        (verifiedUser.fullName && existingMeta.full_name !== verifiedUser.fullName) ||
        (verifiedUser.avatarUrl && existingMeta.avatar_url !== verifiedUser.avatarUrl);

      if (needsUpdate) {
        await serviceSupabase.auth.admin
          .updateUserById(linkData.user.id, {
            user_metadata: {
              ...existingMeta,
              full_name: verifiedUser.fullName || existingMeta.full_name,
              avatar_url: verifiedUser.avatarUrl || existingMeta.avatar_url,
              name: verifiedUser.fullName || existingMeta.name,
              picture: verifiedUser.avatarUrl || existingMeta.picture,
            },
          })
          .catch(() => {});
      }
    }

    // Step 3: Exchange token_hash for session
    const anonClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: otpData, error: otpError } = await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpData?.session) {
      console.error('[auth/google] Supabase verifyOtp error:', {
        message: otpError?.message,
        status: otpError?.status,
        code: (otpError as any)?.code,
      });
      return res.status(500).json({
        error: otpError?.message || 'Failed to exchange token for Supabase session.',
      });
    }

    if (otpData.user) {
      await ensureUserBootstrap(
        otpData.user.id,
        verifiedUser.email,
        verifiedUser.fullName || undefined
      );
    }

    return res.status(200).json({
      session: {
        access_token: otpData.session.access_token,
        refresh_token: otpData.session.refresh_token,
        expires_in: otpData.session.expires_in,
        expires_at: otpData.session.expires_at,
        token_type: otpData.session.token_type,
      },
      user: otpData.user,
    });
  } catch (err: any) {
    console.error('[auth/google] Route handler error:', {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({ error: err?.message || 'Authentication failed. Please try again.' });
  }
}

function verifiedUrl(url: string | null): string | undefined {
  return url ? url : undefined;
}
