'use client';

import React, { useState, useEffect } from 'react';
import { RuleCard } from '../../../components/rules/RuleCard';
import { AddRuleModal } from '../../../components/rules/AddRuleModal';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
} from '../../../lib/actions/rules';
import { getCategories } from '../../../lib/actions/categories';
import { getWorkspaces } from '../../../lib/actions/workspaces';
import type { TransactionRule, RuleFormData } from '../../../types/transactions';
import type { Category } from '../../../types/categories';
import type { Workspace } from '../../../types/workspaces';
import {
  Sliders,
  Plus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Wand2,
} from 'lucide-react';

export default function RulesPage() {
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [rList, cList, wList] = await Promise.all([
        getRules(),
        getCategories(),
        getWorkspaces(),
      ]);
      setRules(rList);
      setCategories(cList);
      setWorkspaces(wList);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      const updated = await updateRule(id, { is_active: active });
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to toggle rule.' });
    }
  };

  const handleDeleteRule = async (id: string) => {
    const target = rules.find((r) => r.id === id);
    if (!window.confirm(`Delete rule "${target?.name || 'this rule'}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setBannerMessage({ type: 'success', text: 'Rule deleted successfully.' });
      setTimeout(() => setBannerMessage(null), 3000);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to delete rule.' });
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= rules.length) return;

    const copy = [...rules];
    const [moved] = copy.splice(index, 1);
    copy.splice(newIdx, 0, moved);

    const reorderedIds = copy.map((r) => r.id);
    const updatedRules = await reorderRules(reorderedIds);
    setRules(updatedRules);
  };

  const handleAddRule = async (data: RuleFormData) => {
    const created = await createRule(data);
    setBannerMessage({
      type: 'success',
      text: `Rule "${created.name}" created at priority #${created.priority}.`,
    });
    setTimeout(() => setBannerMessage(null), 4000);
    await loadAll();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Automation Engine</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Transaction Rules Engine
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Rules execute in strict priority order (lowest number first). The first matching rule applies categories and workspaces during statement import.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.hash = 'auto-categorize';
            }}
            leftIcon={<Wand2 className="w-3.5 h-3.5 text-indigo-500" />}
          >
            Auto-Categorize History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
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
            Add Rule
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs animate-in fade-in ${
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

      {/* How it works info card */}
      <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
              Automated Categorization at Import Time (Step 4 of Pipeline)
            </span>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              When statements are confirmed, every incoming row is tested against these rules sequentially. Once a rule matches (e.g. description contains "SWIGGY"), its category, workspace, and tags are applied immediately.
            </p>
          </div>
        </div>
      </Card>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Sliders className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
              No rules defined yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create rules to match recurring vendors (e.g. Swiggy, Netflix, WeWork, Amazon) for zero-effort statement categorization.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Your First Rule
            </Button>
          </Card>
        ) : (
          rules.map((rule, idx) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteRule}
              onMoveUp={() => handleMove(idx, 'up')}
              onMoveDown={() => handleMove(idx, 'down')}
              isFirst={idx === 0}
              isLast={idx === rules.length - 1}
            />
          ))
        )}
      </div>

      {/* Add Rule Modal */}
      <AddRuleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddRule}
        categories={categories}
        workspaces={workspaces}
        nextDefaultPriority={(rules.length + 1) * 10}
      />
    </div>
  );
}
