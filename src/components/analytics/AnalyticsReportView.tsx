import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { HealthScoreGauge } from './HealthScoreGauge';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { CategorySpendingChart } from './CategorySpendingChart';
import type { AnalyticsReportRecord } from '../../types/analytics';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Lightbulb,
  PiggyBank,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export function formatAnalyticsDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return 'Never';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-IN', { month: 'short' });
  const yr = d.getFullYear();
  const hrs = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr} at ${hrs}:${mins}`;
}

export function formatAnalyticsDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-IN', { month: 'short' });
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function splitRecommendation(text: string, index: number): { title: string; detail: string } {
  const clean = (text || '').trim();
  if (!clean) {
    return {
      title: `Action Item ${index + 1}`,
      detail: 'Review confirmed transactions to optimize monthly cash flow.',
    };
  }

  // Split on ":" or " — " or " - " or first sentence boundary
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 4 && colonIdx < 80) {
    return {
      title: clean.slice(0, colonIdx).trim(),
      detail: clean.slice(colonIdx + 1).trim(),
    };
  }

  const dashMatch = clean.match(/^(.{6,75}?)\s[—–-]\s(.+)$/);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      detail: dashMatch[2].trim(),
    };
  }

  const sentenceIdx = clean.indexOf('. ');
  if (sentenceIdx > 6 && sentenceIdx < 90) {
    return {
      title: clean.slice(0, sentenceIdx + 1).trim(),
      detail: clean.slice(sentenceIdx + 2).trim(),
    };
  }

  return {
    title: `Recommendation ${index + 1}`,
    detail: clean,
  };
}

interface AnalyticsReportViewProps {
  activeReport: AnalyticsReportRecord;
  history: AnalyticsReportRecord[];
  onSelectReport: (report: AnalyticsReportRecord) => void;
}

export const AnalyticsReportView: React.FC<AnalyticsReportViewProps> = ({
  activeReport,
  history,
  onSelectReport,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);

  const report = activeReport.report_json;
  const summary = activeReport.summary_json;

  const periodLabel = `${formatAnalyticsDate(
    activeReport.period_from || summary?.period?.from
  )} – ${formatAnalyticsDate(activeReport.period_to || summary?.period?.to)}`;

  const totalIncome = summary?.totals?.totalIncome ?? 0;
  const totalExpense = summary?.totals?.totalExpense ?? 0;
  const netSavings = summary?.totals?.netSavings ?? 0;
  const savingsRate = summary?.totals?.savingsRate ?? 0;

  const anomalies = (report?.anomaliesAndAlerts || []).slice(0, 5);
  const recommendations = (report?.recommendations || []).slice(0, 3);
  const itSummary = summary?.itSummary || {
    businessIncome: 0,
    businessExpense: 0,
    personalIncome: 0,
    personalExpense: 0,
    workspaces: [],
  };

  return (
    <div className="space-y-6">
      {/* Print-only PDF Header */}
      <div className="print-only pb-4 mb-4 border-b-2 border-slate-900">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-heading font-bold text-xl text-slate-900">
            Zaboraa Finance — Financial Report — {periodLabel}
          </h1>
          <span className="text-xs font-mono text-slate-600">
            https://finance.zaboraa.com
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Generated on {formatAnalyticsDateTime(activeReport.generated_at)} •{' '}
          {(activeReport?.txn_count ?? 0).toLocaleString('en-IN')} confirmed transactions analysed
        </p>
      </div>

      {/* Section 1: Health Score & Executive Summary */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6">
            <HealthScoreGauge score={report.overallHealthScore} />

            <div className="flex-1 space-y-5 w-full">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <h2 className="font-heading font-semibold text-base text-slate-900 dark:text-white print:text-slate-900">
                    Executive Summary
                  </h2>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 print:text-slate-600">
                    {periodLabel}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
                  {report.executiveSummary}
                </p>
              </div>

              {/* 3 KPI Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 print:border-slate-300">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                    <span>Total Income</span>
                    <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="mt-1 font-heading font-bold text-lg text-green-700 dark:text-green-400 print:text-slate-900 font-tabular">
                    {formatINR(totalIncome, { showDecimals: false })}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                    <span>Total Expense</span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="mt-1 font-heading font-bold text-lg text-red-700 dark:text-red-400 print:text-slate-900 font-tabular">
                    {formatINR(totalExpense, { showDecimals: false })}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 print:bg-slate-50 print:border-slate-300">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                    <span>Net Savings ({savingsRate}%)</span>
                    <PiggyBank className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div
                    className={`mt-1 font-heading font-bold text-lg font-tabular print:text-slate-900 ${
                      netSavings >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {formatINR(netSavings, { showDecimals: false, showSign: true })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Income vs Expense Chart (Pure Inline SVG) */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Monthly Income vs Expense
          </CardTitle>
          <CardDescription>
            Confirmed non-transfer cash flow across up to 24 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IncomeExpenseChart months={summary?.byMonth || []} />
        </CardContent>
      </Card>

      {/* Section 3: Spending by Category Chart (Pure Inline SVG) */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Spending by Category (Top 10)
          </CardTitle>
          <CardDescription>
            Sorted by total spend and share of confirmed expenses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategorySpendingChart categories={summary?.byCategory || []} />
        </CardContent>
      </Card>

      {/* Section 4: AI Insights (4 Structured Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="print-break-avoid print:border-slate-300 print:bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Income Analysis</CardTitle>
              <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium capitalize text-slate-700 dark:text-slate-300">
                Trend: {report.incomeAnalysis.trend}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs sm:text-sm">
            <p className="text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
              {report.incomeAnalysis.summary}
            </p>
            <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-200 print:bg-slate-50 print:text-slate-900 print:border-slate-300">
              <span className="font-semibold">Key Insight: </span>
              {report.incomeAnalysis.keyInsight}
            </div>
          </CardContent>
        </Card>

        <Card className="print-break-avoid print:border-slate-300 print:bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Expense Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs sm:text-sm">
            <p className="text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
              {report.expenseAnalysis.summary}
            </p>
            {report.expenseAnalysis.topCategories && (
              <p className="text-xs text-slate-600 dark:text-slate-400 print:text-slate-700">
                <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-slate-900">
                  Top Categories:{' '}
                </span>
                {report.expenseAnalysis.topCategories}
              </p>
            )}
            <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-200 print:bg-slate-50 print:text-slate-900 print:border-slate-300">
              <span className="font-semibold">Key Insight: </span>
              {report.expenseAnalysis.keyInsight}
            </div>
          </CardContent>
        </Card>

        <Card className="print-break-avoid print:border-slate-300 print:bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Savings Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs sm:text-sm">
            <p className="text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
              {report.savingsAnalysis.summary}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 print:border-slate-300">
                <div className="text-slate-500 dark:text-slate-400">Avg Monthly</div>
                <div className="font-semibold text-slate-900 dark:text-white print:text-slate-900 font-tabular mt-0.5 truncate" title={report.savingsAnalysis.averageMonthlySavings}>
                  {report.savingsAnalysis.averageMonthlySavings}
                </div>
              </div>
              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 print:border-slate-300">
                <div className="text-slate-500 dark:text-slate-400">Best Month</div>
                <div className="font-semibold text-green-700 dark:text-green-400 print:text-slate-900 font-tabular mt-0.5 truncate" title={report.savingsAnalysis.bestMonth}>
                  {report.savingsAnalysis.bestMonth}
                </div>
              </div>
              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 print:border-slate-300">
                <div className="text-slate-500 dark:text-slate-400">Lowest Month</div>
                <div className="font-semibold text-amber-700 dark:text-amber-400 print:text-slate-900 font-tabular mt-0.5 truncate" title={report.savingsAnalysis.worstMonth}>
                  {report.savingsAnalysis.worstMonth}
                </div>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 print:bg-slate-50 print:text-slate-900 print:border-slate-300">
              <span className="font-semibold">Key Insight: </span>
              {report.savingsAnalysis.keyInsight}
            </div>
          </CardContent>
        </Card>

        <Card className="print-break-avoid print:border-slate-300 print:bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cash Flow Patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs sm:text-sm">
            <p className="text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
              {report.cashFlowPatterns}
            </p>
            {summary?.selfTransferSummary && summary.selfTransferSummary.count > 0 && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 print:border-slate-300 font-tabular">
                Excluded{' '}
                <span className="font-semibold text-slate-900 dark:text-white print:text-slate-900">
                  {summary.selfTransferSummary.count}
                </span>{' '}
                self-transfer leg(s) totalling{' '}
                <span className="font-semibold text-slate-900 dark:text-white print:text-slate-900">
                  {formatINR(summary.selfTransferSummary.totalVolume, { showDecimals: false })}
                </span>{' '}
                to avoid double counting.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 5: Anomalies & Alerts */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            Anomalies & Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 py-2">
              <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span>No anomalies detected in this period.</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {anomalies.map((alert, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 text-xs sm:text-sm text-slate-800 dark:text-slate-200 print:bg-white print:border-slate-300 print:text-slate-900"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Section 6: ITR Notes */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            ITR & Tax Filing Notes
          </CardTitle>
          <CardDescription>
            Business vs Personal split across confirmed ledger transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 print:border-slate-300">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 print:bg-slate-100 print:text-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5 font-semibold">Workspace Split</th>
                  <th className="py-2.5 px-3.5 font-semibold text-right">Income</th>
                  <th className="py-2.5 px-3.5 font-semibold text-right">Expense</th>
                  <th className="py-2.5 px-3.5 font-semibold text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 print:divide-slate-300 font-tabular">
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-slate-900 dark:text-white print:text-slate-900">
                    Business
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-green-700 dark:text-green-400 print:text-slate-900">
                    {formatINR(itSummary.businessIncome, { showDecimals: false })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-red-700 dark:text-red-400 print:text-slate-900">
                    {formatINR(itSummary.businessExpense, { showDecimals: false })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900 dark:text-white print:text-slate-900">
                    {formatINR(itSummary.businessIncome - itSummary.businessExpense, {
                      showDecimals: false,
                      showSign: true,
                    })}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-slate-900 dark:text-white print:text-slate-900">
                    Personal & Other
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-green-700 dark:text-green-400 print:text-slate-900">
                    {formatINR(itSummary.personalIncome, { showDecimals: false })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-red-700 dark:text-red-400 print:text-slate-900">
                    {formatINR(itSummary.personalExpense, { showDecimals: false })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900 dark:text-white print:text-slate-900">
                    {formatINR(itSummary.personalIncome - itSummary.personalExpense, {
                      showDecimals: false,
                      showSign: true,
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 print:text-slate-800 leading-relaxed">
            {report.itrRelevantNotes}
          </p>
        </CardContent>
      </Card>

      {/* Section 7: Recommendations (3 Numbered Cards) */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Actionable Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.map((rec, idx) => {
              const { title, detail } = splitRecommendation(rec, idx);
              return (
                <div
                  key={idx}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 print:bg-white print:border-slate-300 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 font-tabular">
                      {idx + 1}
                    </span>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white print:text-slate-900 leading-snug">
                      {title}
                    </h3>
                  </div>
                  {detail && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 print:text-slate-700 leading-relaxed">
                      {detail}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 8: Report Metadata */}
      <Card className="print-break-avoid print:border-slate-300 print:bg-white">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Generated at</div>
              <div className="font-medium text-slate-900 dark:text-white print:text-slate-900 mt-0.5 font-tabular">
                {formatAnalyticsDateTime(activeReport.generated_at)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Period analysed</div>
              <div className="font-medium text-slate-900 dark:text-white print:text-slate-900 mt-0.5 font-tabular">
                {periodLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Transactions analysed</div>
              <div className="font-medium text-slate-900 dark:text-white print:text-slate-900 mt-0.5 font-tabular">
                {(activeReport?.txn_count ?? 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Model</div>
              <div className="font-medium text-slate-900 dark:text-white print:text-slate-900 mt-0.5">
                Gemini Pro ({activeReport.model_used || 'gemini-pro'})
              </div>
            </div>
          </div>
          <p className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 print:border-slate-300 text-[11px] text-slate-500 dark:text-slate-400 print:text-slate-600">
            Self-transfers excluded. Review-status transactions excluded. Read-only financial analysis.
          </p>
        </CardContent>
      </Card>

      {/* Report History (Collapsible, hidden in PDF print) */}
      {history.length > 0 && (
        <div className="screen-only">
          <Card>
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-xl cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                  Previous Reports ({history.length})
                </span>
              </div>
              {historyOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {historyOpen && (
              <div className="px-6 pb-5 pt-1 border-t border-slate-200 dark:border-slate-800">
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {history.map((item) => {
                    const isSelected = item.id === activeReport.id;
                    const itemPeriod = `${formatAnalyticsDate(
                      item.period_from || item.summary_json?.period?.from
                    )} – ${formatAnalyticsDate(
                      item.period_to || item.summary_json?.period?.to
                    )}`;
                    const score = item.report_json?.overallHealthScore ?? 5;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectReport(item)}
                        className={`w-full py-3 px-3 flex flex-wrap items-center justify-between gap-3 text-left text-xs transition-colors rounded-lg cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-medium'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold font-tabular">
                            {formatAnalyticsDateTime(item.generated_at)}
                            {isSelected && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                Viewing
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Period: {itemPeriod}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-tabular">
                          <span className="text-slate-500 dark:text-slate-400">
                            {(item?.txn_count ?? 0).toLocaleString('en-IN')} txns
                          </span>
                          <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold">
                            Score {score}/10
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
