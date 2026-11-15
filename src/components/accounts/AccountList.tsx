import React, { useState } from 'react';
import { AccountCard } from './AccountCard';
import { AccountForm } from './AccountForm';
import { AccountEmptyState } from './AccountEmptyState';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import type { AccountWithBalance, AccountFormData, AccountType } from '../../types/accounts';
import { Plus, Filter, Building2, Wallet, CreditCard, ShieldCheck } from 'lucide-react';

interface AccountListProps {
  initialAccounts: AccountWithBalance[];
  onCreateAccount: (data: AccountFormData) => Promise<AccountWithBalance>;
  onUpdateAccount: (id: string, data: Partial<AccountFormData>) => Promise<AccountWithBalance>;
  onDeleteAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
  onToggleActive: (id: string) => Promise<AccountWithBalance>;
}

export const AccountList: React.FC<AccountListProps> = ({
  initialAccounts,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onToggleActive,
}) => {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>(initialAccounts);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithBalance | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType | 'inactive'>('all');
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    type: 'clear' | 'delete_all';
    account: AccountWithBalance;
    inputName: string;
  } | null>(null);

  const activeAccounts = accounts.filter((a) => a.is_active);
  const totalBalance = activeAccounts.reduce((acc, a) => acc + a.current_balance, 0);

  const filteredAccounts = accounts.filter((a) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'inactive') return !a.is_active;
    return a.account_type === typeFilter;
  });

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (acc: AccountWithBalance) => {
    setEditingAccount(acc);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAccount(null);
  };

  const handleFormSubmit = async (formData: AccountFormData) => {
    try {
      if (editingAccount) {
        const updated = await onUpdateAccount(editingAccount.id, formData);
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const created = await onCreateAccount(formData);
        setAccounts((prev) => [...prev, created]);
      }
      handleCloseForm();
    } catch (err: any) {
      setActionError(err.message || 'Operation failed.');
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleDelete = async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;

    if (
      !window.confirm(
        `Are you sure you want to delete "${acc.name}"? If transactions exist, deletion will be blocked.`
      )
    ) {
      return;
    }

    const res = await onDeleteAccount(id);
    if (res.success) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } else {
      setActionError(res.error || 'Cannot delete account with existing transactions.');
      setTimeout(() => setActionError(null), 5000);
    }
  };

  const handleToggle = async (id: string) => {
    const updated = await onToggleActive(id);
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Multi-Account Registry</span>
          </div>
          <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
            Accounts & Portfolios
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeAccounts.length} active of {accounts.length} total registered accounts
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="md" data-testid="add-account-button" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
            Add Account
          </Button>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between animate-in fade-in">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Aggregate Overview Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Book Balance</span>
          <div className="font-heading font-bold text-2xl font-tabular text-slate-900 dark:text-white">
            {formatINR(totalBalance)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Across all active bank & wallet accounts</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Active Accounts</span>
          <div className="font-heading font-bold text-2xl font-tabular text-indigo-600 dark:text-indigo-400">
            {activeAccounts.length} / {accounts.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Ready for statement auto-matching</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Security & Encryption</span>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Last 4 Digits Only</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Full bank numbers are never stored</span>
        </Card>
      </div>

      {/* Filter Segmented Controls */}
      <div className="flex items-center flex-wrap gap-2 pt-2">
        {(
          [
            { id: 'all', label: 'All Accounts' },
            { id: 'savings', label: 'Savings' },
            { id: 'salary', label: 'Salary' },
            { id: 'current', label: 'Current' },
            { id: 'credit_card', label: 'Credit Cards' },
            { id: 'inactive', label: 'Inactive' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTypeFilter(f.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              typeFilter === f.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Accounts Grid or Empty State */}
      {filteredAccounts.length === 0 ? (
        accounts.length === 0 ? (
          <AccountEmptyState onAddAccount={handleOpenCreate} />
        ) : (
          <Card className="p-12 text-center text-slate-500 text-xs">
            No accounts matching the selected filter.
          </Card>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {filteredAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggle}
              onClearTransactions={(acc) => setConfirmModal({ type: 'clear', account: acc, inputName: '' })}
              onDeleteWithTransactions={(acc) => setConfirmModal({ type: 'delete_all', account: acc, inputName: '' })}
            />
          ))}
        </div>
      )}

      {/* Account Modal Form */}
      {isFormOpen && (
        <AccountForm
          initialData={editingAccount}
          onSubmit={handleFormSubmit}
          onCancel={handleCloseForm}
        />
      )}

      {/* Clear/Delete Confirmation Modal with Typed Name Verification */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
              {confirmModal.type === 'clear'
                ? `Clear Transactions for ${confirmModal.account.name}`
                : `Delete Account "${confirmModal.account.name}" & All Transactions`}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmModal.type === 'clear'
                ? `This action will permanently delete all transactions associated with ${confirmModal.account.name}.`
                : `This action will permanently delete the account ${confirmModal.account.name}, its uploads, and all associated transactions.`}
              {' '}Please type <strong className="font-mono text-red-600 dark:text-red-400 font-bold">{confirmModal.account.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmModal.inputName}
              onChange={(e) => setConfirmModal({ ...confirmModal, inputName: e.target.value })}
              placeholder={confirmModal.account.name}
              className="w-full text-xs font-mono py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={confirmModal.inputName !== confirmModal.account.name}
                onClick={async () => {
                  const targetAcc = confirmModal.account;
                  const isClear = confirmModal.type === 'clear';
                  setConfirmModal(null);
                  try {
                    const { clearAccountTransactions, deleteAccountWithTransactions } = await import('../../lib/actions/upload');
                    if (isClear) {
                      await clearAccountTransactions(targetAcc.id);
                    } else {
                      await deleteAccountWithTransactions(targetAcc.id);
                      setAccounts((prev) => prev.filter((a) => a.id !== targetAcc.id));
                    }
                  } catch (err: any) {
                    setActionError(err.message || 'Action failed.');
                  }
                }}
              >
                {confirmModal.type === 'clear' ? 'Clear Transactions' : 'Delete Account'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
