import { createClient as createSupabaseClient } from '../supabase/client';
import { encryptValue, decryptValue } from '../crypto';
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

function normalizeCurrency(code: string | null | undefined): string {
  const cur = (code || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw new Error('Currency must be a valid 3-letter ISO code.');
  }
  return cur;
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
  const supabase = hasClient ? clientOrData : createSupabaseClient();
  const data: PaymentInstructionFormData = (
    hasClient ? maybeData : clientOrData
  ) as PaymentInstructionFormData;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const label = (data.label || '').trim();
  if (!label) {
    throw new Error('Payment instruction label is required.');
  }

  const beneficiaryName = (data.beneficiary_name || '').trim();
  if (!beneficiaryName) {
    throw new Error('Beneficiary name is required.');
  }

  const currency = normalizeCurrency(data.currency);
  const isDefault = Boolean(data.is_default);

  const trimmedAccountNumber = data.account_number?.trim() || '';
  const accountNumberEncrypted = trimmedAccountNumber
    ? await encryptValue(trimmedAccountNumber)
    : null;
  const last4 = trimmedAccountNumber ? trimmedAccountNumber.slice(-4) : null;

  const trimmedIban = data.iban?.trim() || '';
  const ibanEncrypted = trimmedIban ? await encryptValue(trimmedIban) : null;

  if (isDefault) {
    const { error: clearError } = await supabase
      .from('payment_instructions')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('currency', currency)
      .eq('is_default', true);

    if (clearError) {
      throw new Error(
        clearError.message || 'Failed to clear previous default instruction.'
      );
    }
  }

  const payload = {
    user_id: user.id,
    label,
    beneficiary_name: beneficiaryName,
    bank_name: data.bank_name?.trim() || null,
    bank_address: data.bank_address?.trim() || null,
    account_number_encrypted: accountNumberEncrypted,
    last4,
    iban_encrypted: ibanEncrypted,
    swift_bic: data.swift_bic?.trim().toUpperCase() || null,
    ifsc: data.ifsc?.trim().toUpperCase() || null,
    intermediary_bank: data.intermediary_bank?.trim() || null,
    currency,
    is_default: isDefault,
  };

  const { data: created, error } = await supabase
    .from('payment_instructions')
    .insert(payload)
    .select('*')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create payment instruction.');
  }

  return created as PaymentInstruction;
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
  const supabase = hasClient ? clientOrId : createSupabaseClient();
  const id: string = hasClient ? idOrData : clientOrId;
  const data: Partial<PaymentInstructionFormData> =
    (hasClient ? maybeData : idOrData) || {};

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('payment_instructions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Payment instruction not found.');
  }

  const payload: Record<string, unknown> = {};

  if (data.label !== undefined) {
    const label = data.label.trim();
    if (!label) throw new Error('Payment instruction label is required.');
    payload.label = label;
  }

  if (data.beneficiary_name !== undefined) {
    const beneficiaryName = data.beneficiary_name.trim();
    if (!beneficiaryName) throw new Error('Beneficiary name is required.');
    payload.beneficiary_name = beneficiaryName;
  }

  if (data.bank_name !== undefined) {
    payload.bank_name = data.bank_name?.trim() || null;
  }

  if (data.bank_address !== undefined) {
    payload.bank_address = data.bank_address?.trim() || null;
  }

  if (data.account_number !== undefined) {
    const trimmedAccount = data.account_number?.trim() || '';
    if (trimmedAccount.length > 0) {
      payload.account_number_encrypted = await encryptValue(trimmedAccount);
      payload.last4 = trimmedAccount.slice(-4);
    } else if (data.account_number === null) {
      payload.account_number_encrypted = null;
      payload.last4 = null;
    }
  }

  if (data.iban !== undefined) {
    const trimmedIban = data.iban?.trim() || '';
    if (trimmedIban.length > 0) {
      payload.iban_encrypted = await encryptValue(trimmedIban);
    } else if (data.iban === null) {
      payload.iban_encrypted = null;
    }
  }

  if (data.swift_bic !== undefined) {
    payload.swift_bic = data.swift_bic?.trim().toUpperCase() || null;
  }

  if (data.ifsc !== undefined) {
    payload.ifsc = data.ifsc?.trim().toUpperCase() || null;
  }

  if (data.intermediary_bank !== undefined) {
    payload.intermediary_bank = data.intermediary_bank?.trim() || null;
  }

  const targetCurrency =
    data.currency !== undefined ? normalizeCurrency(data.currency) : existing.currency;
  if (data.currency !== undefined) {
    payload.currency = targetCurrency;
  }

  if (data.is_default !== undefined) {
    payload.is_default = Boolean(data.is_default);
  }

  const willBeDefault =
    data.is_default !== undefined ? Boolean(data.is_default) : Boolean(existing.is_default);

  if (willBeDefault) {
    const { error: clearError } = await supabase
      .from('payment_instructions')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('currency', targetCurrency)
      .eq('is_default', true)
      .neq('id', id);

    if (clearError) {
      throw new Error(
        clearError.message || 'Failed to clear existing default instruction.'
      );
    }
  }

  const { data: updated, error } = await supabase
    .from('payment_instructions')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update payment instruction.');
  }

  return updated as PaymentInstruction;
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
  let accountNumber: string | null = null;
  let iban: string | null = null;

  if (instruction.account_number_encrypted) {
    accountNumber = await decryptValue(instruction.account_number_encrypted);
  }

  if (instruction.iban_encrypted) {
    iban = await decryptValue(instruction.iban_encrypted);
  }

  return {
    account_number: accountNumber,
    iban,
  };
}
