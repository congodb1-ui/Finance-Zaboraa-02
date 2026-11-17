'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api-client';
import {
  ALLOWED_AUTO_CATEGORIES,
  type AutoCategorizeBatchSummary,
  type AutoCategorizeItem,
  type CategorySummaryRow,
  type ReviewScopeChoice,
} from '../../../lib/auto-categorize/constants';
import type { Category } from '../../../types/categories';
import { formatINR } from '../../../types/design-system';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Undo2,
  ShieldCheck,
  Search,
  ArrowLeftRight,
  Building2,
  User,
  Users,
  Save,
  Play,
  CheckCheck,
  XCircle,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';

interface StatusResponse {
  totalTransactions: number;
  uncategorizedTransactions: number;
  categories: Category[];
  draftBatch: AutoCategorizeBatchSummary | null;
  draftItems: AutoCategorizeItem[];
  categorySummary: CategorySummaryRow[];
  appliedBatch: AutoCategorizeBatchSummary | null;
  lastRevertedBatch: AutoCategorizeBatchSummary | null;
}

function getScopedTxCount(item: AutoCategorizeItem): number {
  if (!item.transactionIds || item.transactionIds.length === 0) return 0;
  if (item.selectedScope === 'pending') return 0;
  if (!item.selectedScope || item.selectedScope === 'all') {
    return item.transactionIds.length;
  }
  if (item.selectedScope === 'account') {
    if (!item.selectedAccountId) return 0;
    return item.transactionIds.filter(
      (id) => item.transactionAccountIds?.[id] === item.selectedAccountId
    ).length;
  }
  const targetPurposes = new Set(
    item.accounts
      .filter((a) =>
        item.selectedScope === 'business'
          ? a.purpose === 'business'
          : a.purpose !== 'business'
      )
      .map((a) => a.id)
  );
  return item.transactionIds.filter((id) => {
    const accId = item.transactionAccountIds?.[id];
    return accId ? targetPurposes.has(accId) : item.selectedScope === 'personal';
  }).length;
}

function reasonBadgeLabel(reason: string): string {
  switch (reason) {
    case 'person_name':
      return 'Person Name (Never Auto-Assigned)';
    case 'mixed_personal_business':
      return 'Personal & Business — Pick Scope';
    case 'low_confidence':
      return 'Low Confidence';
    case 'transfer_confirm':
      return 'Confirm Transfer';
    default:
      return reason;
  }
}

