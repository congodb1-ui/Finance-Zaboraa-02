'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { Button } from '../../../components/ui/Button';
import { signOut, useAuth } from '../../../lib/auth';
import { BackupSection } from '../../../components/settings/BackupSection';
import {
  SunMoon,
  LogOut,
  ShieldCheck,
  Lock,
  Database,
  Bell,
  User,
  KeyRound,
  Sparkles,
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Settings Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>Zaboraa Finance</span>
          <span>·</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">Portal Configuration</span>
        </div>
        <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
          Settings & Preferences
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Manage your interface theme, session security, and account preferences
        </p>
      </div>

      {/* 1. Theme Setting */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SunMoon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Interface Theme</CardTitle>
          </div>
          <CardDescription>
            Switch between light mode (#F8FAFC) and dark navy (#0B1120) with high-contrast accessibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-2">
          <div>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
              Theme Mode
            </span>
            <span className="text-xs text-slate-500">
              Persisted in local preferences and synchronized with system defaults
            </span>
          </div>
          <ThemeToggle showText={true} />
        </CardContent>
      </Card>

      {/* 2. Gemini AI Intelligence Settings (Batch 6) */}
      <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>Gemini AI Intelligence Engine</CardTitle>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
              Batch 6 Active
            </span>
          </div>
          <CardDescription>
            Master AI toggle, Gemini 2.5 Flash / Pro model telemetry, PII masking rules, and connection diagnostic tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Automated categorization, machine narration cleaning, anomaly detection, and Ask-Your-Data chat.
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => (window.location.hash = 'settings/ai')}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Configure AI
          </Button>
        </CardContent>
      </Card>

      {/* 3. Encrypted Vault Backup (Batch 7) */}
      <BackupSection />

      {/* 4. Session & Sign Out */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Account Session & Security</CardTitle>
          </div>
          <CardDescription>
            Currently signed in via Google OAuth. Only allowlisted emails can access this vault. Automatic 30-minute idle logout active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Signed in as:</span>
              <span className="font-medium font-mono text-slate-900 dark:text-slate-100 text-sm">
                {user?.email || 'wasimssayyed@gmail.com'}
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Single-user vault protection active • 30-min idle timeout
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => signOut('/')}
              leftIcon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign out of Zaboraa Finance
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
