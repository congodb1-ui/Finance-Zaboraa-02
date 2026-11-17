/**
 * Intelligent Anchor-Based Bank Statement Parser
 *
 * Universal Parser Core based on Balance Chain Math, Structural Grammar extraction,
 * and zero hardcoded content values.
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
  pdfRowIndex?: number; // 0-based sequence index from PDF
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

// Master list of Indian States and Union Territories (Finite government list)
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
  'Jammu', 'Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

// Structural address vocabulary keywords
export const STRUCTURAL_ADDRESS_WORDS = [
  'FLAT', 'PLOT', 'FLOOR', 'ROAD', 'MARG', 'NAGAR', 'COLONY', 'SECTOR', 'PHASE',
  'BLOCK', 'BUILDING', 'TOWER', 'WING', 'CHSL', 'BLDG', 'STREET', 'AVENUE', 'COMPLEX'
];

const PRESERVED_ACRONYMS = new Set([
  'ATM', 'POS', 'UPI', 'IMPS', 'NEFT', 'RTGS', 'EFT', 'FT', 'INB', 'FD', 'RD',
  'EMI', 'SI', 'ACH', 'NACH', 'GST', 'TDS', 'BBPS', 'HDFC', 'ICICI', 'SBI',
  'PNB', 'BOB', 'IDFC', 'KOTAK', 'AXIS', 'NSE', 'BSE', 'CLI', 'LLP', 'PVT',
  'LTD', 'OKAXIS', 'OKICICI', 'OKSBI', 'OKHDFCBANK', 'PAYTM', 'YBL', 'IBL',
  'AXL', 'YESB', 'WDL', 'CR', 'DR', 'INR', 'NA'
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

/**
 * Structural Footer & Disclaimer Line Detection
 */
export function isFooterLine(line: string): boolean {
  if (!line || typeof line !== 'string') return false;

  // Statement summary block triggers
  if (/STATEMENT\s+SUMMARY/i.test(line)) return true;
  if (/^\s*(?:dr|cr)\.?\s*count\s*:/i.test(line)) return true;
  if (/^\s*closing\s+bal(?:ance)?\s*:/i.test(line)) return true;

  // Disclaimer phrases
  if (/within\s+\d+\s+days/i.test(line)) return true;
  if (/does\s+not\s+require\s+(?:any\s+)?signature/i.test(line)) return true;
  if (/considered\s+correct/i.test(line)) return true;
  if (/computer\s+generated/i.test(line)) return true;
  if (/errors?\s+and\s+omissions?/i.test(line)) return true;
  if (/contents?\s+of\s+this\s+statement/i.test(line)) return true;

  // Metadata / Summary patterns
  if (/^\s*opening\s+bal(?:ance)?\s*:/i.test(line)) return true;
  if (/^\s*generated\s+(?:on|by)\s*:/i.test(line)) return true;
  if (/^\s*requesting\s+branch/i.test(line)) return true;
  if (/^\s*regd\.?\s*(?:office|address)/i.test(line)) return true;
  if (/^\s*gst(?:n|in)?\s*:/i.test(line)) return true;
  if (/^\s*cin\s*:/i.test(line)) return true;

  return false;
}

/**
 * Strips structural footer bleed from a raw narration string.
 */
