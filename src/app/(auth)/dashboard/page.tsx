'use client';

import React from 'react';
import { useAuth, signOut } from '../../../lib/auth';
import { ZaboraaWordmark } from '../../../components/ui/ZaboraaWordmark';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { LogOut, ShieldCheck, UserCheck } from 'lucide-react';

export default function DashboardPlaceholderPage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navigation Bar with Zaboraa Wordmark, Theme Toggle & Sign Out */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3">
            <ZaboraaWordmark size="md" />
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3 h-3" />
              Authenticated Session
            </span>
          </div>

          {/* Zone 3: Theme Toggle & Sign Out */}
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => signOut('/')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer select-none"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Batch 1 Dashboard Shell) */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Batch 1 · Auth Guard Verified
                  </span>
                  <CardTitle className="text-xl mt-1">Dashboard Shell</CardTitle>
                </div>
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <UserCheck className="w-5 h-5" />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 pt-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                You have successfully authenticated via Supabase Google OAuth.
                This page is protected by the <code className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 rounded font-mono text-indigo-600 dark:text-indigo-400">src/app/(auth)/layout.tsx</code> server guard.
              </p>

              {/* User Session Info Card */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Active Session Profile
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">User Email:</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {isLoading ? 'Loading...' : user?.email || 'wasimssayyed@gmail.com (Demo)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Display Name:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {isLoading ? 'Loading...' : user?.full_name || 'Owner'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">User ID (auth.uid):</span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate block">
                      {user?.id || 'usr_01j7bf93a8e9...'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Environment:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      Next.js 14 App Router + Supabase SSR
                    </span>
                  </div>
                </div>
              </div>

              {/* Batch 2 Next Step Note */}
              <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Next: <strong>Batch 2</strong> will implement Accounts CRUD, Categories Seed, and Balance Health Dots.</span>
                <button
                  type="button"
                  onClick={() => signOut('/')}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Test Sign Out &rarr;
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
