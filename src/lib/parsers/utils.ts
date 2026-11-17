const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Parses Indian statement dates into ISO YYYY-MM-DD:
 * - YYYY-MM-DD
 * - DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (2 or 4 digit year)
 * - DD MMM YYYY or DD MMM YY or DD-MMM-YYYY
 * - DD MMM (falls back to fallbackYear or current year)
 */
export function parseIndianDate(raw: string, fallbackYear?: number): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  // ISO YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyNum = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\b|$)/);
  if (dmyNum) {
    const dayNum = parseInt(dmyNum[1], 10);
    const monNum = parseInt(dmyNum[2], 10);
    let yearStr = dmyNum[3];
    if (yearStr.length === 2) yearStr = `20${yearStr}`;
    if (dayNum >= 1 && dayNum <= 31 && monNum >= 1 && monNum <= 12) {
      return `${yearStr}-${String(monNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }

  // DD MMM YYYY or DD-MMM-YYYY or DD MMM, YYYY
  const dmyAlpha = cleaned.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,9})[\s,\-/]+(\d{2,4})(?:\b|$)/);
  if (dmyAlpha) {
    const mon = MONTH_MAP[dmyAlpha[2].toLowerCase()];
    if (mon) {
      const dayNum = parseInt(dmyAlpha[1], 10);
      let yearStr = dmyAlpha[3];
      if (yearStr.length === 2) yearStr = `20${yearStr}`;
      if (dayNum >= 1 && dayNum <= 31) {
        return `${yearStr}-${mon}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  // DD MMM (no year, e.g. Paytm "10 Nov")
  const dmAlpha = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\b|$)/);
  if (dmAlpha) {
    const mon = MONTH_MAP[dmAlpha[2].toLowerCase()];
    if (mon) {
      const dayNum = parseInt(dmAlpha[1], 10);
      const yr = fallbackYear || new Date().getFullYear();
      if (dayNum >= 1 && dayNum <= 31) {
        return `${yr}-${mon}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/**
 * Combines an ISO date string (YYYY-MM-DD) and a 12h/24h time string (e.g. "10:01 PM" or "15:30")
 * into an ISO timestamp string.
 */
export function buildIsoTimestamp(isoDate: string, timeStr?: string | null): string {
  if (!timeStr) return `${isoDate}T00:00:00.000Z`;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return `${isoDate}T00:00:00.000Z`;

  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const secs = m[3] ? parseInt(m[3], 10) : 0;
  const ampm = m[4]?.toUpperCase();

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return `${isoDate}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.000Z`;
}

/**
 * Cleans an Indian currency string (e.g., "1,25,000.50", "- Rs. 140.00", "+ ₹500")
 * into a signed or unsigned float. Returns null if not numeric.
 */
export function parseMonetaryValue(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str || str === '-' || str === '--' || str.toLowerCase() === 'nil') return null;

  const isNeg = /^\s*[-−]/.test(str) || /\bdr\b/i.test(str);
  const cleaned = str
    .replace(/rs\.?/gi, '')
    .replace(/inr/gi, '')
    .replace(/₹/g, '')
    .replace(/\b(cr|dr)\b/gi, '')
    .replace(/[+,−\-\s]/g, '');

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    const fallbackMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (!fallbackMatch) return null;
    const val = parseFloat(fallbackMatch[1]);
    if (isNaN(val)) return null;
    return isNeg ? -val : val;
  }

  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return isNeg ? -val : val;
}

export function normalizeReferenceNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, '').trim();
  if (!trimmed || /^0+$/.test(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, '');
    return stripped || null;
  }
  // Alphanumeric UTRs like 000CMS3847171284 or KKBKR22026101725350598
  return trimmed.toUpperCase();
}

function normalizeTwelveDigitRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^\d{12}$/.test(digits)) return digits;
  // Many Indian bank Ref No. columns left-pad 12-digit RRN/UTR numbers with leading zeros (e.g. 0000631803023475)
  if (digits.length > 12 && digits.length <= 16 && /^0+/.test(digits)) {
    const trimmed = digits.replace(/^0+/, '');
    if (trimmed.length === 12) return trimmed;
    if (trimmed.length < 12) return digits.slice(-12);
  }
  return null;
}

/**
 * Extracts a 12-digit IMPS reference number from narration or ref column.
 */
export function extractImpsRef(text: string, refNo?: string | null): string | null {
  const src = text || '';
  const m =
    src.match(/IMPS\/\d+\/(\d{12})(?:\b|\/)/i) ||
    src.match(/IMPS\/?[A-Z]*\/?(\d{12})\b/i) ||
    src.match(/IMPS[\/\s-]+(\d{12})\b/i) ||
    (/\bIMPS\b/i.test(src) ? src.match(/\b(\d{12})\b/) : null);
  if (m) return m[1];

  if (/\bIMPS\b/i.test(src) && refNo) {
    return normalizeTwelveDigitRef(refNo);
  }
  return null;
}

/**
 * Extracts a UPI reference number (RRN / Transaction ID) from text or bank reference column.
 */
export function extractUpiRef(
  text: string,
  refNo?: string | null,
  forceUpi: boolean = false
): string | null {
  const src = text || '';
  if (/\bREV[-/\s]+UPI\b/i.test(src)) {
    const revAfterAt = src.match(/@[a-zA-Z][a-zA-Z0-9.-]*[-/\s]+(\d{12})(?=$|[-/\s])/);
    if (revAfterAt) return revAfterAt[1];
    const rev12 = src.match(/(?:^|[\s\-\/,:])(\d{12})(?=$|[\s\-\/,:A-Za-z])/);
    if (rev12) return rev12[1];
    if (refNo) {
      const norm = normalizeTwelveDigitRef(refNo);
      if (norm) return norm;
    }
  }
  const explicitMatch =
    src.match(/UPI\s*Ref\s*No\.?[:\s]+(\d{9,16})/i) ||
    src.match(/UPI\s*(?:Transaction\s*ID|Txn\s*ID|transaction\s*reference\s*(?:no\.?|number)\s*is)[:\s]+(\d{9,16})/i) ||
    src.match(/UPI\/[A-Za-z0-9@._-]+\/(\d{12,14})\b/i) ||
    src.match(/UPI\s+(\d{12,14})(?:[A-Za-z]|\b)/i) ||
    src.match(/UPI[\/\-][^\/\-\n]*?[\/\-](\d{12,14})\b/i);
  if (explicitMatch) {
    return normalizeTwelveDigitRef(explicitMatch[1]) || explicitMatch[1];
  }

  const hasUpiContext =
    forceUpi ||
    /\bUPI\b/i.test(src) ||
    /\bUPIRET\b/i.test(src) ||
    /@[a-zA-Z][a-zA-Z0-9.-]*/.test(src);
  if (hasUpiContext) {
    // Look for a 12-14 digit numeric token inside a UPI narration (e.g., HDFC: UPI-SWIGGY-SWIGGY@ICICI-631803023475-...)
    const tokenMatch = src.match(/(?:^|[\s\-\/,:])(\d{12,14})(?=$|[\s\-\/,:A-Za-z])/);
    if (tokenMatch) return tokenMatch[1];

    if (refNo) {
      const normalizedRef = normalizeTwelveDigitRef(refNo);
      if (normalizedRef) return normalizedRef;
      const cleanRef = refNo.trim();
      if (/^\d{9,16}$/.test(cleanRef)) return cleanRef;
    }
  }

  return null;
}

/**
 * Extracts an NEFT / RTGS UTR or alphanumeric bank reference number from narration or ref column.
 */
export function extractNeftRtgsRef(text: string, refNo?: string | null): string | null {
  const src = text || '';
  if (/\b(?:NEFT|RTGS)\b/i.test(src)) {
    const bankUtr =
      src.match(/\b([A-Z]{4}[A-Z0-9]\d{10,20})\b/) ||
      src.match(/(?:NEFT|RTGS)[\/\s-]+(?:CR|DR)?[\/\s-]*(?:[A-Z]{4}0[A-Z0-9]{6}[-\/])?.*?[-\/]((?=[A-Z0-9]*\d)[A-Z0-9]{10,24})(?:\s|$)/i);
    if (bankUtr) {
      return normalizeReferenceNumber(bankUtr[1]);
    }
  }
  if (refNo) {
    const norm = normalizeReferenceNumber(refNo);
    if (norm && norm.length >= 8) return norm;
  }
  return null;
}

/**
 * Computes cross-source dedup keys (upi_ref_no, imps_ref_no, utr_ref_no) for a statement row.
 */
export function extractCrossSourceRefs(params: {
  parserVersion?: string | null;
  description?: string | null;
  rawDescription?: string | null;
  referenceNumber?: string | null;
  rawNarration?: string | null;
}): { upi_ref_no: string | null; imps_ref_no: string | null; neft_rtgs_ref_no?: string | null } {
  const parser = (params.parserVersion || '').toLowerCase();
  const isPaytmOrGPay = parser.startsWith('paytm-upi') || parser.startsWith('gpay');
  const combinedText = `${params.rawNarration || ''} ${params.description || ''} ${params.rawDescription || ''}`.trim();
  const ref = params.referenceNumber?.trim() || null;

  const imps_ref_no = extractImpsRef(combinedText, ref);
  let upi_ref_no = extractUpiRef(combinedText, ref, isPaytmOrGPay);
  const neft_rtgs_ref_no = extractNeftRtgsRef(combinedText, ref);

  // If IMPS ref already claimed the same 12-digit number and text does not mention UPI, don't double-classify as UPI
  if (upi_ref_no && imps_ref_no && upi_ref_no === imps_ref_no && !/\bUPI\b/i.test(combinedText)) {
    upi_ref_no = null;
  }

  return { upi_ref_no, imps_ref_no, neft_rtgs_ref_no };
}
