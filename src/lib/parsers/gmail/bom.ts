import { normalizeGmailDate, parseIndianAmount, truncateSnippet200 } from './helpers';
import type { GmailParseOutcome } from './types';

export function parseBomImps(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const accountMatch = body.match(/A\/c No [Xx*]*(\d{4})/i);
  const directionMatch = body.match(/credited|debited/i);
  const amountMatch = body.match(/by INR\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(/on (\d{2}-[A-Z]{3}-\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i);
  const impsRefMatch = body.match(/by IMPS (\d+)/i);
  const senderMatch = body.match(/from ([A-Za-z0-9 .&-]+?)(?:\.|\s+A\/c|\s*$)/i);
  const balanceMatch = body.match(/A\/c Bal(?:ance)? (?:is )?(?:INR\s*|Rs\.?\s*)?([\d,]+\.?\d*)/i);

  const last4 = accountMatch?.[1] || '';
  const amount = parseIndianAmount(amountMatch?.[1]);
  const dirStr = directionMatch?.[0]?.toLowerCase() || '';

  if (!last4 || !amount || amount <= 0 || !dirStr) {
    return {
      kind: 'BOM_IMPS',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'BOM_IMPS missing required account last4, direction, or amount',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const direction: 'debit' | 'credit' = dirStr === 'credited' ? 'credit' : 'debit';
  const impsRef = impsRefMatch?.[1]?.trim() || null;
  const senderOrPayee = senderMatch?.[1]?.trim() || (direction === 'credit' ? 'IMPS Remitter' : 'IMPS Recipient');
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);

  return {
    kind: 'BOM_IMPS',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'BOM',
    method: 'IMPS',
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: senderOrPayee,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: impsRef,
    balance_after: balanceAfter,
    description_raw: impsRef
      ? `IMPS/${impsRef}/${senderOrPayee}`
      : `BOM IMPS ${direction === 'credit' ? 'from' : 'to'} ${senderOrPayee}`,
  };
}