export function stripFooterBleedFromNarration(narration: string): string {
  let result = narration;

  // Cut at disclaimer / footer phrase start
  const cutPatterns = [
    /\s*this\s+statement\.?.*/i,
    /\s*contents\s+of\s+this\s+statement.*/i,
    /\s*does\s+not\s+require\s+(?:any\s+)?signature.*/i,
    /\s*computer\s*generated.*/i,
    /\s*considered\s+correct\s+if.*/i,
    /\s*within\s+\d+\s+days.*/i,
    /\s*errors?\s+and\s+omissions?.*/i,
    /\s*STATEMENT\s+SUMMARY.*/i,
    /\s*Opening\s+Balance\s*:.*/i,
    /\s*Closing\s+Bal(?:ance)?\s*:.*/i,
    /\s*Generated\s+(?:On|By)\s*:.*/i,
    /\s*Regd\.?\s*(?:Office|Address)\s*:.*/i,
    /\s*GST(?:N|IN)?\s*:.*/i,
    /\s*CIN\s*:.*/i,
    /\s*www\.[a-z0-9.-]+\.[a-z]{2,}.*/i,
  ];

  for (const pattern of cutPatterns) {
    result = result.replace(pattern, '');
  }

  // Address pattern: Structural address word + 6-digit PIN code
  const addressPinPattern = new RegExp(`\\s+\\b(?:${STRUCTURAL_ADDRESS_WORDS.join('|')})\\b.*\\b\\d{6}\\b.*`, 'i');
  result = result.replace(addressPinPattern, '');

  return result.trim();
}

/**
 * PART 2 — UNIVERSAL NARRATION STRUCTURE PARSER
 * Extracts payee name using grammar position only, zero hardcoded values.
 */
export function extractPayeeName(rawNarration: string): string {
  // First strip leading UTR + date if present
  let narration = rawNarration
    .replace(/^\d{10,16}\s+/, '')               // leading UTR zeros
    .replace(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s+/, '') // leading date
    .trim();

  if (/CREDIT\s+INTEREST|INTEREST\s+CAPITALISED/i.test(narration)) {
    return 'Credit Interest Capitalised';
  }

  // GRAMMAR 1: UPI
  // Structure: UPI-{NAME}-{VPA}@{BANK}-{IFSC}-{REF}-{SUFFIX}
  // Payee = everything between first - and the segment containing @
  if (/^UPI[-\/]/i.test(narration)) {
    const withoutPrefix = narration.replace(/^UPI[-\/]/i, '');
    const atIndex = withoutPrefix.indexOf('@');
    if (atIndex !== -1) {
      const beforeAt = withoutPrefix.substring(0, atIndex);
      const segments = beforeAt.split('-');
      const nameSegments: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i].trim();
        if (
          seg.length >= 2 &&
          !/^\d+$/.test(seg) &&                        // not all digits
          !/^[A-Z]{4}\d{7}$/i.test(seg) &&             // not IFSC format
          !/^(IN|UPI|IMPS|NEFT|RTGS|NA|CR|DR)$/i.test(seg) && // not type code
          !/^\d+[A-Z]$/i.test(seg)                     // not digit-letter like 1A
        ) {
          nameSegments.push(seg);
        } else {
          if (nameSegments.length > 0) break;
        }
      }
      if (nameSegments.length > 0) {
        return toTitleCase(
          mergeWordFragments(nameSegments.join(' ').replace(/\./g, ' ').trim())
        );
      }
    }
    // No @ found — return cleaned prefix content
    const firstSeg = withoutPrefix.split('-')[0].trim();
    if (firstSeg.length >= 2) {
      return toTitleCase(mergeWordFragments(firstSeg));
    }
  }

  // GRAMMAR 2: IMPS
  // Structure: IMPS/{REF}/{MASKED_ACCT}/{NAME}/{PURPOSE} or IMPS/48/{REF}/{MASKED}/{NAME}/{MEMO}
  if (/^IMPS/i.test(narration)) {
    const parts = narration.split('/').map((p) => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (
        part.length >= 3 &&
        !/^\d+$/.test(part) &&
        !/^[X\*]+\d*$/i.test(part) &&   // not masked account
        !/^[A-Z]{4}\d{7}$/i.test(part) // not IFSC
      ) {
        return toTitleCase(mergeWordFragments(part));
      }
    }
  }

  // GRAMMAR 3: NEFT / RTGS
  // Structure: NEFT/{NAME}/{REF} or RTGS CR {NAME} {REF} or {REF} {NAME}
  if (/^(NEFT|RTGS)/i.test(narration)) {
    const parts = narration.split('/');
    if (parts.length >= 2) {
      const candidate = parts[1].trim();
      if (candidate.length >= 3 && !/^\d+$/.test(candidate)) {
        return toTitleCase(mergeWordFragments(candidate));
      }
    }
    const afterType = narration.replace(/^(NEFT|RTGS)\s*(CR|DR)?\s*/i, '');
    const dashParts = afterType.split('-');
    if (dashParts[0].trim().length >= 3) {
      return toTitleCase(mergeWordFragments(dashParts[0].trim()));
    }
  }

  // GRAMMAR 4: Inward transfer with amount in narration
  const amountAtStart = narration.match(/^[\d,]+\.\d{2}\s+/);
  if (amountAtStart) {
    narration = narration.substring(amountAtStart[0].length).trim();
    return extractPayeeName(narration);
  }

  // GRAMMAR 5: Reference number followed by name
  if (narration.length >= 2) {
    const cleaned = narration
      .replace(/\b[A-Z]{4}\d{7}\b/g, '')
      .replace(/\b\d{6,}\b/g, '')      // remaining long numbers
      .replace(/[-\/]+/g, ' ')          // dashes and slashes to spaces
      .trim();
    if (cleaned.length >= 2) {
      return toTitleCase(mergeWordFragments(cleaned));
    }
  }

  return 'UNREADABLE_NARRATION';
}

