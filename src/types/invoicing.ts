import type { Invoice, InvoiceStatus } from './invoices';

export interface BusinessProfile {
  id: string;
  user_id: string;
  company_name: string | null;
  logo_path: string | null;
  address: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  gstin: string | null;
  iec: string | null;
  lut_number: string | null;
  lut_date: string | null;
  default_currency: string;
  invoice_prefix: string;
  next_invoice_no: number;
  default_payment_terms_days: number;
  default_notes: string | null;
  default_footer: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessProfileFormData = Omit<
  BusinessProfile,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

export interface Client {
  id: string;
  user_id: string;
  name: string;
  company_name: string | null;
  country: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  default_currency: string;
  payment_terms_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientFormData = Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface PaymentInstruction {
  id: string;
  user_id: string;
  label: string;
  beneficiary_name: string;
  bank_name: string | null;
  bank_address: string | null;
  account_number_encrypted: string | null;
  last4: string | null;
  iban_encrypted: string | null;
  swift_bic: string | null;
  ifsc: string | null;
  intermediary_bank: string | null;
  currency: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentInstructionFormData {
  label: string;
  beneficiary_name: string;
  bank_name?: string | null;
  bank_address?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  ifsc?: string | null;
  intermediary_bank?: string | null;
  currency: string;
  is_default?: boolean;
}

export type InvoiceStatusV2 = InvoiceStatus | 'partial' | 'cancelled';

export interface SellerSnapshot {
  company_name?: string | null;
  logo_path?: string | null;
  address?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  gstin?: string | null;
  iec?: string | null;
  lut_number?: string | null;
  lut_date?: string | null;
}

export interface ClientSnapshot {
  name?: string | null;
  company_name?: string | null;
  country?: string | null;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  tax_id?: string | null;
}

export interface BankSnapshot {
  label?: string | null;
  beneficiary_name?: string | null;
  bank_name?: string | null;
  bank_address?: string | null;
  last4?: string | null;
  swift_bic?: string | null;
  ifsc?: string | null;
  intermediary_bank?: string | null;
  currency?: string | null;
}

export interface InvoiceV2 extends Omit<Invoice, 'status'> {
  status: InvoiceStatusV2;
  currency: string;
  exchange_rate: number | null;
  inr_equivalent: number | null;
  client_id: string | null;
  country: string | null;
  tax_label: string;
  seller_snapshot: SellerSnapshot | null;
  client_snapshot: ClientSnapshot | null;
  bank_snapshot: BankSnapshot | null;
  amount_received: number | null;
  inr_received: number | null;
  paid_at: string | null;
  linked_transaction_id: string | null;
  payment_instruction_id: string | null;
}

export type InvoiceV2FormData = Omit<
  InvoiceV2,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;
