import {
  cleanBankEntityName,
  normalizeGmailDate,
  normalizeRef,
  parseIndianAmount,
  truncateSnippet200,
} from './helpers';
import type { GmailParseOutcome } from './types';

export function parseBomAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const accountMatch =
    body.match(/A\/c(?:\s+No\.?)?\s*[Xx*\s]*(\d{4})/i) ||
    body.match(/account(?:\s+ending)?\s*[Xx*\s]*(\d{4})/i);
  const directionMatch = body.match(/\b(credited|debited|CR|DR)\b/i);
  const amountMatch =
    body.match(/(?:by|for|of)\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i) ||
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(
    /on\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );
  const balanceMatch = body.match(
    /(?:A\/c Bal(?:ance)?|AVL Bal)(?:\s+is)?(?:\s+INR|\s+Rs\.?)?\s*([\d,]+\.?\d*)/i
  );

  let method: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI' = 'IMPS';
  let kind: 'BOM_IMPS' | 'BOM_NEFT' | 'BOM_RTGS' | 'BOM_UPI' = 'BOM_IMPS';
  if (/\bRTGS\b/i.test(body) || /\bRTGS\b/i.test(subject)) {
    method = 'RTGS';
    kind = 'BOM_RTGS';
  } else if (/\bNEFT\b/i.test(body) || /\bNEFT\b/i.test(subject)) {
    method = 'NEFT';
    kind = 'BOM_NEFT';
  } else if (/\bUPI\b/i.test(body) || /\bUPI\b/i.test(subject)) {
    method = 'UPI';
    kind = 'BOM_UPI';
  }

  const last4 = accountMatch?.[1] || '';
  const amount = parseIndianAmount(amountMatch?.[1]);
  const dirStr = directionMatch?.[1]?.toLowerCase() || '';

  if (!last4 || !amount || amount <= 0 || !dirStr) {
    return {
      kind,
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: `${kind} missing required account last4, direction, or amount`,
      raw_snippet: truncateSnippet200(body),
    };
  }

  const direction: 'debit' | 'credit' =
    dirStr === 'credited' || dirStr === 'cr' ? 'credit' : 'debit';

  const refMatch =
    body.match(
      /(?:by\s+)?(?:IMPS|UPI|NEFT|RTGS)(?:\s+(?:Ref|UTR)(?:\s*No\.?)?)?[:\s\-\/]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i
    ) ||
    body.match(/(?:UTR|Ref(?:erence)?(?:\s+No\.?)?)[:\s]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i) ||
    body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
    body.match(/\b(\d{12})\b/);

  const rawRef = normalizeRef(refMatch?.[1]);
  const senderMatch = body.match(
    /(?:from|to|towards)\s+([A-Za-z0-9 .&-]+?)(?=\.\s*A\/c|\s+A\/c|\s+AVL|\s+on\s+\d|\s+with|\.\s|\s*$)/i
  );
  const senderOrPayee =
    cleanBankEntityName(senderMatch?.[1]) ||
    (direction === 'credit' ? `${method} Remitter` : `${method} Recipient`);
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  const upiRef = method === 'UPI' ? rawRef : null;
  const impsRef = method === 'IMPS' ? rawRef : null;
  const neftRef = method === 'NEFT' ? rawRef : null;
  const rtgsRef = method === 'RTGS' ? rawRef : null;

  return {
    kind,
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'BOM',
    method,
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: senderOrPayee,
    payee_vpa: null,
    upi_ref_no: upiRef,
    imps_ref_no: impsRef,
    neft_ref_no: neftRef,
    rtgs_ref_no: rtgsRef,
    reference_number: rawRef,
    balance_after: balanceAfter,
    description_raw: rawRef
      ? `${method}/${rawRef}/${senderOrPayee}`
      : `BOM ${method} ${direction === 'credit' ? 'from' : 'to'} ${senderOrPayee}`,
  };
}

export const parseBomImps = parseBomAlert;
