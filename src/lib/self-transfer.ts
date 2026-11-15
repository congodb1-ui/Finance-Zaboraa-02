export interface SelfTransferDetectionResult {
  pairsLinked: number;
  flaggedForReview: number;
}

interface CandidateTx {
  id: string;
  account_id: string;
  txn_date: string;
  description: string;
  raw_description: string | null;
  debit: number | null;
  credit: number | null;
  reference_number: string | null;
  upi_ref_no: string | null;
  imps_ref_no: string | null;
  is_transfer: boolean;
  is_self_transfer: boolean;
  transfer_pair_id: string | null;
  category_id: string | null;
  txn_type: string | null;
  status?: string | null;
}

function normalizeTxRow(r: any): CandidateTx {
  return {
    id: r.id,
    account_id: r.account_id,
    txn_date: r.txn_date,
    description: r.description || '',
    raw_description: r.raw_description || null,
    debit: r.debit !== null && r.debit !== undefined ? Number(r.debit) : null,
    credit: r.credit !== null && r.credit !== undefined ? Number(r.credit) : null,
    reference_number: r.reference_number || null,
    upi_ref_no: r.upi_ref_no || null,
    imps_ref_no: r.imps_ref_no || null,
    is_transfer: Boolean(r.is_transfer),
    is_self_transfer: Boolean(r.is_self_transfer),
    transfer_pair_id: r.transfer_pair_id || null,
    category_id: r.category_id || null,
    txn_type: r.txn_type || null,
    status: r.status || null,
  };
}

