import { createClient as createSupabaseClient } from '../supabase/client';
import type { Client, ClientFormData } from '../../types/invoicing';

function isSupabaseClientLike(value: any): boolean {
  return Boolean(
    value &&
      typeof value.from === 'function' &&
      value.auth &&
      typeof value.auth.getUser === 'function'
  );
}

function normalizeClientPayload(data: Partial<ClientFormData>, isCreate: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (data.name !== undefined || isCreate) {
    const trimmedName = (data.name ?? '').trim();
    if (!trimmedName) {
      throw new Error('Client name is required.');
    }
    payload.name = trimmedName;
  }

  if (data.company_name !== undefined) {
    payload.company_name = data.company_name?.trim() || null;
  }

  if (data.country !== undefined) {
    const normalized = data.country?.trim().toUpperCase();
    payload.country = normalized ? normalized.slice(0, 2) : null;
  }

  if (data.address !== undefined) {
    payload.address = data.address?.trim() || null;
  }

  if (data.city !== undefined) {
    payload.city = data.city?.trim() || null;
  }

  if (data.email !== undefined) {
    payload.email = data.email?.trim() || null;
  }

  if (data.phone !== undefined) {
    payload.phone = data.phone?.trim() || null;
  }

  if (data.tax_id !== undefined) {
    payload.tax_id = data.tax_id?.trim() || null;
  }

  if (data.default_currency !== undefined || isCreate) {
    const cur = (data.default_currency ?? 'USD').trim().toUpperCase();
    payload.default_currency = cur.length === 3 ? cur : 'USD';
  }

  if (data.payment_terms_days !== undefined || isCreate) {
    const terms = Number(data.payment_terms_days ?? 30);
    payload.payment_terms_days =
      Number.isFinite(terms) && terms >= 0 ? Math.round(terms) : 30;
  }

  if (data.notes !== undefined) {
    payload.notes = data.notes?.trim() || null;
  }

  return payload;
}

export async function getClients(supabaseClient?: any): Promise<Client[]> {
  const supabase = supabaseClient || createSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load clients.');
  }

  return (data as Client[]) || [];
}

export async function getClient(id: string): Promise<Client | null>;
export async function getClient(supabaseClient: any, id: string): Promise<Client | null>;
export async function getClient(clientOrId: any, maybeId?: string): Promise<Client | null> {
  const hasClient = isSupabaseClientLike(clientOrId);
  const supabase = hasClient ? clientOrId : createSupabaseClient();
  const id: string = hasClient ? (maybeId as string) : clientOrId;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load client.');
  }

  return (data as Client) || null;
}

export async function createClient(data: ClientFormData): Promise<Client>;
export async function createClient(supabaseClient: any, data: ClientFormData): Promise<Client>;
export async function createClient(
  clientOrData: any,
  maybeData?: ClientFormData
): Promise<Client> {
  const hasClient = isSupabaseClientLike(clientOrData);
  const supabase = hasClient ? clientOrData : createSupabaseClient();
  const data: ClientFormData = (hasClient ? maybeData : clientOrData) as ClientFormData;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const payload = {
    user_id: user.id,
    ...normalizeClientPayload(data, true),
  };

  const { data: created, error } = await supabase
    .from('clients')
    .insert(payload)
    .select('*')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create client.');
  }

  return created as Client;
}

export async function updateClient(
  id: string,
  data: Partial<ClientFormData>
): Promise<Client>;
export async function updateClient(
  supabaseClient: any,
  id: string,
  data: Partial<ClientFormData>
): Promise<Client>;
export async function updateClient(
  clientOrId: any,
  idOrData: any,
  maybeData?: Partial<ClientFormData>
): Promise<Client> {
  const hasClient = isSupabaseClientLike(clientOrId);
  const supabase = hasClient ? clientOrId : createSupabaseClient();
  const id: string = hasClient ? idOrData : clientOrId;
  const data: Partial<ClientFormData> = (hasClient ? maybeData : idOrData) || {};

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const payload = normalizeClientPayload(data, false);

  const { data: updated, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update client.');
  }

  return updated as Client;
}

export async function getClientIdsWithInvoices(supabaseClient?: any): Promise<Set<string>> {
  const supabase = supabaseClient || createSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('invoices')
    .select('client_id')
    .eq('user_id', user.id)
    .not('client_id', 'is', null);

  if (error) {
    return new Set<string>();
  }

  const ids = new Set<string>();
  for (const row of data || []) {
    if (row.client_id) ids.add(String(row.client_id));
  }
  return ids;
}

export async function deleteClient(id: string): Promise<void>;
export async function deleteClient(supabaseClient: any, id: string): Promise<void>;
export async function deleteClient(clientOrId: any, maybeId?: string): Promise<void> {
  const hasClient = isSupabaseClientLike(clientOrId);
  const supabase = hasClient ? clientOrId : createSupabaseClient();
  const id: string = hasClient ? (maybeId as string) : clientOrId;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: linkedInvoices, error: checkError } = await supabase
    .from('invoices')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_id', id)
    .limit(1);

  if (checkError) {
    throw new Error(checkError.message || 'Unable to verify client invoice links.');
  }

  if (linkedInvoices && linkedInvoices.length > 0) {
    throw new Error(
      'Cannot delete client with existing invoices. Archive the client instead by setting a note.'
    );
  }

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message || 'Failed to delete client.');
  }
}
