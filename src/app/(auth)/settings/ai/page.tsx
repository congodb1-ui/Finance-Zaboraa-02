'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { apiPost } from '../../../../lib/api-client';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Lock,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';

const AI_ENABLED_KEY = 'zaboraa_ai_enabled';

export default function AISettingsPage() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState<string>('Testing Gemini API connectivity...');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Load persisted AI enabled state (default false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const enabled = localStorage.getItem(AI_ENABLED_KEY) === 'true';
      setAiEnabled(enabled);
    }
  }, []);

  // Ping Gemini test call on load
  const pingConnection = async () => {
    setApiStatus('checking');
    setStatusMessage('Checking server environment key & Gemini API response...');

    try {
      const data = await apiPost('/api/ai/test');
      if (data && data.success) {
        setApiStatus('connected');
        setStatusMessage('Connected (GEMINI_API_KEY verified active on server)');
        if (data.raw) setTestResponse(data.raw);
      } else {
        setApiStatus('error');
        setStatusMessage(data?.message || 'API key error — check your server GEMINI_API_KEY environment variable.');
      }
    } catch (err: any) {
      setApiStatus('error');
      setStatusMessage('API key error — check your server GEMINI_API_KEY environment variable.');
    }
  };

  useEffect(() => {
    pingConnection();
  }, []);

  const handleToggleAi = () => {
    const nextVal = !aiEnabled;
    setAiEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AI_ENABLED_KEY, String(nextVal));
    }
  };

  const handleManualTest = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      const data = await apiPost('/api/ai/test');
      if (data && data.success) {
        setTestResponse(`Status: 200 OK\nModel: ${data.model || 'gemini-2.5-flash'}\nResponse:\n${data.raw || 'CONNECTED'}`);
        setApiStatus('connected');
        setStatusMessage('Connected (GEMINI_API_KEY verified active on server)');
      } else {
        setTestResponse(`Error: ${data?.message || 'Connection failed'}`);
        setApiStatus('error');
        setStatusMessage(data?.message || 'API key error — check your environment variable');
      }
    } catch (err: any) {
      setTestResponse(`Error: ${err.message}`);
      setApiStatus('error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 pb-20">
      {/* Header & Breadcrumb */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <button
              type="button"
              onClick={() => (window.location.hash = 'settings')}
              className="hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">AI Intelligence Engine</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Gemini AI Settings & Telemetry
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure automated categorization, description cleaning, anomaly alerts, and conversational Ask-Your-Data.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={pingConnection}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${apiStatus === 'checking' ? 'animate-spin' : ''}`} />}
          >
            Re-check API
          </Button>
        </div>
      </div>

      {/* 1. Master Switch Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Enable AI Features (Master Switch)</CardTitle>
              <CardDescription className="text-xs mt-1">
                When enabled, Zaboraa uses Google Gemini for smart transaction categorization, description cleaning, and Ask-Your-Data chat. When disabled, the portal operates strictly via rule-engine automation with zero external AI calls.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={handleToggleAi}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                aiEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              role="switch"
              aria-checked={aiEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  aiEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                aiEnabled ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Status: {aiEnabled ? 'AI Features Active' : 'AI Features Disabled'}
            </span>
            <span className="text-slate-400">
              (Stored in localStorage key <code className="font-mono text-[11px]">zaboraa_ai_enabled</code>)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 2. API Status & Model Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* API Status Indicator Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-sm">API Key Status</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Server-side verification of GEMINI_API_KEY (never exposed in client bundle).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                apiStatus === 'connected'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : apiStatus === 'checking'
                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              }`}
            >
              {apiStatus === 'connected' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : apiStatus === 'checking' ? (
                <RefreshCw className="w-4 h-4 text-slate-500 animate-spin shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="font-semibold block">
                  {apiStatus === 'connected' ? 'Connected' : apiStatus === 'checking' ? 'Checking...' : 'API Key Error'}
                </span>
                <p className="text-[11px] leading-relaxed opacity-90">{statusMessage}</p>
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              Rate limiting: In-memory token bucket enforced at 50 requests/minute.
            </div>
          </CardContent>
        </Card>

        {/* Model Architecture Info (Read-Only) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-sm">Assigned AI Models</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Architectural model split as specified in Zaboraa Finance PRD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Categorization & Chat:</span>
                <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  gemini-2.5-flash
                </span>
              </div>
              <p className="text-[11px] text-slate-400">High-throughput sub-second latency for categorization, cleaning & chat.</p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Monthly Report:</span>
                <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                  gemini-2.5-pro
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Deep financial reasoning for narrative monthly reviews (once/month).</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Non-Dismissable Privacy Notice */}
      <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
        <CardContent className="p-5 flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1 text-xs">
            <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
              Data Privacy & Redaction Policy (Non-Negotiable)
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              Transaction descriptions are sanitized before being sent to Google Gemini for analysis. Account numbers, PAN, Aadhaar, full name, mobile numbers, emails, addresses, and exact balances are <strong>NEVER</strong> sent. All AI calls pass through a local regex sanitization layer before egress.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Test AI Connection Button & Output */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Test AI Connection</CardTitle>
          <CardDescription className="text-xs">
            Send a single test prompt to verify end-to-end communication with the Gemini model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualTest}
            isLoading={isTesting}
            leftIcon={<Sparkles className="w-4 h-4 text-indigo-500" />}
          >
            Send Test Prompt
          </Button>

          {testResponse && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Raw Response Output
              </span>
              <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800">
                {testResponse}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
