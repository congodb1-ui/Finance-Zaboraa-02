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

/**
 * Extracts a 12-digit IMPS reference number from narration or ref column.
 */
export function extractImpsRef(text: string): string | null {
  if (!text) return null;
  const m =
    text.match(/IMPS\/?[A-Z]*\/?(\d{12})/i) ||
    text.match(/IMPS[\/\s-]+(\d{12})/i);
  return m ? m[1] : null;
}

/**
 * Extracts a 12-digit UPI reference number from text.
 */
export function extractUpiRef(text: string): string | null {
  if (!text) return null;
  const m =
    text.match(/UPI\s*Ref\s*No[:\s]+(\d{9,})/i) ||
    text.match(/UPI\s*(?:Transaction\s*ID|Txn\s*ID)[:\s]+(\d{9,})/i) ||
    text.match(/UPI\/\d+\/(\d{12})/i);
  return m ? m[1] : null;
}
