import { createClient as createSupabaseClient } from '../supabase/client';
import { getBusinessProfile } from './businessProfile';
import { getClient } from './clients';
import { getPaymentInstruction } from './paymentInstructions';
import { getDecimalsForCurrency } from '../data/currencies';
import type { InvoiceLineItem } from '../../types/invoices';
import type {
  BankSnapshot,
  BusinessProfile,
  Client,
  ClientSnapshot,
  InvoiceV2,
  InvoiceV2FormData,
  PaymentInstruction,
  SellerSnapshot,
} from '../../types/invoicing';

function isSupabaseClientLike(value: any): boolean {
  return Boolean(
    value &&
      typeof value.from === 'function' &&
      value.auth &&
      typeof value.auth.getUser === 'function'
  );
}

function roundToDecimals(value: number, decimals: number): number {
  const safeDecimals = Math.max(0, Math.min(6, decimals));
  const factor = Math.pow(10, safeDecimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeCurrencyCode(code: string | null | undefined, fallback = 'INR'): string {
  const cur = (code || fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw new Error('Currency must be a valid 3-letter ISO code.');
  }
  return cur;
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function buildSellerSnapshot(profile: BusinessProfile | null): SellerSnapshot | null {
  if (!profile) return null;
  return {
    company_name: profile.company_name,
    logo_path: profile.logo_path,
    address: profile.address,
    country: profile.country,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    gstin: profile.gstin,
    iec: profile.iec,
    lut_number: profile.lut_number,
    lut_date: profile.lut_date,
  };
}

function buildClientSnapshot(client: Client | null): ClientSnapshot | null {
  if (!client) return null;
  return {
    name: client.name,
    company_name: client.company_name,
    country: client.country,
    address: client.address,
    city: client.city,
    email: client.email,
    phone: client.phone,
    tax_id: client.tax_id,
  };
}

function buildBankSnapshot(instruction: PaymentInstruction | null): BankSnapshot | null {
  if (!instruction) return null;
  return {
    label: instruction.label,
    beneficiary_name: instruction.beneficiary_name,
    bank_name: instruction.bank_name,
    bank_address: instruction.bank_address,
    last4: instruction.last4,
    account_number: instruction.last4 ? `••••${instruction.last4}` : null,
    iban: instruction.iban_encrypted ? '[encrypted]' : null,
    swift_bic: instruction.swift_bic,
    ifsc: instruction.ifsc,
    intermediary_bank: instruction.intermediary_bank,
    currency: instruction.currency,
  };
}

function computeLineItemsAndTotals(
  rawItems: InvoiceLineItem[] | undefined,
  rawTaxPercent: number | undefined,
  currency: string,
  rawExchangeRate: number | null | undefined
): {
  lineItems: InvoiceLineItem[];
  subtotal: number;
  total: number;
  taxPercent: number;
  exchangeRate: number | null;
  inrEquivalent: number | null;
} {
  const decimals = getDecimalsForCurrency(currency);
  const items = Array.isArray(rawItems) ? rawItems : [];

  const normalizedItems: InvoiceLineItem[] = items.map((item, idx) => {
    const qtyRaw = Number(item.quantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    const priceRaw =
      item.unit_price !== undefined && item.unit_price !== null
        ? Number(item.unit_price)
        : Number(item.rate);
    const unitPrice = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;

    const discountRaw = Number(item.discount);
    const discount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;

    const lineAmount = Math.max(
      0,
      roundToDecimals(quantity * unitPrice - discount, decimals)
    );

    return {
      id: item.id || `item_${idx + 1}`,
      description: (item.description || '').trim(),
      quantity,
      unit_price: unitPrice,
      discount,
      rate: unitPrice,
      amount: lineAmount,
    };
  });

  const subtotal = roundToDecimals(
    normalizedItems.reduce((sum, item) => sum + item.amount, 0),
    decimals
  );

  const taxRaw = Number(rawTaxPercent);
  const taxPercent = Number.isFinite(taxRaw) && taxRaw >= 0 ? taxRaw : 0;
  const taxAmount = roundToDecimals((subtotal * taxPercent) / 100, decimals);
  const total = roundToDecimals(subtotal + taxAmount, decimals);

  let exchangeRate: number | null = null;
  let inrEquivalent: number | null = null;

  if (currency === 'INR') {
    exchangeRate = 1;
    inrEquivalent = roundToDecimals(total, 2);
  } else if (
    rawExchangeRate !== null &&
    rawExchangeRate !== undefined &&
    Number.isFinite(Number(rawExchangeRate)) &&
    Number(rawExchangeRate) > 0
  ) {
    exchangeRate = Number(rawExchangeRate);
    inrEquivalent = roundToDecimals(total * exchangeRate, 2);
  }

  return {
    lineItems: normalizedItems,
    subtotal,
    total,
    taxPercent,
    exchangeRate,
    inrEquivalent,
  };
}

function mapInvoiceRow(row: any): InvoiceV2 {
  const joinedClient = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const { clients: _ignoredClients, ...rest } = row;
  return {
    ...rest,
    client_name: row.client_name || joinedClient?.name || '',
    country: row.country || joinedClient?.country || null,
    currency: (row.currency || 'INR').toUpperCase(),
    tax_label: row.tax_label || 'GST',
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
  } as InvoiceV2;
}

export async function getInvoicesV2(supabaseClient?: any): Promise<InvoiceV2[]> {
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
    .select('*, clients(name, country)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load invoices.');
  }

  return (data || []).map(mapInvoiceRow);
}

export async function getInvoiceV2(
  supabaseClient: any,
  id: string
): Promise<InvoiceV2 | null> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const targetId = isSupabaseClientLike(supabaseClient) ? id : supabaseClient;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name, country)')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load invoice.');
  }

  return data ? mapInvoiceRow(data) : null;
}

