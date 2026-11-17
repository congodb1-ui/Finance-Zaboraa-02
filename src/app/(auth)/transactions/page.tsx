'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TransactionTable } from '../../../components/transactions/TransactionTable';
import { TransfersTable } from '../../../components/transactions/TransfersTable';
import { TransactionFilters } from '../../../components/transactions/TransactionFilters';
import { TransactionRow } from '../../../components/transactions/TransactionRow';
import { AddTransactionModal } from '../../../components/transactions/AddTransactionModal';
import { BulkEditBar } from '../../../components/transactions/BulkEditBar';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { formatINR } from '../../../types/design-system';
import {
  getTransactions,
  getSelfTransferPairs,
  createManualTransaction,
  bulkUpdateTransactions,
} from '../../../lib/actions/transactions';
import { apiDelete, apiGet, apiPatch } from '../../../lib/api-client';
import { getAccounts } from '../../../lib/actions/accounts';
import { getCategories } from '../../../lib/actions/categories';
import { getWorkspaces } from '../../../lib/actions/workspaces';
import type {
  Transaction,
  TransactionFiltersState,
  ManualTransactionFormData,
  SelfTransferPairRow,
} from '../../../types/transactions';
import type { AccountWithBalance } from '../../../types/accounts';
import type { Category } from '../../../types/categories';
import type { Workspace } from '../../../types/workspaces';
import {
  Plus,
  Receipt,
  Download,
  Sliders,
  TrendingDown,
  TrendingUp,
  Hash,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';

export default function TransactionsPage() {
  // Ledger data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transferPairs, setTransferPairs] = useState<SelfTransferPairRow[]>([]);
  const [totalTransferred, setTotalTransferred] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state (defaults to Indian FY 2026-27: April 1, 2026 to March 31, 2027)
  const [filters, setFilters] = useState<TransactionFiltersState>({
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    accountIds: [],
    categoryIds: [],
    workspaceId: 'all',
    txnType: 'all',
    search: '',
  });
  const isTransfersTab = filters.txnType === 'transfer';

  // Entity metadata
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Selection & UI Modals
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTransactionForDrawer, setActiveTransactionForDrawer] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gmailImportedCount, setGmailImportedCount] = useState(0);
  const [confirmDeleteGmail, setConfirmDeleteGmail] = useState(false);
  const [isDeletingGmail, setIsDeletingGmail] = useState(false);

  const loadGmailCount = useCallback(async () => {
    try {
      const status = await apiGet<{ gmail_imported_count?: number }>('/api/gmail/status');
      setGmailImportedCount(status?.gmail_imported_count ?? 0);
    } catch {
      // Ignore status fetch failure on ledger load
    }
  }, []);

  // Load supporting entities once
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [accs, cats, wss] = await Promise.all([
          getAccounts(),
          getCategories(),
          getWorkspaces(),
        ]);
        setAccounts(accs);
        setCategories(cats);
        setWorkspaces(wss);
      } catch (err) {
        console.error('Failed to load accounts/categories:', err);
      }
    }
    loadMetadata();
    loadGmailCount();
  }, [loadGmailCount]);

  // Fetch transactions (or grouped self-transfer pairs on Transfers tab)
  const loadLedger = useCallback(async () => {
    setIsLoading(true);
    try {
      if (filters.txnType === 'transfer') {
        const res = await getSelfTransferPairs(filters);
        setTransferPairs(res.pairs);
        setTotalTransferred(res.totalTransferred);
        setTransactions([]);
        setTotalCount(res.pairs.length);
        setTotalPages(1);
        setTotalDebits(0);
        setTotalCredits(0);
      } else {
        const res = await getTransactions({
          page: currentPage,
          pageSize: 50,
          filters,
        });
        setTransactions(res.transactions);
        setTransferPairs([]);
        setTotalTransferred(0);
        setTotalCount(res.totalCount);
        setTotalPages(res.totalPages);
        setTotalDebits(res.totalDebits);
        setTotalCredits(res.totalCredits);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filters]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Handle filter changes (resets to page 1)
  const handleFiltersChange = (newFilters: TransactionFiltersState) => {
    setFilters(newFilters);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  // Checkbox selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (transactions.every((t) => selectedIds.includes(t.id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map((t) => t.id));
    }
  };

  // Handle Drawer Save
  const handleSaveTransaction = async (id: string, updates: any) => {
    const updatedTx = await apiPatch<Transaction>(`/api/transactions/${id}`, updates);
    await loadLedger();
    if (updatedTx) {
      setActiveTransactionForDrawer(updatedTx);
    }
  };

  // Handle Manual Add Transaction
  const handleAddManualTransaction = async (data: ManualTransactionFormData) => {
    await createManualTransaction(data);
    setBannerMessage({
      type: 'success',
      text: `Manual transaction "${data.description}" recorded in ledger with audit log trace.`,
    });
    setTimeout(() => setBannerMessage(null), 4000);
    await loadLedger();
  };

  // Handle Bulk Edit Apply
  const handleApplyBulkEdit = async (updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    append_tags?: string[];
  }) => {
    const res = await bulkUpdateTransactions(selectedIds, updates);
    setBannerMessage({
      type: 'success',
      text: `Successfully updated ${res.updatedCount} transactions and logged audit records.`,
    });
    setTimeout(() => setBannerMessage(null), 4000);
    setSelectedIds([]);
    await loadLedger();
  };

  // Handle Confirm / Unlink on flagged NEFT/RTGS self-transfer pairs
  const handleReviewTransferPair = async (
    pair: SelfTransferPairRow,
    approve: boolean
  ) => {
    const targetTx = pair.debitTx || pair.creditTx;
    if (!targetTx) return;
    try {
      await apiPatch<Transaction>(
        `/api/transactions/${targetTx.id}`,
        approve
          ? { status: 'confirmed', is_self_transfer: true, is_transfer: true }
          : { is_transfer: false, is_self_transfer: false }
      );
      setBannerMessage({
        type: 'success',
        text: approve
          ? 'Self-transfer pair confirmed.'
          : 'Unlinked transfer — transactions restored to standard ledger.',
      });
      setTimeout(() => setBannerMessage(null), 4000);
      await loadLedger();
    } catch (err) {
      console.error('Failed to update self-transfer pair:', err);
      setBannerMessage({
        type: 'error',
        text: 'Failed to update transfer pair status.',
      });
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Page Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span>Zaboraa Finance</span>
              <span>•</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Batch 4</span>
            </div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Receipt className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Transactions Ledger
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Server-paginated immutable financial ledger with multiset deduplication, rules categorization & transfer links
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {gmailImportedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setConfirmDeleteGmail((prev) => !prev)}
                disabled={isDeletingGmail}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete Gmail Data ({gmailImportedCount})
              </Button>
            )}
            {filters.accountIds.length === 1 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const targetAccId = filters.accountIds[0];
                  const accObj = accounts.find((a) => a.id === targetAccId);
                  const accName = accObj?.name || 'this account';
                  if (
                    window.confirm(
                      `Delete ALL transactions and uploads for ${accName}? This cannot be undone.`
                    )
                  ) {
                    try {
                      const { clearAccountTransactions } = await import('../../../lib/actions/upload');
                      await clearAccountTransactions(targetAccId);
                      setBannerMessage({
                        type: 'success',
                        text: `All transactions for ${accName} cleared successfully.`,
                      });
                      setTimeout(() => setBannerMessage(null), 4000);
                      await Promise.all([loadLedger(), loadGmailCount()]);
                    } catch (err: any) {
                      setBannerMessage({
                        type: 'error',
                        text: err.message || 'Failed to clear account transactions.',
                      });
                    }
                  }
                }}
              >
                Delete All for Account
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadLedger();
                loadGmailCount();
              }}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Transaction
            </Button>
          </div>
        </div>

        {/* Inline Confirm Bar for Deleting All Gmail-Imported Data */}
        {confirmDeleteGmail && (
          <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="font-semibold text-red-900 dark:text-red-200">
                Delete all {gmailImportedCount} Gmail-imported transaction{gmailImportedCount === 1 ? '' : 's'}?
              </p>
              <p className="text-red-700 dark:text-red-300">
                Manual bank statement uploads will not be deleted, and affected account balances will be recalculated automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="destructive"
                size="sm"
                isLoading={isDeletingGmail}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={async () => {
                  setIsDeletingGmail(true);
                  try {
                    const res = await apiDelete<{
                      success: boolean;
                      deleted_transactions: number;
                      preserved_statement_transactions: number;
                      affected_accounts: number;
                    }>('/api/gmail/data');
                    if (typeof window !== 'undefined') {
                      try {
                        window.localStorage.removeItem('zaboraa_gmail_banner_dismissed_sync');
                      } catch {}
                    }
                    setConfirmDeleteGmail(false);
                    setGmailImportedCount(0);
                    setSelectedIds([]);
                    setBannerMessage({
                      type: 'success',
                      text: `Deleted ${res.deleted_transactions} Gmail-imported transaction${res.deleted_transactions === 1 ? '' : 's'} and recalculated ${res.affected_accounts} account balance${res.affected_accounts === 1 ? '' : 's'}.`,
                    });
                    setTimeout(() => setBannerMessage(null), 5000);
                    const [, accs] = await Promise.all([loadLedger(), getAccounts(), loadGmailCount()]);
                    setAccounts(accs);
                  } catch (err: any) {
                    setBannerMessage({
                      type: 'error',
                      text: err.message || 'Failed to delete Gmail-imported data.',
                    });
                  } finally {
                    setIsDeletingGmail(false);
                  }
                }}
              >
                Confirm Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeletingGmail}
                onClick={() => setConfirmDeleteGmail(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {bannerMessage && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-center gap-2.5 text-xs animate-in fade-in ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
            }`}
          >
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
        )}

        {/* Top Financial KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                {isTransfersTab ? 'Self-Transfer Pairs' : 'Total Ledger Records'}
              </span>
              <span className="font-heading font-bold text-2xl text-slate-900 dark:text-white font-tabular mt-0.5 block">
                {totalCount}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {isTransfersTab ? 'Excluded from income & expense' : 'Showing 50 rows per page'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Hash className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                {isTransfersTab ? 'Total Transferred Volume' : 'Filtered Debits (Outflows)'}
              </span>
              <span className="font-heading font-bold text-2xl text-red-600 dark:text-red-400 font-tabular mt-0.5 block">
                {isTransfersTab ? formatINR(totalTransferred) : `−${formatINR(totalDebits)}`}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {isTransfersTab ? 'Internal movement across own accounts' : 'Sum of matching debit entries'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 block">
                {isTransfersTab ? 'Pending Pairs' : 'Filtered Credits (Inflows)'}
              </span>
              <span className="font-heading font-bold text-2xl text-green-600 dark:text-green-400 font-tabular mt-0.5 block">
                {isTransfersTab
                  ? transferPairs.filter((p) => p.status === 'pending_pair').length
                  : `+${formatINR(totalCredits)}`}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {isTransfersTab ? 'Awaiting counterpart statement' : 'Sum of matching credit entries'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/60 text-green-600 dark:text-green-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </Card>
        </div>
      </div>

      {/* Sticky Filters Top Bar */}
      <TransactionFilters
        filters={filters}
        onChange={handleFiltersChange}
        accounts={accounts}
        categories={categories}
        workspaces={workspaces}
        totalFilteredCount={totalCount}
      />

      {/* Main Table Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {isTransfersTab ? (
          <TransfersTable
            pairs={transferPairs}
            onSelectTransaction={(tx) => setActiveTransactionForDrawer(tx)}
            onReviewPair={handleReviewTransferPair}
          />
        ) : (
          <TransactionTable
            transactions={transactions}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={50}
            onPageChange={setCurrentPage}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onRowClick={(tx) => setActiveTransactionForDrawer(tx)}
          />
        )}
      </div>

      {/* Detail Slide-in Drawer */}
      <TransactionRow
        transaction={activeTransactionForDrawer}
        isOpen={!!activeTransactionForDrawer}
        onClose={() => setActiveTransactionForDrawer(null)}
        onSave={handleSaveTransaction}
        categories={categories}
        workspaces={workspaces}
        accounts={accounts}
      />

      {/* Manual Entry Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddManualTransaction}
        accounts={accounts}
        categories={categories}
        workspaces={workspaces}
      />

      {/* Sticky Bottom Bulk Edit Bar */}
      <BulkEditBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onApplyBulkEdit={handleApplyBulkEdit}
        categories={categories}
        workspaces={workspaces}
      />
    </div>
  );
}
