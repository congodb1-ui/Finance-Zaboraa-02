import { normalizeGmailDate, parseIndianAmount, truncateSnippet200 } from './helpers';
import type { GmailParseOutcome } from './types';

export function parseBoiImps(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const accountMatch = body.match(/A\/c[.\s]+[Xx*]+(\d{4})/i);
  const directionMatch = body.match(/credited|debited|\bCR\b|\bDR\b/i);
  const amountMatch = body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(/(\d{2}[-\/]\d{2}[-\/]\d{4}|\d{2}-[A-Z]{3}-\d{4})/i);
  const impsRefMatch = body.match(/IMPS[\/\s]?(?:Ref)?[.:\s]+(\d{12})/i);
  const balanceMatch = body.match(/(?:Bal|Balance)[.:\s]+(?:Rs\.?\s*|INR\s*)?([\d,]+\.?\d*)/i);

  const fieldsExtracted = [
    accountMatch,
    directionMatch,
    amountMatch,
    dateMatch,
    impsRefMatch,
    balanceMatch,
  ].filter(Boolean).length;

  const last4 = accountMatch?.[1] || '';
  const amount = parseIndianAmount(amountMatch?.[1]);
  const dirRaw = directionMatch?.[0]?.toLowerCase() || '';

  if (fieldsExtracted === 0 || !last4 || !amount || amount <= 0 || !dirRaw) {
    return {
      kind: 'BOI_IMPS',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason:
        fieldsExtracted === 0
          ? 'BOI_IMPS yielded 0 extracted fields'
          : 'BOI_IMPS missing required account last4, direction, or amount',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const direction: 'debit' | 'credit' =
    dirRaw === 'credited' || dirRaw === 'cr' ? 'credit' : 'debit';
  const impsRef = impsRefMatch?.[1]?.trim() || null;
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);
  const payeeName = impsRef ? `BOI IMPS ${impsRef}` : 'BOI IMPS Transfer';

  return {
    kind: 'BOI_IMPS',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'BOI',
    method: 'IMPS',
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: null,
    imps_ref_no: impsRef,
    balance_after: balanceAfter,
    description_raw: impsRef ? `BOI/IMPS/${impsRef}` : `BOI IMPS ${direction}`,
  };
}
