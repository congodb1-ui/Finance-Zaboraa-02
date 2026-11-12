import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { AccountHealthDot } from '../ui/AccountHealthDot';
import { formatINR, CATEGORY_PALETTE } from '../../types/design-system';
import {
  type AccountWithBalance,
  ACCOUNT_TYPE_LABELS,
} from '../../types/accounts';
import {
  Building2,
  CreditCard,
  Wallet,
  Landmark,
  Pencil,
  Trash2,
  Calendar,
  AlertCircle,
  Clock,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface AccountCardProps {
  account: AccountWithBalance;
  onEdit: (account: AccountWithBalance) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  const isCreditCard = account.account_type === 'credit_card';
  const colorHex = CATEGORY_PALETTE[account.color_index ?? 0] || '#6366F1';

  // Compute days since last import for AccountHealthDot
  let daysAgo: number | undefined = undefined;
  if (account.last_import_date) {
    const lastDate = new Date(account.last_import_date).getTime();
    const now = Date.now();
    daysAgo = Math.max(0, Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)));
  }

  // Credit card utilization calculation
  const creditLimit = account.credit_limit || 0;
  const currentBalance = account.current_balance;
  // For CC, balance is typically negative (spent amount) or due amount
  const spentAmount = Math.abs(currentBalance < 0 ? currentBalance : 0);
  const utilization =
    creditLimit > 0 ? Math.min(100, Math.round((spentAmount / creditLimit) * 100)) : 0;

  // Choose icon based on account type
  const getAccountIcon = () => {
    switch (account.account_type) {
      case 'credit_card':
        return <CreditCard className="w-5 h-5" />;
      case 'wallet':
        return <Wallet className="w-5 h-5" />;
      case 'current':
      case 'salary':
      case 'savings':
      default:
        return <Landmark className="w-5 h-5" />;
    }
  };

  return (
    <Card
      className={`relative p-5 flex flex-col justify-between transition-all ${
        !account.is_active ? 'opacity-50 hover:opacity-75' : ''
      }`}
    >
      <div>
        {/* Top Header Row: Color bar/icon, Name, Status & Health */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
              style={{ backgroundColor: colorHex }}
              aria-hidden="true"
            >
              {getAccountIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-heading font-semibold text-base text-slate-900 dark:text-white leading-tight">
                  {account.name}
                </h4>
                {!account.is_active && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {account.bank_name}
                {account.account_number_last4 && (
                  <span className="font-mono ml-1.5 text-slate-400">
                    •••• {account.account_number_last4}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Health indicator */}
          <div className="shrink-0 flex items-center gap-1.5">
            {account.last_import_date && daysAgo !== undefined ? (
              <AccountHealthDot daysAgo={daysAgo} />
            ) : (
              <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-slate-400/20" />
                <span>Never imported</span>
              </div>
            )}
          </div>
        </div>

        {/* Account Type Badge & Notes */}
        <div className="flex items-center flex-wrap gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md text-xs font-medium border bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
            {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
          </span>
          {account.notes && (
            <span className="text-xs text-slate-500 italic truncate max-w-[200px]" title={account.notes}>
              {account.notes}
            </span>
          )}
        </div>

        {/* Balance Display with Tabular Figures */}
        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 mb-4">
          <span className="text-xs text-slate-500 block mb-1">
            {isCreditCard ? 'Current Outstanding Balance' : 'Current Book Balance'}
          </span>
          <div
            className={`font-heading font-bold text-2xl font-tabular tracking-tight ${
              account.current_balance < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatINR(account.current_balance, { showSign: false })}
          </div>
        </div>

        {/* Credit Card Specific Fields (Limit, Utilization, Billing Cycle) */}
        {isCreditCard && (
          <div className="space-y-2 mb-4 p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Credit Limit:</span>
              <span className="font-tabular font-semibold text-slate-800 dark:text-slate-200">
                {account.credit_limit ? formatINR(account.credit_limit) : 'Not specified'}
              </span>
            </div>

            {account.credit_limit && account.credit_limit > 0 && (
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-500">Limit Utilization:</span>
                  <span
                    className={`font-tabular font-medium ${
                      utilization > 75
                        ? 'text-red-600 dark:text-red-400'
                        : utilization > 40
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {utilization}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      utilization > 75 ? 'bg-red-500' : utilization > 40 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
              </div>
            )}

            {(account.billing_cycle_day || account.payment_due_day) && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-indigo-100/60 dark:border-indigo-900/30">
                {account.billing_cycle_day && (
                  <span>Bill date: {account.billing_cycle_day}th of month</span>
                )}
                {account.payment_due_day && (
                  <span>Due date: {account.payment_due_day}th of month</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions: Active Toggle, Edit, Delete */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <button
          type="button"
          onClick={() => onToggleActive(account.id)}
          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          {account.is_active ? (
            <>
              <ToggleRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Active</span>
            </>
          ) : (
            <>
              <ToggleLeft className="w-4 h-4 text-slate-400" />
              <span>Mark Active</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.hash = `account-detail?id=${account.id}`;
            }}
            aria-label={`View ledger for ${account.name}`}
          >
            Ledger
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(account)}
            aria-label={`Edit ${account.name}`}
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(account.id)}
            aria-label={`Delete ${account.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
