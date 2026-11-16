import { normalizeGmailDate, parseIndianAmount, truncateSnippet200 } from './helpers';
import type { GmailParseOutcome } from './types';

export function parseHdfcUpiDebit(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/Rs\.?\s*([\d,]+\.?\d*)\s+is debited/i);
  const accountMatch = body.match(/account ending (?:XX)?(\d{4})/i);
  const payeeVpaMatch = body.match(/towards VPA\s+(\S+)/i);
  const payeeNameAfterVpa = body.match(/towards VPA\s+\S+\s*\(([^)]+)\)/i);
  const payeeNameFallback = body.match(/\(([^)]+)\)/);
  const upiRefMatch = body.match(/UPI transaction reference no\.?:?\s*(\d+)/i);
  const dateMatch = body.match(/on (\d{2}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}-[A-Z]{3}-\d{4})/i);

  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: 'HDFC_UPI_DEBIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_UPI_DEBIT missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const payeeVpa = payeeVpaMatch?.[1]?.replace(/[.,;]+$/, '').trim() || null;
  const rawPayeeName = (payeeNameAfterVpa?.[1] || payeeNameFallback?.[1] || '').trim();
  const payeeName = rawPayeeName || payeeVpa || 'UPI Payment';
  const upiRef = upiRefMatch?.[1]?.trim() || null;
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  return {
    kind: 'HDFC_UPI_DEBIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'UPI',
    direction: 'debit',
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: payeeVpa,
    upi_ref_no: upiRef,
    imps_ref_no: null,
    balance_after: null,
    description_raw: upiRef
      ? `UPI/${upiRef}/${payeeName}${payeeVpa ? ` (${payeeVpa})` : ''}`
      : `UPI/${payeeName}`,
  };
}

export function parseHdfcImpsCredit(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+has been successfully added/i);
  const accountMatch = body.match(/account ending (?:XX)?(\d{4})/i);
  const impsRefMatch = body.match(/IMPS-(\d+)-/i);
  const senderMatch = body.match(/IMPS-\d+-([^-]+)-/i);
  const balanceMatch = body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i);

  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: 'HDFC_IMPS_CREDIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_IMPS_CREDIT missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const impsRef = impsRefMatch?.[1]?.trim() || null;
  const senderName = senderMatch?.[1]?.trim() || 'IMPS Sender';
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  return {
    kind: 'HDFC_IMPS_CREDIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'IMPS',
    direction: 'credit',
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: senderName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: impsRef,
    balance_after: balanceAfter,
    description_raw: impsRef ? `IMPS-${impsRef}-${senderName}` : `IMPS Credit - ${senderName}`,
  };
}

export function parseHdfcImpsDebit(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/Rs\.?\s*INR\s*([\d,]+\.?\d*)\s+is deducted/i);
  const accountMatch = body.match(/account ending (?:XX)?(\d{4})/i);
  const impsRefMatch = body.match(/IMPS-(\d+)-/i);
  const destMatch = body.match(/added to IMPS-\d+-([^-]+)-/i);
  const destFallback = body.match(/IMPS-\d+-([^-]+)-/i);
  const balanceMatch = body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(/on (\d{2}-[A-Z]{3}-\d{4})/i);

  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: 'HDFC_IMPS_DEBIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_IMPS_DEBIT missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const impsRef = impsRefMatch?.[1]?.trim() || null;
  const destinationName = (destMatch?.[1] || destFallback?.[1] || 'IMPS Recipient').trim();
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  return {
    kind: 'HDFC_IMPS_DEBIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'IMPS',
    direction: 'debit',
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: destinationName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: impsRef,
    balance_after: balanceAfter,
    description_raw: impsRef ? `IMPS-${impsRef}-${destinationName}` : `IMPS Debit - ${destinationName}`,
  };
}

export function parseHdfcBalanceAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body } = params;

  const accountMatch = body.match(/account ending (?:XX)?(\d{4})/i);
  const balanceMatch = body.match(/available balance.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);

  const last4 = accountMatch?.[1] || '';
  const balance = parseIndianAmount(balanceMatch?.[1]);

  if (!last4 || balance === null) {
    return {
      kind: 'HDFC_BALANCE_ALERT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_BALANCE_ALERT missing account last4 or balance',
      raw_snippet: truncateSnippet200(body),
    };
  }

  return {
    kind: 'HDFC_BALANCE_ALERT',
    record_type: 'balance_alert',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    account_last4: last4,
    balance_after: balance,
  };
}

export function parseHdfcRtgsAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const isCredit =
    /credited|has been successfully added|added to/i.test(body) ||
    /credited|credit/i.test(subject);
  const direction: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

  const amountMatch = body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  const accountMatch =
    body.match(/account ending (?:XX)?(\d{4})/i) ||
    body.match(/A\/c (?:No )?[Xx*]*(\d{4})/i);
  const utrMatch =
    body.match(/(?:UTR|Ref(?:erence)?(?:\s+No)?)[.:\s]+([A-Z0-9]{12,26})/i) ||
    body.match(/RTGS[-\s]+(?:CR|DR)?[-\s]*[A-Z0-9]*[-\s]+.*?([A-Z0-9]{16,26})/i);
  const balanceMatch = body.match(
    /available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i
  );
  const dateMatch = body.match(
    /on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: isCredit ? 'HDFC_RTGS_CREDIT' : 'HDFC_RTGS_DEBIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_RTGS alert missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const utrRef = utrMatch?.[1]?.trim() || null;
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  const senderMatch = body.match(
    /(?:from|by|to)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s+towards|\.|\s*$)/i
  );
  const payeeName =
    senderMatch?.[1]?.trim() || (isCredit ? 'RTGS Sender' : 'RTGS Recipient');

  return {
    kind: isCredit ? 'HDFC_RTGS_CREDIT' : 'HDFC_RTGS_DEBIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'RTGS',
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: null,
    rtgs_ref_no: utrRef,
    reference_number: utrRef,
    balance_after: balanceAfter,
    description_raw: utrRef
      ? `RTGS-${utrRef}-${payeeName}`
      : `RTGS ${direction} - ${payeeName}`,
  };
}

export function parseHdfcNeftAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const isCredit =
    /credited|has been successfully added|added to/i.test(body) ||
    /credited|credit/i.test(subject);
  const direction: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

  const amountMatch = body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  const accountMatch =
    body.match(/account ending (?:XX)?(\d{4})/i) ||
    body.match(/A\/c (?:No )?[Xx*]*(\d{4})/i);
  const utrMatch = body.match(
    /(?:NEFT|UTR|Ref(?:erence)?(?:\s+No)?)[.:\s]+([A-Z0-9]{10,22})/i
  );
  const balanceMatch = body.match(
    /available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i
  );
  const dateMatch = body.match(
    /on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: isCredit ? 'HDFC_NEFT_CREDIT' : 'HDFC_NEFT_DEBIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_NEFT alert missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const neftRef = utrMatch?.[1]?.trim() || null;
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  const senderMatch = body.match(
    /(?:from|by|to)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+having|\s+towards|\.|\s*$)/i
  );
  const payeeName =
    senderMatch?.[1]?.trim() || (isCredit ? 'NEFT Sender' : 'NEFT Recipient');

  return {
    kind: isCredit ? 'HDFC_NEFT_CREDIT' : 'HDFC_NEFT_DEBIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'NEFT',
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: null,
    neft_ref_no: neftRef,
    reference_number: neftRef,
    balance_after: balanceAfter,
    description_raw: neftRef
      ? `NEFT-${neftRef}-${payeeName}`
      : `NEFT ${direction} - ${payeeName}`,
  };
}
