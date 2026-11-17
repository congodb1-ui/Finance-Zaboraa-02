import {
  cleanBankEntityName,
  normalizeGmailDate,
  normalizeRef,
  parseIndianAmount,
  truncateSnippet200,
} from './helpers';
import type { GmailParseOutcome } from './types';

export function parseBoiAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;

  const accountMatch =
    body.match(/A\/c[.\s]+[Xx*\s]*(\d{4})/i) ||
    body.match(/account(?:\s+ending)?\s*[Xx*\s]*(\d{4})/i) ||
    body.match(/(?:Debit|ATM)?\s*Card(?:\s+(?:No\.?|ending(?:\s+in)?))?\s*[Xx*\s]*(\d{4})/i);
  const directionMatch = body.match(
    /\b(credited|debited|withdrawn|deducted|paid|transferred|received|deposited|CR|DR)\b/i
  );
  const amountMatch = body.match(/(?:INR|Rs\.?|₹)\s*([\d,]+\.?\d*)/i);
  const dateMatch = body.match(
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i
  );

  let method: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI' | 'ATM' = 'IMPS';
  let kind: 'BOI_IMPS' | 'BOI_NEFT' | 'BOI_RTGS' | 'BOI_UPI' | 'BOI_ATM' = 'BOI_IMPS';
  if (/\bRTGS\b/i.test(body) || /\bRTGS\b/i.test(subject)) {
    method = 'RTGS';
    kind = 'BOI_RTGS';
  } else if (/\bNEFT\b/i.test(body) || /\bNEFT\b/i.test(subject)) {
    method = 'NEFT';
    kind = 'BOI_NEFT';
  } else if (
    /\b(?:atm(?:\s+cash)?(?:\s+withdrawal)?|cash\s+withdrawal|withdrawn|atw)\b/i.test(body) ||
    /\b(?:atm|cash\s+withdrawal)\b/i.test(subject)
  ) {
    method = 'ATM';
    kind = 'BOI_ATM';
  } else if (/\bUPI\b/i.test(body) || /\bUPI\b/i.test(subject)) {
    method = 'UPI';
    kind = 'BOI_UPI';
  }

  const refMatch =
    body.match(
      /(?:IMPS|UPI|NEFT|RTGS|UTR|ATM|RRN)[\/\s]?(?:Ref(?:\s*No\.?)?)?[.:\s#-]+((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i
    ) ||
    body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
    body.match(/\b(\d{12})\b/);
  const balanceMatch = body.match(/(?:Bal|Balance)[.:\s]+(?:Rs\.?\s*|INR\s*|₹\s*)?([\d,]+\.?\d*)/i);

  const fieldsExtracted = [
    accountMatch,
    directionMatch,
    amountMatch,
    dateMatch,
    refMatch,
    balanceMatch,
  ].filter(Boolean).length;

  const last4 = accountMatch?.[1] || '';
  const amount = parseIndianAmount(amountMatch?.[1]);
  const dirRaw = directionMatch?.[1]?.toLowerCase() || '';

  if (fieldsExtracted === 0 || !last4 || !amount || amount <= 0 || !dirRaw) {
    return {
      kind,
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason:
        fieldsExtracted === 0
          ? `${kind} yielded 0 extracted fields`
          : `${kind} missing required account last4, direction, or amount`,
      raw_snippet: truncateSnippet200(body),
    };
  }

  const direction: 'debit' | 'credit' =
    dirRaw === 'credited' || dirRaw === 'cr' || dirRaw === 'received' || dirRaw === 'deposited'
      ? 'credit'
      : 'debit';
  const rawRef = normalizeRef(refMatch?.[1]);
  const balanceAfter = parseIndianAmount(balanceMatch?.[1]);
  const txnDate = normalizeGmailDate(dateMatch?.[1], internalDate);
  const atmLocMatch =
    method === 'ATM'
      ? body.match(/(?:at\s+(?:ATM\s*)?|location\s*[:\-]\s*)([A-Za-z0-9 .,\/&-]+?)(?:\s+on|\s+Ref|\s+RRN|\s+Bal|\.\s|\s*$)/i)
      : null;
  const counterpartyMatch = body.match(
    /(?:from|to|towards)\s+([A-Za-z0-9 .&-]+?)(?:\s+on|\s+Ref|\s+UTR|\.\s|\s*$)/i
  );
  const atmLoc = cleanBankEntityName(atmLocMatch?.[1]);
  const payeeName =
    method === 'ATM'
      ? atmLoc
        ? `ATM Cash Withdrawal - ${atmLoc}`
        : 'ATM Cash Withdrawal'
      : cleanBankEntityName(counterpartyMatch?.[1]) ||
        (rawRef ? `BOI ${method} ${rawRef}` : `BOI ${method} Transfer`);

  return {
    kind,
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank: 'BOI',
    method,
    direction,
    amount,
    account_last4: last4,
    txn_date: txnDate,
    payee_name: payeeName,
    payee_vpa: null,
    upi_ref_no: method === 'UPI' ? rawRef : null,
    imps_ref_no: method === 'IMPS' ? rawRef : null,
    neft_ref_no: method === 'NEFT' ? rawRef : null,
    rtgs_ref_no: method === 'RTGS' ? rawRef : null,
    reference_number: rawRef,
    balance_after: balanceAfter,
    description_raw: rawRef ? `BOI/${method}/${rawRef}` : `BOI ${method} ${direction}`,
  };
}

export const parseBoiImps = parseBoiAlert;
