import { extractCrossSourceRefs, normalizeReferenceNumber } from './parsers/utils';

export interface DedupCandidateTx {
  id: string;
  account_id: string;
  upload_id?: string | null;
  txn_date: string;
  description: string;
  raw_description?: string | null;
  debit: number | null;
  credit: number | null;
  balance?: number | null;
  balance_after?: number | null;
  reference_number?: string | null;
  upi_ref_no?: string | null;
  imps_ref_no?: string | null;
  source?: string | null;
}

export interface IncomingDedupRow {
  account_id: string;
  upload_id?: string | null;
  txn_date: string;
  description: string;
  raw_description?: string | null;
  debit: number | null;
  credit: number | null;
  balance?: number | null;
  reference_number?: string | null;
  upi_ref_no?: string | null;
  imps_ref_no?: string | null;
  source: 'statement_import' | 'gmail_auto' | 'manual_upload';
}

export interface CrossSourceMatchResult {
  matched: DedupCandidateTx;
  matchTier: 'tier1_ref' | 'tier2_fuzzy';
  enrichmentPatch: Record<string, any> | null;
}

const STOP_WORDS = new Set([
  'hdfc',
  'bank',
  'ltd',
  'limited',
  'india',
  'private',
  'pvt',
  'upi',
  'imps',
  'neft',
  'rtgs',
  'eft',
  'tpt',
  'ft',
  'cr',
  'dr',
  'transfer',
  'payment',
  'payee',
  'from',
  'towards',
  'via',
  'online',
  'banking',
  'netbanking',
  'remitter',
  'recipient',
  'sender',
  'account',
  'saving',
  'savings',
  'current',
  'self',
  'na',
]);

const GENERIC_LABELS = new Set([
  'remitter',
  'imps remitter',
  'imps sender',
  'imps recipient',
  'neft sender',
  'neft recipient',
  'rtgs sender',
  'rtgs recipient',
  'hdfc online transfer',
  'upi payment',
  'upi sender',
  'boi imps transfer',
]);

export function normalizeRefForDedup(raw?: string | null): string | null {
  return normalizeReferenceNumber(raw);
}

function getStrongRef(tx: {
  upi_ref_no?: string | null;
  imps_ref_no?: string | null;
  reference_number?: string | null;
}): string | null {
  const upi = normalizeRefForDedup(tx.upi_ref_no);
  if (upi) return `UPI:${upi}`;
  const imps = normalizeRefForDedup(tx.imps_ref_no);
  if (imps) return `IMPS:${imps}`;
  const ref = normalizeRefForDedup(tx.reference_number);
  // Only treat references with >= 8 chars as unique transaction IDs (short cheque/seq numbers like "43" or "2" aren't globally unique)
  if (ref && ref.length >= 8) return `REF:${ref}`;
  return null;
}

function extractMeaningfulTokens(text: string): string[] {
  const cleaned = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return Array.from(new Set(cleaned));
}

function stripNonAlnumLower(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasCompactPrefixOverlap(a: string, b: string): boolean {
  const sa = stripNonAlnumLower(a);
  const sb = stripNonAlnumLower(b);
  if (sa.length < 6 || sb.length < 6) return false;
  // Check common >=7-char chunks so MOTILALOSWALSECURITI matches MOTILAL OSWAL SECURITIES
  for (let len = Math.min(8, sa.length, sb.length); len >= 7; len--) {
    for (let i = 0; i <= sa.length - len; i++) {
      const sub = sa.slice(i, i + len);
      if (!/^\d+$/.test(sub) && sb.includes(sub)) {
        return true;
      }
    }
  }
  return false;
}

export function areCounterpartiesCompatible(
  descA: string,
  rawA: string | null | undefined,
  descB: string,
  rawB: string | null | undefined
): boolean {
  const cleanA = (descA || '').trim().toLowerCase();
  const cleanB = (descB || '').trim().toLowerCase();

  if (!cleanA || !cleanB) return true;
  if (GENERIC_LABELS.has(cleanA) || GENERIC_LABELS.has(cleanB)) {
    return true;
  }

  // Exact or substring normalized match
  const fullA = `${descA || ''} ${rawA || ''}`;
  const fullB = `${descB || ''} ${rawB || ''}`;

  if (hasCompactPrefixOverlap(cleanA, cleanB) || hasCompactPrefixOverlap(fullA, fullB)) {
    return true;
  }

  const tokensA = extractMeaningfulTokens(fullA);
  const tokensB = extractMeaningfulTokens(fullB);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return true;
  }

  const setB = new Set(tokensB);
  return tokensA.some((t) => setB.has(t));
}

