'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import type { GeneratedMonthlyReport } from '../../lib/ai/monthly-report';
import { apiPost } from '../../lib/api-client';
import {
  FileText,
  Copy,
  Printer,
  RefreshCw,
  Sparkles,
  Check,
  Clock,
  ShieldCheck,
  X,
  AlertCircle,
} from 'lucide-react';

interface MonthlyReportProps {
  isOpen?: boolean;
  onClose?: () => void;
  defaultMonth?: string;
}

const LAST_RUN_KEY = 'zaboraa_monthly_report_last_run';
const CACHED_REPORT_KEY = 'zaboraa_cached_monthly_report';
const AI_ENABLED_KEY = 'zaboraa_ai_enabled';

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  isOpen = true,
  onClose,
  defaultMonth,
}) => {
  const [report, setReport] = useState<GeneratedMonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastRunMinutesAgo, setLastRunMinutesAgo] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isEnabled = localStorage.getItem(AI_ENABLED_KEY) === 'true';
      setAiEnabled(isEnabled);

      // Check last run timestamp
      const lastRunStr = localStorage.getItem(LAST_RUN_KEY);
      if (lastRunStr) {
        const lastRunTime = parseInt(lastRunStr, 10);
        const mins = Math.floor((Date.now() - lastRunTime) / 60000);
        setLastRunMinutesAgo(mins);
      }

      // Check cached report
      const cached = localStorage.getItem(CACHED_REPORT_KEY);
      if (cached) {
        try {
          setReport(JSON.parse(cached));
        } catch {
          // Ignore
        }
      }
    }
  }, []);

  const handleGenerate = async (force: boolean = false) => {
    if (!aiEnabled) {
      setErrorMessage('AI features are disabled. Please enable in Settings > AI.');
      return;
    }

    // Rate limit check: max 1 per hour (60 minutes) unless forced
    if (!force && lastRunMinutesAgo !== null && lastRunMinutesAgo < 60 && report) {
      setErrorMessage(`Report was generated ${lastRunMinutesAgo} minutes ago. Reports are limited to once per hour.`);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiPost('/api/ai/monthly-report', { month: defaultMonth });
      if (data.success && data.report) {
        setReport(data.report);
        const now = Date.now();
        localStorage.setItem(LAST_RUN_KEY, String(now));
        localStorage.setItem(CACHED_REPORT_KEY, JSON.stringify(data.report));
        setLastRunMinutesAgo(0);
      } else {
        setErrorMessage(data.error || 'Failed to generate report from Gemini 2.5 Pro.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error while contacting AI report service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!report?.markdown) return;
    navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  // Render markdown with styled formatting
  const renderMarkdownContent = (md: string) => {
    const lines = md.split('\n');
    return (
      <div className="space-y-3 text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed print:text-black">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('## ')) {
            return (
              <h2
                key={idx}
                className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white pt-2 pb-1 border-b border-slate-200 dark:border-slate-800 print:text-black"
              >
                {trimmed.replace('## ', '')}
              </h2>
            );
          }
          if (trimmed.startsWith('### ')) {
            return (
              <h3
                key={idx}
                className="font-heading font-semibold text-sm sm:text-base text-indigo-600 dark:text-indigo-400 pt-2 print:text-black"
              >
                {trimmed.replace('### ', '')}
              </h3>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const content = trimmed.slice(2);
            return (
              <li key={idx} className="ml-4 list-disc text-slate-700 dark:text-slate-300 print:text-black">
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
              </li>
            );
          }
          if (/^\d+\.\s/.test(trimmed)) {
            const content = trimmed.replace(/^\d+\.\s/, '');
            return (
              <li key={idx} className="ml-4 list-decimal text-slate-700 dark:text-slate-300 print:text-black">
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
              </li>
            );
          }
          if (trimmed === '') {
            return <div key={idx} className="h-1" />;
          }
          return (
            <p key={idx} className="text-slate-700 dark:text-slate-300 print:text-black">
              <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />
            </p>
          );
        })}
      </div>
    );
  };

  function formatInlineMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-white print:text-black">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">$1</code>');
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:fixed-none">
      <div className="w-full max-w-3xl my-8 bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:border-none print:shadow-none">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  Monthly Financial Intelligence Report
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800">
                  gemini-2.5-pro
                </span>
              </div>
              <p className="text-xs text-slate-500">
                AI narrative synthesis with category breakdown and tax strategy recommendations
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            {lastRunMinutesAgo !== null ? (
              <span>Report generated {lastRunMinutesAgo === 0 ? 'just now' : `${lastRunMinutesAgo} min ago`}</span>
            ) : (
              <span>No report generated yet this hour</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {report && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copied ? 'Copied' : 'Copy Report'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                >
                  Export as PDF
                </Button>
              </>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleGenerate(true)}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              {report ? 'Re-generate' : 'Generate Monthly Report'}
            </Button>
          </div>
        </div>

        {/* Alert / Error Bar */}
        {errorMessage && (
          <div className="m-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 print:hidden">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 print:p-0 print:overflow-visible">
          {!report && !isLoading && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Ready to synthesize this month's financials
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Click Generate to securely analyze category aggregates, business vs personal allocation, and cost-reduction opportunities with Gemini 2.5 Pro.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleGenerate(false)}
                leftIcon={<Sparkles className="w-4 h-4" />}
                className="mt-2"
              >
                Generate Monthly Report
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
              <p className="font-heading font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Generating narrative review with gemini-2.5-pro...
              </p>
              <p className="text-xs text-slate-500">
                Aggregating PII-masked metrics and preparing structured financial breakdown.
              </p>
            </div>
          )}

          {report && !isLoading && (
            <div className="space-y-6">
              {/* Report Body */}
              <div className="p-6 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 print:bg-white print:border-none print:p-0">
                {renderMarkdownContent(report.markdown)}
              </div>

              {/* Disclaimer Notice */}
              <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between gap-3 print:text-black">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Generated by Gemini 2.5 Pro — verify figures against your ledger. Strictly PII-masked prior to synthesis.
                  </span>
                </div>
                <span className="font-mono text-[10px] shrink-0">
                  {new Date(report.generatedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
