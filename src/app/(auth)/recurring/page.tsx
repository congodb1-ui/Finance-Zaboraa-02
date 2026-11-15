'use client';

import React, { useState, useEffect } from 'react';
import { RecurringList } from '../../../components/recurring/RecurringList';
import { AddRecurringModal } from '../../../components/recurring/AddRecurringModal';
import {
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(null);

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

  const handleSave = async (data: RecurringFormData) => {
    if (editingItem) {
      await updateRecurringTransaction(editingItem.id, data);
    } else {
      await createRecurringTransaction(data);
    }
    await loadData();
    setIsModalOpen(false);
    setEditingItem(null);
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
        onOpenAddModal={() => {
          setEditingItem(null);
          setIsModalOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setIsModalOpen(true);
        }}
      />

      <AddRecurringModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSave}
        accounts={accounts}
        categories={categories}
        workspaces={workspaces}
        editingItem={editingItem}
      />
    </div>
  );
}
