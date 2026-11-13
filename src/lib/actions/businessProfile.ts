import { createClient } from '../supabase/client';
import type { BusinessProfile } from '../../types/invoicing';

export const LOGO_MAX_BYTES = 1048576; // 1 MB
export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function isSupabaseClientLike(value: any): boolean {
  return Boolean(
    value &&
      typeof value.from === 'function' &&
      value.auth &&
      typeof value.auth.getUser === 'function'
  );
}

async function computeFileSHA256(file: File): Promise<string> {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API is required to hash logo files.');
  }
  const buffer = await file.arrayBuffer();
  const hashBuffer = await cryptoApi.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateLogoFile(file: File): { valid: true; ext: string } | { valid: false; error: string } {
  const lowerName = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'image/svg+xml' || lowerName.endsWith('.svg')) {
    return {
      valid: false,
      error: 'SVG files are not allowed for security reasons. Please upload a PNG, JPG, or WebP image.',
    };
  }

  const extFromMime = MIME_TO_EXT[mime];
  if (!extFromMime) {
    return {
      valid: false,
      error: 'Unsupported file format. Only PNG, JPG, and WebP images are allowed.',
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'Selected file is empty.',
    };
  }

  if (file.size > LOGO_MAX_BYTES) {
    return {
      valid: false,
      error: 'Logo file exceeds the 1 MB maximum size limit.',
    };
  }

  return { valid: true, ext: extFromMime };
}

export async function getBusinessProfile(supabaseClient?: any): Promise<BusinessProfile | null> {
  const supabase = supabaseClient || createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load business profile.');
  }

  return (data as BusinessProfile) || null;
}

export async function upsertBusinessProfile(
  data: Partial<BusinessProfile>
): Promise<BusinessProfile>;
export async function upsertBusinessProfile(
  supabaseClient: any,
  data: Partial<BusinessProfile>
): Promise<BusinessProfile>;
export async function upsertBusinessProfile(
  clientOrData: any,
  maybeData?: Partial<BusinessProfile>
): Promise<BusinessProfile> {
  const hasClient = isSupabaseClientLike(clientOrData);
  const supabase = hasClient ? clientOrData : createClient();
  const data: Partial<BusinessProfile> = (hasClient ? maybeData : clientOrData) || {};

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  // Strip managed fields; next_invoice_no is managed strictly by allocate_invoice_number RPC
  const payload: Record<string, unknown> = {
    user_id: user.id,
  };

  if (data.company_name !== undefined) payload.company_name = data.company_name?.trim() || null;
  if (data.logo_path !== undefined) payload.logo_path = data.logo_path || null;
  if (data.address !== undefined) payload.address = data.address?.trim() || null;
  if (data.country !== undefined) {
    const normalizedCountry = data.country?.trim().toUpperCase();
    payload.country = normalizedCountry ? normalizedCountry.slice(0, 2) : null;
  }
  if (data.email !== undefined) payload.email = data.email?.trim() || null;
  if (data.phone !== undefined) payload.phone = data.phone?.trim() || null;
  if (data.website !== undefined) payload.website = data.website?.trim() || null;
  if (data.gstin !== undefined) {
    const normalizedGstin = data.gstin?.trim().toUpperCase();
    payload.gstin = normalizedGstin || null;
  }
  if (data.iec !== undefined) {
    const normalizedIec = data.iec?.trim().toUpperCase();
    payload.iec = normalizedIec || null;
  }
  if (data.lut_number !== undefined) payload.lut_number = data.lut_number?.trim() || null;
  if (data.lut_date !== undefined) payload.lut_date = data.lut_date || null;
  if (data.default_currency !== undefined) {
    const cur = data.default_currency?.trim().toUpperCase();
    payload.default_currency = cur && cur.length === 3 ? cur : 'INR';
  }
  if (data.invoice_prefix !== undefined) {
    const prefix = data.invoice_prefix?.trim().slice(0, 10);
    payload.invoice_prefix = prefix || 'INV';
  }
  if (data.default_payment_terms_days !== undefined) {
    const terms = Number(data.default_payment_terms_days);
    payload.default_payment_terms_days =
      Number.isFinite(terms) && terms >= 0 ? Math.round(terms) : 30;
  }
  if (data.default_notes !== undefined) payload.default_notes = data.default_notes?.trim() || null;
  if (data.default_footer !== undefined) payload.default_footer = data.default_footer?.trim() || null;

  const { data: updated, error } = await supabase
    .from('business_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to save business profile.');
  }

  return updated as BusinessProfile;
}

export async function uploadLogo(file: File): Promise<string>;
export async function uploadLogo(supabaseClient: any, file: File): Promise<string>;
export async function uploadLogo(clientOrFile: any, maybeFile?: File): Promise<string> {
  const hasClient = isSupabaseClientLike(clientOrFile);
  const supabase = hasClient ? clientOrFile : createClient();
  const file: File | undefined = hasClient ? maybeFile : clientOrFile;

  if (!file) {
    throw new Error('No logo file provided.');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const validation = validateLogoFile(file);
  if (validation.valid === false) {
    throw new Error(validation.error);
  }

  const hash = await computeFileSHA256(file);
  const storagePath = `${user.id}/logo-${hash}.${validation.ext}`;

  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload logo.');
  }

  return storagePath;
}

export async function getLogoSignedUrl(path: string): Promise<string>;
export async function getLogoSignedUrl(supabaseClient: any, path: string): Promise<string>;
export async function getLogoSignedUrl(clientOrPath: any, maybePath?: string): Promise<string> {
  const hasClient = isSupabaseClientLike(clientOrPath);
  const supabase = hasClient ? clientOrPath : createClient();
  const path: string | undefined = hasClient ? maybePath : clientOrPath;

  if (!path) {
    throw new Error('Logo path is required.');
  }

  const { data, error } = await supabase.storage
    .from('logos')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to generate signed URL for logo.');
  }

  return data.signedUrl;
}
