import { maskForAI } from '../ai/pii-mask';
import { deSplitPdfWords } from '../parsers/bank-transaction';
import type {
  AccountScopeTag,
  MerchantAccountSummary,
  MerchantFrequency,
  MerchantGroup,
} from './constants';

const COMMERCIAL_KEYWORDS = new Set([
  'CHEMIST', 'PHARMACY', 'MEDICAL', 'MEDICOS', 'CLINIC', 'HOSPITAL', 'LAB', 'LABS',
  'DIAGNOSTIC', 'DIAGNOSTICS', 'HEALTH', 'HEALTHCARE', 'DENTAL', 'OPTICAL', 'OPTICALS',
  'SUPER', 'MARKET', 'SUPERMARKET', 'MART', 'BAZAAR', 'BAKERY', 'BAKERS', 'SWEETS',
  'DAIRY', 'STORE', 'STORES', 'SHOP', 'SHOPS', 'EMPORIUM', 'GENERAL', 'PROVISION',
  'PROVISIONS', 'KIRANA', 'GROCERY', 'GROCERIES', 'VEGETABLES', 'FRUITS', 'MEAT',
  'PETROL', 'PETROLEUM', 'FUEL', 'DIESEL', 'PUMP', 'STATION', 'FUELSTATION',
  'HPCL', 'BPCL', 'IOCL', 'SHELL', 'NAYARA', 'MOTORS', 'AUTOMOBILE', 'AUTOMOBILES',
  'GARAGE', 'TYRE', 'TYRES', 'WORKSHOP', 'SPARES', 'SERVICE', 'SERVICES', 'WASH',
  'ELECTRIC', 'ELECTRICAL', 'ELECTRICALS', 'POWER', 'ENERGY', 'WATER', 'GAS',
  'MSEDCL', 'MAHAVITARAN', 'BESCOM', 'MGL', 'IGL', 'TORRENT', 'ADANI', 'TATA',
  'TELECOM', 'BROADBAND', 'FIBER', 'WIFI', 'CABLE', 'RECHARGE', 'AIRTEL', 'JIO',
  'VODAFONE', 'BSNL', 'SYSTEMS', 'TECHNOLOGIES', 'TECHNOLOGY', 'TECH', 'SOLUTIONS',
  'SOFTWARE', 'CLOUD', 'DIGITAL', 'MEDIA', 'NETWORK', 'NETWORKS', 'COMMUNICATIONS',
  'ENTERPRISE', 'ENTERPRISES', 'TRADING', 'TRADERS', 'AGENCY', 'AGENCIES',
  'DISTRIBUTOR', 'DISTRIBUTORS', 'INDUSTRIES', 'CONSULTING', 'CONSULTANCY',
  'ASSOCIATES', 'PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'INC', 'CORP', 'CO',
  'BANK', 'BANKING', 'CHARGES', 'CHARGE', 'FEE', 'FEES', 'INTEREST', 'INT',
  'PENALTY', 'SMS', 'ATM', 'TAX', 'GST', 'TDS', 'INCOME', 'SALARY', 'PAYROLL',
  'INSURANCE', 'FINANCE', 'CAPITAL', 'MUTUAL', 'FUND', 'FUNDS', 'BROKING',
  'SECURITIES', 'INVESTMENT', 'INVESTMENTS', 'ZERODHA', 'GROWW', 'UPSTOX',
  'RESTAURANT', 'RESTAURANTS', 'HOTEL', 'HOTELS', 'CAFE', 'COFFEE', 'TEA',
  'FOOD', 'FOODS', 'KITCHEN', 'CATERERS', 'CATERING', 'BIRYANI', 'PIZZA', 'BURGER',
  'TRAVEL', 'TRAVELS', 'TOURS', 'AIRWAYS', 'AIRLINES', 'INDIGO', 'VISTARA',
  'RAILWAY', 'IRCTC', 'METRO', 'CAB', 'CABS', 'TAXI', 'PARKING', 'TOLL', 'FASTAG',
  'UBER', 'OLA', 'RAPIDO', 'REDBUS', 'MAKEMYTRIP', 'GOIBIBO',
  'CINEMA', 'THEATRE', 'MULTIPLEX', 'ENTERTAINMENT', 'PVR', 'INOX', 'CINEPOLIS',
  'NETFLIX', 'SPOTIFY', 'HOTSTAR', 'PRIME', 'YOUTUBE', 'APPLE', 'GOOGLE', 'MICROSOFT',
  'AMAZON', 'FLIPKART', 'MYNTRA', 'NYKAA', 'AJIO', 'MEESHO', 'DMART', 'RELIANCE',
  'SWIGGY', 'ZOMATO', 'BLINKIT', 'ZEPTO', 'INSTAMART', 'BIGBASKET', 'DUNZO',
  'MALL', 'FASHION', 'APPAREL', 'CLOTHING', 'TEXTILES', 'GARMENTS', 'FOOTWEAR',
  'JEWELLERS', 'JEWELLERY', 'GOLD', 'ELECTRONICS', 'HARDWARE', 'FURNITURE', 'DECOR',
  'BOOK', 'BOOKS', 'STATIONERY', 'SCHOOL', 'COLLEGE', 'ACADEMY', 'UNIVERSITY',
  'INSTITUTE', 'COACHING', 'TUITION', 'GYM', 'FITNESS', 'SALON', 'SPA',
  'RENT', 'RENTAL', 'MAINTENANCE', 'SOCIETY', 'HOUSING', 'APARTMENT', 'BUILDERS',
  'DEVELOPERS', 'REALTY', 'ESTATE', 'WEWORK', 'AWFIS', 'COWORKING',
  'AWS', 'AZURE', 'GCP', 'VERCEL', 'SUPABASE', 'STRIPE', 'RAZORPAY', 'PAYTM',
  'PHONEPE', 'GPAY', 'PAYPAL', 'WISE', 'LOAN', 'EMI', 'CARD', 'CREDIT', 'DEBIT',
  'REFUND', 'REVERSAL', 'CASHBACK', 'DIVIDEND', 'TRANSFER', 'SAVING', 'SAVINGS',
  'CURRENT', 'SELF', 'OWN', 'INTERNAL', 'FAMILY', 'NEFT', 'RTGS', 'IMPS', 'UPI',
  'CLUB', 'TRUST', 'FOUNDATION', 'CHARITY', 'MOSQUE', 'TEMPLE', 'CHURCH',
  'ONLINE', 'INDIA', 'BHARAT', 'PUNE', 'MUMBAI', 'DELHI', 'BANGALORE', 'BENGALURU',
  'CLIENT', 'CLIENTS', 'PAYOUT', 'PAYOUTS', 'MERCHANT', 'MERCHANTS', 'VENDOR', 'VENDORS',
  'SUPPLIER', 'SUPPLIERS', 'RETAIL', 'RETAILER', 'WHOLESALE', 'UNKNOWN', 'STUDIO',
  'WORKS', 'GLOBAL', 'LOGISTICS', 'OPTICS',
]);

