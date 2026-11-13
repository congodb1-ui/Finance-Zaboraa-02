import crypto from 'node:crypto';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
}

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

export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string
): Promise<VerifiedGoogleUser> {
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
