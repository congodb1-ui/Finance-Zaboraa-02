import {
  cleanBankEntityName,
  normalizeGmailDate,
  normalizeRef,
  parseIndianAmount,
  truncateSnippet200,
} from './helpers';
import type { GmailParseOutcome } from './types';

function inferBankCode(fromAddress: string, body: string): string {
  const hay = `${fromAddress} ${body}`.toLowerCase();
  if (hay.includes('hdfc')) return 'HDFC';
  if (hay.includes('mahabank') || hay.includes('maharashtra')) return 'BOM';
  if (hay.includes('bankofindia') || /\bboi\b/.test(hay)) return 'BOI';
  if (hay.includes('sbi') || hay.includes('state bank')) return 'SBI';
  if (hay.includes('icici')) return 'ICICI';
  if (hay.includes('axisbank') || hay.includes('axis bank')) return 'AXIS';
  if (hay.includes('kotak')) return 'KOTAK';
  if (hay.includes('idfc')) return 'IDFC';
  if (hay.includes('yesbank') || hay.includes('yes bank')) return 'YES';
  if (hay.includes('indusind')) return 'INDUSIND';
  if (hay.includes('federal')) return 'FEDERAL';
  if (hay.includes('canara')) return 'CANARA';
  if (hay.includes('pnb') || hay.includes('punjab national')) return 'PNB';
  return 'BANK';
}

export function parseGenericBankAlert(params: {
  msgId: string;
  fromAddress: string;
  subject: string;
  body: string;
  internalDate?: string;
}): GmailParseOutcome {
  const { msgId, fromAddress, subject, body, internalDate } = params;
  const bank = inferBankCode(fromAddress, body);

  const accountMatch =
    body.match(/(?:A\/c|Account|Acct)(?:\s+(?:No\.?|ending(?:\s+in)?|bearing))?\s*[Xx*\s]*(\d{4})/i) ||
    body.match(/(?:Debit|ATM)?\s*Card(?:\s+(?:No\.?|ending(?:\s+in)?|bearing))?\s*[Xx*\s]*(\d{4})/i) ||
    body.match(/\b[Xx*]{2,}(\d{4})\b/);

  const isCredit = /\b(?:credited|received|deposited|added to|CR)\b/i.test(body);
  const isDebit = /\b(?:debited|deducted|paid|transferred|spent|withdrawn|DR)\b/i.test(body);

  const amountMatch = body.match(/(?:INR|Rs\.?|₹)\s*([\d,]+\.?\d*)/i);
  const amount = parseIndianAmount(amountMatch?.[1]);
  const last4 = accountMatch?.[1] || '';

  if (!amount || amount <= 0 || !last4 || (!isCredit && !isDebit)) {
    return {
      kind: 'GENERIC_BANK_ALERT',
      record_type: 'error',
      gmail_msg_id: msgId,
      from_address: fromAddress,
      subject,
      error_reason: 'Generic bank alert missing required amount, direction, or account last4',
      raw_snippet: truncateSnippet200(body),
    };
  }

  const direction: 'credit' | 'debit' = isCredit && !isDebit ? 'credit' : isDebit && !isCredit ? 'debit' : /\bcredited\b/i.test(body) ? 'credit' : 'debit';

  let method: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS' | 'EFT' | 'ATM' = 'EFT';
  if (/\bRTGS\b/i.test(body) || /\bRTGS\b/i.test(subject)) method = 'RTGS';
  else if (/\bNEFT\b/i.test(body) || /\bNEFT\b/i.test(subject)) method = 'NEFT';
  else if (
    /\b(?:atm(?:\s+cash)?(?:\s+withdrawal)?|cash\s+withdrawal|atw)\b/i.test(body) ||
    /\b(?:atm|cash\s+withdrawal)\b/i.test(subject) ||
    (/\bwithdrawn\b/i.test(body) && /\b(?:atm|card)\b/i.test(body))
  ) {
    method = 'ATM';
  } else if (/\bIMPS\b/i.test(body) || /\bIMPS\b/i.test(subject)) method = 'IMPS';
  else if (/\bUPI\b|@[a-zA-Z0-9.-]+/i.test(body) || /\bUPI\b/i.test(subject)) method = 'UPI';

  const refMatch =
    body.match(
      /(?:UPI|IMPS|NEFT|RTGS|UTR|RRN|ATM\s*(?:Ref|Txn|ID)|Ref(?:erence)?(?:\s*No\.?)?)(?:\s+is\s+|[:\s\-\/#]+)((?=[A-Z0-9]*\d)[A-Z0-9]{8,26})/i
    ) ||
    body.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
    body.match(/\b(\d{12})\b/);
  const refNo = normalizeRef(refMatch?.[1]);

  const vpaMatch = body.match(/(?:VPA|to|from)\s+([a-zA-Z0-9.*_-]+@[a-zA-Z0-9.-]+)/i);
  const payeeVpa = vpaMatch?.[1] || null;

  const atmLocMatch =
    method === 'ATM'
      ? body.match(/(?:at\s+(?:ATM\s*)?|location\s*[:\-]\s*)([A-Za-z0-9 .,\/&-]+?)(?:\s+on\s+\d|\s+Ref|\s+RRN|\s+Avl|\.\s|\s*$)/i)
      : null;
  const atmLoc = cleanBankEntityName(atmLocMatch?.[1]);

  const counterpartyMatch =
    body.match(/\bInfo[:\s]+([A-Za-z0-9 .&*/-]+?)(?:\.\s|\s+Avl|\s+Ref|\s*$)/i) ||
    body.match(/(?:from|to|towards)\s+(?:VPA\s+\S+\s*\()?([A-Za-z0-9 .&-]+?)(?:\)|\s+with|\s+on\s+\d|\s+Ref|\s+UTR|\.\s|\s*$)/i);
  const payeeName =
    method === 'ATM'
      ? atmLoc
        ? `ATM Cash Withdrawal - ${atmLoc}`
        : 'ATM Cash Withdrawal'
      : cleanBankEntityName(counterpartyMatch?.[1]) ||
        payeeVpa ||
        `${bank} ${method} ${direction === 'credit' ? 'Credit' : 'Debit'}`;

  const dateMatch = body.match(
    /(?:on|dated?)\s+(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );
  const balanceMatch = body.match(
    /(?:Avl\.?\s*Bal(?:ance)?|Available\s*Balance|Bal(?:ance)?)[:\s]*(?:is\s*)?(?:INR|Rs\.?|₹)?\s*([\d,]+\.?\d*)/i
  );

  return {
    kind: 'GENERIC_BANK_ALERT',
    record_type: 'transaction',
    gmail_msg_id: msgId,
    from_address: fromAddress,
    bank,
    method,
    direction,
    amount,
    account_last4: last4,
    txn_date: normalizeGmailDate(dateMatch?.[1], internalDate),
    payee_name: payeeName,
    payee_vpa: payeeVpa,
    upi_ref_no: method === 'UPI' ? refNo : null,
    imps_ref_no: method === 'IMPS' ? refNo : null,
    neft_ref_no: method === 'NEFT' ? refNo : null,
    rtgs_ref_no: method === 'RTGS' ? refNo : null,
    reference_number: refNo,
    balance_after: parseIndianAmount(balanceMatch?.[1]),
    description_raw: refNo
      ? `${bank}/${method}/${refNo}/${payeeName}`
      : `${bank}/${method}/${payeeName}`,
  };
}
