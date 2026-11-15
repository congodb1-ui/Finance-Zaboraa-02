import { callGeminiPro, GEMINI_MODELS, isAIError } from '../ai/gemini-client';
import {
  buildAnalyticsSummary,
  maskSummaryPayees,
  unmaskReportPayees,
} from './summary';
import type {
  AnalyticsReportJson,
  AnalyticsReportRecord,
  AnalyticsSummaryPayload,
} from '../../types/analytics';

const SYSTEM_INSTRUCTION = `You are a personal finance analyst for an Indian individual who runs a business alongside personal finances. Analyse the structured financial summary provided and return ONLY valid JSON with these exact keys:
{
  "executiveSummary": "2-3 sentence overview of overall financial health",
  "incomeAnalysis": {
    "summary": "...",
    "trend": "growing | stable | declining | irregular",
    "keyInsight": "..."
  },
  "expenseAnalysis": {
    "summary": "...",
    "topCategories": "...",
    "keyInsight": "..."
  },
  "savingsAnalysis": {
    "summary": "...",
    "averageMonthlySavings": "...",
    "bestMonth": "...",
    "worstMonth": "...",
    "keyInsight": "..."
  },
  "cashFlowPatterns": "observations on timing, seasonality, recurring outflows",
  "anomaliesAndAlerts": ["...", "..."],
  "itrRelevantNotes": "observations relevant for Indian income tax filing (business vs personal split, deductible categories, GST-relevant expenses if visible)",
  "recommendations": ["actionable recommendation 1", "recommendation 2", "recommendation 3"],
  "overallHealthScore": 7
}
Rules: Use Indian Rupee formatting (₹X,XX,XXX). Be specific to the numbers given. Never give investment advice or stock picks. Return valid JSON only.`;

function asString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return fallback;
}

function asStringArray(val: unknown, maxItems: number): string[] {
  if (!Array.isArray(val)) return [];
  const out: string[] = [];
  for (const item of val) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim());
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const title = asString(obj.title || obj.heading || obj.action);
      const detail = asString(obj.detail || obj.description || obj.summary || obj.text);
      const combined = title && detail ? `${title}: ${detail}` : title || detail;
      if (combined) out.push(combined);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeReportJson(raw: unknown): AnalyticsReportJson {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inc = (
    obj.incomeAnalysis && typeof obj.incomeAnalysis === 'object' ? obj.incomeAnalysis : {}
  ) as Record<string, unknown>;
  const exp = (
    obj.expenseAnalysis && typeof obj.expenseAnalysis === 'object' ? obj.expenseAnalysis : {}
  ) as Record<string, unknown>;
  const sav = (
    obj.savingsAnalysis && typeof obj.savingsAnalysis === 'object' ? obj.savingsAnalysis : {}
  ) as Record<string, unknown>;

  const rawScore = Number(obj.overallHealthScore);
  const overallHealthScore = Number.isFinite(rawScore)
    ? Math.max(1, Math.min(10, Math.round(rawScore)))
    : 5;

  return {
    executiveSummary: asString(
      obj.executiveSummary,
      'Financial summary generated from confirmed ledger transactions.'
    ),
    incomeAnalysis: {
      summary: asString(inc.summary, 'Income streams analysed across confirmed transactions.'),
      trend: asString(inc.trend, 'stable'),
      keyInsight: asString(inc.keyInsight, 'Review recurring inflows for month-over-month consistency.'),
    },
    expenseAnalysis: {
      summary: asString(exp.summary, 'Expense distribution analysed across active categories.'),
      topCategories: asString(exp.topCategories, 'Top spending categories are shown in the chart above.'),
      keyInsight: asString(exp.keyInsight, 'Monitor your highest-share expense categories monthly.'),
    },
    savingsAnalysis: {
      summary: asString(sav.summary, 'Monthly net savings calculated after excluding self-transfers.'),
      averageMonthlySavings: asString(sav.averageMonthlySavings, '₹0'),
      bestMonth: asString(sav.bestMonth, 'N/A'),
      worstMonth: asString(sav.worstMonth, 'N/A'),
      keyInsight: asString(sav.keyInsight, 'Consistent surplus tracking helps build reserve liquidity.'),
    },
    cashFlowPatterns: asString(
      obj.cashFlowPatterns,
      'Cash flow timing reflects regular monthly inflows and operating outflows.'
    ),
    anomaliesAndAlerts: asStringArray(obj.anomaliesAndAlerts, 5),
    itrRelevantNotes: asString(
      obj.itrRelevantNotes,
      'Keep business and personal workspaces tagged cleanly for Indian ITR preparation.'
    ),
    recommendations: asStringArray(obj.recommendations, 3),
    overallHealthScore,
  };
}

