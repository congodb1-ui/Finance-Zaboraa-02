'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api-client';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  AnalyticsReportView,
  formatAnalyticsDateTime,
} from '../../../components/analytics/AnalyticsReportView';
import type { AnalyticsReportRecord } from '../../../types/analytics';
import {
  AlertCircle,
  BarChart3,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { PageErrorBoundary } from '../../../components/ui/PageErrorBoundary';

export default function AnalyticsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Analytics View Error">
      <AnalyticsPageContent />
    </PageErrorBoundary>
  );
}

function AnalyticsPageContent() {
  const [reports, setReports] = useState<AnalyticsReportRecord[]>([]);
  const [activeReport, setActiveReport] = useState<AnalyticsReportRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiGet<{ reports: AnalyticsReportRecord[] }>(
        '/api/analytics/reports'
      );
      const list = Array.isArray(data?.reports) ? data.reports : [];
      setReports(list);
      setActiveReport(list[0] || null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load analytics reports.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const res = await apiPost<{ report: AnalyticsReportRecord }>(
        '/api/analytics/generate',
        {}
      );
      if (res?.report) {
        setReports((prev) => [
          res.report,
          ...prev.filter((r) => r.id !== res.report.id),
        ].slice(0, 10));
        setActiveReport(res.report);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Failed to generate AI financial report. Please try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = () => {
    window.print();
  };

  const latestGeneratedText = activeReport
    ? `Generated on ${formatAnalyticsDateTime(activeReport.generated_at)}`
    : reports[0]
    ? `Generated on ${formatAnalyticsDateTime(reports[0].generated_at)}`
    : 'Last report: Never';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Bar (hidden on PDF print) */}
      <div className="screen-only flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              AI Analytics
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Financial Analytics & Consolidated Report
          </h1>
          {!isLoading && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-tabular">
              {latestGeneratedText}
            </p>
          )}
        </div>

        {activeReport && !isLoading && (
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportPdf}
              disabled={isGenerating}
              className="whitespace-nowrap shrink-0 gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Export PDF</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="whitespace-nowrap shrink-0 gap-1.5"
            >
              {!isGenerating && <RefreshCw className="w-4 h-4" />}
              <span>{isGenerating ? 'Analysing...' : 'Regenerate'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Error / Cooldown Banner */}
      {errorMsg && (
        <div
          role="alert"
          className="screen-only p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <Card>
          <CardContent className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Loading saved financial reports...
            </p>
          </CardContent>
        </Card>
      ) : isGenerating && !activeReport ? (
        /* Initial Generation Pending State */
        <Card>
          <CardContent className="py-20 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <h2 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
              Analysing Your Confirmed Transactions...
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
              Aggregating cash flow trends, category splits, and workspace figures with PII-masked summaries via Gemini Pro.
            </p>
          </CardContent>
        </Card>
      ) : !activeReport ? (
        /* State A — No report yet */
        <Card>
          <CardContent className="py-16 px-6 flex flex-col items-center justify-center text-center space-y-5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>

            <div className="space-y-2 max-w-lg">
              <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">
                Consolidated AI Financial Report
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Generate a read-only, structured analysis of your complete confirmed transaction history, monthly cash flow, category breakdown, ITR split, and financial health score.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="whitespace-nowrap shrink-0 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analyse My Finances</span>
            </Button>

            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <p className="font-medium font-tabular">{latestGeneratedText}</p>
              <p>
                Note: Analysis uses all confirmed transactions. Review-status transactions are excluded.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* State B — Report Ready */
        <AnalyticsReportView
          activeReport={activeReport}
          history={reports}
          onSelectReport={(rep) => {
            setActiveReport(rep);
            setErrorMsg(null);
          }}
        />
      )}
    </div>
  );
}
