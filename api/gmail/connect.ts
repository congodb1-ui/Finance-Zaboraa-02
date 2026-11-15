import type { VercelResponse } from '@vercel/node';
import { authenticateRequest, setCorsHeaders, getServiceSupabase, type AuthenticatedVercelRequest } from '../_lib/middleware';
import { saveGmailTokenToVault } from '../../src/lib/gmail-vault';

export default async function handler(req: AuthenticatedVercelRequest, res: VercelResponse) {
  if (!setCorsHeaders(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await authenticateRequest(req, res))) return;

  try {
    const userId = req.user!.id;
    const serviceSupabase = getServiceSupabase();
    if (!serviceSupabase) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to store Gmail tokens securely in Vault.',
      });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    let accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : '';
    let refreshToken: string | null = null;
    let expiresInSec = Number(req.body?.expires_in || 3600);

    if (code) {
      const clientId = (
        process.env.GOOGLE_CLIENT_ID ||
        process.env.VITE_GOOGLE_CLIENT_ID ||
        ''
      ).trim();
      const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'GOOGLE_CLIENT_SECRET is required on the server to exchange authorization codes.',
        });
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: 'postmessage',
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error_description?: string;
        error?: string;
      };

      if (!tokenRes.ok || !tokenJson.access_token) {
        return res.status(400).json({
          error:
            tokenJson.error_description ||
            tokenJson.error ||
            'Failed to exchange Google authorization code for Gmail access.',
        });
      }

      accessToken = tokenJson.access_token;
      refreshToken = tokenJson.refresh_token || null;
      expiresInSec = Number(tokenJson.expires_in || 3600);
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing Gmail OAuth access token or authorization code.' });
    }

    const gmailProfileRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!gmailProfileRes.ok) {
      return res.status(400).json({
        error: 'Google token lacks Gmail read-only permission. Please grant Gmail access.',
      });
    }

    const gmailProfile = (await gmailProfileRes.json().catch(() => ({}))) as {
      emailAddress?: string;
    };
    const gmailEmail = gmailProfile.emailAddress?.trim().toLowerCase() || req.user!.email || null;

    await saveGmailTokenToVault(serviceSupabase, userId, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry: Date.now() + expiresInSec * 1000,
    });

    await serviceSupabase
      .from('profiles')
      .update({
        gmail_connected: true,
        gmail_email: gmailEmail,
        gmail_sync_enabled: true,
      })
      .eq('user_id', userId);

    return res.json({
      gmail_connected: true,
      gmail_email: gmailEmail,
      has_refresh_token: Boolean(refreshToken),
    });
  } catch (err: any) {
    console.error('Gmail connect error:', err?.message);
    return res.status(500).json({ error: err?.message || 'Failed to connect Gmail.' });
  }
}