export async function createInvoiceV2(
  supabaseClient: any,
  data: InvoiceV2FormData
): Promise<InvoiceV2> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const payloadData: InvoiceV2FormData = isSupabaseClientLike(supabaseClient)
    ? data
    : supabaseClient;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: allocatedNumber, error: rpcError } = await supabase.rpc(
    'allocate_invoice_number',
    { p_user_id: user.id }
  );

  if (rpcError || !allocatedNumber) {
    const rawMsg = rpcError?.message || '';
    if (rawMsg.toLowerCase().includes('no business profile')) {
      throw new Error(
        'Please save your Business Profile in Settings before creating an invoice (required for automatic invoice numbering).'
      );
    }
    throw new Error(rawMsg || 'Failed to allocate invoice number.');
  }

  const [sellerProfile, clientRecord, paymentInstruction] = await Promise.all([
    getBusinessProfile(supabase),
    payloadData.client_id ? getClient(supabase, payloadData.client_id) : Promise.resolve(null),
    payloadData.payment_instruction_id
      ? getPaymentInstruction(supabase, payloadData.payment_instruction_id)
      : Promise.resolve(null),
  ]);

  const currency = normalizeCurrencyCode(
    payloadData.currency || clientRecord?.default_currency || sellerProfile?.default_currency,
    'INR'
  );

  const clientName = (
    payloadData.client_name ||
    clientRecord?.company_name ||
    clientRecord?.name ||
    ''
  ).trim();
  if (!clientName) {
    throw new Error('Client name is required.');
  }

  if (!payloadData.line_items || payloadData.line_items.length === 0) {
    throw new Error('At least one line item is required.');
  }

  const computed = computeLineItemsAndTotals(
    payloadData.line_items,
    payloadData.tax_percent,
    currency,
    payloadData.exchange_rate
  );

  const status = payloadData.status === 'sent' ? 'sent' : 'draft';
  const country = normalizeCountryCode(payloadData.country || clientRecord?.country);
  const taxLabel = (payloadData.tax_label || 'GST').trim() || 'GST';

  const insertPayload = {
    user_id: user.id,
    invoice_number: String(allocatedNumber),
    client_id: payloadData.client_id || null,
    client_name: clientName,
    client_email: payloadData.client_email?.trim() || clientRecord?.email || null,
    country,
    currency,
    exchange_rate: computed.exchangeRate,
    inr_equivalent: computed.inrEquivalent,
    issue_date: payloadData.issue_date,
    due_date: payloadData.due_date || null,
    line_items: computed.lineItems,
    subtotal: computed.subtotal,
    tax_percent: computed.taxPercent,
    tax_label: taxLabel,
    total: computed.total,
    status,
    notes: payloadData.notes?.trim() || null,
    payment_instruction_id: payloadData.payment_instruction_id || null,
    seller_snapshot: buildSellerSnapshot(sellerProfile),
    client_snapshot: buildClientSnapshot(clientRecord),
    bank_snapshot: buildBankSnapshot(paymentInstruction),
  };

  const { data: created, error } = await supabase
    .from('invoices')
    .insert(insertPayload)
    .select('*, clients(name, country)')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create invoice.');
  }

  return mapInvoiceRow(created);
}

