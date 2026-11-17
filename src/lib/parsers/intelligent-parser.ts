/**
 * Intelligent Anchor-Based Bank Statement Parser
 *
 * Built on two universal invariants:
 * INVARIANT 1: Date always comes first (starts the transaction anchor line).
 * INVARIANT 2: Balance always comes last (last number on the transaction anchor line).
 *
 * Self-healing balance equation: previous_balance - debit + credit = current_balance
 */

import type { ColumnMapping, ParseResult } from '../../types/uploads';
import { extractPDFRawData, extractStatementPeriod, type PDFExtractionResult } from './pdf';

export interface ParsedTransaction {
  date: string; // ISO format YYYY-MM-DD
  rawDate: string; // Original date string DD/MM/YY or DD/MM/YYYY
  narration: string; // cleaned description
  reference: string; // UTR, IMPS ref, cheque no, or empty
  debit: number; // 0 if credit transaction
  credit: number; // 0 if debit transaction
  balance: number; // closing balance for this row
  balanceMismatch: boolean; // true if balance sequence breaks
  rawNarration: string; // original unclean narration for debugging
}

export interface IntelligentParseResult {
  transactions: ParsedTransaction[];
  warnings: string[];
  detectedFormat: string; // which bank profile was matched or UNKNOWN
  totalDebits: number;
  totalCredits: number;
  openingBalance: number | null;
  closingBalance: number | null;
  statementPeriodStart?: string | null;
  statementPeriodEnd?: string | null;
}

// Master list of Indian States and Union Territories
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
  'Jammu', 'Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

// Master list of Major Indian Cities
export const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai',
  'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore',
  'Thane', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana',
  'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Varanasi', 'Aurangabad',
  'Amritsar', 'Allahabad', 'Prayagraj', 'Howrah', 'Coimbatore', 'Gwalior',
  'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati',
  'Solapur', 'Mysuru', 'Mysore', 'Gurgaon', 'Gurugram', 'Noida', 'Jamshedpur',
  'Bhubaneswar', 'Kochi', 'Cochin', 'Dehradun', 'Nanded', 'Kolhapur', 'Ajmer',
  'Jammu', 'Mangalore', 'Mangaluru', 'Belgaum', 'Belagavi', 'Udaipur', 'Jalgaon',
  'Malegaon', 'Navi Mumbai', 'Vasai', 'Kalyan', 'Bhiwandi', 'Akola', 'Gulbarga',
  'Jamnagar', 'Ujjain', 'Loni', 'Siliguri', 'Jhansi', 'Ulhasnagar', 'Sangli',
  'Erode', 'Tiruppur', 'Salem', 'Ambattur', 'Tirunelveli', 'Gaya', 'Bareilly',
  'Aligarh', 'Jalandhar', 'Saharanpur', 'Gorakhpur', 'Guntur', 'Bikaner', 'Amravati',
  'Bhilai', 'Cuttack', 'Firozabad', 'Bhavnagar', 'Durgapur', 'Asansol'
];

const INDIAN_CITIES_REGEX = INDIAN_CITIES.join('|');
const INDIAN_STATES_REGEX = INDIAN_STATES.join('|');

const PRESERVED_ACRONYMS = new Set([
  'ATM', 'POS', 'UPI', 'IMPS', 'NEFT', 'RTGS', 'EFT', 'FT', 'INB', 'FD', 'RD',
  'EMI', 'SI', 'ACH', 'NACH', 'GST', 'TDS', 'BBPS', 'HDFC', 'ICICI', 'SBI',
  'PNB', 'BOB', 'IDFC', 'KOTAK', 'AXIS', 'NSE', 'BSE', 'CLI', 'LLP', 'PVT',
  'LTD', 'OKAXIS', 'OKICICI', 'OKSBI', 'OKHDFCBANK', 'PAYTM', 'YBL', 'IBL',
  'AXL', 'YESB', 'YESBOYBLUPI', 'WDL', 'CR', 'DR', 'INR', 'NA'
]);