/**
 * Structural noise stripper
 */
export function stripStructuralNoise(narration: string): string {
  let text = narration;

  // 1. Remove VPA domain suffixes
  text = text.replace(/@[a-zA-Z0-9.-]+\b/g, '');

  // 2. Remove structural codes
  text = text.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, ''); // IFSC code
  text = text.replace(/\b\d{10,16}\b/g, '');            // 10-16 digit UTR/Ref
  text = text.replace(/\b[X\*]{4,}\d*\b/gi, '');         // Masked account numbers

  // 3. Remove structural suffix patterns
  text = text
    .replace(/-\s*SAVING(?:-UPI)?(?:\s*PAYMENT)?/gi, '')
    .replace(/-\s*UPI\s*PAYMENT/gi, '')
    .replace(/-\s*NA\b/gi, '')
    .replace(/-\s*OID\d+/gi, '')
    .replace(/-\s*[A-Z0-9]{8,15}\b/gi, '') // trailing alphanumeric hashes
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

/**
 * Final description sanitizer
 */
export function sanitizeFinalDescription(narration: string, rawNarration: string): string {
  let cleaned = narration.trim();

  // If extraction left noise or was too short (< 2 chars), fallback to raw cleaned
  if (!cleaned || cleaned === 'UNREADABLE_NARRATION' || cleaned.length < 2) {
    cleaned = rawNarration
      .replace(/^\d{10,16}\s+/, '')
      .replace(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s+/, '')
      .replace(/[-\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Remove lingering @ symbols or trailing dashes
  cleaned = cleaned.replace(/@/g, '').replace(/[-_]+$/, '').trim();

  return toTitleCase(cleaned);
}

/**
 * Narration keyword fallback detection
 */
const CREDIT_PATTERNS = [
  /\bCR\b/i,
  /CREDIT\s+INTEREST/i,
  /INTEREST\s+CAPITALISED/i,
  /INTEREST\s+CREDIT/i,
  /\bNEFT\s+CR\b/i,
  /\bRTGS\s+CR\b/i,
  /\bIMPS\s+CR\b/i,
  /BY\s+TRANSFER/i,
  /BY\s+CLEARING/i,
  /SALARY\s+CR/i,
  /\bREFUND\b/i,
  /\bREVERSAL\b/i,
  /\bCASHBACK\b/i,
  /MATURITY\s+PROCEEDS/i,
  /\bDIVIDEND\b/i,
  /FD\s+MATURITY/i,
  /RD\s+MATURITY/i,
  /INWARD\s+REMITTANCE/i,
];

const DEBIT_PATTERNS = [
  /\bDR\b/i,
  /\bATM\s+WDL\b/i,
  /\bATM\s+CASH\b/i,
  /\bPOS\s+/i,
  /\bEMI\b/i,
  /SERVICE\s+CHARGE/i,
  /ANNUAL\s+FEE/i,
  /LOAN\s+INSTALLMENT/i,
];

export function detectTypeFromKeywords(narration: string): 'debit' | 'credit' {
  const isCredit = CREDIT_PATTERNS.some((p) => p.test(narration));
  const isDebit = DEBIT_PATTERNS.some((p) => p.test(narration));
  if (isCredit && !isDebit) return 'credit';
  return 'debit'; // Default to debit
}

export function cleanNumber(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Universal Anchor Parsing Engine based on Balance Chain Math
 */
export async function parsePDFIntelligent(
  buffer: ArrayBuffer | Uint8Array | PDFExtractionResult,
  options?: { bankHint?: string; preExtracted?: PDFExtractionResult } | string
): Promise<ParseResult> {
  let pdfData: PDFExtractionResult;

  if (buffer && typeof buffer === 'object' && 'pages' in buffer) {
    pdfData = buffer as PDFExtractionResult;
  } else {
    const rawBuffer = buffer as ArrayBuffer | Uint8Array;
    const opts = typeof options === 'object' ? options : undefined;
    pdfData = opts?.preExtracted || (await extractPDFRawData(rawBuffer));
  }

  // Interface for Visual Line with text items
  interface VisualLine {
    y: number;
    text: string;
    items: typeof pdfData.pages[0]['textItems'];
  }

  const allVisualLines: VisualLine[] = [];
  let summaryReached = false;

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

      for (const line of linesMap) {
        line.items.sort((a, b) => a.x - b.x);
        line.text = line.items.map((i) => i.text).join(' ');
        if (isFooterLine(line.text) && !/^\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line.text)) {
          summaryReached = true;
          break;
        }
        allVisualLines.push(line);
      }
    }
  }

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
      if (!dateMatch) {
        const srMatch = text.match(SR_NO_DATE_REGEX);
        if (srMatch) {
          dateFound = srMatch[1].trim();
          dateMatch = srMatch;
        }
      }

      const dateItem = vLine.items.find(
        (i) => i.x < 120 && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(i.text.trim())
      );

      if (dateMatch && dateItem) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          anchorLine: vLine,
          anchorText: text,
          continuationLines: [],
          continuationTexts: [],
          dateStr: dateFound || dateItem.text.trim(),
        };
      } else if (currentBlock) {
        if (!isFooterLine(text)) {
          currentBlock.continuationLines.push(vLine);
          currentBlock.continuationTexts.push(text);
        }
      }
    }
    if (currentBlock) {
      blocks.push(currentBlock);
    }
  }

  // Parse transactions using PART 1 — BALANCE CHAIN MATH
  const parsedTxns: ParsedTransaction[] = [];
  let prevBalance: number | null = pdfData.openingBalance ?? null;

  // Number regex for Indian currency format
  const NUMBER_REGEX = /\b\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\b/g;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const dateStr = block.dateStr;
    const isoDate = normalizeDateToISO(dateStr);

    let debit = 0;
    let credit = 0;
    let balance = 0;
    let resolved = false;

    // STEP 1 — Extract all numbers from anchor line
    const anchorTextWithoutDate = block.anchorText.replace(/^\s*(?:\d{1,4}\s+)?\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s*/, '');
    const numMatches = Array.from(anchorTextWithoutDate.matchAll(NUMBER_REGEX));

    interface ExtractedNum {
      val: number;
      raw: string;
      index: number;
    }

    const extractedNums: ExtractedNum[] = [];
    for (const match of numMatches) {
      const raw = match[0];
      const val = cleanNumber(raw);
      if (val !== null) {
        extractedNums.push({ val, raw, index: match.index ?? 0 });
      }
    }

    // STEP 2 — Identify balance using chain math
    if (prevBalance !== null && extractedNums.length >= 2) {
      for (let nIdx = 0; nIdx < extractedNums.length; nIdx++) {
        const N = extractedNums[nIdx].val; // Balance candidate
        for (let aIdx = 0; aIdx < extractedNums.length; aIdx++) {
          if (nIdx === aIdx) continue;
          const A = extractedNums[aIdx].val; // Amount candidate

          const debitCheck = Math.abs(prevBalance - A - N);
          const creditCheck = Math.abs(prevBalance + A - N);

          if (debitCheck < 0.05) {
            debit = A;
            balance = N;
            resolved = true;
            break;
          }
          if (creditCheck < 0.05) {
            credit = A;
            balance = N;
            resolved = true;
            break;
          }
        }
        if (resolved) break;
      }
    }

    // STEP 4 — Fallback if chain math does not resolve (first row or opening balance unknown)
    if (!resolved && extractedNums.length >= 2) {
      balance = extractedNums[extractedNums.length - 1].val;
      const amount = extractedNums[extractedNums.length - 2].val;
      const type = detectTypeFromKeywords(block.anchorText);
      if (type === 'credit') credit = amount;
      else debit = amount;
      resolved = true;
    } else if (!resolved && extractedNums.length === 1) {
      // STEP 5 — Amount on continuation line
      balance = extractedNums[0].val;

      // Scan continuation lines for amount
      let contAmount: number | null = null;
      for (const cText of block.continuationTexts) {
        const cMatches = Array.from(cText.matchAll(NUMBER_REGEX));
        if (cMatches.length > 0) {
          contAmount = cleanNumber(cMatches[0][0]);
          if (contAmount !== null) break;
        }
      }

      if (contAmount !== null) {
        if (prevBalance !== null) {
          const debitCheck = Math.abs(prevBalance - contAmount - balance);
          const creditCheck = Math.abs(prevBalance + contAmount - balance);
          if (creditCheck < debitCheck) credit = contAmount;
          else debit = contAmount;
        } else {
          const type = detectTypeFromKeywords(block.anchorText + ' ' + block.continuationTexts.join(' '));
          if (type === 'credit') credit = contAmount;
          else debit = contAmount;
        }
      }
      resolved = true;
    }

    prevBalance = balance > 0 ? balance : prevBalance;

    // STEP 6 — Extract and clean narration
    let rawFullNarr = block.anchorText;
    for (const cText of block.continuationTexts) {
      rawFullNarr = smartJoin(rawFullNarr, cText);
    }

    // Strip footer bleed first
    const strippedFooter = stripFooterBleedFromNarration(rawFullNarr);

    // Extract reference
    const utrMatch = strippedFooter.match(/\b(\d{10,16})\b/);
    const reference = utrMatch ? utrMatch[1].replace(/^0+/, '') || utrMatch[1] : '';

    // Extract Payee Name via grammar
    const payee = extractPayeeName(strippedFooter);
    const payeeStripped = stripStructuralNoise(payee);
    const finalNarration = sanitizeFinalDescription(payeeStripped, strippedFooter);

    parsedTxns.push({
      date: isoDate,
      rawDate: dateStr,
      narration: finalNarration,
      reference,
      debit,
      credit,
      balance,
      balanceMismatch: false,
      rawNarration: rawFullNarr,
      pdfRowIndex: i,
    });
  }

  // STEP 8 — BALANCE CONTINUITY VERIFICATION
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
    pdf_row_index: String(t.pdfRowIndex ?? 0),
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
    parser_version: 'universal-chain-math-v2',
    detected_bank: 'Universal Parser',
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
