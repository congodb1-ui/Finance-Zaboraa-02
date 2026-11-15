import { decryptValue, encryptValue } from './crypto';

export interface GmailVaultTokenPayload {
  access_token: string;
  refresh_token: string | null;
  expiry: number; // Unix epoch ms
}

const ENCRYPTED_WRAPPER_PREFIX = 'zbf:v1:';

export function getGmailVaultSecretName(userId: string): string {
  return `gmail_token_${userId}`;
}

export async function saveGmailTokenToVault(
  serviceSupabase: any,
  userId: string,
  payload: GmailVaultTokenPayload
): Promise<void> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to store Gmail tokens in Vault.');
  }

  const secretName = getGmailVaultSecretName(userId);
  const serialized = JSON.stringify({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || null,
    expiry: payload.expiry,
  });

  // Encrypt with ENCRYPTION_KEY when configured so fallback table is also AES-256-GCM encrypted at rest
  const valueToStore =
    process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim().length > 0
      ? await encryptValue(serialized)
      : serialized;

  const { error } = await serviceSupabase.rpc('upsert_gmail_vault_token', {
    p_secret_name: secretName,
    p_secret_value: valueToStore,
  });

  if (error) {
    throw new Error(`Failed to save Gmail token to Vault: ${error.message}`);
  }
}

export async function loadGmailTokenFromVault(
  serviceSupabase: any,
  userId: string
): Promise<GmailVaultTokenPayload | null> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to read Gmail tokens from Vault.');
  }

  const secretName = getGmailVaultSecretName(userId);
  const { data, error } = await serviceSupabase.rpc('get_gmail_vault_token', {
    p_secret_name: secretName,
  });

  if (error) {
    throw new Error(`Failed to read Gmail token from Vault: ${error.message}`);
  }

  if (!data || typeof data !== 'string') {
    return null;
  }

  const rawJson = data.startsWith(ENCRYPTED_WRAPPER_PREFIX) ? await decryptValue(data) : data;
  const parsed = JSON.parse(rawJson) as Partial<GmailVaultTokenPayload>;
  if (!parsed?.access_token) {
    return null;
  }

  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token || null,
    expiry: typeof parsed.expiry === 'number' ? parsed.expiry : 0,
  };
}

export async function deleteGmailTokenFromVault(
  serviceSupabase: any,
  userId: string
): Promise<void> {
  if (!serviceSupabase) return;

  const secretName = getGmailVaultSecretName(userId);
  const { error } = await serviceSupabase.rpc('delete_gmail_vault_token', {
    p_secret_name: secretName,
  });

  if (error) {
    throw new Error(`Failed to remove Gmail token from Vault: ${error.message}`);
  }
}

export async function getValidGmailAccessToken(
  serviceSupabase: any,
  userId: string
): Promise<string> {
  const token = await loadGmailTokenFromVault(serviceSupabase, userId);
  if (!token) {
    throw new Error('Gmail is not connected for this user.');
  }

  const nowMs = Date.now();
  // Still valid for at least 60 seconds
  if (token.expiry > nowMs + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error('Gmail access token expired. Please reconnect Gmail in Settings.');
  }

  const clientId = (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'Gmail access token expired and GOOGLE_CLIENT_SECRET is not configured for offline refresh.'
    );
  }

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const refreshJson = (await refreshRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!refreshRes.ok || !refreshJson.access_token) {
    throw new Error(
      refreshJson.error_description ||
        refreshJson.error ||
        'Failed to refresh Gmail access token. Please reconnect Gmail in Settings.'
    );
  }

  const nextPayload: GmailVaultTokenPayload = {
    access_token: refreshJson.access_token,
    refresh_token: refreshJson.refresh_token || token.refresh_token,
    expiry: Date.now() + Number(refreshJson.expires_in || 3600) * 1000,
  };

  await saveGmailTokenToVault(serviceSupabase, userId, nextPayload);
  return nextPayload.access_token;
}