export async function updateInvoiceV2(
  supabaseClient: any,
  id: string,
  data: Partial<InvoiceV2FormData>
): Promise<InvoiceV2> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const targetId: string = isSupabaseClientLike(supabaseClient) ? id : supabaseClient;
  const updates: Partial<InvoiceV2FormData> = isSupabaseClientLike(supabaseClient)
    ? data
    : (id as unknown as Partial<InvoiceV2FormData>);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Invoice not found.');
  }

  if (existing.status !== 'draft') {
    throw new Error('Only draft invoices can be edited.');
  }

  const nextCurrency =
    updates.currency !== undefined
      ? normalizeCurrencyCode(updates.currency, existing.currency || 'INR')
      : normalizeCurrencyCode(existing.currency, 'INR');

  const nextLineItems =
    updates.line_items !== undefined ? updates.line_items : existing.line_items;
  const nextTaxPercent =
    updates.tax_percent !== undefined ? updates.tax_percent : existing.tax_percent;
  const nextExchangeRate =
    updates.exchange_rate !== undefined ? updates.exchange_rate : existing.exchange_rate;

  const computed = computeLineItemsAndTotals(
    nextLineItems,
    nextTaxPercent,
    nextCurrency,
    nextExchangeRate
  );

  const updatePayload: Record<string, unknown> = {
    currency: nextCurrency,
    line_items: computed.lineItems,
    subtotal: computed.subtotal,
    tax_percent: computed.taxPercent,
    total: computed.total,
    exchange_rate: computed.exchangeRate,
    inr_equivalent: computed.inrEquivalent,
    updated_at: new Date().toISOString(),
  };

  if (updates.client_id !== undefined) {
    updatePayload.client_id = updates.client_id || null;
    if (updates.client_id) {
      const clientRecord = await getClient(supabase, updates.client_id);
      updatePayload.client_snapshot = buildClientSnapshot(clientRecord);
    } else {
      updatePayload.client_snapshot = null;
    }
  }

  if (updates.payment_instruction_id !== undefined) {
    updatePayload.payment_instruction_id = updates.payment_instruction_id || null;
    if (updates.payment_instruction_id) {
      const instruction = await getPaymentInstruction(
        supabase,
        updates.payment_instruction_id
      );
      updatePayload.bank_snapshot = buildBankSnapshot(instruction);
    } else {
      updatePayload.bank_snapshot = null;
    }
  }

  if (!existing.seller_snapshot) {
    const profile = await getBusinessProfile(supabase);
    updatePayload.seller_snapshot = buildSellerSnapshot(profile);
  }

  if (updates.client_name !== undefined) {
    const trimmed = updates.client_name.trim();
    if (!trimmed) throw new Error('Client name is required.');
    updatePayload.client_name = trimmed;
  }

  if (updates.client_email !== undefined) {
    updatePayload.client_email = updates.client_email?.trim() || null;
  }

  if (updates.country !== undefined) {
    updatePayload.country = normalizeCountryCode(updates.country);
  }

  if (updates.issue_date !== undefined) {
    updatePayload.issue_date = updates.issue_date;
  }

  if (updates.due_date !== undefined) {
    updatePayload.due_date = updates.due_date || null;
  }

  if (updates.tax_label !== undefined) {
    updatePayload.tax_label = updates.tax_label.trim() || 'GST';
  }

  if (updates.notes !== undefined) {
    updatePayload.notes = updates.notes?.trim() || null;
  }

  if (updates.status !== undefined) {
    if (updates.status === 'draft' || updates.status === 'sent') {
      updatePayload.status = updates.status;
    }
  }

  const { data: updated, error } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', targetId)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .select('*, clients(name, country)')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update invoice.');
  }

  return mapInvoiceRow(updated);
}

export async function cancelInvoice(supabaseClient: any, id: string): Promise<void> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const targetId: string = isSupabaseClientLike(supabaseClient) ? id : supabaseClient;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Invoice not found.');
  }

  if (existing.status === 'paid') {
    throw new Error('Paid invoices cannot be cancelled.');
  }

  if (existing.status === 'cancelled') {
    return;
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error(error.message || 'Failed to cancel invoice.');
  }
}

export async function deleteDraftInvoiceV2(
  supabaseClient: any,
  id: string
): Promise<void> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const targetId: string = isSupabaseClientLike(supabaseClient) ? id : supabaseClient;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Invoice not found.');
  }

  if (existing.status !== 'draft') {
    throw new Error('Only draft invoices can be deleted. Cancel issued invoices instead.');
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', targetId)
    .eq('user_id', user.id)
    .eq('status', 'draft');

  if (error) {
    throw new Error(error.message || 'Failed to delete draft invoice.');
  }
}

export async function markInvoicePaidV2(
  supabaseClient: any,
  id: string
): Promise<InvoiceV2> {
  const supabase = isSupabaseClientLike(supabaseClient)
    ? supabaseClient
    : createSupabaseClient();
  const targetId: string = isSupabaseClientLike(supabaseClient) ? id : supabaseClient;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Invoice not found.');
  }

  if (existing.status === 'cancelled') {
    throw new Error('Cancelled invoices cannot be marked as paid.');
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      amount_received: existing.amount_received ?? existing.total,
      inr_received: existing.inr_received ?? existing.inr_equivalent,
      paid_at: existing.paid_at || nowIso,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .eq('user_id', user.id)
    .select('*, clients(name, country)')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to mark invoice as paid.');
  }

  return mapInvoiceRow(updated);
}
