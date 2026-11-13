import { createClient as createSupabaseClient } from '../supabase/client';
import { apiPatch, apiPost } from '../api-client';
import type {
  PaymentInstruction,
  PaymentInstructionFormData,
} from '../../types/invoicing';

export type { PaymentInstructionFormData };

function isSupabaseClientLike(value: any): boolean {
  return Boolean(
    value &&
      typeof value.from === 'function' &&
      value.auth &&
      typeof value.auth.getUser === 'function'
  );
}

export async function getPaymentInstructions(
  supabaseClient?: any
): Promise<PaymentInstruction[]> {
  const supabase = supabaseClient || createSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('payment_instructions')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('label', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load payment instructions.');
  }

  return (data as PaymentInstruction[]) || [];
}

export async function getPaymentInstruction(
  id: string
): Promise<PaymentInstruction | null>;
export async function getPaymentInstruction(
  supabaseClient: any,
  id: string
): Promise<PaymentInstruction | null>;
export async function getPaymentInstruction(
  clientOrId: any,
  maybeId?: string
): Promise<PaymentInstruction | null> {
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
    .from('payment_instructions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load payment instruction.');
  }

  return (data as PaymentInstruction) || null;
}

export async function createPaymentInstruction(
  data: PaymentInstructionFormData
): Promise<PaymentInstruction>;
export async function createPaymentInstruction(
  supabaseClient: any,
  data: PaymentInstructionFormData
): Promise<PaymentInstruction>;
export async function createPaymentInstruction(
  clientOrData: any,
  maybeData?: PaymentInstructionFormData
): Promise<PaymentInstruction> {
  const hasClient = isSupabaseClientLike(clientOrData);
  const data: PaymentInstructionFormData = (
    hasClient ? maybeData : clientOrData
  ) as PaymentInstructionFormData;

  return apiPost<PaymentInstruction>('/api/payment-instructions', data);
}

export async function updatePaymentInstruction(
  id: string,
  data: Partial<PaymentInstructionFormData>
): Promise<PaymentInstruction>;
export async function updatePaymentInstruction(
  supabaseClient: any,
  id: string,
  data: Partial<PaymentInstructionFormData>
): Promise<PaymentInstruction>;
export async function updatePaymentInstruction(
  clientOrId: any,
  idOrData: any,
  maybeData?: Partial<PaymentInstructionFormData>
): Promise<PaymentInstruction> {
  const hasClient = isSupabaseClientLike(clientOrId);
  const id: string = hasClient ? idOrData : clientOrId;
  const data: Partial<PaymentInstructionFormData> =
    (hasClient ? maybeData : idOrData) || {};

  return apiPatch<PaymentInstruction>(
    `/api/payment-instructions/${encodeURIComponent(id)}`,
    data
  );
}

export async function deletePaymentInstruction(id: string): Promise<void>;
export async function deletePaymentInstruction(
  supabaseClient: any,
  id: string
): Promise<void>;
export async function deletePaymentInstruction(
  clientOrId: any,
  maybeId?: string
): Promise<void> {
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

  const { error } = await supabase
    .from('payment_instructions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message || 'Failed to delete payment instruction.');
  }
}

export async function decryptPaymentInstruction(
  instruction: PaymentInstruction
): Promise<{ account_number: string | null; iban: string | null }> {
  return apiPost<{ account_number: string | null; iban: string | null }>(
    `/api/payment-instructions/${encodeURIComponent(instruction.id)}/reveal`,
    {}
  );
}
