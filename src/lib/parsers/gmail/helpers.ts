const MONTH_MAP: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

export function parseIndianAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

export function normalizeRef(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, '').trim();
  if (!cleaned || /^0+$/.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) {
    const stripped = cleaned.replace(/^0+/, '');
    return stripped || null;
  }
  return cleaned.toUpperCase();
}

export function normalizeGmailDate(
  dateStr: string | undefined | null,
  internalDateMs?: string
): string {
  if (dateStr) {
    const trimmed = dateStr.trim();

    // YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return trimmed;

    // DD-MON-YYYY or DD MON YYYY or DD-MON-YY (e.g. 14-NOV-2026, 30-JUL-2026, 13 Nov 2025, 13-Nov-25)
    const monMatch = trimmed.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3})[\s\-/,]+(\d{2,4})$/);
    if (monMatch) {
      const mm = MONTH_MAP[monMatch[2].toUpperCase()];
      if (mm) {
        const dd = monMatch[1].padStart(2, '0');
        const yyyy = monMatch[3].length === 2 ? `20${monMatch[3]}` : monMatch[3];
        return `${yyyy}-${mm}-${dd}`;
      }
    }

    // DD-MM-YY or DD/MM/YY (e.g. 14-11-26)
    const shortMatch = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
    if (shortMatch) {
      return `20${shortMatch[3]}-${shortMatch[2].padStart(2, '0')}-${shortMatch[1].padStart(2, '0')}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const fullMatch = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (fullMatch) {
      return `${fullMatch[3]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[1].padStart(2, '0')}`;
    }
  }

  if (internalDateMs && /^\d+$/.test(internalDateMs)) {
    const dt = new Date(Number(internalDateMs));
    if (!Number.isNaN(dt.getTime())) {
      // Format in Asia/Kolkata (+05:30)
      const ist = new Date(dt.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 10);
    }
  }

  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return nowIst.toISOString().slice(0, 10);
}

export function cleanBankEntityName(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/\b(Not you\??|Call\s+\d+|If you did not|Available balance|Warm regards|For queries|SMS\s+'?BLOCK|via HDFC Bank Online Banking|A\/c Bal).*$/i, '')
    .replace(/^[-:.\s]+|[-:.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateSnippet200(text: string): string {
  const collapsed = (text || '').replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 200);
}

export function extractEmailAddress(fromHeader: string): string {
  const raw = (fromHeader || '').trim();
  const angleMatch = raw.match(/<([^>]+)>/);
  const email = (angleMatch ? angleMatch[1] : raw).trim().toLowerCase();
  return email;
}