function getTxAmountAndDirection(tx: { debit: number | null; credit: number | null }): {
  isDebit: boolean;
  amount: number;
} | null {
  const dr = tx.debit !== null && tx.debit !== undefined ? Number(tx.debit) : 0;
  const cr = tx.credit !== null && tx.credit !== undefined ? Number(tx.credit) : 0;
  if (dr > 0) return { isDebit: true, amount: Math.round(dr * 100) / 100 };
  if (cr > 0) return { isDebit: false, amount: Math.round(cr * 100) / 100 };
  return null;
}

function dateDiffDays(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.abs(a - b) / 86_400_000;
}

export function buildCrossSourceEnrichmentPatch(
  existing: DedupCandidateTx,
  incoming: IncomingDedupRow
): Record<string, any> | null {
  const patch: Record<string, any> = {};

  if (incoming.source === 'statement_import' && existing.source === 'gmail_auto') {
    if (
      incoming.balance !== null &&
      incoming.balance !== undefined &&
      (existing.balance === null || existing.balance === undefined || existing.balance_after === null)
    ) {
      patch.balance = incoming.balance;
      patch.balance_after = incoming.balance;
    }
    if (incoming.upload_id && !existing.upload_id) {
      patch.upload_id = incoming.upload_id;
    }
    if (incoming.reference_number && !existing.reference_number) {
      patch.reference_number = normalizeRefForDedup(incoming.reference_number) || incoming.reference_number;
    }
    if (incoming.upi_ref_no && !existing.upi_ref_no) {
      patch.upi_ref_no = incoming.upi_ref_no;
    }
    if (incoming.imps_ref_no && !existing.imps_ref_no) {
      patch.imps_ref_no = incoming.imps_ref_no;
    }
    if (
      incoming.raw_description &&
      incoming.raw_description.length > (existing.raw_description || '').length
    ) {
      patch.raw_description = incoming.raw_description;
    }
  } else if (incoming.source === 'gmail_auto' && existing.source !== 'gmail_auto') {
    if (
      incoming.balance !== null &&
      incoming.balance !== undefined &&
      (existing.balance_after === null || existing.balance_after === undefined)
    ) {
      patch.balance_after = incoming.balance;
    }
    if (incoming.reference_number && !existing.reference_number) {
      patch.reference_number = normalizeRefForDedup(incoming.reference_number) || incoming.reference_number;
    }
    if (incoming.upi_ref_no && !existing.upi_ref_no) {
      patch.upi_ref_no = incoming.upi_ref_no;
    }
    if (incoming.imps_ref_no && !existing.imps_ref_no) {
      patch.imps_ref_no = incoming.imps_ref_no;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Finds the best existing transaction matching `incoming`, respecting:
 * - Tier 1: Normalized UPI/IMPS/NEFT/RTGS reference number match
 *   (Never merges two transactions that carry different strong transaction refs!)
 * - Tier 2: Cross-source fuzzy fallback (±2 days, same account, same direction, amount ±0.01,
 *   compatible counterparty, when at least one side lacks a strong unique ref)
 */
export function findBestCrossSourceMatch(
  incoming: IncomingDedupRow,
  candidates: DedupCandidateTx[],
  consumedIds?: Set<string>
): CrossSourceMatchResult | null {
  const inAmtDir = getTxAmountAndDirection(incoming);
  if (!inAmtDir) return null;

  const inCross = extractCrossSourceRefs({
    description: incoming.description,
    rawDescription: incoming.raw_description,
    referenceNumber: incoming.reference_number,
    rawNarration: incoming.raw_description,
  });
  const inUpi = normalizeRefForDedup(incoming.upi_ref_no || inCross.upi_ref_no);
  const inImps = normalizeRefForDedup(incoming.imps_ref_no || inCross.imps_ref_no);
  const inRef = normalizeRefForDedup(incoming.reference_number || inCross.neft_rtgs_ref_no);
  const inStrongRef = getStrongRef({
    upi_ref_no: inUpi,
    imps_ref_no: inImps,
    reference_number: inRef,
  });

  // Tier 1: Reference match
  for (const cand of candidates) {
    if (consumedIds?.has(cand.id)) continue;
    const candAmtDir = getTxAmountAndDirection(cand);
    if (!candAmtDir) continue;

    const sameAccount = cand.account_id === incoming.account_id;
    const sameDirection = candAmtDir.isDebit === inAmtDir.isDebit;
    const sameAmount = Math.abs(candAmtDir.amount - inAmtDir.amount) <= 0.01;

    const candUpi = normalizeRefForDedup(cand.upi_ref_no);
    const candImps = normalizeRefForDedup(cand.imps_ref_no);
    const candRef = normalizeRefForDedup(cand.reference_number);

    // UPI ref match (same account, or cross-source same-direction + amount)
    if (inUpi && (candUpi === inUpi || candRef === inUpi)) {
      if (sameAccount || (sameDirection && sameAmount)) {
        return {
          matched: cand,
          matchTier: 'tier1_ref',
          enrichmentPatch: buildCrossSourceEnrichmentPatch(cand, incoming),
        };
      }
    }

    // IMPS ref match (same account, or cross-source same-direction + amount; opposite leg across accounts = self-transfer!)
    if (inImps && (candImps === inImps || candRef === inImps)) {
      if (sameAccount || (sameDirection && sameAmount)) {
        return {
          matched: cand,
          matchTier: 'tier1_ref',
          enrichmentPatch: buildCrossSourceEnrichmentPatch(cand, incoming),
        };
      }
    }

    // NEFT / RTGS / Generic UTR ref match (must be >= 8 chars, same account + direction + amount ±0.01)
    if (
      inRef &&
      inRef.length >= 8 &&
      sameAccount &&
      sameDirection &&
      sameAmount &&
      (candRef === inRef || candUpi === inRef || candImps === inRef)
    ) {
      return {
        matched: cand,
        matchTier: 'tier1_ref',
        enrichmentPatch: buildCrossSourceEnrichmentPatch(cand, incoming),
      };
    }
  }

  // Tier 2: Cross-source ref-less / date-lag fallback (only when from different sources, e.g. gmail_auto <-> statement_import)
  for (const cand of candidates) {
    if (consumedIds?.has(cand.id)) continue;
    if (cand.account_id !== incoming.account_id) continue;
    if (cand.source && cand.source === incoming.source) continue;

    const candAmtDir = getTxAmountAndDirection(cand);
    if (!candAmtDir) continue;
    if (candAmtDir.isDebit !== inAmtDir.isDebit) continue;
    if (Math.abs(candAmtDir.amount - inAmtDir.amount) > 0.01) continue;
    if (dateDiffDays(incoming.txn_date, cand.txn_date) > 2) continue;

    // Never merge if BOTH sides carry distinct strong transaction IDs (e.g. two ₹50 UPI txns on same day)
    const candStrongRef = getStrongRef(cand);
    if (inStrongRef && candStrongRef && inStrongRef !== candStrongRef) {
      continue;
    }

    if (
      areCounterpartiesCompatible(
        incoming.description,
        incoming.raw_description,
        cand.description,
        cand.raw_description
      )
    ) {
      return {
        matched: cand,
        matchTier: 'tier2_fuzzy',
        enrichmentPatch: buildCrossSourceEnrichmentPatch(cand, incoming),
      };
    }
  }

  return null;
}
