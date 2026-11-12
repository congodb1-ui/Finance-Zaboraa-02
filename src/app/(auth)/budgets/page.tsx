'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BudgetCard } from '../../../components/budgets/BudgetCard';
import { AddBudgetModal } from '../../../components/budgets/AddBudgetModal';
import { getBudgets, createBudget } from '../../../lib/actions/budgets';
import { getCategories } from '../../../lib/actions/categories';
import { getWorkspaces } from '../../../lib/actions/workspaces';
import { formatINR } from '../../../types/design-system';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { BudgetWithSpending, BudgetPeriod, BudgetFormData } from '../../../types/budgets';
import type { Category } from '../../../types/categories';
import type { Workspace } from '../../../types/workspaces';
import {
  Target,
  Plus,
  Calendar,
  Filter,
  Loader2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export default function BudgetsPage() {
  const [selectedFY, setSelectedFY] = useState('2026-27');
  const [selectedPeriod, setSelectedPeriod] = useState<BudgetPeriod>('monthly');

  const [budgets, setBudgets] = useState<BudgetWithSpending[]>([]);
  const [totalBudgeted, setTotalBudgeted] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [overallPercentage, setOverallPercentage] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, cats, wss] = await Promise.all([
        getBudgets(selectedFY, selectedPeriod),
        getCategories(),
        getWorkspaces(),
      ]);

      setBudgets(res.budgets);
      setTotalBudgeted(res.totalBudgeted);
      setTotalSpent(res.totalSpent);
      setOverallPercentage(res.overallPercentage);
      setCategories(cats);
      setWorkspaces(wss);
    } catch (err) {
      console.error('Failed to load budgets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFY, selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (data: BudgetFormData) => {
    await createBudget(data);
    await loadData();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Financial Planning</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Category Budgets & Targets
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Set and track spending boundaries across categories with automated threshold alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* FY Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedFY}
              onChange={(e) => setSelectedFY(e.target.value)}
              className="bg-transparent font-semibold focus:outline-hidden cursor-pointer"
            >
              <option value="2026-27">FY 2026–27</option>
              <option value="2025-26">FY 2025–26</option>
              <option value="2024-25">FY 2024–25</option>
            </select>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as BudgetPeriod)}
              className="bg-transparent font-semibold focus:outline-hidden cursor-pointer capitalize"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsAddModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Budget
          </Button>
        </div>
      </div>

      {/* Summary Row at Top */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Budgeted */}
        <Card className="p-4 sm:p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Total Budgeted ({selectedPeriod})
          </span>
          <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white font-tabular">
            {formatINR(totalBudgeted)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Across {budgets.length} configured categories
          </span>
        </Card>

        {/* Total Spent */}
        <Card className="p-4 sm:p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Total Spent
          </span>
          <div
            className={`font-heading font-extrabold text-2xl font-tabular ${
              totalSpent > totalBudgeted ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatINR(totalSpent)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {overallPercentage}% of total allocated limit
          </span>
        </Card>

        {/* Remaining / Net Room */}
        <Card className="p-4 sm:p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Remaining Budget Room
          </span>
          <div
            className={`font-heading font-extrabold text-2xl font-tabular ${
              totalBudgeted - totalSpent < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {formatINR(Math.max(0, totalBudgeted - totalSpent))}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {totalBudgeted - totalSpent < 0 ? 'Exceeded period budget' : 'Safe operating margin'}
          </span>
        </Card>
      </div>

      {/* Budget Cards Grid */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
        </div>
      ) : budgets.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Target className="w-6 h-6" />
          </div>
          <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
            No budgets configured for FY {selectedFY} ({selectedPeriod})
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            Create monthly or quarterly budgets for key categories like Food, Utilities, or Travel to keep your spending on track.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
            className="mt-2"
          >
            Create Budget
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((b) => (
            <BudgetCard key={b.id} budget={b} />
          ))}
        </div>
      )}

      {/* Add Modal */}
      <AddBudgetModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreate}
        categories={categories}
        workspaces={workspaces}
        defaultFY={selectedFY}
      />
    </div>
  );
}
