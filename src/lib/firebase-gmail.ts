import { getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { getGoogleClientId } from './auth';
import { loadGoogleOAuth2Client } from './google-gis';

// Strictly read-only Gmail scope — never request write/send/modify scopes
export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'] as const;

export type GmailAuthGrant =
  | { mode: 'code'; code: string }
  | { mode: 'token'; access_token: string; expires_in: number };

function isGisOriginAllowlisted(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'finance.zaboraa.com' ||
    host === 'zaboraa.com'
  );
}

async function authorizeViaFirebasePopup(loginHint?: string): Promise<GmailAuthGrant> {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'consent',
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  // Immediately clear transient client Firebase auth state; token is stored server-side in Vault only
  await auth.signOut().catch(() => {});

  if (!accessToken) {
    throw new Error('Failed to obtain Gmail read-only access token from Google.');
  }

  return {
    mode: 'token',
    access_token: accessToken,
    expires_in: 3600,
  };
}

/**
 * Initiates a user-consented Google OAuth popup requesting ONLY `gmail.readonly`.
 * - On finance.zaboraa.com / localhost with VITE_GOOGLE_CLIENT_ID: uses direct GIS popup
 *   (authorization code flow when GOOGLE_CLIENT_SECRET is configured for 6-hour offline refresh,
 *   or GIS token client otherwise).
 * - In AI Studio ephemeral preview domains: uses Firebase Auth popup configured via set_up_oauth.
 */
export async function requestGmailReadonlyGrant(options?: {
  loginHint?: string;
  preferCodeFlow?: boolean;
}): Promise<GmailAuthGrant> {
  const clientId = getGoogleClientId();
  const useDirectGis = Boolean(clientId) && isGisOriginAllowlisted();

  if (!useDirectGis) {
    return authorizeViaFirebasePopup(options?.loginHint);
  }

  const oauth2 = await loadGoogleOAuth2Client();

  if (options?.preferCodeFlow) {
    return new Promise<GmailAuthGrant>((resolve, reject) => {
      const codeClient = oauth2.initCodeClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        ux_mode: 'popup',
        access_type: 'offline',
        prompt: 'consent',
        login_hint: options?.loginHint,
        callback: (response) => {
          if (response.error || !response.code) {
            reject(
              new Error(
                response.error_description || response.error || 'Gmail authorization failed.'
              )
            );
            return;
          }
          resolve({ mode: 'code', code: response.code });
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Gmail popup closed before authorization completed.'));
        },
      });
      codeClient.requestCode();
    });
  }

  return new Promise<GmailAuthGrant>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      prompt: 'consent',
      hint: options?.loginHint,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || 'Gmail authorization failed.'
            )
          );
          return;
        }
        resolve({
          mode: 'token',
          access_token: response.access_token,
          expires_in: Number(response.expires_in || 3600),
        });
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Gmail popup closed before authorization completed.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}
