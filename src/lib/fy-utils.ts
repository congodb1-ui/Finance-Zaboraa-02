/**
 * Zaboraa Finance — Indian Financial Year (FY) Utilities
 * India Financial Year runs from April 1 to March 31.
 */

export interface FYInfo {
  label: string; // e.g. "FY 2026–27"
  shortLabel: string; // e.g. "2026-27"
  start: string; // "2026-04-01"
  end: string; // "2027-03-31"
  yearStart: number;
  yearEnd: number;
}

/**
 * Returns the current Indian Financial Year (April 1 to March 31) based on reference date
 */
export function getCurrentFY(refDate: Date = new Date()): FYInfo {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-indexed: 0 = Jan, 3 = April

  // If before April, we are in the second half of the previous FY (e.g., Feb 2027 is in FY 2026–27)
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  const shortEnd = String(endYear).slice(-2);
  const label = `FY ${startYear}–${shortEnd}`;
  const shortLabel = `${startYear}-${shortEnd}`;

  return {
    label,
    shortLabel,
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
    yearStart: startYear,
    yearEnd: endYear,
  };
}

/**
 * Returns options for FY dropdowns (default 3 to 5 years backwards)
 */
export function getFYOptions(count: number = 3, refDate: Date = new Date()): FYInfo[] {
  const current = getCurrentFY(refDate);
  const options: FYInfo[] = [];

  for (let i = 0; i < count; i++) {
    const startYear = current.yearStart - i;
    const endYear = startYear + 1;
    const shortEnd = String(endYear).slice(-2);
    options.push({
      label: `FY ${startYear}–${shortEnd}`,
      shortLabel: `${startYear}-${shortEnd}`,
      start: `${startYear}-04-01`,
      end: `${endYear}-03-31`,
      yearStart: startYear,
      yearEnd: endYear,
    });
  }

  return options;
}

/**
 * Returns start and end bounds for a given FY label (e.g. "2026-27" or "FY 2026–27")
 */
export function getFYBounds(label: string): { start: string; end: string } {
  // Extract 4-digit start year
  const match = label.match(/(\d{4})/);
  if (match) {
    const startYear = parseInt(match[1], 10);
    const endYear = startYear + 1;
    return {
      start: `${startYear}-04-01`,
      end: `${endYear}-03-31`,
    };
  }

  // Fallback to current FY
  const curr = getCurrentFY();
  return { start: curr.start, end: curr.end };
}
