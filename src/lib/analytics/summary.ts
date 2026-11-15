import { maskForAI } from '../ai/pii-mask';
import type {
  AnalyticsAccountRow,
  AnalyticsCategoryRow,
  AnalyticsLargeTransactionRow,
  AnalyticsMonthRow,
  AnalyticsPayeeRow,
  AnalyticsReportJson,
  AnalyticsSummaryPayload,
  AnalyticsUnusualTransactionRow,
  AnalyticsWorkspaceSummaryRow,
} from '../../types/analytics';

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function formatMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const mIdx = parseInt(mStr, 10) - 1;
  const abbr = MONTH_ABBR[mIdx] || mStr;
  return `${abbr} ${yStr}`;
}

function countSpanMonths(fromDate: string, toDate: string): number {
  const [fy, fm] = fromDate.split('-').map((v) => parseInt(v, 10));
  const [ty, tm] = toDate.split('-').map((v) => parseInt(v, 10));
  if (!Number.isFinite(fy) || !Number.isFinite(fm) || !Number.isFinite(ty) || !Number.isFinite(tm)) {
    return 1;
  }
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * Extracts a clean, deterministic payee/counterparty label from a transaction description
 * so recurring payments to the same merchant aggregate cleanly in analytics.
 */
export function extractPayeeLabel(description: string | null | undefined): string {
  const raw = (description || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Unknown Payee';

  // Common Indian bank statement UPI / IMPS / NEFT pattern cleanup
  // e.g. "UPI/SWIGGY/123456789012/Payment" -> "SWIGGY"
  const slashParts = raw.split('/').map((p) => p.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const prefix = slashParts[0].toUpperCase();
    if (['UPI', 'IMPS', 'NEFT', 'RTGS', 'POS', 'ACH', 'MMT'].includes(prefix)) {
      const candidate = slashParts.find(
        (part, idx) =>
          idx > 0 &&
          part.length >= 2 &&
          !/^\d{6,}$/.test(part) &&
          !/^(DR|CR|P2M|P2P|UPI|IN|PAY)$/i.test(part)
      );
      if (candidate) {
        return candidate.slice(0, 72);
      }
    }
  }

  // Strip trailing long reference digits (6+ digits)
  const cleaned = raw
    .replace(/\b(?:REF|UTR|TXN|ID)[:#\s-]*[A-Z0-9]{6,}\b/gi, '')
    .replace(/\b\d{8,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || raw).slice(0, 80);
}

interface RawAnalyticsTxnRow {
  id: string;
  txn_date: string;
  description: string | null;
  debit: number | string | null;
  credit: number | string | null;
  category_id: string | null;
  workspace_id: string | null;
  account_id: string;
  txn_type: string | null;
  is_transfer: boolean;
  is_self_transfer: boolean;
  anomaly: {
    anomaly_type?: string;
    explanation?: string;
    severity?: string;
  } | null;
}

export async function buildAnalyticsSummary(
  supabase: any,
  userId: string
): Promise<{ summary: AnalyticsSummaryPayload; txnCount: number }> {
  const [accountsRes, categoriesRes, workspacesRes, selfTransferRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, bank_name, account_type')
      .eq('user_id', userId),
    supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId),
    supabase
      .from('workspaces')
      .select('id, name')
      .eq('user_id', userId),
    supabase
      .from('transactions')
      .select('id, debit, credit')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .eq('is_self_transfer', true),
  ]);

  const accountsMap = new Map<string, { name: string; bank: string; type: string }>();
  for (const a of accountsRes.data || []) {
    accountsMap.set(a.id, {
      name: a.name || 'Account',
      bank: a.bank_name || 'Bank',
      type: a.account_type || 'bank',
    });
  }

  const categoriesMap = new Map<string, { name: string; type: string }>();
  for (const c of categoriesRes.data || []) {
    categoriesMap.set(c.id, {
      name: c.name || 'Uncategorized',
      type: c.type || 'expense',
    });
  }

  const workspacesMap = new Map<string, string>();
  for (const w of workspacesRes.data || []) {
    workspacesMap.set(w.id, w.name || 'Personal');
  }

  // Paginate through ALL confirmed, non-self-transfer transactions ordered chronologically
  const PAGE_SIZE = 1000;
  const txns: RawAnalyticsTxnRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, txn_date, description, debit, credit, category_id, workspace_id, account_id, txn_type, is_transfer, is_self_transfer, anomaly'
      )
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .eq('is_self_transfer', false)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to query confirmed transactions: ${error.message}`);
    }

    const batch = (data || []) as RawAnalyticsTxnRow[];
    txns.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const selfTransferRows = (selfTransferRes.data || []) as Array<{
    id: string;
    debit: number | string | null;
    credit: number | string | null;
  }>;
  let selfTransferVolume = 0;
  for (const st of selfTransferRows) {
    const amt = Number(st.debit ?? st.credit ?? 0);
    if (Number.isFinite(amt) && amt > 0) {
      selfTransferVolume += amt;
    }
  }

  return computeAnalyticsSummaryFromRows({
    txns,
    accountsMap,
    categoriesMap,
    workspacesMap,
    selfTransferCount: selfTransferRows.length,
    selfTransferVolume: round2(selfTransferVolume),
  });
}

export function computeAnalyticsSummaryFromRows(params: {
  txns: RawAnalyticsTxnRow[];
  accountsMap: Map<string, { name: string; bank: string; type: string }>;
  categoriesMap: Map<string, { name: string; type: string }>;
  workspacesMap: Map<string, string>;
  selfTransferCount: number;
  selfTransferVolume: number;
}): { summary: AnalyticsSummaryPayload; txnCount: number } {
  const {
    txns,
    accountsMap,
    categoriesMap,
    workspacesMap,
    selfTransferCount,
    selfTransferVolume,
  } = params;

  if (txns.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    return {
      txnCount: 0,
      summary: {
        period: { from: today, to: today, months: 0 },
        totals: { totalIncome: 0, totalExpense: 0, netSavings: 0, savingsRate: 0 },
        byMonth: [],
        byCategory: [],
        byAccount: [],
        topPayees: [],
        largeTransactions: [],
        unusualTransactions: [],
        selfTransferSummary: {
          count: selfTransferCount,
          totalVolume: selfTransferVolume,
        },
        itSummary: {
          businessIncome: 0,
          businessExpense: 0,
          personalIncome: 0,
          personalExpense: 0,
          workspaces: [],
        },
      },
    };
  }

  const periodFrom = txns[0].txn_date;
  const periodTo = txns[txns.length - 1].txn_date;
  const spanMonths = countSpanMonths(periodFrom, periodTo);

  let totalIncome = 0;
  let totalExpense = 0;

  const monthMap = new Map<
    string,
    { income: number; expense: number; txnCount: number }
  >();
  const categoryMap = new Map<
    string,
    { category: string; type: 'income' | 'expense'; total: number; txnCount: number }
  >();
  const accountAggMap = new Map<
    string,
    { nickname: string; bank: string; type: string; totalIn: number; totalOut: number }
  >();
  const payeeAggMap = new Map<string, { total: number; txnCount: number }>();
  const workspaceAggMap = new Map<string, { income: number; expense: number }>();

  let businessIncome = 0;
  let businessExpense = 0;
  let personalIncome = 0;
  let personalExpense = 0;

  const candidateLarge: Array<AnalyticsLargeTransactionRow & { absAmount: number }> = [];
  const unusualTransactions: AnalyticsUnusualTransactionRow[] = [];

  for (const tx of txns) {
    // Skip non-cashflow opening balance / unflagged transfer rows from income/expense math
    if (tx.is_self_transfer || tx.is_transfer || tx.txn_type === 'transfer' || tx.txn_type === 'opening') {
      continue;
    }

    const debit = tx.debit !== null && tx.debit !== undefined ? Number(tx.debit) : 0;
    const credit = tx.credit !== null && tx.credit !== undefined ? Number(tx.credit) : 0;
    const isIncome = credit > 0 && tx.txn_type !== 'refund';
    const isExpense = debit > 0;

    const ym = (tx.txn_date || '').slice(0, 7);
    if (ym.length === 7) {
      const mBucket = monthMap.get(ym) || { income: 0, expense: 0, txnCount: 0 };
      if (isIncome) mBucket.income += credit;
      if (isExpense) mBucket.expense += debit;
      mBucket.txnCount += 1;
      monthMap.set(ym, mBucket);
    }

    if (isIncome) totalIncome += credit;
    if (isExpense) totalExpense += debit;

    // Category aggregation
    const catInfo = tx.category_id ? categoriesMap.get(tx.category_id) : undefined;
    const catName = catInfo?.name || 'Uncategorized';
    if (isExpense) {
      const key = `expense::${catName}`;
      const cBucket = categoryMap.get(key) || {
        category: catName,
        type: 'expense',
        total: 0,
        txnCount: 0,
      };
      cBucket.total += debit;
      cBucket.txnCount += 1;
      categoryMap.set(key, cBucket);
    } else if (isIncome) {
      const key = `income::${catName}`;
      const cBucket = categoryMap.get(key) || {
        category: catName,
        type: 'income',
        total: 0,
        txnCount: 0,
      };
      cBucket.total += credit;
      cBucket.txnCount += 1;
      categoryMap.set(key, cBucket);
    }

    // Account aggregation
    const accInfo = accountsMap.get(tx.account_id) || {
      name: 'Account',
      bank: 'Bank',
      type: 'bank',
    };
    const accBucket = accountAggMap.get(tx.account_id) || {
      nickname: accInfo.name,
      bank: accInfo.bank,
      type: accInfo.type,
      totalIn: 0,
      totalOut: 0,
    };
    if (credit > 0) accBucket.totalIn += credit;
    if (debit > 0) accBucket.totalOut += debit;
    accountAggMap.set(tx.account_id, accBucket);

    // Payee aggregation
    const payee = extractPayeeLabel(tx.description);
    const absAmt = isExpense ? debit : credit;
    if (absAmt > 0) {
      const pBucket = payeeAggMap.get(payee) || { total: 0, txnCount: 0 };
      pBucket.total += absAmt;
      pBucket.txnCount += 1;
      payeeAggMap.set(payee, pBucket);

      candidateLarge.push({
        date: tx.txn_date,
        amount: round2(isExpense ? -debit : credit),
        payee,
        category: catName,
        account: accInfo.name,
        absAmount: absAmt,
      });
    }

    // Anomaly aggregation
    if (tx.anomaly && (tx.anomaly.explanation || tx.anomaly.anomaly_type)) {
      unusualTransactions.push({
        date: tx.txn_date,
        amount: round2(isExpense ? -debit : credit),
        payee,
        reason: tx.anomaly.explanation || tx.anomaly.anomaly_type || 'Flagged unusual activity',
      });
    }

    // Workspace / ITR breakdown
    const wsName = tx.workspace_id
      ? workspacesMap.get(tx.workspace_id) || 'Personal'
      : 'Personal';
    const wsBucket = workspaceAggMap.get(wsName) || { income: 0, expense: 0 };
    if (isIncome) wsBucket.income += credit;
    if (isExpense) wsBucket.expense += debit;
    workspaceAggMap.set(wsName, wsBucket);

    const wsLower = wsName.toLowerCase();
    if (wsLower.includes('business')) {
      if (isIncome) businessIncome += credit;
      if (isExpense) businessExpense += debit;
    } else {
      if (isIncome) personalIncome += credit;
      if (isExpense) personalExpense += debit;
    }
  }

  const netSavings = round2(totalIncome - totalExpense);
  const savingsRate =
    totalIncome > 0 ? round1((netSavings / totalIncome) * 100) : 0;

  const byMonth: AnalyticsMonthRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([ym, v]) => ({
      month: formatMonthLabel(ym),
      income: round2(v.income),
      expense: round2(v.expense),
      net: round2(v.income - v.expense),
      txnCount: v.txnCount,
    }));

  const byCategory: AnalyticsCategoryRow[] = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)
    .map((c) => {
      const denom = c.type === 'expense' ? totalExpense : totalIncome;
      return {
        category: c.category,
        type: c.type,
        total: round2(c.total),
        txnCount: c.txnCount,
        pct: denom > 0 ? round1((c.total / denom) * 100) : 0,
      };
    });

  const byAccount: AnalyticsAccountRow[] = Array.from(accountAggMap.values())
    .map((a) => ({
      nickname: a.nickname,
      bank: a.bank,
      type: a.type,
      totalIn: round2(a.totalIn),
      totalOut: round2(a.totalOut),
      net: round2(a.totalIn - a.totalOut),
    }))
    .sort((a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut));

  const topPayees: AnalyticsPayeeRow[] = Array.from(payeeAggMap.entries())
    .map(([payee, v]) => ({
      payee,
      total: round2(v.total),
      txnCount: v.txnCount,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const largeTransactions: AnalyticsLargeTransactionRow[] = candidateLarge
    .sort((a, b) => b.absAmount - a.absAmount)
    .slice(0, 10)
    .map(({ absAmount: _abs, ...rest }) => rest);

  const workspaces: AnalyticsWorkspaceSummaryRow[] = Array.from(
    workspaceAggMap.entries()
  )
    .map(([name, v]) => ({
      name,
      income: round2(v.income),
      expense: round2(v.expense),
    }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));

  return {
    txnCount: txns.length,
    summary: {
      period: {
        from: periodFrom,
        to: periodTo,
        months: spanMonths,
      },
      totals: {
        totalIncome: round2(totalIncome),
        totalExpense: round2(totalExpense),
        netSavings,
        savingsRate,
      },
      byMonth,
      byCategory,
      byAccount,
      topPayees,
      largeTransactions,
      unusualTransactions: unusualTransactions.slice(-15),
      selfTransferSummary: {
        count: selfTransferCount,
        totalVolume: selfTransferVolume,
      },
      itSummary: {
        businessIncome: round2(businessIncome),
        businessExpense: round2(businessExpense),
        personalIncome: round2(personalIncome),
        personalExpense: round2(personalExpense),
        workspaces,
      },
    },
  };
}

/**
 * Replaces every real payee name in the summary with a deterministic alias
 * (`PAYEE_1`, `PAYEE_2`, ...) stored strictly in a server-side Map, and passes
 * remaining text fields through `maskForAI` so zero real payee names or PII
 * ever leave the server to Gemini.
 */
export function maskSummaryPayees(
  summary: AnalyticsSummaryPayload,
  profileName?: string
): {
  maskedSummary: AnalyticsSummaryPayload;
  payeeMap: Map<string, string>;
} {
  const realToToken = new Map<string, string>();
  const payeeMap = new Map<string, string>();
  let nextIdx = 1;

  const getOrAssignToken = (realPayee: string): string => {
    const normalized = realPayee.trim() || 'Unknown Payee';
    const existing = realToToken.get(normalized);
    if (existing) return existing;
    const token = `PAYEE_${nextIdx++}`;
    realToToken.set(normalized, token);
    payeeMap.set(token, normalized);
    return token;
  };

  // Assign deterministic tokens first to topPayees, then largeTransactions, then unusualTransactions
  const maskedTopPayees = summary.topPayees.map((p) => ({
    ...p,
    payee: getOrAssignToken(p.payee),
  }));

  const maskedLargeTransactions = summary.largeTransactions.map((t) => ({
    ...t,
    payee: getOrAssignToken(t.payee),
    category: maskForAI(t.category, profileName),
    account: maskForAI(t.account, profileName),
  }));

  // Prepare longest-first replacements for redacting any real payee names appearing inside reason strings
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const maskedUnusualPre = summary.unusualTransactions.map((u) => ({
    ...u,
    payee: getOrAssignToken(u.payee),
  }));

  const sortedRealEntries = Array.from(realToToken.entries()).sort(
    ([a], [b]) => b.length - a.length
  );

  const redactPayeesAndPII = (text: string): string => {
    let out = text || '';
    for (const [realName, token] of sortedRealEntries) {
      if (realName.length >= 2) {
        out = out.replace(new RegExp(escapeRegex(realName), 'gi'), token);
      }
    }
    return maskForAI(out, profileName);
  };

  const maskedUnusualTransactions = maskedUnusualPre.map((u) => ({
    ...u,
    reason: redactPayeesAndPII(u.reason),
  }));

  const maskedByAccount = summary.byAccount.map((a) => ({
    ...a,
    nickname: maskForAI(a.nickname, profileName),
    bank: maskForAI(a.bank, profileName),
  }));

  const maskedByCategory = summary.byCategory.map((c) => ({
    ...c,
    category: maskForAI(c.category, profileName),
  }));

  const maskedWorkspaces = summary.itSummary.workspaces.map((w) => ({
    ...w,
    name: maskForAI(w.name, profileName),
  }));

  const maskedSummary: AnalyticsSummaryPayload = {
    period: { ...summary.period },
    totals: { ...summary.totals },
    byMonth: summary.byMonth.map((m) => ({ ...m })),
    byCategory: maskedByCategory,
    byAccount: maskedByAccount,
    topPayees: maskedTopPayees,
    largeTransactions: maskedLargeTransactions,
    unusualTransactions: maskedUnusualTransactions,
    selfTransferSummary: { ...summary.selfTransferSummary },
    itSummary: {
      ...summary.itSummary,
      workspaces: maskedWorkspaces,
    },
  };

  return { maskedSummary, payeeMap };
}

function replacePayeeTokens(text: string, payeeMap: Map<string, string>): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\bPAYEE_(\d+)\b/g, (fullMatch) => {
    return payeeMap.get(fullMatch) ?? fullMatch;
  });
}

/**
 * Restores real payee names from `PAYEE_N` aliases across all text fields in
 * the parsed Gemini analytics report using word-boundary exact token matching.
 */
export function unmaskReportPayees(
  report: AnalyticsReportJson,
  payeeMap: Map<string, string>
): AnalyticsReportJson {
  return {
    executiveSummary: replacePayeeTokens(report.executiveSummary, payeeMap),
    incomeAnalysis: {
      summary: replacePayeeTokens(report.incomeAnalysis.summary, payeeMap),
      trend: replacePayeeTokens(report.incomeAnalysis.trend, payeeMap),
      keyInsight: replacePayeeTokens(report.incomeAnalysis.keyInsight, payeeMap),
    },
    expenseAnalysis: {
      summary: replacePayeeTokens(report.expenseAnalysis.summary, payeeMap),
      topCategories: replacePayeeTokens(report.expenseAnalysis.topCategories, payeeMap),
      keyInsight: replacePayeeTokens(report.expenseAnalysis.keyInsight, payeeMap),
    },
    savingsAnalysis: {
      summary: replacePayeeTokens(report.savingsAnalysis.summary, payeeMap),
      averageMonthlySavings: replacePayeeTokens(
        report.savingsAnalysis.averageMonthlySavings,
        payeeMap
      ),
      bestMonth: replacePayeeTokens(report.savingsAnalysis.bestMonth, payeeMap),
      worstMonth: replacePayeeTokens(report.savingsAnalysis.worstMonth, payeeMap),
      keyInsight: replacePayeeTokens(report.savingsAnalysis.keyInsight, payeeMap),
    },
    cashFlowPatterns: replacePayeeTokens(report.cashFlowPatterns, payeeMap),
    anomaliesAndAlerts: report.anomaliesAndAlerts.map((item) =>
      replacePayeeTokens(item, payeeMap)
    ),
    itrRelevantNotes: replacePayeeTokens(report.itrRelevantNotes, payeeMap),
    recommendations: report.recommendations.map((item) =>
      replacePayeeTokens(item, payeeMap)
    ),
    overallHealthScore: report.overallHealthScore,
  };
}
