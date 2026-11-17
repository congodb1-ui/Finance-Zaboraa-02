import {
  cleanBankEntityName,
  normalizeGmailDate,
  normalizeRef,
  parseIndianAmount,
  truncateSnippet200,
} from './helpers';
import type { GmailParseOutcome } from './types';

function extractHdfcAccountLast4(body: string): string {
  const m =
    body.match(/(?:account|A\/c)(?:\s+No\.?)?\s+ending(?:\s+in)?\s+(?:XX|\*{2,}|[Xx*]+)?\s*(\d{4})/i) ||
    body.match(/account\s+[Xx*]+(\d{4})/i) ||
    body.match(/A\/c(?:\s+No\.?)?\s*[Xx*]*\s*(\d{4})/i) ||
    body.match(/(?:Debit|ATM)?\s*Card(?:\s+(?:No\.?|ending(?:\s+in)?))?\s*(?:XX|\*{2,}|[Xx*]+)?\s*(\d{4})/i) ||
    body.match(/\b[Xx*]{2,}(\d{4})\b/);
  return m?.[1] || '';
}

export function parseHdfcUpiDebit(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s+is debited/i);
  const last4 = extractHdfcAccountLast4(body);
  const payeeVpaMatch = body.match(/towards VPA\s+(\S+)/i);
  const payeeNameAfterVpa = body.match(/towards VPA\s+\S+\s*\(([^)]+)\)/i);
  const payeeNameFallback = body.match(/\(([^)]+)\)/);
  const upiRefMatch = body.match(
    /UPI\s*transaction\s*reference\s*(?:no\.?|number)\s*(?:is|:)\s*(\d+)/i
  );
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

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
  const rawPayeeName = cleanBankEntityName(payeeNameAfterVpa?.[1] || payeeNameFallback?.[1] || '');
  const payeeName = rawPayeeName || payeeVpa || 'UPI Payment';
  const upiRef = normalizeRef(upiRefMatch?.[1]);
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
    reference_number: upiRef,
    balance_after: null,
    description_raw: upiRef
      ? `UPI/${upiRef}/${payeeName}${payeeVpa ? ` (${payeeVpa})` : ''}`
      : `UPI/${payeeName}`,
  };
}