function formatDateReadable(iso: string | null | undefined): string {
  if (!iso) return 'today';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function AutoCategorizePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const [totalTransactions, setTotalTransactions] = useState(0);
  const [uncategorizedTransactions, setUncategorizedTransactions] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draftBatch, setDraftBatch] = useState<AutoCategorizeBatchSummary | null>(null);
  const [appliedBatch, setAppliedBatch] = useState<AutoCategorizeBatchSummary | null>(null);
  const [items, setItems] = useState<AutoCategorizeItem[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );
  const [showRevertModal, setShowRevertModal] = useState(false);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const res = await apiGet<StatusResponse>('/api/auto-categorize/status');
      setTotalTransactions(res.totalTransactions || 0);
      setUncategorizedTransactions(res.uncategorizedTransactions || 0);
      setCategories(res.categories || []);
      setDraftBatch(res.draftBatch || null);
      setAppliedBatch(res.appliedBatch || null);
      setItems(Array.isArray(res.draftItems) ? res.draftItems : []);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to load auto-categorization workspace.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const categoryIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.name.trim().toLowerCase(), c.id);
    }
    return map;
  }, [categories]);

  const handleAnalyzeHistory = async () => {
    setIsAnalyzing(true);
    setBanner(null);
    try {
      const res = await apiPost<{
        empty?: boolean;
        message?: string;
        batch: AutoCategorizeBatchSummary | null;
        items: AutoCategorizeItem[];
        categories: Category[];
        totalTransactions: number;
        uncategorizedTransactions: number;
      }>('/api/auto-categorize/analyze', {});

      setTotalTransactions(res.totalTransactions || 0);
      setUncategorizedTransactions(res.uncategorizedTransactions || 0);
      if (res.categories) setCategories(res.categories);

      if (res.empty) {
        setItems([]);
        setDraftBatch(null);
        setBanner({
          type: 'info',
          text: res.message || 'Upload your bank statements first, then run analysis',
        });
        return;
      }

      setDraftBatch(res.batch);
      setItems(Array.isArray(res.items) ? res.items : []);
      if (res.items.length === 0) {
        setBanner({
          type: 'info',
          text: 'All eligible historical transactions already have categories assigned.',
        });
      } else {
        setBanner({
          type: 'success',
          text: `Analyzed ${res.uncategorizedTransactions} uncategorized transactions into ${res.items.length} unique merchants. Nothing has been applied yet — review below before clicking Apply.`,
        });
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to analyze transaction history.',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateItem = (
    merchantKey: string,
    updater: (prev: AutoCategorizeItem) => AutoCategorizeItem
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.merchantKey === merchantKey ? updater(item) : item))
    );
  };

  const handleCategoryChange = (merchantKey: string, categoryName: string) => {
    const catId = categoryIdByName.get(categoryName.trim().toLowerCase()) || null;
    updateItem(merchantKey, (item) => ({
      ...item,
      selectedCategoryName: categoryName,
      selectedCategoryId: catId,
      isTransfer: categoryName === 'Family Transfer' ? true : item.isTransfer,
    }));
  };

  const handleScopeChange = (merchantKey: string, scope: ReviewScopeChoice) => {
    updateItem(merchantKey, (item) => ({
      ...item,
      selectedScope: scope,
      selectedAccountId:
        scope === 'account'
          ? item.selectedAccountId || item.accounts[0]?.id || null
          : null,
    }));
  };

  const handleAccountSelect = (merchantKey: string, accountId: string) => {
    updateItem(merchantKey, (item) => ({
      ...item,
      selectedScope: 'account',
      selectedAccountId: accountId,
    }));
  };

  const handleToggleTransfer = (merchantKey: string, isTransfer: boolean) => {
    updateItem(merchantKey, (item) => {
      const nextCatName =
        isTransfer && (!item.selectedCategoryName || item.selectedCategoryName === 'Other')
          ? 'Family Transfer'
          : item.selectedCategoryName;
      const nextCatId = categoryIdByName.get(nextCatName.trim().toLowerCase()) || item.selectedCategoryId;
      return {
        ...item,
        isTransfer,
        selectedCategoryName: nextCatName,
        selectedCategoryId: nextCatId,
      };
    });
  };

  const handleApproveDecisionItem = (merchantKey: string) => {
    const target = items.find((i) => i.merchantKey === merchantKey);
    if (!target) return;
    if (target.selectedScope === 'pending') {
      setBanner({
        type: 'error',
        text: `Please pick an account scope (Personal Only, Business Only, This Account Only, or All Accounts) for "${target.displayName}" before approving.`,
      });
      return;
    }
    updateItem(merchantKey, (item) => ({
      ...item,
      approved: true,
      decisionResolved: true,
    }));
  };

  const handleSkipDecisionItem = (merchantKey: string) => {
    updateItem(merchantKey, (item) => ({
      ...item,
      approved: false,
      decisionResolved: true,
    }));
  };

  const handleToggleApproveMerchant = (merchantKey: string) => {
    const target = items.find((i) => i.merchantKey === merchantKey);
    if (!target) return;
    if (!target.approved && target.selectedScope === 'pending') {
      setBanner({
        type: 'error',
        text: `Please pick an account scope for "${target.displayName}" before approving.`,
      });
      return;
    }
    updateItem(merchantKey, (item) => ({
      ...item,
      approved: !item.approved,
      decisionResolved: item.needsDecision ? true : item.decisionResolved,
    }));
  };

  const handleApproveAllHighConfidence = () => {
    setItems((prev) =>
      prev.map((item) => {
        if (!item.needsDecision && item.confidence === 'high' && item.selectedScope !== 'pending') {
          return { ...item, approved: true, decisionResolved: true };
        }
        return item;
      })
    );
    setBanner({
      type: 'success',
      text: 'Approved all high-confidence merchants. Resolve any remaining items in Needs Your Decision before clicking Apply.',
    });
  };

  const handleClearAllApprovals = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        approved: false,
        decisionResolved: item.needsDecision ? false : true,
      }))
    );
  };

  const handleSaveDraft = async () => {
    if (!draftBatch) return;
    setIsSavingDraft(true);
    setBanner(null);
    try {
      const res = await apiPost<{ batch: AutoCategorizeBatchSummary }>('/api/auto-categorize/draft', {
        batchId: draftBatch.id,
        items,
      });
      setDraftBatch(res.batch);
      setBanner({
        type: 'success',
        text: 'Draft saved safely. No transactions or rules have been modified.',
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to save draft.',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const needsDecisionItems = useMemo(
    () => items.filter((item) => item.needsDecision),
    [items]
  );

  const unresolvedDecisionCount = useMemo(
    () =>
      needsDecisionItems.filter(
        (item) => !item.decisionResolved || item.selectedScope === 'pending'
      ).length,
    [needsDecisionItems]
  );

  const approvedItems = useMemo(
    () => items.filter((item) => item.approved),
    [items]
  );

  const applyCounts = useMemo(() => {
    const txIdSet = new Set<string>();
    let ruleCount = 0;
    for (const item of approvedItems) {
      ruleCount += 1;
      const scopedCount = getScopedTxCount(item);
      if (scopedCount > 0) {
        if (item.selectedScope === 'all' || !item.selectedScope) {
          item.transactionIds.forEach((id) => txIdSet.add(id));
        } else if (item.selectedScope === 'account' && item.selectedAccountId) {
          item.transactionIds.forEach((id) => {
            if (item.transactionAccountIds?.[id] === item.selectedAccountId) {
              txIdSet.add(id);
            }
          });
        } else {
          const targetAccIds = new Set(
            item.accounts
              .filter((a) =>
                item.selectedScope === 'business'
                  ? a.purpose === 'business'
                  : a.purpose !== 'business'
              )
              .map((a) => a.id)
          );
          item.transactionIds.forEach((id) => {
            const accId = item.transactionAccountIds?.[id];
            if (accId ? targetAccIds.has(accId) : item.selectedScope === 'personal') {
              txIdSet.add(id);
            }
          });
        }
      }
    }
    return {
      rules: ruleCount,
      transactions: txIdSet.size,
    };
  }, [approvedItems]);

  const categorySummary = useMemo(() => {
    const map = new Map<string, CategorySummaryRow>();
    for (const spec of ALLOWED_AUTO_CATEGORIES) {
      map.set(spec.name, {
        categoryName: spec.name,
        categoryId: categoryIdByName.get(spec.name.toLowerCase()) || null,
        merchantCount: 0,
        totalAmount: 0,
        approvedMerchantCount: 0,
      });
    }
    for (const item of items) {
      const catName =
        item.isTransfer && (!item.selectedCategoryName || item.selectedCategoryName === 'Other')
          ? 'Family Transfer'
          : item.selectedCategoryName || item.suggestedCategoryName;
      const entry = map.get(catName) || map.get('Other')!;
      entry.merchantCount += 1;
      entry.totalAmount = Math.round((entry.totalAmount + item.totalAmount) * 100) / 100;
      if (item.approved) entry.approvedMerchantCount += 1;
    }
    return Array.from(map.values()).filter((r) => r.merchantCount > 0);
  }, [items, categoryIdByName]);

  const filteredMerchants = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.displayName.toLowerCase().includes(q) ||
        item.merchantKey.toLowerCase().includes(q) ||
        item.selectedCategoryName.toLowerCase().includes(q) ||
        item.variants.some((v) => v.toLowerCase().includes(q))
    );
  }, [items, searchTerm]);

  const canApply =
    Boolean(draftBatch) &&
    items.length > 0 &&
    unresolvedDecisionCount === 0 &&
    applyCounts.rules > 0 &&
    applyCounts.transactions > 0;

  const handleApply = async () => {
    if (!draftBatch || !canApply) return;
    setIsApplying(true);
    setBanner(null);
    try {
      const res = await apiPost<{
        batch: AutoCategorizeBatchSummary;
        rulesCreated: number;
        transactionsCategorized: number;
      }>('/api/auto-categorize/apply', {
        batchId: draftBatch.id,
        items,
      });

      setAppliedBatch(res.batch);
      setDraftBatch(null);
      setItems([]);
      setBanner({
        type: 'success',
        text: `Categories applied on ${formatDateReadable(res.batch.applied_at)}, ${res.rulesCreated} rules created, ${res.transactionsCategorized} transactions categorized.`,
      });
      await loadStatus();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to apply approved categories.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleConfirmRevert = async () => {
    if (!appliedBatch) return;
    setIsReverting(true);
    setBanner(null);
    try {
      const res = await apiPost<{
        resetTransactions: number;
        deletedRules: number;
      }>('/api/auto-categorize/revert', {
        batchId: appliedBatch.id,
      });
      setShowRevertModal(false);
      setBanner({
        type: 'success',
        text: `Reverted batch: ${res.resetTransactions} transactions reset to Uncategorized and ${res.deletedRules} AI-suggested rules deleted. Manual categories were preserved.`,
      });
      await loadStatus();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to revert batch.',
      });
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 pb-32">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Merchant Intelligence
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Auto-Categorize History
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Groups bank statement variants by merchant, flags people & cross-account ambiguity, and creates persistent rules after your review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            disabled={isLoading || isAnalyzing}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleAnalyzeHistory}
            isLoading={isAnalyzing}
            leftIcon={<Play className="w-4 h-4" />}
          >
            {items.length > 0 ? 'Re-run Analysis' : 'Analyze History'}
          </Button>
        </div>
      </div>

      {/* Zero-PII & Manual Protection Guarantee */}
      <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong>Zero-PII AI Guard:</strong> Only masked merchant summaries are sent to AI. Manual categories are never overwritten.
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500">
          <span>Total Txns: <strong className="text-slate-900 dark:text-white">{totalTransactions}</strong></span>
          <span>Uncategorized: <strong className="text-indigo-600 dark:text-indigo-400">{uncategorizedTransactions}</strong></span>
        </div>
      </div>

      {/* Status Notification Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
            banner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : banner.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              : 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : banner.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Post-Apply Summary Banner + Prominent Revert Button */}
      {appliedBatch && (
        <Card className="p-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-sm text-emerald-950 dark:text-emerald-100">
                  Categories applied on {formatDateReadable(appliedBatch.applied_at)},{' '}
                  {appliedBatch.rules_created} rules created,{' '}
                  {appliedBatch.transactions_categorized} transactions categorized
                </p>
                <p className="text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                  Future PDF uploads and Gmail alerts for these merchants will categorize automatically.
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowRevertModal(true)}
              leftIcon={<Undo2 className="w-4 h-4" />}
            >
              Revert
            </Button>
          </div>
        </Card>
      )}

      {/* Empty State: 0 Transactions */}
      {!isLoading && totalTransactions === 0 && (
        <Card className="p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
              Upload your bank statements first, then run analysis
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Once your bank statements or Gmail alerts are imported, click Analyze History to group merchants and review categories safely before applying.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                window.location.hash = 'upload';
              }}
              leftIcon={<UploadCloud className="w-4 h-4" />}
            >
              Go to Upload Statements
            </Button>
          </div>
        </Card>
      )}

      {/* Ready-to-Analyze Prompt (Has transactions, no active draft) */}
      {!isLoading && totalTransactions > 0 && items.length === 0 && (
        <Card className="p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-heading font-semibold text-base text-slate-900 dark:text-white">
              {uncategorizedTransactions > 0
                ? `${uncategorizedTransactions} Uncategorized Transactions Ready to Analyze`
                : 'No Uncategorized Transactions Remaining'}
            </h2>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              {uncategorizedTransactions > 0
                ? 'Click Analyze History to group merchant spelling variations across all your accounts and prepare a reviewable categorization draft.'
                : 'Your ledger is fully categorized! You can still re-run analysis anytime after importing new statements.'}
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={handleAnalyzeHistory}
              isLoading={isAnalyzing}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Analyze History
            </Button>
          </div>
        </Card>
      )}

      {/* REVIEW WORKSPACE */}
      {items.length > 0 && (
        <>
          {/* 1. Summary by Category */}
          <Card>
            <CardHeader className="p-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold">
                Summary by Category ({items.length} merchants)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {categorySummary.map((row) => (
                  <div
                    key={row.categoryName}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50"
                  >
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {row.categoryName}
                    </div>
                    <div className="font-heading font-bold text-sm text-slate-900 dark:text-white font-tabular mt-1">
                      {formatINR(row.totalAmount)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>{row.merchantCount} merchant{row.merchantCount === 1 ? '' : 's'}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {row.approvedMerchantCount} approved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 2. Needs Your Decision Section */}
          {needsDecisionItems.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800/80">
              <CardHeader className="p-4 pb-3 border-b border-amber-100 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 flex flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <CardTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                      Needs Your Decision ({needsDecisionItems.length})
                    </CardTitle>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                      Person names, mixed personal/business merchants, transfers, and low-confidence items require your explicit choice before Apply is unlocked.
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg ${
                    unresolvedDecisionCount === 0
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  {unresolvedDecisionCount === 0
                    ? 'All Decided ✓'
                    : `${unresolvedDecisionCount} Pending`}
                </span>
              </CardHeader>

              <CardContent className="p-4 divide-y divide-slate-100 dark:divide-slate-800 space-y-4">
                {needsDecisionItems.map((item) => {
                  const isDecided = item.decisionResolved && item.selectedScope !== 'pending';
                  return (
                    <div
                      key={item.merchantKey}
                      className="pt-4 first:pt-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Merchant Info & Reasons */}
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                            {item.displayName}
                          </span>
                          {item.decisionReasons.map((r) => (
                            <span
                              key={r}
                              className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                            >
                              {reasonBadgeLabel(r)}
                            </span>
                          ))}
                          {isDecided && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              {item.approved ? 'Approved ✓' : 'Skipped'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <span>{item.count} txns</span>
                          <span>Total: <strong className="text-slate-800 dark:text-slate-200">{formatINR(item.totalAmount)}</strong></span>
                          <span>Avg: {formatINR(item.avgAmount)}</span>
                          <span className="capitalize">Freq: {item.frequency}</span>
                          <span>
                            Accounts:{' '}
                            {item.accounts.map((a) => `${a.name} (${a.scopeTag})`).join(', ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 italic">{item.reasoning}</p>
                      </div>

                      {/* Controls: Category, Scope, Is Transfer, Approve / Skip */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Category (13 only) */}
                        <select
                          aria-label={`Category for ${item.displayName}`}
                          value={item.selectedCategoryName}
                          onChange={(e) => handleCategoryChange(item.merchantKey, e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          {ALLOWED_AUTO_CATEGORIES.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        {/* Scope selector */}
                        <select
                          aria-label={`Scope for ${item.displayName}`}
                          value={item.selectedScope}
                          onChange={(e) =>
                            handleScopeChange(item.merchantKey, e.target.value as ReviewScopeChoice)
                          }
                          className={`px-2.5 py-1.5 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white ${
                            item.selectedScope === 'pending'
                              ? 'border-amber-500 ring-1 ring-amber-400'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {item.selectedScope === 'pending' && (
                            <option value="pending">Select Scope...</option>
                          )}
                          <option value="all">All Accounts</option>
                          <option value="personal">Personal Only</option>
                          <option value="business">Business Only</option>
                          <option value="account">This Account Only</option>
                        </select>

                        {item.selectedScope === 'account' && item.accounts.length > 0 && (
                          <select
                            aria-label={`Specific account for ${item.displayName}`}
                            value={item.selectedAccountId || item.accounts[0]?.id || ''}
                            onChange={(e) => handleAccountSelect(item.merchantKey, e.target.value)}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          >
                            {item.accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.purpose})
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Is Transfer Yes / No */}
                        <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-xs">
                          <span className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-500 border-r border-slate-300 dark:border-slate-700">
                            Transfer?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleTransfer(item.merchantKey, true)}
                            className={`px-2.5 py-1.5 font-medium cursor-pointer ${
                              item.isTransfer
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleTransfer(item.merchantKey, false)}
                            className={`px-2.5 py-1.5 font-medium cursor-pointer ${
                              !item.isTransfer
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            No
                          </button>
                        </div>

                        <Button
                          variant={item.approved ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => handleApproveDecisionItem(item.merchantKey)}
                        >
                          {item.approved ? 'Approved ✓' : 'Approve'}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSkipDecisionItem(item.merchantKey)}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* 3. Top Merchants by Spend Table */}
          <Card>
            <CardHeader className="p-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">
                  Top Merchants by Spend ({filteredMerchants.length})
                </CardTitle>
                <span className="text-xs text-slate-500">
                  Sorted highest total spend first. Spelling and UPI/QR variations are grouped together.
                </span>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter merchants or categories..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                    <th className="py-2.5 px-4 min-w-[240px]">Merchant</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Count</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Avg Amount</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Accounts</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Suggested Category</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Confidence</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredMerchants.map((item) => {
                    const confBadge =
                      item.confidence === 'high'
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                        : item.confidence === 'medium'
                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300';

                    return (
                      <tr
                        key={item.merchantKey}
                        className={`transition-colors ${
                          item.approved
                            ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Merchant */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                            <span>{item.displayName}</span>
                            {item.isTransfer && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                                TRANSFER
                              </span>
                            )}
                            {item.needsDecision && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                                Needs Decision
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2 font-tabular">
                            <span>Total: <strong>{formatINR(item.totalAmount)}</strong></span>
                            <span>•</span>
                            <span>Min {formatINR(item.minAmount)} – Max {formatINR(item.maxAmount)}</span>
                            <span>•</span>
                            <span className="capitalize">{item.frequency}</span>
                          </div>
                          {item.variants.length > 1 && (
                            <div
                              className="text-[10px] text-slate-400 truncate max-w-md mt-0.5"
                              title={item.variants.join(' | ')}
                            >
                              Variants ({item.variants.length}): {item.variants.slice(0, 3).join(' · ')}
                            </div>
                          )}
                        </td>

                        {/* Count */}
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {item.count}
                        </td>

                        {/* Avg Amount */}
                        <td className="py-3 px-3 text-right font-tabular text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {formatINR(item.avgAmount)}
                        </td>

                        {/* Accounts */}
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {item.accountScopes.map((scope) => (
                              <span
                                key={scope}
                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                                  scope === 'business'
                                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                    : scope === 'family'
                                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {scope === 'business' ? (
                                  <Building2 className="w-2.5 h-2.5" />
                                ) : scope === 'family' ? (
                                  <Users className="w-2.5 h-2.5" />
                                ) : (
                                  <User className="w-2.5 h-2.5" />
                                )}
                                {scope}
                              </span>
                            ))}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]">
                            {item.accounts.map((a) => a.name).join(', ')}
                          </div>
                        </td>

                        {/* Suggested Category (strict 13) */}
                        <td className="py-3 px-3">
                          <select
                            aria-label={`Suggested category for ${item.displayName}`}
                            value={item.selectedCategoryName}
                            onChange={(e) => handleCategoryChange(item.merchantKey, e.target.value)}
                            className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          >
                            {ALLOWED_AUTO_CATEGORIES.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Confidence */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${confBadge}`}
                          >
                            {item.confidence} ({Math.round(item.confidenceScore * 100)}%)
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant={item.isTransfer ? 'secondary' : 'ghost'}
                              size="sm"
                              onClick={() =>
                                handleToggleTransfer(item.merchantKey, !item.isTransfer)
                              }
                              title="Mark as Transfer"
                              leftIcon={<ArrowLeftRight className="w-3 h-3" />}
                            >
                              Transfer
                            </Button>
                            <Button
                              variant={item.approved ? 'primary' : 'outline'}
                              size="sm"
                              onClick={() => handleToggleApproveMerchant(item.merchantKey)}
                            >
                              {item.approved ? 'Approved ✓' : 'Approve'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Sticky Review Footer Bar */}
          <div className="fixed bottom-14 md:bottom-0 left-0 md:left-64 right-0 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 z-20 shadow-lg">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApproveAllHighConfidence}
                  leftIcon={<CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
                >
                  Approve All High-Confidence
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAllApprovals}
                  leftIcon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Clear All Approvals
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  isLoading={isSavingDraft}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                >
                  Save as Draft
                </Button>
              </div>

              <div className="flex items-center gap-3">
                {unresolvedDecisionCount > 0 && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Decide {unresolvedDecisionCount} item{unresolvedDecisionCount === 1 ? '' : 's'} above to enable Apply
                  </span>
                )}
                <Button
                  variant="primary"
                  size="md"
                  disabled={!canApply || isApplying}
                  isLoading={isApplying}
                  onClick={handleApply}
                >
                  {`Apply ${applyCounts.rules} Rules to ${applyCounts.transactions} Transactions`}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Revert Confirmation Modal */}
      {showRevertModal && appliedBatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 shrink-0">
                <Undo2 className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                  Revert Auto-Categorization Batch?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {`This will reset ${appliedBatch.transactions_categorized} transactions to Uncategorized and delete ${appliedBatch.rules_created} AI-suggested rules. Your manual categories will not be affected. Confirm?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRevertModal(false)}
                disabled={isReverting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmRevert}
                isLoading={isReverting}
              >
                Confirm Revert
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
