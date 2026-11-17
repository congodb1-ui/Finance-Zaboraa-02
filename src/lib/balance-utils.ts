export interface BalanceSequenceRow {
  txn_date: string;
  debit?: number | null;
  credit?: number | null;
  balance?: number | null;
  balance_after?: number | null;
}

const TOLERANCE = 0.05;

function getReportedBalance(row: BalanceSequenceRow): number | null {
  const val = row.balance_after !== undefined && row.balance_after !== null
    ? row.balance_after
    : row.balance;
  if (val === undefined || val === null) return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function toPaise(val: number): number {
  return Math.round(val * 100);
}

/**
 * Counts sequential continuity breaks assuming rows are ordered chronologically (oldest -> newest).
 */
export function countChronologicalBreaks(rows: BalanceSequenceRow[]): {
  breaks: number;
  breakIndices: number[];
} {
  let breaks = 0;
  const breakIndices: number[] = [];
  let prevBal: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const curBal = getReportedBalance(rows[i]);
    if (curBal !== null && prevBal !== null) {
      const dr = Number(rows[i].debit ?? 0);
      const cr = Number(rows[i].credit ?? 0);
      const expected = prevBal - dr + cr;
      if (Math.abs(expected - curBal) > TOLERANCE) {
        breaks++;
        breakIndices.push(i);
      }
    }
    if (curBal !== null) {
      prevBal = curBal;
    } else if (prevBal !== null) {
      const dr = Number(rows[i].debit ?? 0);
      const cr = Number(rows[i].credit ?? 0);
      prevBal = Math.round((prevBal - dr + cr) * 100) / 100;
    }
  }

  return { breaks, breakIndices };
}

function popMatchingRow(
  buckets: Map<number, number[]>,
  targetPaise: number,
  used: Set<number>
): number | null {
  for (let offset = 0; offset <= 5; offset++) {
    const candidates = offset === 0 ? [targetPaise] : [targetPaise - offset, targetPaise + offset];
    for (const key of candidates) {
      const list = buckets.get(key);
      if (!list) continue;
      while (list.length > 0) {
        const idx = list[0];
        if (used.has(idx)) {
          list.shift();
          continue;
        }
        list.shift();
        return idx;
      }
    }
  }
  return null;
}

function chainDayRows<T extends BalanceSequenceRow>(
  dayRows: T[],
  prevDayEndBal: number | null
): { ordered: T[]; endBal: number | null } {
  if (dayRows.length <= 1) {
    const bal = dayRows.length === 1 ? getReportedBalance(dayRows[0]) : prevDayEndBal;
    return {
      ordered: [...dayRows],
      endBal:
        bal !== null
          ? bal
          : prevDayEndBal !== null && dayRows.length === 1
          ? Math.round((prevDayEndBal - Number(dayRows[0].debit ?? 0) + Number(dayRows[0].credit ?? 0)) * 100) / 100
          : prevDayEndBal,
    };
  }

  // Fast path: check if dayRows already matches continuous forward order from prevDayEndBal
  const isContinuousFrom = (seq: T[], seedBal: number | null): boolean => {
    let running = seedBal;
    for (let i = 0; i < seq.length; i++) {
      const bal = getReportedBalance(seq[i]);
      if (bal === null) return false;
      if (running !== null) {
        const dr = Number(seq[i].debit ?? 0);
        const cr = Number(seq[i].credit ?? 0);
        if (Math.abs(running - dr + cr - bal) > TOLERANCE) return false;
      }
      running = bal;
    }
    return true;
  };

  if (isContinuousFrom(dayRows, prevDayEndBal)) {
    return { ordered: [...dayRows], endBal: getReportedBalance(dayRows[dayRows.length - 1]) };
  }

  const reversed = [...dayRows].reverse();
  if (isContinuousFrom(reversed, prevDayEndBal)) {
    return { ordered: reversed, endBal: getReportedBalance(reversed[reversed.length - 1]) };
  }

  // Reconstruct chain via bal_before -> bal_after matching
  const withBalIndices: number[] = [];
  const withoutBalIndices: number[] = [];
  const startBuckets = new Map<number, number[]>();
  const endBalancePaiseCounts = new Map<number, number>();
  const startBalPaiseByIdx = new Map<number, number>();
  const endBalByIdx = new Map<number, number>();

  for (let i = 0; i < dayRows.length; i++) {
    const endBal = getReportedBalance(dayRows[i]);
    if (endBal === null) {
      withoutBalIndices.push(i);
      continue;
    }
    const dr = Number(dayRows[i].debit ?? 0);
    const cr = Number(dayRows[i].credit ?? 0);
    const startBal = Math.round((endBal + dr - cr) * 100) / 100;
    const startP = toPaise(startBal);
    const endP = toPaise(endBal);

    withBalIndices.push(i);
    startBalPaiseByIdx.set(i, startP);
    endBalByIdx.set(i, endBal);

    const bucket = startBuckets.get(startP) || [];
    bucket.push(i);
    startBuckets.set(startP, bucket);

    endBalancePaiseCounts.set(endP, (endBalancePaiseCounts.get(endP) || 0) + 1);
  }

  if (withBalIndices.length === 0) {
    let running = prevDayEndBal;
    for (const r of dayRows) {
      if (running !== null) {
        running = Math.round((running - Number(r.debit ?? 0) + Number(r.credit ?? 0)) * 100) / 100;
      }
    }
    return { ordered: [...dayRows], endBal: running };
  }

  const used = new Set<number>();
  const result: T[] = [];
  let cursorBal: number | null = prevDayEndBal;

  while (used.size < withBalIndices.length) {
    let nextIdx: number | null = null;

    if (cursorBal !== null) {
      nextIdx = popMatchingRow(startBuckets, toPaise(cursorBal), used);
    }

    if (nextIdx === null) {
      // Pick head of an unconsumed sub-chain: a row whose startBal is NOT matched by another unconsumed row's endBal
      const remainingEndCounts = new Map<number, number>();
      for (const idx of withBalIndices) {
        if (used.has(idx)) continue;
        const eP = toPaise(endBalByIdx.get(idx)!);
        remainingEndCounts.set(eP, (remainingEndCounts.get(eP) || 0) + 1);
      }

      for (const idx of withBalIndices) {
        if (used.has(idx)) continue;
        const sP = startBalPaiseByIdx.get(idx)!;
        // Self-loop zero-amount rows shouldn't block head selection
        const eP = toPaise(endBalByIdx.get(idx)!);
        const endCount = remainingEndCounts.get(sP) || 0;
        if (endCount === 0 || (sP === eP && endCount <= 1)) {
          nextIdx = idx;
          break;
        }
      }

      if (nextIdx === null) {
        nextIdx = withBalIndices.find((idx) => !used.has(idx)) ?? null;
      }
    }

    if (nextIdx === null) break;

    used.add(nextIdx);
    result.push(dayRows[nextIdx]);
    cursorBal = endBalByIdx.get(nextIdx)!;
  }

  for (const idx of withoutBalIndices) {
    result.push(dayRows[idx]);
    if (cursorBal !== null) {
      cursorBal =
        Math.round(
          (cursorBal - Number(dayRows[idx].debit ?? 0) + Number(dayRows[idx].credit ?? 0)) * 100
        ) / 100;
    }
  }

  return { ordered: result, endBal: cursorBal };
}

