import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import type { Transaction } from '../../types/transactions';
import { Receipt, ArrowRight, ArrowRightLeft } from 'lucide-react';

interface RecentTransactionsProps {
  transactions: Transaction[];
  onViewAll?: () => void;
  onSelectTransaction?: (tx: Transaction) => void;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  onViewAll,
  onSelectTransaction,
}) => {
  return (
    <Card className="p-5 flex flex-col justify-between space-y-4">
      {/* Header with View All link */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Recent Ledger Entries
        </span>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View all transactions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Transactions Table / List */}
      {transactions.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No transactions recorded in the ledger yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium text-[11px]">
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Description</th>
                <th className="py-2 px-2">Account</th>
                <th className="py-2 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => onSelectTransaction && onSelectTransaction(tx)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-2.5 px-2 font-tabular text-slate-500 whitespace-nowrap">
                    {tx.txn_date}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5 truncate max-w-[240px]">
                      {tx.is_transfer && (
                        <ArrowRightLeft className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="font-medium text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {tx.description.length > 40
                          ? `${tx.description.slice(0, 40)}...`
                          : tx.description}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {tx.account?.name || 'Bank Account'}
                  </td>
                  <td className="py-2.5 px-2 text-right font-tabular whitespace-nowrap">
                    {tx.debit ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        −{formatINR(tx.debit)}
                      </span>
                    ) : tx.credit ? (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatINR(tx.credit)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
