import { createClient } from '../supabase/client';
import { encryptWithSecret } from '../crypto';

export interface ProfileRecord {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  pan_encrypted: string | null;
  phone: string | null;
  address: string | null;
  default_fy: string;
  dark_mode: boolean;
  last_backup_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpsertInput {
  full_name?: string | null;
  email?: string | null;
  pan?: string | null;
  pan_encrypted?: string | null;
  phone?: string | null;
  address?: string | null;
  default_fy?: string | null;
  dark_mode?: boolean;
  last_backup_at?: string | null;
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Encrypts a sensitive field (e.g. PAN) using shared Web Crypto AES-256-GCM
 * before persisting to profiles.pan_encrypted. Never logs or stores plaintext.
 */
export async function encryptPanValue(plaintextPan: string, userId: string): Promise<string> {
  const normalized = plaintextPan.trim().toUpperCase();
  if (!PAN_REGEX.test(normalized)) {
    throw new Error('Invalid PAN format. Expected 10-character format (e.g. ABCDE1234F).');
  }

  return encryptWithSecret(normalized, `zaboraa-vault:${userId}`);
}

export async function getProfile(supabaseClient?: any): Promise<ProfileRecord | null> {
  const supabase = supabaseClient || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('Error fetching profile:', error.message);
    }
    return null;
  }

  return data as ProfileRecord;
}

export async function upsertProfile(data: ProfileUpsertInput): Promise<ProfileRecord>;
export async function upsertProfile(
  supabaseClient: any,
  data: ProfileUpsertInput
): Promise<ProfileRecord>;
export async function upsertProfile(
  clientOrData: any,
  maybeData?: ProfileUpsertInput
): Promise<ProfileRecord> {
  const isClientProvided = Boolean(
    clientOrData &&
      typeof clientOrData.from === 'function' &&
      clientOrData.auth &&
      typeof clientOrData.auth.getUser === 'function'
  );

  const supabase = isClientProvided ? clientOrData : createClient();
  const input: ProfileUpsertInput = (isClientProvided ? maybeData : clientOrData) || {};

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const payload: Record<string, any> = {
    user_id: user.id,
  };

  if (input.full_name !== undefined) {
    payload.full_name = input.full_name?.trim() || null;
  }
  if (input.email !== undefined) {
    payload.email = input.email?.trim() || null;
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone?.trim() || null;
  }
  if (input.address !== undefined) {
    payload.address = input.address?.trim() || null;
  }
  if (input.default_fy !== undefined) {
    payload.default_fy = input.default_fy || '2026-27';
  }
  if (input.dark_mode !== undefined) {
    payload.dark_mode = Boolean(input.dark_mode);
  }
  if (input.last_backup_at !== undefined) {
    payload.last_backup_at = input.last_backup_at;
  }

  // PAN must ONLY be stored encrypted in pan_encrypted
  if (input.pan !== undefined) {
    const trimmedPan = input.pan?.trim() || '';
    if (trimmedPan.length > 0) {
      payload.pan_encrypted = await encryptPanValue(trimmedPan, user.id);
    }
  } else if (input.pan_encrypted !== undefined) {
    payload.pan_encrypted = input.pan_encrypted;
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to save profile.');
  }

  return updated as ProfileRecord;
}
