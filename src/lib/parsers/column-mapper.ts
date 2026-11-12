import type { ColumnMapping, MappingConfidence } from '../../types/uploads';

const PATTERNS = {
  date: [
    'date',
    'txn date',
    'transaction date',
    'value date',
    'posting date',
    'trans date',
    'tran date',
    'txndate',
    'transaction_date',
    'value_date',
  ],
  description: [
    'description',
    'narration',
    'particulars',
    'remarks',
    'details',
    'transaction details',
    'transaction narration',
    'tran details',
    'transaction_details',
    'payment details',
  ],
  debit: [
    'debit',
    'debit amount',
    'withdrawal',
    'withdrawal amt',
    'dr',
    'dr amount',
    'paid out',
    'debit (inr)',
    'withdrawal amount',
    'debit_amount',
    'dr_amt',
  ],
  credit: [
    'credit',
    'credit amount',
    'deposit',
    'deposit amt',
    'cr',
    'cr amount',
    'paid in',
    'credit (inr)',
    'deposit amount',
    'credit_amount',
    'cr_amt',
  ],
  balance: [
    'balance',
    'closing balance',
    'running balance',
    'available balance',
    'bal',
    'closing bal',
    'account balance',
    'balance (inr)',
  ],
  reference: [
    'reference',
    'ref no',
    'utr',
    'cheque no',
    'chq no',
    'transaction id',
    'utr number',
    'ref_no',
    'chq/ref no',
    'chq / ref no',
    'reference number',
    'txn id',
  ],
  amount: [
    'amount',
    'transaction amount',
    'txn amount',
    'amount (inr)',
    'net amount',
  ],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[._\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(headers: string[], patterns: string[]): string | null {
  // 1. Exact match against patterns
  for (const header of headers) {
    const norm = normalizeHeader(header);
    for (const pat of patterns) {
      if (norm === pat) return header;
    }
  }

  // 2. Starts with / contains match
  for (const header of headers) {
    const norm = normalizeHeader(header);
    for (const pat of patterns) {
      if (norm.includes(pat)) return header;
    }
  }

  return null;
}

export function detectBankFromHeaders(headers: string[]): string | null {
  const normList = headers.map(normalizeHeader);
  const allText = normList.join(' ');

  if (allText.includes('chq / ref no') && allText.includes('narration') && allText.includes('closing balance')) {
    return 'HDFC Bank';
  }
  if (allText.includes('txn date') && allText.includes('value date') && allText.includes('ref no./cheque no.')) {
    return 'State Bank of India (SBI)';
  }
  if (allText.includes('transaction date') && allText.includes('transaction remarks') && allText.includes('balance(inr)')) {
    return 'ICICI Bank';
  }
  if (allText.includes('tran date') && allText.includes('chq/ref number') && allText.includes('balance')) {
    return 'Axis Bank';
  }
  if (allText.includes('transaction date') && allText.includes('particulars') && allText.includes('cr / dr')) {
    return 'Kotak Mahindra Bank';
  }
  if (allText.includes('wallet') || allText.includes('order id') || allText.includes('upi reference id')) {
    return 'Paytm / UPI Export';
  }

  return null;
}

export function detectColumnMapping(headers: string[]): {
  mapping: ColumnMapping;
  confidence: MappingConfidence;
  detected_bank: string | null;
} {
  const date_col = findBestMatch(headers, PATTERNS.date);
  const description_col = findBestMatch(headers, PATTERNS.description);
  const debit_col = findBestMatch(headers, PATTERNS.debit);
  const credit_col = findBestMatch(headers, PATTERNS.credit);
  const balance_col = findBestMatch(headers, PATTERNS.balance);
  const reference_col = findBestMatch(headers, PATTERNS.reference);

  let amount_col: string | null = null;
  let is_single_amount_col = false;

  // If separate debit/credit not found, look for single amount column
  if (!debit_col && !credit_col) {
    amount_col = findBestMatch(headers, PATTERNS.amount);
    if (amount_col) {
      is_single_amount_col = true;
    }
  }

  // Calculate confidence level
  let confidence: MappingConfidence = 'none';

  const hasDate = !!date_col;
  const hasDesc = !!description_col;
  const hasSeparateAmounts = !!debit_col && !!credit_col;
  const hasPartialAmounts = !!debit_col || !!credit_col || !!amount_col;

  if (hasDate && hasDesc && (hasSeparateAmounts || is_single_amount_col)) {
    confidence = 'high';
  } else if (hasDate && hasDesc && hasPartialAmounts) {
    confidence = 'medium';
  } else if (hasDate || hasDesc || hasPartialAmounts) {
    confidence = 'low';
  } else {
    confidence = 'none';
  }

  const detected_bank = detectBankFromHeaders(headers);

  return {
    mapping: {
      date_col,
      description_col,
      debit_col,
      credit_col,
      balance_col,
      reference_col,
      amount_col,
      is_single_amount_col,
    },
    confidence,
    detected_bank,
  };
}
