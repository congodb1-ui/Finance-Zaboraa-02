export type GmailEmailKind =
  | 'HDFC_UPI_DEBIT'
  | 'HDFC_UPI_CREDIT'
  | 'HDFC_IMPS_CREDIT'
  | 'HDFC_IMPS_DEBIT'
  | 'HDFC_RTGS_CREDIT'
  | 'HDFC_RTGS_DEBIT'
  | 'HDFC_NEFT_CREDIT'
  | 'HDFC_NEFT_DEBIT'
  | 'HDFC_EFT_CREDIT'
  | 'HDFC_EFT_DEBIT'
  | 'HDFC_BALANCE_ALERT'
  | 'BOM_IMPS'
  | 'BOI_IMPS'
  | 'UNKNOWN';

export type GmailTransferMethod = 'UPI' | 'IMPS' | 'RTGS' | 'NEFT' | 'EFT' | 'BALANCE_ALERT';

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
    body?: {
      data?: string;
    };
    parts?: GmailMessagePart[];
  };
  // Optional pre-decoded helpers for unit tests or synthetic calls
  from?: string;
  subject?: string;
  bodyText?: string;
}

export interface ParsedEmailTransaction {
  kind: Exclude<GmailEmailKind, 'HDFC_BALANCE_ALERT' | 'UNKNOWN'>;
  record_type: 'transaction';
  gmail_msg_id: string;
  from_address: string;
  bank: string;
  method: 'UPI' | 'IMPS' | 'RTGS' | 'NEFT' | 'EFT';
  direction: 'debit' | 'credit';
  amount: number;
  account_last4: string;
  txn_date: string; // YYYY-MM-DD
  payee_name: string;
  payee_vpa: string | null;
  upi_ref_no: string | null;
  imps_ref_no: string | null;
  rtgs_ref_no?: string | null;
  neft_ref_no?: string | null;
  reference_number?: string | null;
  balance_after: number | null;
  description_raw: string;
}

export interface ParsedEmailBalanceAlert {
  kind: 'HDFC_BALANCE_ALERT';
  record_type: 'balance_alert';
  gmail_msg_id: string;
  from_address: string;
  bank: 'HDFC';
  account_last4: string;
  balance_after: number;
}

export interface ParsedEmailError {
  kind: 'UNKNOWN' | GmailEmailKind;
  record_type: 'error';
  gmail_msg_id: string;
  from_address: string;
  subject: string;
  error_reason: string;
  raw_snippet: string; // Strictly <= 200 chars
}

export type GmailParseOutcome =
  | ParsedEmailTransaction
  | ParsedEmailBalanceAlert
  | ParsedEmailError;
