'use client';

import React, { useState, useEffect } from 'react';
import { RecurringList } from '../../../components/recurring/RecurringList';
import { AddRecurringModal } from '../../../components/recurring/AddRecurringModal';
import {
  getRecurringTransactions,
  createRecurringTransaction,
  toggleRecurringActive,
  deleteRecurringTransaction,
} from '../../../lib/actions/recurring';
import { getAccounts } from '../../../lib/actions/accounts';
import { getCategories } from '../../../lib/actions/categories';
import { getWorkspaces } from '../../../lib/actions/workspaces';
import type { RecurringTransaction, RecurringFormData } from '../../../types/recurring';
import type { AccountWithBalance } from '../../../types/accounts';
import type { Category } from '../../../types/categories';
import type { Workspace } from '../../../types/workspaces';
import { Loader2 } from 'lucide-react';

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rItems, accs, cats, wss] = await Promise.all([
        getRecurringTransactions(),
        getAccounts(),
        getCategories(),
        getWorkspaces(),
      ]);
      setItems(rItems);
      setAccounts(accs);
      setCategories(cats);
      setWorkspaces(wss);
    } catch (err) {
      console.error('Failed to load recurring data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (data: RecurringFormData) => {
    await createRecurringTransaction(data);
    await loadData();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await toggleRecurringActive(id, active);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_active: active } : item)));
  };

  const handleDelete = async (id: string) => {
    await deleteRecurringTransaction(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full pb-24">
      <RecurringList
        items={items}
        onToggleActive={handleToggle}
        onDelete={handleDelete}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      <AddRecurringModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreate}
        accounts={accounts}
        categories={categories}
        workspaces={workspaces}
      />
    </div>
  );
}