function textContainsOwnerName(rawText: string, ownerNames: string[]): boolean {
  const hay = rawText.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!hay) return false;
  for (const name of ownerNames) {
    const normName = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normName || normName.length < 4) continue;
    if (hay.includes(normName)) return true;

    // Also match first + last name on NEFT/RTGS lines where middle name is omitted by bank
    const parts = normName.split(' ').filter((p) => p.length >= 3);
    if (
      parts.length >= 2 &&
      /\b(NEFT|RTGS|FT|TRF)\b/i.test(hay) &&
      hay.includes(parts[0]) &&
      hay.includes(parts[parts.length - 1])
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reusable Batch 4b Self-Transfer Detection & Linking Engine.
 * Works for both statement imports (commitUploadTransactions) and Gmail auto-imports (Batch 5b).
 *
 * Rules:
 * 1. IMPS ref match across two owner-operated accounts (opposite debit/credit) -> confirmed pair
 * 2. UPI ref match across two owner-operated accounts (opposite debit/credit) -> confirmed pair
 * 3. NEFT/RTGS name-match fallback (owner_full_name in raw_description, amount ±0.01, date ±1d, both operated_by_owner) -> review pair
 * 4. Amount ±0.01 + date ±1.5d across two owner-operated accounts (Batch 2b fallback) -> confirmed pair
 *
 * Sets `is_self_transfer = true`, `is_transfer = true`, `txn_type = 'transfer'`,
 * `transfer_pair_id`, and `category_id` = system `Self Transfer` category.
 */
export async function detectAndLinkSelfTransfers(
  supabase: any,
  userId: string,
  newTransactionIds: string[]
): Promise<SelfTransferDetectionResult> {
  if (!userId || !newTransactionIds || newTransactionIds.length === 0) {
    return { pairsLinked: 0, flaggedForReview: 0 };
  }

  const SELECT_FIELDS =
    'id, account_id, txn_date, description, raw_description, debit, credit, reference_number, upi_ref_no, imps_ref_no, is_transfer, is_self_transfer, transfer_pair_id, category_id, txn_type, status';

  const [{ data: newRows, error: newErr }, { data: accounts }, { data: profile }, { data: selfTransferCat }] =
    await Promise.all([
      supabase
        .from('transactions')
        .select(SELECT_FIELDS)
        .eq('user_id', userId)
        .in('id', newTransactionIds),
      supabase
        .from('accounts')
        .select('id, operated_by_owner')
        .eq('user_id', userId),
      supabase
        .from('profiles')
        .select('owner_full_name, full_name')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('categories')
        .select('id')
        .eq('name', 'Self Transfer')
        .eq('is_system', true)
        .maybeSingle(),
    ]);

  if (newErr || !newRows || newRows.length === 0) {
    return { pairsLinked: 0, flaggedForReview: 0 };
  }

  const newTxns: CandidateTx[] = (newRows as any[]).map(normalizeTxRow);
  const selfTransferCatId: string | null = selfTransferCat?.id ?? null;

  const operatedByOwnerMap = new Map<string, boolean>();
  for (const acc of accounts || []) {
    operatedByOwnerMap.set(acc.id, acc.operated_by_owner !== false);
  }

  const ownerNames: string[] = [];
  if (profile?.owner_full_name) ownerNames.push(String(profile.owner_full_name));
  if (profile?.full_name) ownerNames.push(String(profile.full_name));

  // Collect IMPS refs, UPI refs, and date window across the new batch to query candidates in batch
  const impsRefs = Array.from(
    new Set(newTxns.map((t: CandidateTx) => t.imps_ref_no).filter((v): v is string => Boolean(v)))
  );
  const upiRefs = Array.from(
    new Set(newTxns.map((t: CandidateTx) => t.upi_ref_no).filter((v): v is string => Boolean(v)))
  );

  let minDate = newTxns[0].txn_date;
  let maxDate = newTxns[0].txn_date;
  for (const t of newTxns) {
    if (t.txn_date < minDate) minDate = t.txn_date;
    if (t.txn_date > maxDate) maxDate = t.txn_date;
  }

  const minWindow = new Date(minDate);
  minWindow.setDate(minWindow.getDate() - 2);
  const maxWindow = new Date(maxDate);
  maxWindow.setDate(maxWindow.getDate() + 2);

  const candidateQueries: Promise<any>[] = [
    supabase
      .from('transactions')
      .select(SELECT_FIELDS)
      .eq('user_id', userId)
      .is('transfer_pair_id', null)
      .gte('txn_date', minWindow.toISOString().split('T')[0])
      .lte('txn_date', maxWindow.toISOString().split('T')[0]),
  ];

  if (impsRefs.length > 0) {
    candidateQueries.push(
      supabase
        .from('transactions')
        .select(SELECT_FIELDS)
        .eq('user_id', userId)
        .in('imps_ref_no', impsRefs)
    );
  }

  if (upiRefs.length > 0) {
    candidateQueries.push(
      supabase
        .from('transactions')
        .select(SELECT_FIELDS)
        .eq('user_id', userId)
        .in('upi_ref_no', upiRefs)
    );
  }

  const queryResults = await Promise.all(candidateQueries);
  const candidateMap = new Map<string, CandidateTx>();
  for (const t of newTxns) {
    candidateMap.set(t.id, t);
  }
  for (const res of queryResults) {
    for (const row of res?.data || []) {
      if (!candidateMap.has(row.id)) {
        candidateMap.set(row.id, normalizeTxRow(row));
      }
    }
  }

  const allCandidates = Array.from(candidateMap.values());
  const pairedIds = new Set<string>();
  let pairsLinked = 0;
  let flaggedForReview = 0;

  const linkPair = async (
    a: CandidateTx,
    b: CandidateTx,
    status: 'confirmed' | 'review'
  ) => {
    pairedIds.add(a.id);
    pairedIds.add(b.id);
    const nowIso = new Date().toISOString();

    await Promise.all([
      supabase
        .from('transactions')
        .update({
          is_self_transfer: true,
          is_transfer: true,
          txn_type: 'transfer',
          transfer_pair_id: b.id,
          category_id: selfTransferCatId,
          status,
          updated_at: nowIso,
        })
        .eq('id', a.id)
        .eq('user_id', userId),
      supabase
        .from('transactions')
        .update({
          is_self_transfer: true,
          is_transfer: true,
          txn_type: 'transfer',
          transfer_pair_id: a.id,
          category_id: selfTransferCatId,
          status,
          updated_at: nowIso,
        })
        .eq('id', b.id)
        .eq('user_id', userId),
    ]);
  };

  for (const tx of newTxns) {
    if (pairedIds.has(tx.id) || tx.transfer_pair_id) continue;
    if (operatedByOwnerMap.get(tx.account_id) === false) continue;

    const txAmt = tx.debit ?? tx.credit;
    if (!txAmt || txAmt <= 0) continue;
    const isTxDebit = tx.debit !== null && tx.debit !== undefined && tx.debit > 0;
    const txDateMs = new Date(tx.txn_date).getTime();

    const eligibleOthers = allCandidates.filter((other) => {
      if (other.id === tx.id || pairedIds.has(other.id)) return false;
      if (other.transfer_pair_id) return false;
      if (other.account_id === tx.account_id) return false;
      if (operatedByOwnerMap.get(other.account_id) === false) return false;
      const otherAmt = other.debit ?? other.credit;
      if (!otherAmt || otherAmt <= 0) return false;
      const isOtherDebit = other.debit !== null && other.debit !== undefined && other.debit > 0;
      return isOtherDebit !== isTxDebit;
    });

    // 1. IMPS Ref match (highest confidence)
    if (tx.imps_ref_no) {
      const impsMatch = eligibleOthers.find(
        (other) => other.imps_ref_no === tx.imps_ref_no
      );
      if (impsMatch) {
        await linkPair(tx, impsMatch, 'confirmed');
        pairsLinked++;
        continue;
      }
    }

    // 2. UPI Ref self-transfer match
    if (tx.upi_ref_no) {
      const upiMatch = eligibleOthers.find(
        (other) => other.upi_ref_no === tx.upi_ref_no
      );
      if (upiMatch) {
        await linkPair(tx, upiMatch, 'confirmed');
        pairsLinked++;
        continue;
      }
    }

    // 3. Name-match fallback (for NEFT/RTGS where no unique ref exists)
    const txRawCombined = `${tx.raw_description || ''} ${tx.description || ''}`;
    const isNeftOrRtgs = /\b(NEFT|RTGS)\b/i.test(txRawCombined);
    const txHasOwnerName = textContainsOwnerName(txRawCombined, ownerNames);

    if (ownerNames.length > 0 && (txHasOwnerName || isNeftOrRtgs)) {
      const nameMatch = eligibleOthers.find((other) => {
        const otherAmt = (other.debit ?? other.credit) || 0;
        if (Math.abs(txAmt - otherAmt) > 0.01) return false;
        const diffMs = Math.abs(txDateMs - new Date(other.txn_date).getTime());
        if (diffMs > 86400000) return false; // within 1 day
        const otherRawCombined = `${other.raw_description || ''} ${other.description || ''}`;
        const otherHasOwnerName = textContainsOwnerName(otherRawCombined, ownerNames);
        return txHasOwnerName || otherHasOwnerName;
      });

      if (nameMatch) {
        await linkPair(tx, nameMatch, 'review');
        flaggedForReview++;
        pairsLinked++;
        continue;
      }
    }

    // 4. Batch 2b general opposite-leg self-transfer fallback (±1.5 days, exact amount within ₹0.01)
    const amountDateMatch = eligibleOthers.find((other) => {
      const otherAmt = (other.debit ?? other.credit) || 0;
      if (Math.abs(txAmt - otherAmt) > 0.01) return false;
      const diffMs = Math.abs(txDateMs - new Date(other.txn_date).getTime());
      return diffMs <= 86400000 * 1.5;
    });

    if (amountDateMatch) {
      await linkPair(tx, amountDateMatch, 'confirmed');
      pairsLinked++;
    }
  }

  return { pairsLinked, flaggedForReview };
}