/**
 * Converts text to Title Case while preserving acronyms
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
      if (PRESERVED_ACRONYMS.has(cleanWord.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

/**
 * Normalizes date DD/MM/YY or DD/MM/YYYY into ISO YYYY-MM-DD
 */
export function normalizeDateToISO(dateStr: string): string {
  const m = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return dateStr;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) {
    const yNum = parseInt(year, 10);
    year = yNum < 50 ? `20${year}` : `19${year}`;
  }
  return `${year}-${month}-${day}`;
}

// STEP 7: NARRATION CLEANERS & JOINERS

export function smartJoin(existing: string, continuation: string): string {
  if (!existing) return continuation;
  if (!continuation) return existing;

  const existingEndsInLetter = /[A-Za-z]$/.test(existing);
  const continuationStartsLetter = /^[A-Za-z]/.test(continuation);
  const fragmentIsShort = continuation.split(' ')[0].length <= 4;
  const existingLastWordIsLong = (existing.split(' ').pop() || '').length >= 4;

  if (
    existingEndsInLetter &&
    continuationStartsLetter &&
    fragmentIsShort &&
    existingLastWordIsLong
  ) {
    return existing + continuation;
  }

  return existing + ' ' + continuation;
}

export function mergeWordFragments(name: string): string {
  return name.replace(/([A-Za-z]{4,})\s+([A-Za-z]{1,3})(?=\s|$)/g, '$1$2');
}

export function stripUTRPrefix(narration: string): { narration: string; ref: string } {
  const utrMatch = narration.match(/^(\d{10,16})\s+/);
  let ref = '';
  let result = narration;
  if (utrMatch) {
    ref = utrMatch[1].replace(/^0+/, '') || utrMatch[1];
    result = result.slice(utrMatch[0].length);
  }
  result = result.replace(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s+/, '');
  return { narration: result.trim(), ref };
}

export function extractReference(narration: string, explicitRef?: string): { ref: string; narration: string } {
  if (explicitRef && explicitRef.trim()) {
    const rawRef = explicitRef.trim();
    // Strip leading zeros for numeric UTRs (keeping last 10-16 digits)
    const cleanRef = /^\d+$/.test(rawRef) ? (rawRef.replace(/^0+/, '') || rawRef) : rawRef;
    return { ref: cleanRef, narration: narration.replace(rawRef, '').trim() };
  }
  const refMatch = narration.match(/\b(\d{10,16})\b/);
  if (refMatch) {
    const stripped = refMatch[1].replace(/^0+/, '') || refMatch[1];
    return {
      ref: stripped,
      narration: narration.replace(refMatch[0], '').trim(),
    };
  }
  return { ref: '', narration };
}

export function extractPayeeName(narration: string): string {
  if (/CREDIT\s+INTEREST|INTEREST\s+CAPITALISED/i.test(narration)) {
    return 'Credit Interest Capitalised';
  }

  // Pattern 1: UPI-PAYEE NAME-VPA@BANK-IFSC-REF-UPI or UPI/PAYEE/VPA@BANK
  const upiPrefix = narration.match(
    /^UPI[-\/]([A-Z][A-Z0-9\s\.]{2,40}?)[-\/][A-Z0-9]+[@\-]/i
  );
  if (upiPrefix) {
    const merged = mergeWordFragments(upiPrefix[1].trim());
    return toTitleCase(merged);
  }

  // Pattern 2: IMPS/REF/MASKED/PAYEE NAME/Purpose
  const impsSlash = narration.match(
    /^IMPS\/\d+\/[^\/]*\/([^\/]+)\//i
  );
  if (impsSlash) {
    const merged = mergeWordFragments(impsSlash[1].trim());
    return toTitleCase(merged);
  }

  // Pattern 3: VPA@BANK without UPI prefix: take before @, take after last -
  const atSign = narration.match(/^(.*?)@/);
  if (atSign) {
    const beforeAt = atSign[1];
    const parts = beforeAt.split('-');
    const username = parts[parts.length - 1];
    if (username && username.length > 2) {
      const merged = mergeWordFragments(username.replace(/\./g, ' ').replace(/\d+$/, '').trim());
      return toTitleCase(merged);
    }
  }

  // Pattern 4: NEFT/RTGS — name after transfer type
  const neft = narration.match(
    /^(?:NEFT|RTGS|IMPS)[-\/\s]+(.+?)(?:[-\/]\d{6,}|$)/i
  );
  if (neft) {
    const merged = mergeWordFragments(neft[1].trim());
    return toTitleCase(merged);
  }

  return mergeWordFragments(narration);
}

