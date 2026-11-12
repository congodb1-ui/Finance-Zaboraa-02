import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { KPICard } from '../ui/KPICard';
import { AccountHealthDot } from '../ui/AccountHealthDot';
import { CategoryBadge, WorkspaceBadge, MetadataRow } from '../ui/Badge';
import { formatINR } from '../../types/design-system';
import {
  Upload,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Building,
  CreditCard,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';

export const DashboardWireframePreview: React.FC = () => {
  const [workspaceFilter, setWorkspaceFilter] = useState<'All' | 'Personal' | 'Business'>('All');
  const [fyFilter, setFyFilter] = useState<string>('2026-27');

  const mockAccounts = [
    {
      id: 'acc_1',
      name: 'HDFC Savings - Main',
      type: 'Savings',
      accountNumberMasked: '****4819',
      balance: 485200.0,
      daysAgo: 2,
    },
    {
      id: 'acc_2',
      name: 'SBI Salary Account',
      type: 'Salary',
      accountNumberMasked: '****9102',
      balance: 142800.5,
      daysAgo: 5,
    },
    {
      id: 'acc_3',
      name: 'ICICI Current - Business',
      type: 'Current',
      accountNumberMasked: '****3341',
      balance: 854300.0,
      daysAgo: 16,
    },
    {
      id: 'acc_4',
      name: 'Kotak White Credit Card',
      type: 'Credit Card',
      accountNumberMasked: '****7021',
      balance: -34500.0,
      daysAgo: 4,
      dueDate: '22 Nov 2026',
    },
    {
      id: 'acc_5',
      name: 'Paytm Wallet & UPI',
      type: 'UPI / Wallet',
      accountNumberMasked: '98201****@paytm',
      balance: 4250.0,
      daysAgo: 42,
    },
  ];

  const mockTransactions = [
    {
      id: 'tx_1',
      date: '10 Nov 2026',
      descriptionClean: 'Apex Industrial Solutions Ltd',
      rawDescription: 'NEFT/N102934/APEXIND/CONSULT',
      amount: 125000.0,
      type: 'credit' as const,
      category: 'Client Payment',
      categoryColor: '#6366F1',
      workspace: 'Business' as const,
      account: 'ICICI Business',
    },
    {
      id: 'tx_2',
      date: '09 Nov 2026',
      descriptionClean: 'WeWork Office Leasing',
      rawDescription: 'UPI/48910293/WEWORK/RENT',
      amount: -32000.0,
      type: 'debit' as const,
      category: 'Rent',
      categoryColor: '#EF4444',
      workspace: 'Business' as const,
      account: 'ICICI Business',
    },
    {
      id: 'tx_3',
      date: '08 Nov 2026',
      descriptionClean: 'Swiggy Online Food',
      rawDescription: 'UPI/SWIGGY/48291048/BLR',
      amount: -840.0,
      type: 'debit' as const,
      category: 'Food & Dining',
      categoryColor: '#EAB308',
      workspace: 'Personal' as const,
      account: 'HDFC Savings',
    },
    {
      id: 'tx_4',
      date: '07 Nov 2026',
      descriptionClean: 'HDFC Savings to Kotak Card',
      rawDescription: 'IMPS/KOTAKCC/BILLPAY',
      amount: 45000.0,
      type: 'transfer' as const,
      category: 'Self-Transfer',
      categoryColor: '#6366F1',
      workspace: 'Personal' as const,
      account: 'Kotak Card',
    },
    {
      id: 'tx_5',
      date: '05 Nov 2026',
      descriptionClean: 'Amazon Web Services AWS',
      rawDescription: 'POS/AMAZON WEB SERVICES/US',
      amount: -14200.0,
      type: 'debit' as const,
      category: 'Subscriptions',
      categoryColor: '#A855F7',
      workspace: 'Business' as const,
      account: 'Kotak Card',
    },
  ];

  const totalBalance = mockAccounts.reduce((acc, a) => acc + a.balance, 0);

  return (
    <div className="space-y-8">
      {/* Dashboard Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>·</span>
            <span>Private Ledger</span>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Owner Vault</span>
          </div>
          <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
            Financial Dashboard
          </h2>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Workspace Filter Segmented Control */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['All', 'Personal', 'Business'] as const).map((ws) => (
              <button
                key={ws}
                type="button"
                onClick={() => setWorkspaceFilter(ws)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  workspaceFilter === ws
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {ws}
              </button>
            ))}
          </div>

          {/* FY selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>FY {fyFilter}</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.location.hash = 'upload';
            }}
            leftIcon={<Upload className="w-3.5 h-3.5" />}
          >
            Upload Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="This Month Income"
          amount={185400.0}
          type="income"
          changePercentage={18.4}
          changeLabel="MoM"
          icon={<ArrowDownLeft className="w-4 h-4 text-green-600 dark:text-green-400" />}
        />
        <KPICard
          title="This Month Expense"
          amount={64250.0}
          type="expense"
          changePercentage={-4.2}
          changeLabel="MoM"
          icon={<ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />}
        />
        <KPICard
          title="Net Cashflow"
          amount={121150.0}
          type="net"
          subtitle="Tax provision: ₹24,200"
          icon={<Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
        />
        <KPICard
          title="Total Balance"
          amount={totalBalance}
          type="balance"
          subtitle="Across 5 active accounts"
          icon={<Building className="w-4 h-4 text-slate-600 dark:text-slate-400" />}
        />
      </div>

      {/* Main Content Grid: Account Health + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account Health Widget (1 Column) */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Account Registry</CardTitle>
              <span className="text-xs text-slate-500">5 Accounts Monitored</span>
            </div>
            <Button variant="ghost" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
            {mockAccounts.map((account) => (
              <div key={account.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {account.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {account.accountNumberMasked} · {account.type}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-xs font-bold font-tabular ${
                      account.balance < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {formatINR(account.balance)}
                  </div>
                  <div className="mt-1 flex justify-end">
                    <AccountHealthDot daysAgo={account.daysAgo} showLabel={false} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Transactions Ledger Table (2 Columns) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <span className="text-xs text-slate-500">Multiset Dedup Active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">50 items</span>
              <Button variant="outline" size="sm">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-4 font-medium">Description</th>
                  <th className="py-2.5 px-4 font-medium">Category</th>
                  <th className="py-2.5 px-4 font-medium">Workspace</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mockTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-tabular text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {tx.descriptionClean}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                        {tx.account} · {tx.rawDescription}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <CategoryBadge name={tx.category} color={tx.categoryColor} />
                    </td>
                    <td className="py-3 px-4">
                      <WorkspaceBadge workspace={tx.workspace} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-semibold font-tabular text-sm ${
                          tx.type === 'credit'
                            ? 'text-green-600 dark:text-green-400'
                            : tx.type === 'debit'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {formatINR(tx.amount, { showSign: true })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
