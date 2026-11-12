'use client';

import React from 'react';
import { ChatInterface } from '../../../components/ai/ChatInterface';
import { Sparkles, ShieldCheck } from 'lucide-react';

export default function AskYourDataPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Intelligence Layer
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Ask-Your-Data Chat
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Zero SQL Injection Risk • Allowlisted Parameter Verification</span>
        </div>
      </div>

      {/* Main Chat Interface */}
      <ChatInterface />
    </div>
  );
}