export async function listAnalyticsReports(
  supabase: any,
  userId: string
): Promise<AnalyticsReportRecord[]> {
  const { data, error } = await supabase
    .from('analytics_reports')
    .select(
      'id, user_id, generated_at, period_from, period_to, txn_count, report_json, summary_json, model_used, created_at'
    )
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Failed to load analytics reports: ${error.message}`);
  }

  return (data || []) as AnalyticsReportRecord[];
}

export async function generateAnalyticsReport(params: {
  supabase: any;
  userId: string;
  profileName?: string;
}): Promise<{
  report: AnalyticsReportRecord;
  summary: AnalyticsSummaryPayload;
}> {
  const { supabase, userId, profileName } = params;

  // 1. Build structured summary server-side (confirmed, non-self-transfer only)
  const { summary, txnCount } = await buildAnalyticsSummary(supabase, userId);

  if (txnCount === 0) {
    const err = new Error(
      'No confirmed transactions found to analyse. Confirm imported transactions or add entries first.'
    );
    (err as any).statusCode = 400;
    throw err;
  }

  // 2. PII-mask & alias real payee names to PAYEE_N before sending to Gemini
  const { maskedSummary, payeeMap } = maskSummaryPayees(summary, profileName);

  const userPrompt = `Analyse this structured Indian financial summary (all self-transfers and unconfirmed review transactions are already excluded). Return valid JSON matching the exact schema requested.\n\n${JSON.stringify(
    maskedSummary
  )}`;

  // 3. Call Gemini Pro via central client
  const aiRes = await callGeminiPro(userPrompt, {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: 'application/json',
  });

  if (isAIError(aiRes)) {
    const err = new Error(aiRes.message);
    (err as any).statusCode = aiRes.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 502;
    (err as any).code = aiRes.code;
    throw err;
  }

  // 4. Parse & validate JSON response
  const cleanedText = aiRes.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleanedText);
  } catch {
    const err = new Error('Gemini returned an invalid JSON analytics report. Please try again.');
    (err as any).statusCode = 502;
    throw err;
  }

  const normalized = normalizeReportJson(parsedRaw);

  // 5. Unmask PAYEE_N tokens back to real payee names before saving & returning
  const unmaskedReport = unmaskReportPayees(normalized, payeeMap);

  // 6. Store in analytics_reports (owner-scoped via RLS)
  const { data: inserted, error: insertError } = await supabase
    .from('analytics_reports')
    .insert({
      user_id: userId,
      generated_at: new Date().toISOString(),
      period_from: summary.period.from || null,
      period_to: summary.period.to || null,
      txn_count: txnCount,
      report_json: unmaskedReport,
      summary_json: summary,
      model_used: GEMINI_MODELS.PRO || 'gemini-pro',
    })
    .select(
      'id, user_id, generated_at, period_from, period_to, txn_count, report_json, summary_json, model_used, created_at'
    )
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `Failed to save analytics report: ${insertError?.message || 'Unknown error'}`
    );
  }

  // 7. Prune any reports older than the latest 10 for this user
  try {
    const { data: allRows } = await supabase
      .from('analytics_reports')
      .select('id')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false });

    if (Array.isArray(allRows) && allRows.length > 10) {
      const idsToDelete = allRows.slice(10).map((r: { id: string }) => r.id);
      if (idsToDelete.length > 0) {
        await supabase
          .from('analytics_reports')
          .delete()
          .eq('user_id', userId)
          .in('id', idsToDelete);
      }
    }
  } catch (pruneErr: any) {
    console.error('[analytics] Failed to prune old analytics_reports:', pruneErr?.message);
  }

  return {
    report: inserted as AnalyticsReportRecord,
    summary,
  };
}
