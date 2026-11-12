'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { Button } from '../../../components/ui/Button';
import { signOut, useAuth } from '../../../lib/auth';
import {
  SunMoon,
  LogOut,
  ShieldCheck,
  Lock,
  Database,
  Bell,
  User,
  KeyRound,
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

      {/* 2. Session & Sign Out */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Account Session</CardTitle>
          </div>
          <CardDescription>
            Currently signed in via Google OAuth. Only allowlisted emails can access this vault.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Signed in as:</span>
              <span className="font-medium font-mono text-slate-900 dark:text-slate-100 text-sm">
                {user?.email || 'wasimssayyed@gmail.com'}
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

      {/* 3. Placeholder Sections for Future Batches */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-slate-400">
          Planned Future Settings (Batches 6 & 7)
        </h3>

        {/* Account Security Placeholder */}
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <CardTitle className="text-sm">Account Security & Idle Logout</CardTitle>
            </div>
            <CardDescription className="text-xs">
              30-minute idle session timeout, allowlist verification, and active session controls (coming in Batch 7).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Data & Privacy Placeholder */}
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400" />
              <CardTitle className="text-sm">Data & Encrypted Backups</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Password-protected ZIP export, statement retention, and zero-PII storage audit (coming in Batch 7).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Notifications Placeholder */}
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-400" />
              <CardTitle className="text-sm">Alerts & Reminders</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Bill due date alerts and monthly ITR reconciliation notifications.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
