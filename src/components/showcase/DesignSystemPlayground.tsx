import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { KPICard } from '../ui/KPICard';
import {
  MetadataRow,
  TransactionTypeBadge,
  CategoryBadge,
  WorkspaceBadge,
} from '../ui/Badge';
import { AccountHealthDot } from '../ui/AccountHealthDot';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ZaboraaWordmark } from '../ui/ZaboraaWordmark';
import {
  CATEGORY_PALETTE,
  SEED_CATEGORIES,
  formatINR,
} from '../../types/design-system';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Building,
  CreditCard,
  Plus,
  Download,
  Search,
  Check,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export const DesignSystemPlayground: React.FC = () => {
  const [buttonLoading, setButtonLoading] = useState(false);
  const [tabularToggle, setTabularToggle] = useState(true);
  const [testAmount, setTestAmount] = useState<number>(142500.5);
  const [testDaysAgo, setTestDaysAgo] = useState<number>(3);

  const simulateLoading = () => {
    setButtonLoading(true);
    setTimeout(() => setButtonLoading(false), 2000);
  };

  return (
    <div className="space-y-12 pb-16">
      {/* Intro Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Batch 0 Design System
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="text-xs text-slate-500 font-mono">v2.1.0</span>
        </div>
        <h2 className="font-heading font-bold text-3xl text-slate-900 dark:text-white tracking-tight">
          Zaboraa Finance Component & Design Tokens
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
          Comprehensive design system based on Section 6 of the PRD. Enforces zero-pill metadata discipline,
          tabular figures for all financial amounts, strict single-brand-color focus (Indigo #4F46E5), and
          colorblind-safe credit/debit signaling.
        </p>
      </div>

      {/* 1. Typography & Tabular Figures */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
            1. Typography & Tabular Figures (PRD §6.1)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Toggle Tabular Nums:</span>
            <Button
              size="sm"
              variant={tabularToggle ? 'primary' : 'secondary'}
              onClick={() => setTabularToggle(!tabularToggle)}
            >
              {tabularToggle ? 'tabular-nums (ON)' : 'proportional (OFF)'}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Typeface Showcase */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Typeface Hierarchy
                </div>
                <div>
                  <span className="text-xs text-slate-500">Display / Headings:</span>
                  <p className="font-heading font-bold text-2xl text-slate-900 dark:text-white">
                    Manrope 700 — ₹12,45,000 Net Profit
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">UI / Body Text:</span>
                  <p className="font-sans text-sm text-slate-700 dark:text-slate-300">
                    Inter 400/500/600 — Clean legibility across dense banking tables, filters, and transaction ledgers.
                  </p>
                </div>
              </div>

              {/* Tabular vs Proportional Column Comparison */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Vertical Column Alignment Test ({tabularToggle ? 'Active: tabular-nums' : 'Active: proportional'})
                </div>
                <div
                  className={`p-4 rounded-lg bg-slate-50 dark:bg-slate-800/80 font-mono text-sm space-y-1.5 ${
                    tabularToggle ? 'font-tabular' : ''
                  }`}
                >
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1 text-xs text-slate-400">
                    <span>Transaction</span>
                    <span>Amount (INR)</span>
                  </div>
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>1. Client Consulting Fee</span>
                    <span>+ ₹1,11,111.11</span>
                  </div>
                  <div className="flex justify-between text-slate-900 dark:text-slate-100">
                    <span>2. Bank Interest Credit</span>
                    <span>+ ₹8,88,888.88</span>
                  </div>
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>3. Office Rent</span>
                    <span>− ₹1,00,000.00</span>
                  </div>
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>4. Software Subscriptions</span>
                    <span>− ₹2,22,222.22</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Color System & Fixed Category Palette */}
      <section className="space-y-4">
        <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
          2. Color System & 10-Color Categorical Palette (PRD §6.2, §6.3)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Functional Semantics */}
          <Card>
            <CardHeader>
              <CardTitle>Semantic Roles</CardTitle>
              <CardDescription>Strict single-role color assignment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  Brand / Primary Focus
                </span>
                <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                  #4F46E5 / #6366F1
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800">
                <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                  Income / Credit (+ sign mandatory)
                </span>
                <span className="font-mono text-xs text-green-600 dark:text-green-400">
                  #16A34A / #22C55E
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Expense / Debit (− sign mandatory)
                </span>
                <span className="font-mono text-xs text-red-600 dark:text-red-400">
                  #DC2626 / #F87171
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Warning / Review Pending
                </span>
                <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                  #D97706 / #FBBF24
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Self-Transfer / Neutral
                </span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  #64748B / #94A3B8
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Fixed 10-Color Palette */}
          <Card>
            <CardHeader>
              <CardTitle>Fixed 10-Color Categorical Palette</CardTitle>
              <CardDescription>
                Deterministic category assignment so Food is always same color across all charts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {CATEGORY_PALETTE.map((hex, idx) => (
                  <div
                    key={hex}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-1.5"
                  >
                    <div
                      className="w-7 h-7 rounded-md shadow-xs"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[10px] text-slate-500">{hex}</span>
                    <span className="text-[10px] text-slate-400">Slot {idx}</span>
                  </div>
                ))}
              </div>

              {/* Seed Categories Preview */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-2 font-medium">Sample Seed Categories:</div>
                <div className="flex flex-wrap gap-2">
                  {SEED_CATEGORIES.slice(0, 8).map((cat) => (
                    <CategoryBadge key={cat.id} name={cat.name} color={cat.color} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 3. Button Component Matrix */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
            3. Button Component Matrix (PRD §6.2)
          </h3>
          <Button size="sm" variant="secondary" onClick={simulateLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Test Loading Spinner
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-6">
            {/* Variants */}
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Variants (Indigo is single brand accent)
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" isLoading={buttonLoading} leftIcon={<Plus className="w-4 h-4" />}>
                  Primary Button
                </Button>
                <Button variant="secondary" isLoading={buttonLoading} leftIcon={<Download className="w-4 h-4" />}>
                  Secondary Action
                </Button>
                <Button variant="outline" isLoading={buttonLoading}>
                  Outline Button
                </Button>
                <Button variant="ghost" isLoading={buttonLoading}>
                  Ghost Action
                </Button>
                <Button variant="destructive" isLoading={buttonLoading}>
                  Confirm Delete
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            {/* Sizes */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Sizes (Sm: 32px, Md: 40px, Lg: 44px)
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="primary">
                  Small (sm)
                </Button>
                <Button size="md" variant="primary">
                  Medium (md)
                </Button>
                <Button size="lg" variant="primary">
                  Large (lg)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. KPI Cards & Financial Metrics */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
            4. KPI Cards & Tabular Numbers (PRD §4.5)
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Live Amount Slider:</span>
            <input
              type="range"
              min="0"
              max="500000"
              step="1000"
              value={testAmount}
              onChange={(e) => setTestAmount(Number(e.target.value))}
              className="w-32 accent-indigo-600"
            />
            <span className="font-tabular font-bold text-xs text-indigo-600 dark:text-indigo-400">
              {formatINR(testAmount)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="This Month Income"
            amount={testAmount}
            type="income"
            changePercentage={14.2}
            changeLabel="vs last month"
            icon={<ArrowDownLeft className="w-4 h-4 text-green-600 dark:text-green-400" />}
          />
          <KPICard
            title="This Month Expense"
            amount={64820.5}
            type="expense"
            changePercentage={-5.8}
            changeLabel="vs last month"
            icon={<ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />}
          />
          <KPICard
            title="Net Profit"
            amount={testAmount - 64820.5}
            type="net"
            subtitle="FY 2026–27 Q3"
            icon={<Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          />
          <KPICard
            title="Credit Card Balance"
            amount={-42350.0}
            type="balance"
            subtitle="Due on 18 Nov 2026"
            icon={<CreditCard className="w-4 h-4 text-red-600 dark:text-red-400" />}
          />
        </div>
      </section>

      {/* 5. Account Health Indicators */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
            5. Account Health Status (PRD §4.2)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Simulate Days Ago:</span>
            <div className="flex gap-1">
              {[2, 12, 45].map((d) => (
                <button
                  key={d}
                  onClick={() => setTestDaysAgo(d)}
                  className={`px-2 py-0.5 text-xs font-medium rounded-md border ${
                    testDaysAgo === d
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Accounts list shows color dot + explicit text label for colorblind accessibility:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">HDFC Salary Main</div>
                  <div className="text-[11px] text-slate-500">Last imported: 2 days ago</div>
                </div>
                <AccountHealthDot daysAgo={2} />
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">SBI Savings</div>
                  <div className="text-[11px] text-slate-500">Last imported: 14 days ago</div>
                </div>
                <AccountHealthDot daysAgo={14} />
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">ICICI Business Current</div>
                  <div className="text-[11px] text-slate-500">Last imported: 48 days ago</div>
                </div>
                <AccountHealthDot daysAgo={48} />
              </div>
            </div>

            <div className="pt-2 text-xs text-slate-500 flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Active Test State:</span>
              <AccountHealthDot daysAgo={testDaysAgo} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6. Zero-Pill Metadata & Transaction Badges */}
      <section className="space-y-4">
        <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
          6. Zero-Pill Metadata & Transaction Badges (PRD §6.2)
        </h3>

        <Card>
          <CardContent className="space-y-6">
            {/* Unboxed Metadata row */}
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Unboxed Metadata Row (Zero-Pill Discipline)
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
                <MetadataRow
                  items={[
                    <span key="1" className="font-semibold text-slate-900 dark:text-white">HDFC Statement Oct 2026</span>,
                    'SHA-256 Verified',
                    '148 rows imported',
                    '0 duplicates skipped',
                    'Parser v2.1.0',
                  ]}
                />
              </div>
            </div>

            {/* Semantic Badges */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Transaction Status Badges (Subtle, non-pill, with + / − / arrows)
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TransactionTypeBadge type="credit" />
                <TransactionTypeBadge type="debit" />
                <TransactionTypeBadge type="transfer" />
                <TransactionTypeBadge type="pending" />
                <WorkspaceBadge workspace="Business" />
                <WorkspaceBadge workspace="Personal" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 7. Form Controls */}
      <section className="space-y-4">
        <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
          7. Form Input & Select Primitives
        </h3>

        <Card>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Input
                label="Account Nickname"
                placeholder="e.g. HDFC Main Savings"
                defaultValue="HDFC Savings - Main"
                helperText="Identifies account in dropdowns and statements"
              />
              <Input
                label="Search Transactions"
                placeholder="Payee, UTR, amount..."
                leftIcon={<Search className="w-4 h-4" />}
              />
              <Select
                label="Financial Year (FY)"
                options={[
                  { value: '2026-27', label: 'FY 2026–27 (Current)' },
                  { value: '2025-26', label: 'FY 2025–26' },
                  { value: '2024-25', label: 'FY 2024–25' },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 8. Wordmark Variations */}
      <section className="space-y-4">
        <h3 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
          8. Wordmark & Identity (PRD §1 — Brand: Zaboraa)
        </h3>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-8 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/80">
              <div>
                <span className="text-xs text-slate-400 block mb-1">Small (sm)</span>
                <ZaboraaWordmark size="sm" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Medium (md)</span>
                <ZaboraaWordmark size="md" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Large (lg)</span>
                <ZaboraaWordmark size="lg" />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Wordmark specifications: &quot;Zaboraa&quot; (Manrope 700) + &quot;Finance&quot; (Inter 400), indigo #4F46E5.
              Double &apos;a&apos; brand spelling strictly enforced.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
