/**
 * Indian Financial Year Utilities (April 1 to March 31)
 */

export interface FYInfo {
  label: string; // e.g., 'FY 2026-27'
  value: string; // e.g., 'FY2026-27'
  start: string; // e.g., '2026-04-01'
  end: string;   // e.g., '2027-03-31'
}

/**
 * Returns current Indian FY based on current date
 */
export function getCurrentFY(refDate: Date = new Date()): { label: string; start: string; end: string; value: string } {
  const currentMonth = refDate.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr, 11 = Dec
  const currentYear = refDate.getFullYear();

  // If before April, FY started in previous year
  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;
  const shortEnd = String(endYear).slice(-2);

  const label = `FY ${startYear}–${shortEnd}`;
  const value = `FY${startYear}-${shortEnd}`;
  const start = `${startYear}-04-01`;
  const end = `${endYear}-03-31`;

  return { label, value, start, end };
}

/**
 * Returns array of recent FY options for selectors (current FY and preceding years)
 */
export function getFYOptions(count: number = 3, refDate: Date = new Date()): Array<{ label: string; start: string; end: string; value: string }> {
  const currentMonth = refDate.getMonth();
  const currentYear = refDate.getFullYear();
  const currentStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

  const options: Array<{ label: string; start: string; end: string; value: string }> = [];

  for (let i = 0; i < count; i++) {
    const sYear = currentStartYear - i;
    const eYear = sYear + 1;
    const shortEnd = String(eYear).slice(-2);
    options.push({
      label: `FY ${sYear}–${shortEnd} (Apr ${sYear} – Mar ${eYear})`,
      value: `FY${sYear}-${shortEnd}`,
      start: `${sYear}-04-01`,
      end: `${eYear}-03-31`,
    });
  }

  return options;
}

/**
 * Parses any FY label or value into start and end bounds
 * Accepts 'FY2026-27', 'FY 2026-27', '2026-27', 'FY 2026–27', etc.
 */
export function getFYBounds(label: string): { start: string; end: string } {
  if (!label) {
    const curr = getCurrentFY();
    return { start: curr.start, end: curr.end };
  }

  // Look for 4 digits (start year)
  const match = label.match(/(20\d\d)/);
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

/**
 * Returns a wide encompassing date range across multiple FYs (e.g. for anomaly scanning)
 */
export function getBroadDateRange(yearsBack = 3, yearsAhead = 1): { startDate: string; endDate: string } {
  const curr = getCurrentFY();
  const startYear = parseInt(curr.start.slice(0, 4), 10) - yearsBack;
  const endYear = parseInt(curr.end.slice(0, 4), 10) + yearsAhead;
  return {
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  };
}
