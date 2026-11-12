'use client';

import React, { useEffect, useState } from 'react';
import { AccountList } from '../../../components/accounts/AccountList';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  toggleAccountActive,
} from '../../../lib/actions/accounts';
import type { AccountWithBalance } from '../../../types/accounts';
import { Loader2 } from 'lucide-react';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAccounts();
        setAccounts(data);
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <AccountList
        initialAccounts={accounts}
        onCreateAccount={createAccount}
        onUpdateAccount={updateAccount}
        onDeleteAccount={deleteAccount}
        onToggleActive={toggleAccountActive}
      />
    </div>
  );
}
