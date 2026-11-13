import React, { useState } from 'react';
import { ZaboraaWordmark } from '../ui/ZaboraaWordmark';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Card, CardContent } from '../ui/Card';
import {
  ShieldCheck,
  Layers,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  CheckCircle,
  FileText,
  Building2,
  Receipt,
  Sparkles,
} from 'lucide-react';

interface LandingSkeletonProps {
  onLoginClick?: () => void;
}

export const LandingSkeleton: React.FC<LandingSkeletonProps> = ({ onLoginClick }) => {
  const [loginAlert, setLoginAlert] = useState(false);

  const handleLogin = () => {
    if (onLoginClick) {
      onLoginClick();
    } else {
      setLoginAlert(true);
      setTimeout(() => setLoginAlert(false), 4000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract (Section 2 of Frontend Design: 1-row, 3-zone contract) */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark (Single text element) */}
          <a href="https://finance.zaboraa.com" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md">
            <ZaboraaWordmark size="md" />
          </a>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#pillars"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0"
            >
              Core Engine
            </a>
            <a
              href="#security"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0"
            >
              Security & Privacy
            </a>
            <a
              href="#itr"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0"
            >
              ITR & Tax
            </a>
            <a
              href="#architecture"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action + Theme Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <Button
              variant="primary"
              size="md"
              data-testid="login-button"
              onClick={handleLogin}
              leftIcon={
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
              }
            >
              Login with Google
            </Button>
          </div>
        </div>
      </header>

      {/* Login notification toast for Batch 0 */}
      {loginAlert && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-sm">Private Portal Authentication</p>
              <p className="text-slate-300 mt-1">
                Configure VITE_GOOGLE_CLIENT_ID to enable direct Google Identity Services sign-in for finance.zaboraa.com.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section with Soft Indigo -> Teal Gradient Mesh (PRD Section 6.4) */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Soft gradient mesh behind hero: indigo #4F46E5 -> teal #0EA5E9 at low opacity */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 pointer-events-none opacity-20 dark:opacity-25"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 20%, #4F46E5 0%, transparent 45%), radial-gradient(circle at 75% 45%, #0EA5E9 0%, transparent 40%)`,
          }}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Privacy badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Private Personal Accounting Portal · India (FY Apr–Mar)</span>
          </div>

          {/* Hero Headline */}
          <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl text-slate-900 dark:text-white tracking-tight text-balance leading-tight">
            Your money,{' '}
            <span className="text-indigo-600 dark:text-indigo-400">clearly accounted.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Replace chaotic spreadsheets with a high-integrity, automated ledger.
            Ingest statements across 5–10 Indian bank accounts, eliminate duplicate entries,
            and generate audit-proof ITR profit and tax summaries.
          </p>

          {/* CTA Group */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="primary"
              size="lg"
              onClick={handleLogin}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Access Private Vault
            </Button>
            <a
              href="#pillars"
              className="inline-flex items-center justify-center py-2.5 px-5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Explore Architecture &rarr;
            </a>
          </div>

          {/* Public Promise: Zero Data Guarantee (PRD §1 & §2) */}
          <div className="mt-12 pt-8 border-t border-slate-200/60 dark:border-slate-800/60 max-w-2xl mx-auto flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Zero financial data on public web
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Strict Row-Level Security (RLS)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Read-only money movement
            </span>
          </div>
        </div>
      </section>

      {/* Core Engine Section (4 Pillars) */}
      <section id="pillars" className="py-16 bg-white dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              System Capabilities
            </span>
            <h2 className="mt-2 font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
              Built for precision, privacy, and Indian taxation
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Designed specifically around the quirks of Indian banking statements, UPI handles,
              credit card billing cycles, and ITR classification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Pillar 1 */}
            <Card className="p-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
                Multi-Account Registry
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Register 5–10 accounts (HDFC, SBI, ICICI, Kotak, Paytm, GPay). Auto-matched on upload via account number, customer ID, or last 4 digits.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                Health dot alerts (<span className="text-green-600 font-bold">&lt;7d</span>, <span className="text-amber-600 font-bold">7–30d</span>, <span className="text-red-600 font-bold">&gt;30d</span>)
              </div>
            </Card>

            {/* Pillar 2 */}
            <Card className="p-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
                3-Layer Deduplication
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Layer 1 file hash check, Layer 2 period overlap warning, and Layer 3 multiset transaction-level matching. Overlapping statements never create duplicates.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                Multiset occurrence accounting
              </div>
            </Card>

            {/* Pillar 3 */}
            <Card className="p-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <Receipt className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
                Transfer & Card Discipline
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Auto-detects self-transfers between own accounts within ±1 day. Credit card spends are expensed on purchase; bill payments are transfers to avoid double counting.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                Zero double-counting of expenses
              </div>
            </Card>

            {/* Pillar 4 */}
            <Card className="p-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
                CA & ITR Reports
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Clear Personal vs Business segregation. Multi-tab Excel export, CA-ready PDF summaries, and running tax provisions for April–March financial years.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                Excel, PDF & Tally-compatible export
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Security & Architecture Section */}
      <section id="security" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Data Architecture
              </span>
              <h2 className="mt-2 font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
                Single-user privacy fortress
              </h2>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Zaboraa Finance is engineered for a single owner in India. It does not connect directly to bank credentials or UPI APIs.
                It processes statements you provide, and isolates all records under strict PostgreSQL Row-Level Security.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-1 rounded-md bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400 mt-0.5 shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Direct Google Identity + Allowlist Enforcement
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Only allowlisted owner emails can view records. Strangers see an unauthorized rejection state.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-1 rounded-md bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400 mt-0.5 shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Complete PII Masking on AI Operations
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Account numbers, PAN, customer IDs, and personal phone/names are stripped before any AI categorization.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-1 rounded-md bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400 mt-0.5 shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Encrypted Password-Protected Backups
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      One-click full vault export (JSON + Excel + PDF statements) packaged into an encrypted ZIP file.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Card */}
            <Card className="p-6 bg-slate-900 text-white border-slate-800">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs">
                <span className="font-heading font-bold text-indigo-400">Zaboraa Finance Pipeline</span>
                <span className="font-tabular text-slate-400">Domain: finance.zaboraa.com</span>
              </div>
              <div className="mt-5 space-y-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <span className="text-slate-400">01. INGESTION:</span> PDF / CSV / XLSX
                  <p className="text-slate-400 text-[11px] font-sans mt-1">
                    SHA-256 hash validation &rarr; Header parsing &rarr; Account matching
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <span className="text-slate-400">02. RECONCILIATION:</span> Opening + In - Out
                  <p className="text-slate-400 text-[11px] font-sans mt-1">
                    Mathematical balance verification before database commit
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <span className="text-slate-400">03. DEDUPLICATION:</span> Multiset Occurrences
                  <p className="text-slate-400 text-[11px] font-sans mt-1">
                    Prevents duplicate transactions while respecting legitimate identical charges
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <span className="text-indigo-300">04. REPORTING:</span> ITR-Ready & Tabular
                  <p className="text-slate-400 text-[11px] font-sans mt-1">
                    Tabular figures everywhere, FY-aware (Apr 1 – Mar 31), CA exports
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] py-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ZaboraaWordmark size="sm" />
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
            <span>https://finance.zaboraa.com</span>
          </div>
          <div className="flex items-center gap-6">
            <span>India FY: April–March</span>
            <span>Timezone: Asia/Kolkata</span>
            <span>Private Single-User Edition</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
