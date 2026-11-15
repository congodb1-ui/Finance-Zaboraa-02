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

export function normalizeGmailDate(
  dateStr: string | undefined | null,
  internalDateMs?: string
): string {
  if (dateStr) {
    const trimmed = dateStr.trim();

    // DD-MON-YYYY (e.g. 14-NOV-2026)
    const monMatch = trimmed.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (monMatch) {
      const mm = MONTH_MAP[monMatch[2].toUpperCase()];
      if (mm) {
        return `${monMatch[3]}-${mm}-${monMatch[1]}`;
      }
    }

    // DD-MM-YY or DD/MM/YY (e.g. 14-11-26)
    const shortMatch = trimmed.match(/^(\d{2})[-\/](\d{2})[-\/](\d{2})$/);
    if (shortMatch) {
      return `20${shortMatch[3]}-${shortMatch[2]}-${shortMatch[1]}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const fullMatch = trimmed.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (fullMatch) {
      return `${fullMatch[3]}-${fullMatch[2]}-${fullMatch[1]}`;
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
