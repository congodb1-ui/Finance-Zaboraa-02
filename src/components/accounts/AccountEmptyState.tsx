import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Building2, Plus, ShieldCheck } from 'lucide-react';

interface AccountEmptyStateProps {
  onAddAccount: () => void;
}

export const AccountEmptyState: React.FC<AccountEmptyStateProps> = ({ onAddAccount }) => {
  return (
    <Card className="p-12 text-center max-w-xl mx-auto border-dashed border-2">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-5 shadow-xs">
        <Building2 className="w-7 h-7" />
      </div>

      <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white tracking-tight">
        No accounts registered yet
      </h3>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        Register your 5–10 Indian bank accounts, digital wallets, or credit cards.
        Statements you upload later will automatically match to these registered accounts.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={onAddAccount}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Your First Account
        </Button>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span>Only last 4 digits stored · Full account numbers never stored</span>
      </div>
    </Card>
  );
};
