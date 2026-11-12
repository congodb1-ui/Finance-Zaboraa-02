import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { AccountHealthDot } from '../ui/AccountHealthDot';
import type { AccountWithBalance } from '../../types/accounts';
import { Building2, CreditCard, ChevronRight, Landmark, Wallet } from 'lucide-react';

interface AccountBalanceListProps {
  accounts: AccountWithBalance[];
  onSelectAccount?: (accountId: string) => void;
}

export const AccountBalanceList: React.FC<AccountBalanceListProps> = ({
  accounts,
  onSelectAccount,
}) => {
  // Sort accounts by balance descending
  const sortedAccounts = [...accounts].sort((a, b) => b.current_balance - a.current_balance);

  const getDaysAgo = (importDate?: string | null) => {
    if (!importDate) return 999;
    const last = new Date(importDate).getTime();
    return Math.max(0, Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24)));
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'credit_card':
        return <CreditCard className="w-4 h-4 text-red-500" />;
      case 'wallet':
        return <Wallet className="w-4 h-4 text-indigo-500" />;
      case 'current':
        return <Building2 className="w-4 h-4 text-sky-500" />;
      default:
        return <Landmark className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <Card className="p-5 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Account Health & Balances
        </span>
        <span className="text-[11px] text-slate-400">
          {accounts.length} active account{accounts.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Account List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {sortedAccounts.map((acc) => {
          const daysAgo = getDaysAgo(acc.last_import_date);
          const isCreditCard = acc.account_type === 'credit_card';
          const creditLimit = acc.credit_limit || 0;
          const spent = Math.abs(acc.current_balance < 0 ? acc.current_balance : 0);
          const utilization =
            creditLimit > 0 ? Math.min(100, Math.round((spent / creditLimit) * 100)) : 0;

          return (
            <div
              key={acc.id}
              onClick={() => onSelectAccount && onSelectAccount(acc.id)}
              className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer group"
            >
              {/* Account icon, nickname, bank */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  {getAccountIcon(acc.account_type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {acc.name}
                    </span>
                    <AccountHealthDot daysAgo={daysAgo} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>{acc.bank_name}</span>
                    {acc.account_number_last4 && <span>• ****{acc.account_number_last4}</span>}
                  </div>

                  {/* Credit card limit & utilization */}
                  {isCreditCard && creditLimit > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-tabular mt-1">
                      <span>Limit: {formatINR(creditLimit)}</span>
                      <span>•</span>
                      <span
                        className={
                          utilization > 75
                            ? 'text-red-500 font-bold'
                            : utilization > 40
                            ? 'text-amber-500 font-semibold'
                            : 'text-emerald-500'
                        }
                      >
                        {utilization}% utilized
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Balance & chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div
                    className={`font-heading font-bold text-sm font-tabular ${
                      acc.current_balance < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {formatINR(acc.current_balance)}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    {acc.last_import_date
                      ? `Updated ${daysAgo === 0 ? 'today' : `${daysAgo}d ago`}`
                      : 'No statement yet'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
