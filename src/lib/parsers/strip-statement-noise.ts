/**
 * Universal Statement Header/Footer & Noise Stripper
 * Discards metadata, headers, footers, address blocks, disclaimers,
 * and page numbers across all Indian bank statements.
 */

// Safe date regex: Lines starting with a date are SACRED transaction rows
const DATE_START_REGEX = /^\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/;

const UNIVERSAL_NOISE_PATTERNS: RegExp[] = [
  // Page numbers: "Page No :: 60", "Page 1 of 120", "Page: 3", "Page 1", "1 of 60"
  /^\s*Page\s*(?:No|Number|#)?\s*[:.\-\s]*\d+/i,
  /^\s*\d+\s+of\s+\d+\s*$/i,
  /^\s*Page\s+\d+\s+of\s+\d+/i,

  // Statement headers & periods
  /statement of account/i,
  /statement\s+(?:from|period|for\s+the\s+period)/i,
  /generated\s+(?:on|date|time)/i,

  // Balance labels when standalone (not starting with date)
  /^\s*(?:opening|closing)\s+balance\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*[\d,.]*\s*$/i,
  /^\s*total\s+(?:withdrawal|deposit|debit|credit)\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*[\d,.]*\s*$/i,

  // Pure column header rows
  /^\s*(?:date|txn\s*date|value\s*dt)\b.*\b(?:narration|particulars|description)\b.*\b(?:debit|credit|withdrawal|deposit|balance|chq|ref)/i,
  /^\s*Date\s+Narration\s+Value\s*Dt\s+Ref\s*No/i,

  // Account metadata
  /nomination\s*[:\-]?\s*(?:registered|not\s+registered|yes|no)/i,
  /(?:account|a\/c)\s*(?:no|number)\s*[:\-]/i,
  /(?:cust|customer)\s*id\s*[:\-]/i,
  /(?:customer\s+relationship\s+number|crn)\s*[:\-]/i,
  /(?:rtgs\/neft\s+)?ifsc\s*(?:code)?\s*[:\-]/i,
  /micr\s*(?:code)?\s*[:\-]/i,
  /branch\s*(?:code|name)?\s*[:\-]/i,
  /(?:account|a\/c)\s+branch\s*[:\-]/i,
  /(?:account|a\/c)\s+(?:type|status|category)\s*[:\-]/i,
  /(?:a\/c|account)\s+open\s*(?:date)?\s*[:\-]/i,
  /od\s+limit\s*[:\-]/i,
  /joint\s+holders?\b/i,
  /registered\s+office/i,
  /regd\.?\s+office/i,
  /gst(?:n|in)?\s*[:\-]/i,
  /cin\s*(?:no)?\.?\s*[:\-]/i,
  /pan\s*(?:no)?\.?\s*[:\-]/i,
  /currency\s*[:\-]\s*INR/i,

  // Contact / URLs / Postal addresses
  /\bwww\.[a-z0-9.\-]+\.[a-z]{2,}\b/i,
  /https?:\/\//i,
  /email\s*(?:id)?\s*[:\-]/i,
  /phone\s*(?:no|number)?\.?\s*[:\-]/i,
  /tel\s*(?:no)?\.?\s*[:\-]/i,

  // Standalone phone number lines
  /^\s*(?:\+?91[\-\s]?)?[6789]\d{9}\s*$/,
  /^\s*[\d\s\-\+\(\)]{10,}\s*$/,

  // Postal addresses with Indian states / cities + 6 digit PIN code
  /\b(?:maharashtra|mumbai|pune|delhi|new\s+delhi|karnataka|bengaluru|bangalore|tamil\s+nadu|chennai|gujarat|ahmedabad|kolkata|west\s+bengal|hyderabad|telangana|andhra\s+pradesh|uttar\s+pradesh|haryana|gurgaon|gurugram|noida|kerala|kochi|rajasthan|jaipur|madhya\s+pradesh|indore|bhopal|bihar|patna|punjab|chandigarh)\b.*\b\d{6}\b/i,
  /\b\d{6}\b.*\b(?:maharashtra|mumbai|pune|delhi|karnataka|bengaluru|bangalore|tamil\s+nadu|chennai|gujarat|kolkata|hyderabad|telangana|india)\b/i,
  /\b(?:pin|pincode|pin\s+code)\s*[:\-]?\s*\d{6}\b/i,

  // Bank disclaimer & statutory text
  /considered\s+correct\s+if\s+no\s+error/i,
  /within\s+30\s+days/i,
  /contents\s+of\s+this\s+statement/i,
  /^\s*this\s+statement\.?\s*$/i,
  /computer\s+generated\s+statement/i,
  /does\s+not\s+require\s+(?:any\s+)?signature/i,
  /we\s+understand\s+your\s+world/i,
  /thank\s+you\s+for\s+banking\s+with/i,

  // Specific Bank Names & Branch Address Headers/Footers
  /^\s*HDFC\s+BANK\s+LIMITED\b/i,
  /hdfc\s+bank\s+house.*senapati\s+bapat\s+marg/i,
  /^\s*\*?\s*Closing\s+balance\s+includes\b/i,
  /^\s*State\s+account\s+branch\s+GST/i,
  /^\s*Address\s*[:\-]/i,
  /^\s*City\s*[:\-]/i,
  /^\s*State\s*[:\-]/i,
  /^\s*STATE\s+BANK\s+OF\s+INDIA\s*$/i,
  /^\s*ICICI\s+BANK\s+LIMITED\s*$/i,
  /^\s*AXIS\s+BANK\s+LIMITED\s*$/i,
  /^\s*KOTAK\s+MAHINDRA\s+BANK(?:\s+LIMITED)?\s*$/i,
  /^\s*PUNJAB\s+NATIONAL\s+BANK\s*$/i,
  /^\s*BANK\s+OF\s+INDIA\s*$/i,
  /^\s*BANK\s+OF\s+MAHARASHTRA\s*$/i,

  // Common customer address artifacts (like "KOOL HOMES", "FLAT NO", "BLDG NO" etc. accompanied by PIN)
  /\b(?:kool\s+homes|flat\s+no|bldg|building|chsl|nagar|road|marg|sector|plot\s+no)\b.*\b\d{6}\b/i,
  /^\s*(?:mr\.|mrs\.|ms\.|dr\.|shri|smt|m\/s\.?)\s+[A-Z0-9\s.&'-]{3,}$/i, // Standalone customer name header line e.g. "MR. WASIM SALIM SAYYED", "M/S. CONGO TECHNOLOGIES"
];

/**
 * Tests if a line is a header, footer, or metadata noise.
 * NEVER returns true for lines starting with a date or containing transactional amounts.
 */
export function isStatementNoiseLine(line: string): boolean {
  if (!line || typeof line !== 'string') return true;
  const trimmed = line.trim();
  if (!trimmed) return true;

  // SAFE RULE: Date-starting lines are SACRED transaction rows. NEVER strip.
  if (DATE_START_REGEX.test(trimmed)) {
    return false;
  }

  for (const pattern of UNIVERSAL_NOISE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Takes an array of text lines extracted from a statement PDF or email,
 * and strips out all header/footer/metadata noise lines.
 */
export function stripStatementNoise(lines: string[]): string[] {
  if (!lines || !Array.isArray(lines)) return [];

  const result: string[] = [];

  for (const rawLine of lines) {
    if (isStatementNoiseLine(rawLine)) {
      continue;
    }
    result.push(rawLine);
  }

  return result;
}
