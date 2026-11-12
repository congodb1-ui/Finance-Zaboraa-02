import React, { useState, useEffect } from 'react';
import { LandingSkeleton } from './components/landing/LandingSkeleton';
import { DesignSystemPlayground } from './components/showcase/DesignSystemPlayground';
import { DashboardWireframePreview } from './components/showcase/DashboardWireframePreview';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ZaboraaWordmark } from './components/ui/ZaboraaWordmark';
import { Layers, Monitor, LayoutGrid, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'playground' | 'dashboard'>('landing');

  useEffect(() => {
    // Ensure dark mode initialization from local storage or OS preference
    const stored = localStorage.getItem('zaboraa_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Batch 0 Navigation & View Switcher Bar */}
      <div className="bg-slate-900 text-slate-200 border-b border-slate-800 text-xs py-2 px-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Batch Identifier */}
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-indigo-600 text-white font-heading font-bold text-[11px] flex items-center justify-center">
              Z
            </div>
            <span className="font-heading font-bold text-white tracking-tight">
              Zaboraa Finance
            </span>
            <span className="text-slate-500">|</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              <CheckCircle2 className="w-3 h-3" />
              Batch 0: Design System Locked
            </span>
          </div>

          {/* Interactive View Switcher Tabs */}
          <div className="flex items-center p-0.5 bg-slate-800 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('landing')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'landing'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Public Landing Skeleton</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('playground')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'playground'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Component Playground</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Dashboard Wireframe</span>
            </button>
          </div>

          {/* Domain & Theme Controls */}
          <div className="flex items-center gap-3">
            <a
              href="https://zaboraa.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-400 transition-colors font-mono"
            >
              <span>zaboraa.com</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <ThemeToggle showText={false} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" />
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <main className="flex-1">
        {activeTab === 'landing' && <LandingSkeleton onLoginClick={() => setActiveTab('dashboard')} />}

        {activeTab === 'playground' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <DesignSystemPlayground />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <DashboardWireframePreview />
          </div>
        )}
      </main>
    </div>
  );
}
