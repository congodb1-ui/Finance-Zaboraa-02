import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { verifyGoogleIdToken } from '../../src/lib/google-auth-server';
import { ensureBatch2bBootstrap } from '../../src/lib/batch2b-seed';

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

    const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: verifiedUser.email,
      options: {
        data: {
          full_name: verifiedUser.fullName || undefined,
          avatar_url: verifiedUser.avatarUrl || undefined,
          name: verifiedUser.fullName || undefined,
          picture: verifiedUser.avatarUrl || undefined,
        },
      },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Supabase generateLink failed:', linkError?.message);
      return res.status(500).json({ error: 'Failed to create Supabase user session.' });
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
      console.error('Supabase verifyOtp failed:', otpError?.message);
      return res.status(500).json({ error: 'Failed to exchange token for Supabase session.' });
    }

    const authedUser = otpData.user || linkData.user;
    if (authedUser?.id) {
      try {
        await ensureBatch2bBootstrap(serviceSupabase, authedUser);
      } catch (seedErr: any) {
        console.error('[Batch 2b] Bootstrap warning:', seedErr?.message);
      }
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
  } catch (err) {
    console.error('Google auth route error:', err);
    return res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
}