const TRANSFER_HINTS_REGEX =
  /\b(SELF\s*TRANSFER|OWN\s*ACCOUNT|SAVING(?:S)?\s*ACCOUNT|TO\s*SELF|INTERNAL\s*TRANSFER|FAMILY\s*TRANSFER|WASIM\s+SAVING|TRANSFER\s+TO\s+SAVING)\b/i;

const BANK_CHARGE_KEYWORDS_REGEX =
  /\b(BANK\s*CHARGES?|SMS\s*ALERT\s*CH|SMS\s*CHARGES?|DEBIT\s*CARD\s*(?:ANNUAL\s*)?FEE|AMB\s*(?:NON|CHARGE)|MIN(?:IMUM)?\s*BAL(?:ANCE)?\s*CH|PENAL\s*(?:CHARGE|INT)|SERVICE\s*CHARGE|GST\s*ON\s*(?:CH|FEE)|IMPS\s*CHARGE|NEFT\s*CHARGE|RTGS\s*CHARGE|BOUNCE\s*CHARGE|CHEQUE\s*RETURN|INTEREST\s*(?:DEBIT|CHARGED|RECOVERED)|OVERDRAFT\s*INT|ANNUAL\s*MAINT)\b/i;

export function normalizeMerchantKey(
  description?: string | null,
  rawDescription?: string | null
): string {
  const source = (description || rawDescription || '').trim();
  if (!source) return 'UNKNOWN MERCHANT';

  let s = deSplitPdfWords(source).toUpperCase();

  // Replace '&' with ' AND ' so Western Bakery & General Stores === Western Bakery And General Stores
  s = s.replace(/\s*&\s*/g, ' AND ');

  // Strip UPI / NEFT / IMPS / RTGS / POS / ACH / NACH prefixes repeatedly
  for (let i = 0; i < 3; i++) {
    s = s.replace(
      /^(?:UPI|IMPS|NEFT(?:\s+(?:CR|DR))?|RTGS(?:\s+(?:CR|DR))?|POS(?:\s+\d{4}X+\d{0,4})?|ACH|NACH|ATM|ECOM|MB|BIL|INB|CLG|MMT|BY\s+TRANSFER|TO\s+TRANSFER)[-:/\s]+/i,
      ''
    );
  }

  // Strip channel suffixes BEFORE Paytm/VPA stripping so merchant grouping key contains ONLY payee title
  const preStrippedChannel = s
    .replace(
      /[-/\s·]+(?:SENT\s+(?:USING|FROM)\s+(?:PAYTM(?:\s+U)?|GPAY|PHONEPE|BHIM)|UPI\s+MANDATE|UPI\s+INTENT|UPI\s+PAYMENT|BANK\s+TRANSFER|IMPS\s+TRANSFER|NEFT\s+TRANSFER|RTGS\s+TRANSFER|CARD\s*\/\s*ATM)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (preStrippedChannel) {
    s = preStrippedChannel;
  }

  // Strip Paytm QR / OID / merchant codes & VPA handles (before hyphen stripping)
  s = s.replace(/PAYTMQR[A-Z0-9]+(?:@[A-Z0-9._-]+)?/gi, ' ');
  s = s.replace(/\b[A-Z0-9._-]+@[A-Z0-9._-]+\b/gi, ' ');
  s = s.replace(/[-/\s]+PAYTM[A-Z0-9]*/gi, ' ');
  s = s.replace(/[-/\s]+OID\d+[A-Z0-9]*/gi, ' ');

  // Strip IFSC codes (e.g. HDFC0000123, ICIC0000456, KKBK0001234)
  s = s.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, ' ');

  // Strip masked card / account numbers (e.g. XXXX3597, XX4821, 4532XXXX1234)
  s = s.replace(/\b(?:\d{0,6}X{2,}\d{0,4}|A\/C\s*\d+)\b/g, ' ');

  // Strip bank reference tokens like SBINR..., HDFCR..., UTIB..., CBIN..., UTR..., REF...
  s = s.replace(/\b(?:UTR|REF|TXN|IMPS|UPI|CHQ|NO)[:#.\-\s]*[A-Z0-9]{6,}\b/g, ' ');
  s = s.replace(/\b[A-Z]{4,5}\d{8,}[A-Z0-9]*\b/g, ' ');

  // Strip pure 6+ digit sequences (UTRs, phone numbers, ref numbers)
  s = s.replace(/\b\d{6,}\b/g, ' ');

  // Strip trailing channel / NA filler after ref removal
  const postStrippedChannel = s
    .replace(
      /[-/\s·]+(?:SENT\s+(?:USING|FROM)\s+(?:PAYTM(?:\s+U)?|GPAY|PHONEPE|BHIM)|UPI\s+MANDATE|UPI\s+INTENT|UPI\s+PAYMENT|BANK\s+TRANSFER|IMPS\s+TRANSFER|NEFT\s+TRANSFER|RTGS\s+TRANSFER|CARD\s*\/\s*ATM|NA)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (postStrippedChannel) {
    s = postStrippedChannel;
  }

  // Replace remaining delimiters with space
  s = s.replace(/[^A-Z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Strip leading/trailing isolated short reference codes (like "CR", "DR", "P2A", "P2M")
  s = s.replace(/^(?:CR|DR|P2A|P2M|IN)\s+/g, '').replace(/\s+(?:CR|DR|P2A|P2M)$/g, '').trim();

  return s || source.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() || 'UNKNOWN MERCHANT';
}

export function formatMerchantDisplayName(merchantKey: string, variants: string[]): string {
  // Prefer a clean mixed-case variant if one looks clean, otherwise Title Case the merchantKey
  const cleanVariant = variants.find(
    (v) =>
      v &&
      !/^UPI[-/]|PAYTMQR|@|\d{6,}/i.test(v) &&
      /[a-z]/.test(v) &&
      normalizeMerchantKey(v) === merchantKey
  );
  if (cleanVariant) return cleanVariant.trim();

  return merchantKey
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (['AND', 'OF', 'THE', 'FOR', 'TO', 'IN', 'ON'].includes(word.toUpperCase()) && word !== merchantKey.split(/\s+/)[0].toLowerCase()) {
        return word;
      }
      if (['MSEDCL', 'HPCL', 'BPCL', 'IOCL', 'AWS', 'GST', 'TDS', 'ATM', 'SMS', 'EMI', 'HDFC', 'ICICI', 'SBI'].includes(word.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function detectPersonName(
  merchantKey: string,
  sampleDescriptions: string[] = [],
  knownPersonNames: string[] = []
): boolean {
  if (!merchantKey || merchantKey === 'UNKNOWN MERCHANT') return false;

  const upper = merchantKey.toUpperCase();
  if (BANK_CHARGE_KEYWORDS_REGEX.test(upper)) return false;

  const tokens = upper.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  // Known family member / owner full name exact or multi-token match
  for (const known of knownPersonNames) {
    const normKnown = normalizeMerchantKey(known);
    if (!normKnown) continue;
    if (upper === normKnown) return true;
    const knownTokens = normKnown.split(/\s+/).filter((t) => t.length >= 3);
    if (knownTokens.length >= 2) {
      const overlap = knownTokens.filter((t) => tokens.includes(t));
      if (overlap.length >= 2) return true;
    }
  }

  // Must have 2 to 5 alphabetic tokens (e.g. SALIM GAFFAR SAYYED, NASEEMUSSAHAR SAJID PERWEZ ANSARI)
  if (tokens.length < 2 || tokens.length > 5) {
    return false;
  }

  // If any token has digits, or is 1-char initial only with commercial keyword, check carefully
  const hasDigits = tokens.some((t) => /\d/.test(t));
  if (hasDigits) return false;

  // If any token is a recognized business, store, utility, bank, or food keyword -> NOT a person name
  if (tokens.some((t) => COMMERCIAL_KEYWORDS.has(t))) {
    return false;
  }

  // Check raw descriptions for obvious P2M/merchant markers like PAYTMQR or BIZ or .COM
  const joinedSamples = sampleDescriptions.join(' ').toUpperCase();
  if (/PAYTMQR|MERCHANT|\.COM|\.IN\b|BIZ\b|STORE|SHOP|PVT|LTD|LLP/.test(joinedSamples)) {
    return false;
  }

  // Check that words look like name parts (at least two words >= 3 chars, alpha only)
  const substantialAlphaTokens = tokens.filter((t) => /^[A-Z]{3,}$/.test(t));
  if (substantialAlphaTokens.length >= 2) {
    return true;
  }

  return false;
}

export function detectSelfOrFamilyTransfer(
  merchantKey: string,
  rawSamples: string[],
  accounts: Array<{
    id: string;
    name?: string | null;
    account_number_last4?: string | null;
    account_holder_name?: string | null;
  }>,
  ownerName?: string | null,
  familyNames: string[] = []
): boolean {
  const combined = `${merchantKey} ${rawSamples.join(' ')}`.toUpperCase();

  if (TRANSFER_HINTS_REGEX.test(combined)) {
    return true;
  }

  // Matches owner's own full name or "WASIM SAVING" / "<NAME> SAVING"
  const peopleNames = [
    ...(ownerName ? [ownerName] : []),
    ...familyNames,
    ...accounts.map((a) => a.account_holder_name || '').filter(Boolean),
  ];

  for (const name of peopleNames) {
    const norm = normalizeMerchantKey(name);
    if (!norm) continue;
    const first = norm.split(/\s+/)[0];
    if (norm === merchantKey) {
      return true;
    }
    if (first && first.length >= 4) {
      const savingRegex = new RegExp(`\\b${first}\\b.*\\b(?:SAVING|SAVINGS|TRANSFER|SELF|OWN|ACCOUNT)\\b`, 'i');
      const revRegex = new RegExp(`\\b(?:TRANSFER|SELF|OWN)\\b.*\\b${first}\\b`, 'i');
      if (savingRegex.test(combined) || revRegex.test(combined)) {
        return true;
      }
    }
  }

  // Mentions own account last4 digits + transfer cue
  for (const acc of accounts) {
    const last4 = (acc.account_number_last4 || '').trim();
    if (last4.length === 4 && combined.includes(last4) && /TRF|TRANSFER|NEFT|IMPS|RTGS|SELF|SAVING/i.test(combined)) {
      return true;
    }
  }

  return false;
}

export function computeFrequency(dates: string[], count: number): MerchantFrequency {
  if (count <= 1) return 'one-time';
  const sortedDates = [...dates]
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort();
  if (sortedDates.length <= 1) return 'occasional';

  const firstMs = new Date(sortedDates[0]).getTime();
  const lastMs = new Date(sortedDates[sortedDates.length - 1]).getTime();
  const spanDays = Math.max(1, Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24)));
  const avgGapDays = spanDays / (sortedDates.length - 1);

  if (avgGapDays <= 2.5 && count >= 4) return 'daily';
  if (avgGapDays <= 10.5 && count >= 3) return 'weekly';
  if (avgGapDays <= 45 && count >= 2) return 'monthly';
  return 'occasional';
}

export function resolveAccountScopeTag(
  acc: {
    purpose?: string | null;
    operated_by_owner?: boolean | null;
    account_holder_name?: string | null;
    name?: string | null;
  },
  ownerName?: string | null,
  familyNames: string[] = []
): AccountScopeTag {
  if (acc.purpose === 'business') return 'business';
  if (acc.operated_by_owner === false) return 'family';

  const holder = (acc.account_holder_name || '').trim().toLowerCase();
  const ownerLower = (ownerName || '').trim().toLowerCase();
  if (holder && ownerLower && holder !== ownerLower) {
    return 'family';
  }
  const accNameLower = (acc.name || '').toLowerCase();
  for (const fam of familyNames) {
    const first = fam.trim().toLowerCase().split(/\s+/)[0];
    if (first && first.length >= 3 && (holder.includes(first) || accNameLower.includes(first))) {
      return 'family';
    }
  }
  return 'personal';
}

export interface GroupMerchantsOptions {
  ownerName?: string | null;
  familyNames?: string[];
  userEditedTxIds?: Set<string>;
  includeAlreadyCategorized?: boolean;
}

export function groupTransactionsByMerchant(
  transactions: any[],
  accounts: any[],
  options: GroupMerchantsOptions = {}
): MerchantGroup[] {
  const {
    ownerName = null,
    familyNames = [],
    userEditedTxIds = new Set<string>(),
    includeAlreadyCategorized = false,
  } = options;

  const accountMap = new Map<string, any>();
  for (const acc of accounts || []) {
    accountMap.set(acc.id, acc);
  }

  const knownPeople = [
    ...(ownerName ? [ownerName] : []),
    ...familyNames,
    ...(accounts || [])
      .filter((a) => a.purpose !== 'business' && a.account_holder_name)
      .map((a) => a.account_holder_name as string),
  ];

  interface Accumulator {
    merchantKey: string;
    variantsSet: Set<string>;
    rawSamples: string[];
    totalAmount: number;
    debitTotal: number;
    creditTotal: number;
    minAmount: number;
    maxAmount: number;
    dates: string[];
    accountSummaryMap: Map<string, MerchantAccountSummary>;
    transactionIds: string[];
    transactionAccountIds: Record<string, string>;
  }

  const groupsMap = new Map<string, Accumulator>();

  for (const tx of transactions || []) {
    // Never overwrite manual categories or user-edited transactions
    const isManualProtected =
      tx.category_source === 'manual' ||
      Boolean(tx.is_manual && tx.category_id) ||
      userEditedTxIds.has(tx.id);

    if (isManualProtected) continue;
    if (!includeAlreadyCategorized && tx.category_id) continue;
    if (tx.is_self_transfer || tx.txn_type === 'opening') continue;

    const debit = tx.debit !== null && tx.debit !== undefined ? Number(tx.debit) : 0;
    const credit = tx.credit !== null && tx.credit !== undefined ? Number(tx.credit) : 0;
    const amt = Math.max(debit, credit);

    const key = normalizeMerchantKey(tx.description, tx.raw_description);
    let accEntry = groupsMap.get(key);
    if (!accEntry) {
      accEntry = {
        merchantKey: key,
        variantsSet: new Set<string>(),
        rawSamples: [],
        totalAmount: 0,
        debitTotal: 0,
        creditTotal: 0,
        minAmount: amt > 0 ? amt : 0,
        maxAmount: amt,
        dates: [],
        accountSummaryMap: new Map<string, MerchantAccountSummary>(),
        transactionIds: [],
        transactionAccountIds: {},
      };
      groupsMap.set(key, accEntry);
    }

    if (tx.description) accEntry.variantsSet.add(String(tx.description).trim());
    if (tx.raw_description && accEntry.rawSamples.length < 5) {
      accEntry.rawSamples.push(String(tx.raw_description).trim());
    }

    accEntry.totalAmount += amt;
    accEntry.debitTotal += debit;
    accEntry.creditTotal += credit;
    if (amt > 0) {
      accEntry.minAmount = accEntry.minAmount === 0 ? amt : Math.min(accEntry.minAmount, amt);
      accEntry.maxAmount = Math.max(accEntry.maxAmount, amt);
    }
    if (tx.txn_date) accEntry.dates.push(String(tx.txn_date));

    accEntry.transactionIds.push(tx.id);
    if (tx.account_id) {
      accEntry.transactionAccountIds[tx.id] = tx.account_id;
      if (!accEntry.accountSummaryMap.has(tx.account_id)) {
        const accountObj = accountMap.get(tx.account_id);
        const purpose: 'personal' | 'business' =
          accountObj?.purpose === 'business' ? 'business' : 'personal';
        const scopeTag: AccountScopeTag = accountObj
          ? resolveAccountScopeTag(accountObj, ownerName, familyNames)
          : 'personal';
        accEntry.accountSummaryMap.set(tx.account_id, {
          id: tx.account_id,
          name: accountObj?.name || 'Account',
          purpose,
          scopeTag,
        });
      }
    }
  }

  const groups: MerchantGroup[] = [];
  for (const acc of groupsMap.values()) {
    const variants = Array.from(acc.variantsSet).slice(0, 8);
    const displayName = formatMerchantDisplayName(acc.merchantKey, variants);
    const count = acc.transactionIds.length;
    const avgAmount = count > 0 ? Math.round((acc.totalAmount / count) * 100) / 100 : 0;
    const accountSummaries = Array.from(acc.accountSummaryMap.values());
    const scopeTagsSet = new Set<AccountScopeTag>(accountSummaries.map((a) => a.scopeTag));
    const hasBusiness = accountSummaries.some((a) => a.purpose === 'business');
    const hasPersonalOrFamily = accountSummaries.some((a) => a.purpose !== 'business');
    const isMixedPersonalAndBusiness = hasBusiness && hasPersonalOrFamily;

    const sortedDates = [...acc.dates].sort();
    const predominantDirection: 'debit' | 'credit' | 'mixed' =
      acc.debitTotal > 0 && acc.creditTotal === 0
        ? 'debit'
        : acc.creditTotal > 0 && acc.debitTotal === 0
        ? 'credit'
        : acc.creditTotal > acc.debitTotal * 1.5
        ? 'credit'
        : acc.debitTotal > acc.creditTotal * 1.5
        ? 'debit'
        : 'mixed';

    const isLikelyTransfer = detectSelfOrFamilyTransfer(
      acc.merchantKey,
      [...variants, ...acc.rawSamples],
      accounts,
      ownerName,
      familyNames
    );

    const isPersonName = detectPersonName(
      acc.merchantKey,
      [...variants, ...acc.rawSamples],
      knownPeople
    );

    const sampleForAI = maskForAI(
      variants[0] || acc.merchantKey,
      ownerName || undefined
    );

    groups.push({
      merchantKey: acc.merchantKey,
      displayName,
      variants,
      maskedSample: sampleForAI || acc.merchantKey,
      count,
      totalAmount: Math.round(acc.totalAmount * 100) / 100,
      debitTotal: Math.round(acc.debitTotal * 100) / 100,
      creditTotal: Math.round(acc.creditTotal * 100) / 100,
      avgAmount,
      minAmount: Math.round(acc.minAmount * 100) / 100,
      maxAmount: Math.round(acc.maxAmount * 100) / 100,
      frequency: computeFrequency(acc.dates, count),
      predominantDirection,
      firstDate: sortedDates[0] || '',
      lastDate: sortedDates[sortedDates.length - 1] || '',
      accounts: accountSummaries,
      accountScopes: Array.from(scopeTagsSet),
      isMixedPersonalAndBusiness,
      isPersonName,
      isLikelyTransfer,
      transactionIds: acc.transactionIds,
      transactionAccountIds: acc.transactionAccountIds,
    });
  }

  // Highest-spend merchants shown first
  groups.sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count);
  return groups;
}
