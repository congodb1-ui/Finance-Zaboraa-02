import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://placeholder-project.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

export function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = (req.headers.origin as string) || '';
  res.setHeader('Vary', 'Origin');

  const ALLOWED_CORS_ORIGINS = new Set<string>([
    'https://finance.zaboraa.com',
    'https://finance-zaboraa-02.vercel.app',
  ]);

  if (process.env.NODE_ENV !== 'production') {
    ALLOWED_CORS_ORIGINS.add('http://localhost:3000');
  }

  if (origin) {
    let isAllowed = ALLOWED_CORS_ORIGINS.has(origin);
    if (!isAllowed) {
      try {
        const originHost = new URL(origin).host;
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
        const requestHost = hostHeader.split(',')[0].trim();
        if (requestHost && originHost === requestHost) {
          isAllowed = true;
        }
      } catch {
        isAllowed = false;
      }
    }

    if (!isAllowed) {
      res.status(403).json({ error: 'CORS origin not allowed.' });
      return false;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  return true;
}

export type AuthenticatedVercelRequest = VercelRequest & {
  user?: any;
  supabase?: any;
};

export async function authenticateRequest(
  req: AuthenticatedVercelRequest,
  res: VercelResponse
): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const reqSupabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error,
    } = await reqSupabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const allowedRaw = process.env.ALLOWED_EMAILS || '';
    const allowedEmails = allowedRaw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowedEmails.length > 0 &&
      (!user.email || !allowedEmails.includes(user.email.toLowerCase()))
    ) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }

    req.user = user;
    req.supabase = reqSupabase;
    return true;
  } catch (err) {
    console.error('[api/_lib/middleware] Auth verification error:', err);
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
}

export function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('[api/_lib/middleware] SUPABASE_SERVICE_ROLE_KEY missing');
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