/**
 * Reconstructs true chronological order (oldest -> newest) using date + running balance links,
 * healing scrambled intra-day rows from batch inserts with identical timestamps.
 */
export function orderTransactionsChronologically<T extends BalanceSequenceRow>(rows: T[]): {
  ordered: T[];
  breaks: number;
  breakIndices: number[];
  originalDirection: 'ascending' | 'descending' | 'mixed';
} {
  if (!rows || rows.length === 0) {
    return { ordered: [], breaks: 0, breakIndices: [], originalDirection: 'ascending' };
  }
  if (rows.length === 1) {
    return { ordered: [...rows], breaks: 0, breakIndices: [], originalDirection: 'ascending' };
  }

  const fwdCheck = countChronologicalBreaks(rows);
  const firstDate = rows[0].txn_date || '';
  const lastDate = rows[rows.length - 1].txn_date || '';
  if (fwdCheck.breaks === 0 && firstDate <= lastDate) {
    return {
      ordered: [...rows],
      breaks: 0,
      breakIndices: [],
      originalDirection: 'ascending',
    };
  }

  const rev = [...rows].reverse();
  const revCheck = countChronologicalBreaks(rev);
  if (revCheck.breaks === 0 && lastDate <= firstDate) {
    return {
      ordered: rev,
      breaks: 0,
      breakIndices: [],
      originalDirection: 'descending',
    };
  }

  // Group by txn_date ascending
  const dateGroups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.txn_date || '';
    const list = dateGroups.get(key) || [];
    list.push(row);
    dateGroups.set(key, list);
  }

  const sortedDates = Array.from(dateGroups.keys()).sort();
  const ordered: T[] = [];
  let cursorBal: number | null = null;

  for (const d of sortedDates) {
    const dayRows = dateGroups.get(d)!;
    const step: { ordered: T[]; endBal: number | null } = chainDayRows(dayRows, cursorBal);
    ordered.push(...step.ordered);
    cursorBal = step.endBal;
  }

  const finalCheck = countChronologicalBreaks(ordered);

  // Determine whether the input was originally descending
  const originalDirection: 'ascending' | 'descending' | 'mixed' =
    firstDate > lastDate ? 'descending' : firstDate < lastDate ? 'ascending' : 'mixed';

  return {
    ordered,
    breaks: finalCheck.breaks,
    breakIndices: finalCheck.breakIndices,
    originalDirection,
  };
}

/**
 * Computes authoritative account balance from opening_balance + chronologically sorted transactions.
 * Whenever a transaction carries a bank-reported balance/balance_after, running balance snaps to it;
 * subsequent transactions without a bank-reported balance adjust from that anchor.
 */
export function computeAuthoritativeAccountBalance(
  openingBalance: number,
  chronologicalTxns: BalanceSequenceRow[]
): number {
  let running = Number.isFinite(openingBalance) ? openingBalance : 0;

  for (const tx of chronologicalTxns) {
    const reported = getReportedBalance(tx);
    if (reported !== null) {
      running = reported;
    } else {
      const dr = Number(tx.debit ?? 0);
      const cr = Number(tx.credit ?? 0);
      running = running + cr - dr;
    }
  }

  return Math.round(running * 100) / 100;
}