export function stripNoiseSuffixes(narration: string): string {
  return narration
    .replace(/-SAVING-UPI\s*PA?\s*YMENT/gi, '')
    .replace(/-UPI\s*PA?\s*YMENT/gi, '')
    .replace(/-UPI\s*PAYMENT/gi, '')
    .replace(/\s*-\s*NA\s*$/gi, '')
    .replace(/-OID\d+/gi, '')
    .replace(/-PYTM\d+\b/gi, '')
    .replace(/-PAYTM\d+\b/gi, '')
    .replace(/@PAY\s*$/gi, '')
    .replace(/YESBOYBLUPI/gi, '')
    .replace(/\s*-\s*SAVING/gi, '')
    .trim();
}

export function stripFooterBleed(narration: string): string {
  const CUT_PATTERNS = [
    // Universal disclaimer phrases
    /\s*this statement\.?.*/i,
    /\s*contents of this statement.*/i,
    /\s*not require[s]? signature.*/i,
    /\s*computer.?generated.*/i,
    /\s*considered correct if no.*/i,
    /\s*within \d+ days.*/i,
    /\s*errors? and omissions?.*/i,
    /\s*subject to realis.*/i,

    // Universal summary block keywords
    /\s*STATEMENT\s+SUMMARY.*/i,
    /\s*Opening\s+Balance\s*:.*/i,
    /\s*Closing\s+Bal(?:ance)?\s*:.*/i,
    /\s*Generated\s+On\s*:.*/i,
    /\s*Generated\s+By\s*:.*/i,
    /\s*Requesting\s+Branch\s+Code\s*:.*/i,
    /\s*Dr\.?\s*Count\s*:.*/i,
    /\s*Cr\.?\s*Count\s*:.*/i,

    // Universal metadata labels
    /\s*Address\s*:.*/i,
    /\s*Regd\.?\s*(?:Office|Address)\s*:.*/i,
    /\s*GST(?:N|IN)?\s*:.*/i,
    /\s*CIN\s*:.*/i,
    /\s*www\.[a-z].*/i,

    // Address pattern: 6-digit PIN code signals end of real narration
    /\s*\b\d{6}\b.*/,

    // City + State pattern
    new RegExp(
      '\\s+(?:' + INDIAN_CITIES_REGEX + ')\\s+(?:' + INDIAN_STATES_REGEX + ').*',
      'i'
    ),
  ];

  let result = narration;
  for (const pattern of CUT_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

export function cleanNarrationPipeline(rawNarration: string, explicitRef?: string): { cleanDescription: string; reference: string } {
  const strippedFooter = stripFooterBleed(rawNarration);
  const { narration: strippedUtr, ref: utrRef } = stripUTRPrefix(strippedFooter);
  const { ref: extractedRef, narration: narrWithoutRef } = extractReference(strippedUtr, explicitRef);
  const payeeExtracted = extractPayeeName(narrWithoutRef);
  const cleanDescription = stripNoiseSuffixes(payeeExtracted);
  const finalRef = utrRef || extractedRef || (explicitRef ? (/^\d+$/.test(explicitRef.trim()) ? explicitRef.trim().replace(/^0+/, '') : explicitRef.trim()) : '');

  return {
    cleanDescription: cleanDescription || rawNarration.trim(),
    reference: finalRef,
  };
}

// STEP 10: SUMMARY STOP
export const UNIVERSAL_SUMMARY_STOP = [
  /STATEMENT\s+SUMMARY/i,
  /^\s*Dr\.?\s*Count\s*:/i,
  /^\s*Cr\.?\s*Count\s*:/i,
  /^\s*Closing\s+Bal(?:ance)?\s*:/i,
  /^\s*Generated\s+On\s*:/i,
  /^\s*Generated\s+By\s*:/i,
  /^\s*Requesting\s+Branch\s+Code\s*:/i,
  /Grand\s+Total/i,
];

export function isSummaryStop(line: string): boolean {
  if (!line || typeof line !== 'string') return false;
  return UNIVERSAL_SUMMARY_STOP.some((p) => p.test(line));
}

// STEP 9: BANK PROFILES
export interface BankProfile {
  name: string;
  hasSrNo: boolean;
  hasChannel: boolean;
  hasValueDate: boolean;
  debitLabel: RegExp;
  creditLabel: RegExp;
  summaryStopPattern: RegExp;
}

export const BANK_PROFILES: Record<string, BankProfile> = {
  HDFC: {
    name: 'HDFC Bank',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: true,
    debitLabel: /Withdrawal\s*Amt/i,
    creditLabel: /Deposit\s*Amt/i,
    summaryStopPattern: /STATEMENT\s+SUMMARY/i,
  },
  BOM: {
    name: 'Bank of Maharashtra',
    hasSrNo: true,
    hasChannel: true,
    hasValueDate: false,
    debitLabel: /Debit/i,
    creditLabel: /Credit/i,
    summaryStopPattern: /Total\s*(?:Debit|Credit|Transaction)/i,
  },
  BOI: {
    name: 'Bank of India',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: false,
    debitLabel: /Amt\s*Withdrawn/i,
    creditLabel: /Amt\s*Deposited/i,
    summaryStopPattern: /Total\s*(?:Debit|Credit|Transaction)/i,
  },
  SBI: {
    name: 'State Bank of India',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: true,
    debitLabel: /Debit/i,
    creditLabel: /Credit/i,
    summaryStopPattern: /Grand\s*Total/i,
  },
  ICICI: {
    name: 'ICICI Bank',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: true,
    debitLabel: /Withdrawal/i,
    creditLabel: /Deposit/i,
    summaryStopPattern: /Statement\s+Summary/i,
  },
  AXIS: {
    name: 'Axis Bank',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: true,
    debitLabel: /Debit/i,
    creditLabel: /Credit/i,
    summaryStopPattern: /Total\s*(?:Debit|Credit)/i,
  },
  UNKNOWN: {
    name: 'Unknown Bank',
    hasSrNo: false,
    hasChannel: false,
    hasValueDate: false,
    debitLabel: /Debit|Withdrawal|Dr/i,
    creditLabel: /Credit|Deposit|Cr/i,
    summaryStopPattern: /Total|Summary|Closing/i,
  },
};

export function detectBankProfile(lines: string[]): BankProfile {
  const headerText = lines.slice(0, 30).join(' ');
  if (/HDFC\s*BANK/i.test(headerText)) return BANK_PROFILES.HDFC;
  if (/Bank\s*of\s*Maharashtra/i.test(headerText)) return BANK_PROFILES.BOM;
  if (/Bank\s*of\s*India/i.test(headerText)) return BANK_PROFILES.BOI;
  if (/State\s*Bank\s*of\s*India/i.test(headerText)) return BANK_PROFILES.SBI;
  if (/ICICI\s*Bank/i.test(headerText)) return BANK_PROFILES.ICICI;
  if (/Axis\s*Bank/i.test(headerText)) return BANK_PROFILES.AXIS;
  if (/Kotak/i.test(headerText)) return BANK_PROFILES.AXIS;
  if (/Punjab\s*National/i.test(headerText)) return BANK_PROFILES.BOI;
  return BANK_PROFILES.UNKNOWN;
}

const CREDIT_KEYWORDS = [
  /CREDIT\s+INTEREST/i,
  /INTEREST\s+CAPITALISED/i,
  /INTEREST\s+CREDIT/i,
  /NEFT\s+CR/i,
  /RTGS\s+CR/i,
  /IMPS\s+CR/i,
  /UPI\s+CR/i,
  /BY\s+TRANSFER/i,
  /BY\s+CLEARING/i,
  /BY\s+CASH/i,
  /SALARY\s+CREDIT/i,
  /SALARY\s+CR/i,
  /REFUND/i,
  /REVERSAL/i,
  /CASHBACK/i,
  /MATURITY\s+PROCEEDS/i,
  /DIVIDEND/i,
  /CREDIT\s+ADJUSTMENT/i,
  /MISCELLANEOUS\s+CREDIT/i,
  /INB\s+CR/i,
  /ATM\s+CR/i,
  /FD\s+MATURITY/i,
  /RD\s+MATURITY/i,
  /\bCR\b/i,
];

const DEBIT_KEYWORDS = [
  /UPI\s+DR/i,
  /NEFT\s+DR/i,
  /RTGS\s+DR/i,
  /IMPS\s+DR/i,
  /ATM\s+WDL/i,
  /ATM\s+CASH/i,
  /POS\s+/i,
  /BILL\s+PAYMENT/i,
  /LOAN\s+EMI/i,
  /EMI\s+DEBIT/i,
  /ANNUAL\s+FEE/i,
  /SERVICE\s+CHARGE/i,
  /CHARGES/i,
  /DEBIT\s+ADJUSTMENT/i,
  /\bDR\b/i,
];

export function cleanNumber(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parses raw extracted PDF data using Intelligent Anchor-Based parsing.
 * Preserves dynamic column x-positions and raw line structures.
 */
export async function parsePDFIntelligent(
  buffer: ArrayBuffer | Uint8Array | PDFExtractionResult,
  options?: { bankHint?: string; preExtracted?: PDFExtractionResult } | string
): Promise<ParseResult> {
  let pdfData: PDFExtractionResult;
  let bankHint: string | undefined;

  if (buffer && typeof buffer === 'object' && 'pages' in buffer) {
    pdfData = buffer as PDFExtractionResult;
    bankHint = typeof options === 'string' ? options : options?.bankHint;
  } else {
    const rawBuffer = buffer as ArrayBuffer | Uint8Array;
    const opts = typeof options === 'object' ? options : undefined;
    pdfData = opts?.preExtracted || (await extractPDFRawData(rawBuffer));
    bankHint = typeof options === 'string' ? options : opts?.bankHint;
  }

  const rawLines: string[] = [];
  let summaryReached = false;

  interface VisualLine {
    y: number;
    text: string;
    items: typeof pdfData.pages[0]['textItems'];
  }

  const allVisualLines: VisualLine[] = [];

  for (const page of pdfData.pages) {
    if (summaryReached) break;
    if (page.textItems && page.textItems.length > 0) {
      const linesMap: VisualLine[] = [];
      const sorted = [...page.textItems].sort((a, b) => b.y - a.y || a.x - b.x);
      for (const item of sorted) {
        if (!item.text || !item.text.trim()) continue;
        const line = linesMap.find((l) => Math.abs(l.y - item.y) <= 3.5);
        if (line) {
          line.items.push(item);
        } else {
          linesMap.push({ y: item.y, text: '', items: [item] });
        }
      }

      // Check header row for dynamic column positions
      let pageDebitX: number | null = null;
      let pageCreditX: number | null = null;
      let pageBalanceX: number | null = null;

      for (const line of linesMap) {
        line.items.sort((a, b) => a.x - b.x);
        line.text = line.items.map((i) => i.text).join(' ');
        const isHeader =
          line.items.some((i) => /narration|particulars|description/i.test(i.text)) &&
          line.items.some((i) => /debit|withdrawal/i.test(i.text));
        if (isHeader) {
          const w = line.items.find((i) => /withdrawal|debit/i.test(i.text));
          const d = line.items.find((i) => /deposit|credit/i.test(i.text));
          const b = line.items.find((i) => /balance/i.test(i.text));
          if (w) pageDebitX = w.x;
          if (d) pageCreditX = d.x;
          if (b) pageBalanceX = b.x;
        }
      }

      for (const line of linesMap) {
        if (isSummaryStop(line.text) && !/^\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line.text)) {
          summaryReached = true;
          break;
        }
        allVisualLines.push(line);
        rawLines.push(line.text);
      }
    } else {
      // Grid rows fallback
      for (const gRow of page.gridRows) {
        const rowStr = gRow.join(' ');
        if (isSummaryStop(rowStr) && !/^\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(rowStr)) {
          summaryReached = true;
          break;
        }
        rawLines.push(rowStr);
      }
    }
  }

  // Detect bank profile
  const profile = (bankHint && BANK_PROFILES[bankHint.toUpperCase()]) || detectBankProfile(rawLines);

  // Group into raw transaction blocks by Date Anchor (Invariant 1)
  interface RawAnchorBlock {
    anchorLine: VisualLine | null;
    anchorText: string;
    continuationLines: VisualLine[];
    continuationTexts: string[];
    dateStr: string;
  }

  const blocks: RawAnchorBlock[] = [];
  let currentBlock: RawAnchorBlock | null = null;

  const DATE_REGEX = /^\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/;
  const SR_NO_DATE_REGEX = /^\s*\d{1,4}\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/;

  const hasVisualItems = allVisualLines.length > 0;

  if (hasVisualItems) {
    for (const vLine of allVisualLines) {
      const text = vLine.text.trim();
      if (!text) continue;

      let dateMatch = text.match(DATE_REGEX);
      let dateFound = dateMatch ? dateMatch[0].trim() : '';
      if (!dateMatch && profile.hasSrNo) {
        const srMatch = text.match(SR_NO_DATE_REGEX);
        if (srMatch) {
          dateFound = srMatch[1].trim();
          dateMatch = srMatch;
        }
      }

      // Check if this line is an Anchor (Invariant 1)
      const dateItem = vLine.items.find(
        (i) => i.x < 100 && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(i.text.trim())
      );

      if (dateMatch && (dateItem || !hasVisualItems)) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          anchorLine: vLine,
          anchorText: text,
          continuationLines: [],
          continuationTexts: [],
          dateStr: dateFound || (dateItem ? dateItem.text.trim() : ''),
        };
      } else if (currentBlock) {
        currentBlock.continuationLines.push(vLine);
        currentBlock.continuationTexts.push(text);
      }
    }
    if (currentBlock) {
      blocks.push(currentBlock);
    }
  } else {
    // String line based anchor extraction
    for (const lineText of rawLines) {
      const text = lineText.trim();
      if (!text) continue;
      let dateMatch = text.match(DATE_REGEX);
      let dateFound = dateMatch ? dateMatch[0].trim() : '';
      if (!dateMatch && profile.hasSrNo) {
        const srMatch = text.match(SR_NO_DATE_REGEX);
        if (srMatch) {
          dateFound = srMatch[1].trim();
          dateMatch = srMatch;
        }
      }

      if (dateMatch) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          anchorLine: null,
          anchorText: text,
          continuationLines: [],
          continuationTexts: [],
          dateStr: dateFound,
        };
      } else if (currentBlock) {
        currentBlock.continuationTexts.push(text);
      }
    }
    if (currentBlock) {
      blocks.push(currentBlock);
    }
  }

  // Parse transactions from Anchor blocks
  const parsedTxns: ParsedTransaction[] = [];
  let runningBalance: number | null = pdfData.openingBalance ?? null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const dateStr = block.dateStr;
    const isoDate = normalizeDateToISO(dateStr);

    let debit = 0;
    let credit = 0;
    let balance = 0;
    let explicitRef = '';

    const allBlockTexts = [block.anchorText, ...block.continuationTexts];
    const joinedRawNarration = allBlockTexts.join(' ');

    if (block.anchorLine && block.anchorLine.items.length > 0) {
      const items = [...block.anchorLine.items].sort((a, b) => a.x - b.x);

      // Date item
      const dateItm = items.find((it) => it.x < 100 && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(it.text.trim()));

      // Narration items on anchor line
      const narrItms = items.filter((it) => it.x >= 65 && it.x < 280);
      const refItms = items.filter((it) => it.x >= 280 && it.x < 355);

      if (refItms.length > 0) {
        explicitRef = refItms.map((it) => it.text).join('').trim();
      }

      // Amounts items (x >= 380)
      const amountItems = items.filter((it) => it !== dateItm && it.x >= 380);

      // Extract numbers with their X coordinates
      interface AmtItem {
        num: number;
        x: number;
      }
      const extractedAmts: AmtItem[] = [];
      for (const it of amountItems) {
        const n = cleanNumber(it.text);
        if (n !== null) {
          extractedAmts.push({ num: n, x: it.x });
        }
      }

      // INVARIANT 2: Balance always comes last (highest x or last item in array)
      if (extractedAmts.length > 0) {
        const balItem = extractedAmts[extractedAmts.length - 1];
        balance = balItem.num;

        const candidateAmounts = extractedAmts.slice(0, extractedAmts.length - 1);

        if (candidateAmounts.length === 1) {
          const amt = candidateAmounts[0];
          // PRIORITY 1: X-position check (HDFC standard debit ~417, credit ~492)
          if (amt.x < 460) {
            debit = amt.num;
          } else if (amt.x >= 460 && amt.x < 535) {
            credit = amt.num;
          } else {
            // PRIORITY 2: Balance math
            if (runningBalance !== null) {
              const dDiff = Math.abs(runningBalance - amt.num - balance);
              const cDiff = Math.abs(runningBalance + amt.num - balance);
              if (cDiff < dDiff || cDiff < 0.05) credit = amt.num;
              else debit = amt.num;
            } else {
              // PRIORITY 3: Narration keyword fallback
              const isCr = CREDIT_KEYWORDS.some((kw) => kw.test(joinedRawNarration));
              if (isCr) credit = amt.num;
              else debit = amt.num;
            }
          }
        } else if (candidateAmounts.length >= 2) {
          // If two amount candidates exist (e.g. Debit col and Credit col)
          const first = candidateAmounts[0];
          const second = candidateAmounts[1];
          if (first.num > 0 && second.num === 0) debit = first.num;
          else if (second.num > 0 && first.num === 0) credit = second.num;
          else {
            if (first.x < 460) debit = first.num;
            if (second.x >= 460) credit = second.num;
          }
        }
      }

      // Collect narration from anchor items + continuation lines using smartJoin
      const anchorNarr = narrItms.map((it) => it.text).join(' ');
      let rawFullNarr = anchorNarr;
      for (const cl of block.continuationLines) {
        const cNarrItms = cl.items.filter((it) => it.x >= 50 && it.x < 360);
        const cText = cNarrItms.map((it) => it.text).join(' ').trim();
        if (cText) {
          rawFullNarr = smartJoin(rawFullNarr, cText);
        }
      }
      if (!rawFullNarr) rawFullNarr = joinedRawNarration;
      const { cleanDescription, reference } = cleanNarrationPipeline(rawFullNarr, explicitRef);

      parsedTxns.push({
        date: isoDate,
        rawDate: dateStr,
        narration: cleanDescription,
        reference,
        debit,
        credit,
        balance,
        balanceMismatch: false,
        rawNarration: rawFullNarr,
      });

      runningBalance = balance;
    } else {
      // String/Grid based fallback
      // Extract numbers matching pattern
      const numMatches = block.anchorText.match(/\b(?:\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+\.\d{2})\b/g) || [];
      const nums = numMatches.map((s) => cleanNumber(s)).filter((n): n is number => n !== null);

      if (nums.length >= 2) {
        // INVARIANT 2: Balance always comes last
        balance = nums[nums.length - 1];
        const amt = nums[nums.length - 2];

        // PRIORITY 2: Balance direction math
        if (runningBalance !== null) {
          const dDiff = Math.abs(runningBalance - amt - balance);
          const cDiff = Math.abs(runningBalance + amt - balance);
          if (cDiff < dDiff || cDiff < 0.05) credit = amt;
          else debit = amt;
        } else {
          // PRIORITY 3: Narration keyword fallback
          const isCr = CREDIT_KEYWORDS.some((kw) => kw.test(joinedRawNarration));
          if (isCr) credit = amt;
          else debit = amt;
        }
      } else if (nums.length === 1) {
        balance = nums[0];
      }

      const { cleanDescription, reference } = cleanNarrationPipeline(joinedRawNarration);

      parsedTxns.push({
        date: isoDate,
        rawDate: dateStr,
        narration: cleanDescription,
        reference,
        debit,
        credit,
        balance,
        balanceMismatch: false,
        rawNarration: joinedRawNarration,
      });

      runningBalance = balance;
    }
  }

  // STEP 8: BALANCE CONTINUITY VERIFICATION
  for (let i = 1; i < parsedTxns.length; i++) {
    const prev = parsedTxns[i - 1];
    const curr = parsedTxns[i];
    if (prev.balance > 0 && curr.balance > 0) {
      const expected = prev.balance - curr.debit + curr.credit;
      const diff = Math.abs(expected - curr.balance);
      if (diff > 0.05) {
        curr.balanceMismatch = true;
      }
    }
  }

  // Convert to standard ParseResult format
  const rows: Array<Record<string, string>> = parsedTxns.map((t) => ({
    Date: t.rawDate,
    Narration: t.narration,
    'Value Dt': t.rawDate,
    'Ref No./Cheque No.': t.reference,
    Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
    Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
    Balance: t.balance > 0 ? t.balance.toFixed(2) : '',
    ...(t.balanceMismatch ? { needs_review: 'true' } : {}),
  }));

  const headers = ['Date', 'Narration', 'Value Dt', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'];

  const suggested_mapping: ColumnMapping = {
    date_col: 'Date',
    description_col: 'Narration',
    debit_col: 'Debit',
    credit_col: 'Credit',
    balance_col: 'Balance',
    reference_col: 'Ref No./Cheque No.',
    amount_col: null,
    is_single_amount_col: false,
  };

  const period =
    pdfData.statementPeriodStart && pdfData.statementPeriodEnd
      ? { start: pdfData.statementPeriodStart, end: pdfData.statementPeriodEnd }
      : extractStatementPeriod(pdfData.fullDocumentText);

  let periodStart = period.start;
  let periodEnd = period.end;
  if (!periodStart && rows.length > 0) {
    periodStart = rows[0].Date;
    periodEnd = rows[rows.length - 1].Date;
  }

  return {
    headers,
    rows,
    parser_version: 'intelligent-anchor-v1',
    detected_bank: profile.name,
    confidence: 'high',
    suggested_mapping,
    opening_balance: pdfData.openingBalance,
    closing_balance: rows.length > 0 ? cleanNumber(rows[rows.length - 1].Balance) : pdfData.closingBalance,
    statement_period_start: periodStart,
    statement_period_end: periodEnd,
    raw_text: pdfData.fullDocumentText,
  };
}

export const intelligentParse = parsePDFIntelligent;
