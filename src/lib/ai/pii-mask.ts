import type { Transaction } from '../../types/transactions';

export interface MaskedTransaction {
  id: string;
  txn_date: string;
  masked_description: string;
  debit: number | null;
  credit: number | null;
  txn_type: string | null;
  category_id: string | null;
}

/**
 * PII Masking Layer for Zaboraa Finance
 * Mandatory sanitization executed on ALL text and transaction payloads before sending to Gemini.
 * Redacts PAN, Aadhaar, mobile numbers, emails, account numbers, IFSC codes, and user name.
 */
export function maskForAI(text: string, profileName?: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Redact Email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    '[EMAIL-REDACTED]'
  );

  // 2. Redact PAN (Permanent Account Number: 5 letters, 4 digits, 1 letter)
  // e.g., ABCDE1234F or abcde1234f
  sanitized = sanitized.replace(
    /\b[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}\b/g,
    '[PAN-REDACTED]'
  );

  // 3. Redact explicit Aadhaar references or 12-digit formatted numbers (e.g. "Aadhaar: 987654321098", "4521 8901 2345", "1234-5678-9012")
  sanitized = sanitized.replace(
    /(?:AADHAAR|UIDAI|UID)[#:\s]*(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/gi,
    '[AADHAAR-REDACTED]'
  );
  sanitized = sanitized.replace(
    /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/g,
    '[AADHAAR-REDACTED]'
  );

  // 4. Redact explicit bank account numbers (prefixed with AC, ACC, A/C, etc.)
  sanitized = sanitized.replace(
    /\b(?:A\/C|AC|ACC|ACCT|ACCOUNT)[#:\s]*(?<!\d)\d{9,18}(?!\d)/gi,
    '[ACCT-REDACTED]'
  );

  // 5. Redact continuous 12-digit Aadhaar if not already matched
  sanitized = sanitized.replace(
    /(?<!\d)\d{12}(?!\d)/g,
    '[AADHAAR-REDACTED]'
  );

  // 6. Redact any remaining long bank account digit sequences (13 to 18 digits)
  sanitized = sanitized.replace(
    /(?<!\d)\d{13,18}(?!\d)/g,
    '[ACCT-REDACTED]'
  );

  // 7. Redact Indian Mobile Numbers (10 digits starting with 6-9, optional +91 or 0 prefix)
  sanitized = sanitized.replace(
    /(?<!\d)(?:\+91[-\s]?|0)?[6-9]\d{4}[-\s]?\d{5}(?!\d)/g,
    '[MOBILE-REDACTED]'
  );

  // 8. Redact IFSC codes (4 letters, 0, 6 alphanumeric chars)
  sanitized = sanitized.replace(
    /\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g,
    '[IFSC-REDACTED]'
  );

  // 9. Redact account last 4 patterns (e.g. "XX1234", "ending in 4819", "A/c *4819", "Card ...4819")
  sanitized = sanitized.replace(
    /\b(?:A\/C|AC|ACC|ACCT|ACCOUNT|ENDING(?:\s+IN)?|CARD(?:\s+NO)?|XX|\*{2,})[#:\s\-]*\d{4}\b/gi,
    '[ACCT-XXXX]'
  );

  // 8. Redact CIF / Customer ID patterns (e.g. "CIF: 9812401", "CustID 129384")
  sanitized = sanitized.replace(
    /\b(?:CIF|CUSTID|CUSTOMER\s*ID)[#:\s]*[A-Za-z0-9]{6,12}\b/gi,
    '[CIF-REDACTED]'
  );

  // 9. Redact Profile Name if provided (case-insensitive fuzzy / word boundary match)
  if (profileName && profileName.trim().length > 2) {
    const trimmedName = profileName.trim();
    // Escape regex special chars
    const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[NAME-REDACTED]');

    // Also match individual first/last name parts if longer than 3 chars
    const nameParts = trimmedName.split(/\s+/).filter((p) => p.length >= 3);
    for (const part of nameParts) {
      const escPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(`\\b${escPart}\\b`, 'gi'), '[NAME-REDACTED]');
    }
  }

  return sanitized;
}

/**
 * Sanitizes a transaction record into a strict, PII-stripped MaskedTransaction
 * Excludes account_number, customer_id, balances, notes, bill URLs, and counterparty personal names.
 */
export function maskTransactionForAI(
  txn: Partial<Transaction>,
  profileName?: string
): MaskedTransaction {
  const rawDesc = txn.description || txn.raw_description || 'Transaction';
  const maskedDesc = maskForAI(rawDesc, profileName);

  return {
    id: txn.id || 'tx_unknown',
    txn_date: txn.txn_date || new Date().toISOString().split('T')[0],
    masked_description: maskedDesc,
    debit: txn.debit ?? null,
    credit: txn.credit ?? null,
    txn_type: txn.txn_type || null,
    category_id: txn.category_id || null,
  };
}
