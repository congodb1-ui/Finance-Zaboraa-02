'use client';

import React, { useState, useEffect } from 'react';
import type { DetectedAnomaly } from '../../lib/ai/anomalies';
import { formatINR } from '../../types/design-system';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Info,
} from 'lucide-react';

interface AnomalyBannerProps {
  onViewTransaction?: (transactionId: string) => void;
  onRefresh?: () => void;
}

const DISMISSED_KEY = 'zaboraa_dismissed_anomalies';
const AI_ENABLED_KEY = 'zaboraa_ai_enabled';

export const AnomalyBanner: React.FC<AnomalyBannerProps> = ({ onViewTransaction }) => {
  const [anomalies, setAnomalies] = useState<DetectedAnomaly[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check localStorage for AI enabled state & dismissed anomalies
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isEnabled = localStorage.getItem(AI_ENABLED_KEY) === 'true';
      setAiEnabled(isEnabled);

      try {
        const savedDismissed = localStorage.getItem(DISMISSED_KEY);
        if (savedDismissed) {
          setDismissedIds(JSON.parse(savedDismissed));
        }
      } catch {
        // Fallback
      }
    }
  }, []);

  // Fetch anomalies from backend
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!aiEnabled) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch('/api/ai/anomalies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceRefresh: false }),
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.anomalies)) {
            setAnomalies(data.anomalies);
          }
        }
      } catch (err) {
        console.warn('Failed to load anomalies:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [aiEnabled]);

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
    }
  };

  // Filter only high & medium severity anomalies that have not been dismissed
  const visibleAnomalies = anomalies.filter(
    (a) =>
      (a.severity === 'high' || a.severity === 'medium') &&
      !dismissedIds.includes(a.transaction_id)
  );

  // If AI is disabled: show muted reminder banner
  if (!aiEnabled) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 p-3.5 flex items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>AI Anomaly Detection is unavailable — enable in Settings to scan recent transactions.</span>
        </div>
        <button
          type="button"
          onClick={() => (window.location.hash = 'settings/ai')}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
        >
          Configure AI →
        </button>
      </div>
    );
  }

  // If loading or no high/medium anomalies exist
  if (isLoading || visibleAnomalies.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 backdrop-blur-xs overflow-hidden shadow-xs transition-all">
      {/* Banner Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-900/20 transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-sm text-amber-900 dark:text-amber-200">
                🔍 AI Anomaly Alert
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-200/80 dark:bg-amber-800/60 text-amber-900 dark:text-amber-200">
                {visibleAnomalies.length} {visibleAnomalies.length === 1 ? 'item' : 'items'} found
              </span>
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Gemini 2.5 Flash identified unusual transaction patterns in the last 90 days.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-200/50 dark:hover:bg-amber-800/50 transition-colors"
          aria-label={isExpanded ? 'Collapse anomalies' : 'Expand anomalies'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Anomaly Cards */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-amber-200/60 dark:border-amber-900/40">
          {visibleAnomalies.map((anomaly) => {
            const isHigh = anomaly.severity === 'high';
            const tx = anomaly.transaction;

            return (
              <div
                key={anomaly.transaction_id}
                className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/50 dark:border-amber-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isHigh
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-900'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                      }`}
                    >
                      {anomaly.severity} severity
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {anomaly.anomaly_type.replace('_', ' ')}
                    </span>
                    {tx && (
                      <span className="text-slate-400 font-mono text-[11px]">
                        • {tx.txn_date} • {formatINR(tx.amount)}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                    {anomaly.explanation}
                  </p>
                  {tx && (
                    <p className="text-slate-400 text-[10px] truncate max-w-md">
                      Desc: {tx.description}
                    </p>
                  )}
                </div>

                {/* Actions: View & Dismiss */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (onViewTransaction) {
                        onViewTransaction(anomaly.transaction_id);
                      } else {
                        window.location.hash = `transactions?search=${encodeURIComponent(
                          anomaly.transaction_id
                        )}`;
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium transition-colors cursor-pointer"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDismiss(anomaly.transaction_id, e)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