export function parseHdfcUpiCredit(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s+is (?:successfully\s+)?credited/i);
  const last4 = extractHdfcAccountLast4(body);
  const vpaAndNameMatch = body.match(
    /(?:by|from)\s+VPA\s+([^\s]+)\s+(.+?)\s+on\s+\d{1,2}[-\/]/i
  );
  const payeeVpaMatch = body.match(/(?:by|from)\s+VPA\s+(\S+)/i);
  const parenNameMatch = body.match(/(?:by|from)\s+VPA\s+\S+\s*\(([^)]+)\)/i);
  const upiRefMatch = body.match(
    /UPI\s*transaction\s*reference\s*(?:no\.?|number)\s*(?:is|:)\s*(\d+)/i
  );
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: 'HDFC_UPI_CREDIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_UPI_CREDIT missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const payeeVpa = (vpaAndNameMatch?.[1] || payeeVpaMatch?.[1] || '')
    .replace(/[.,;]+$/, '')
    .trim() || null;
  const rawPayeeName = cleanBankEntityName(
    parenNameMatch?.[1] || vpaAndNameMatch?.[2] || ''
  );
  const payeeName = rawPayeeName || payeeVpa || 'UPI Sender';
  const upiRef = normalizeRef(upiRefMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  return {
    kind: 'HDFC_UPI_CREDIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'UPI',
    direction: 'credit',
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: payeeVpa,
    upi_ref_no: upiRef,
    imps_ref_no: null,
    reference_number: upiRef,
    balance_after: null,
    description_raw: upiRef
      ? `UPI/${upiRef}/${payeeName}${payeeVpa ? ` (${payeeVpa})` : ''}`
      : `UPI Credit - ${payeeName}`,
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

  const amountMatch =
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)\s+has been successfully added/i) ||
    body.match(/is credited (?:for|with|by)\s*(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i) ||
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)\s+(?:is|has been)\s+(?:successfully\s+)?(?:credited|received)/i) ||
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const impsRefMatch =
    body.match(/IMPS[-\s]+(\d{8,16})\b/i) ||
    body.match(/IMPS\s*(?:Ref|RRN|UTR)\s*(?:No\.?)?[:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,22})/i) ||
    body.match(/(?:Ref(?:erence)?\s*(?:No\.?)?|RRN)[:\s]+(\d{8,16})/i);
  const senderMatch =
    body.match(/IMPS-\d+-([^-]+)-/i) ||
    body.match(/(?:from|by)\s+([A-Za-z0-9 .&*/-]+?)(?:\s+with\s+(?:Ref|UTR)|\s+on|\s+\(|\s*\.|\s*$)/i);
  const balanceMatch = body.match(/(?:available balance|avl\.?\s*bal(?:ance)?).*?(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

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

  const impsRef = normalizeRef(impsRefMatch?.[1]);
  const senderName = cleanBankEntityName(senderMatch?.[1]) || 'IMPS Sender';
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
    reference_number: impsRef,
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

  const amountMatch =
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)\s+is deducted/i) ||
    body.match(/is debited (?:for|with|by)\s*(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i) ||
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)\s+(?:is|has been)\s+(?:debited|transferred|remitted)/i) ||
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const impsRefMatch =
    body.match(/IMPS\s*(?:Ref|RRN|UTR)\s*(?:No\.?)?[:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,22})/i) ||
    body.match(/IMPS-(\d{8,16})-/i) ||
    body.match(/IMPS[-\/\s]+(\d{8,16})\b/i) ||
    body.match(/(?:Ref(?:erence)?\s*(?:No\.?)?|RRN)[:\s]+(\d{8,16})/i);
  const destMatch = body.match(/added to IMPS-\d+-([^-]+)-/i);
  const destFallback = body.match(/IMPS-\d+-([^-]+)-/i);
  const pairedAcctMatch = body.match(/and\s+(A\/c\s+[Xx*]+\d{4})\s+is\s+credited/i);
  const toPayeeMatch = body.match(/(?:to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+(?:Ref|UTR)|\s*\(|\s*\.|\s+on\s+\d|$)/i);
  const balanceMatch = body.match(/(?:available balance|avl\.?\s*bal(?:ance)?).*?(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

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

  const impsRef = normalizeRef(impsRefMatch?.[1]);
  const destinationName =
    cleanBankEntityName(
      destMatch?.[1] ||
        destFallback?.[1] ||
        pairedAcctMatch?.[1] ||
        toPayeeMatch?.[1] ||
        ''
    ) || 'IMPS Recipient';
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
    reference_number: impsRef,
    balance_after: balanceAfter,
    description_raw: impsRef
      ? `IMPS-${impsRef}-${destinationName}`
      : `IMPS Debit - ${destinationName}`,
  };
}

export function parseHdfcEftTransfer(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const isCredit = /\bcredited\b|\badded to\b/i.test(body);
  const direction: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

  const amountMatch =
    body.match(/payment\s+of\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i) ||
    body.match(/(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const amount = parseIndianAmount(amountMatch?.[1]);

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: direction === 'credit' ? 'HDFC_EFT_CREDIT' : 'HDFC_EFT_DEBIT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_EFT missing required amount or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const payeeMatch =
    body.match(/Transfer\s+to\s+payee\s+(.+?)(?:\s+via\s+HDFC|\s*\.|\s*$)/i) ||
    body.match(/from\s+A\/c\s+[Xx*]+\d{4}\s+to\s+([A-Za-z0-9 .&_-]+?)(?:\s+Not you|\s*\.|\s*$)/i) ||
    body.match(/(?:to|from)\s+([A-Za-z0-9 .&_-]+?)(?:\s+Not you|\s+via|\s*\.|\s*$)/i);

  const payeeName = cleanBankEntityName(payeeMatch?.[1]) || 'HDFC Online Transfer';
  const refMatch = body.match(/(?:Ref(?:erence)?(?:\s+No\.?)?|Txn\s+ID)[:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{6,22})/i);
  const refNo = normalizeRef(refMatch?.[1]);
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );
  const balanceMatch = body.match(/available balance.*?(?:Rs\.?\s*INR|Rs\.?|INR)\s*([\d,]+\.?\d*)/i);

  return {
    kind: direction === 'credit' ? 'HDFC_EFT_CREDIT' : 'HDFC_EFT_DEBIT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'EFT',
    direction,
    amount,
    account_last4: last4,
    txn_date: normalizeGmailDate(dateMatch?.[1], internalDate),
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: null,
    reference_number: refNo,
    balance_after: parseIndianAmount(balanceMatch?.[1]),
    description_raw: `EFT-${payeeName}`,
  };
}

export function parseHdfcBalanceAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body } = params;

  const last4 = extractHdfcAccountLast4(body);
  const balanceMatch = body.match(/available balance.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
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
    /\b(?:credited|has been successfully added|added to|received)\b/i.test(body) ||
    /\bcredited|credit\b/i.test(subject);
  const direction: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

  const amountMatch = body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const utrMatch =
    body.match(/(?:UTR|Ref(?:erence)?(?:\s+No\.?)?|RTGS\s*(?:Ref|UTR)?)[.:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i) ||
    body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
    body.match(/RTGS[-\s]+(?:CR|DR)?[-\s]*[A-Z0-9]*[-\s]+.*?((?=[A-Z0-9]*\d)[A-Z0-9]{10,26})/i);
  const balanceMatch = body.match(
    /(?:available balance|avl\.?\s*bal(?:ance)?).*?(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i
  );
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

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

  const utrRef = normalizeRef(utrMatch?.[1]);
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  const senderMatch = body.match(
    /(?:from|by|to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+via\s+RTGS|\s+having|\s*\(|\s+on\s+\d|\s+Not you|\.\s|\s*$)/i
  );
  const payeeName =
    cleanBankEntityName(senderMatch?.[1]) || (isCredit ? 'RTGS Sender' : 'RTGS Recipient');

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
    /\b(?:credited|has been successfully added|added to|received)\b/i.test(body) ||
    /\bcredited|credit\b/i.test(subject);
  const direction: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

  const amountMatch = body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const utrMatch =
    body.match(/(?:NEFT\s*(?:Ref|UTR)?|UTR|Ref(?:erence)?(?:\s+No\.?)?)[.:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i) ||
    body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
    body.match(/NEFT[-\/](?:CR|DR)?[-\/]?.*?[-\/]((?=[A-Z0-9]*\d)[A-Z0-9]{10,24})/i);
  const balanceMatch = body.match(
    /(?:available balance|avl\.?\s*bal(?:ance)?).*?(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i
  );
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );

  const amount = parseIndianAmount(amountMatch?.[1]);

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

  const neftRef = normalizeRef(utrMatch?.[1]);
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  const senderMatch = body.match(
    /(?:from|by|to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+with\s+UTR|\s+via\s+NEFT|\s+having|\s*\(|\s+on\s+\d|\s+Not you|\.\s|\s*$)/i
  );
  const payeeName =
    cleanBankEntityName(senderMatch?.[1]) || (isCredit ? 'NEFT Sender' : 'NEFT Recipient');

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

export function parseHdfcAtmWithdrawal(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const amountMatch = body.match(/(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i);
  const last4 = extractHdfcAccountLast4(body);
  const amount = parseIndianAmount(amountMatch?.[1]);

  if (!amount || amount <= 0 || !last4) {
    return {
      kind: 'HDFC_ATM_WITHDRAWAL',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'HDFC_ATM_WITHDRAWAL missing required amount or account/card last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const refMatch =
    body.match(/(?:RRN|ATM\s*(?:Ref|Txn|ID)|Ref(?:erence)?(?:\s+No\.?)?|Txn\s*(?:Ref|ID|No\.?))[:\s#-]+((?=[A-Z0-9]*\d)[A-Z0-9]{6,22})/i) ||
    body.match(/\b(\d{12})\b/);
  const refNo = normalizeRef(refMatch?.[1]);

  const locMatch = body.match(
    /(?:at\s+(?:ATM\s*)?|location\s*[:\-]\s*)([A-Za-z0-9 .,\/&-]+?)(?:\s+on\s+\d|\s+Ref|\s+RRN|\s+Avl|\s+Available|\s+Not\s+you|\.\s|\s*$)/i
  );
  const atmLoc = cleanBankEntityName(locMatch?.[1]);
  const payeeName = atmLoc ? `ATM Cash Withdrawal - ${atmLoc}` : 'ATM Cash Withdrawal';

  const balanceMatch = body.match(
    /(?:available balance|avl\.?\s*bal(?:ance)?).*?(?:Rs\.?\s*INR|Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i
  );
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );

  return {
    kind: 'HDFC_ATM_WITHDRAWAL',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'HDFC',
    method: 'ATM',
    direction: 'debit',
    amount,
    account_last4: last4,
    txn_date: normalizeGmailDate(dateMatch?.[1], internalDate),
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: null,
    reference_number: refNo,
    balance_after: parseIndianAmount(balanceMatch?.[1]),
    description_raw: refNo ? `ATM/${refNo}/${payeeName}` : `ATM/${payeeName}`,
  };
}
