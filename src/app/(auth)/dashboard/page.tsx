'use client';

import React from 'react';
import { useAuth } from '../../../lib/auth';
import { DashboardWireframePreview } from '../../../components/showcase/DashboardWireframePreview';
import { Card, CardContent } from '../../../components/ui/Card';
import { ShieldCheck, UserCheck } from 'lucide-react';

export default function DashboardPlaceholderPage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Session Banner */}
      <Card className="bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50 p-4">
        <CardContent className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {user?.full_name || 'Wasim Sayyed'}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Verified Owner
                </span>
              </div>
              <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                {isLoading ? 'Loading...' : user?.email || 'wasimssayyed@gmail.com'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Private Vault · India FY 2026-27 · Row-Level Security Enforced
          </div>
        </CardContent>
      </Card>

      {/* Financial Overview & Interactive Widgets */}
      <DashboardWireframePreview />
    </div>
  );
}

