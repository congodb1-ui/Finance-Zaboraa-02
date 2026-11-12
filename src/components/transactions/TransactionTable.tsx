import React from 'react';
import type { Transaction } from '../../types/transactions';
import { formatINR } from '../../types/design-system';
import { Button } from '../ui/Button';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Repeat,
} from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (transaction: Transaction) => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  currentPage,
  totalPages,
  totalCount,
  pageSize = 50,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
}) => {
  const isAllSelected = transactions.length > 0 && transactions.every((t) => selectedIds.includes(t.id));
  const isSomeSelected = transactions.some((t) => selectedIds.includes(t.id)) && !isAllSelected;

  if (transactions.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
          <Inbox className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
          No transactions match your filters
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
          Try expanding your date range, clearing search terms, or importing statements in the Upload module.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      {/* Table Header / Pagination Status */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Financial Ledger</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-500">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
          </span>
        </div>

        {/* Pagination buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>
            <span className="px-2 font-mono text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* MOBILE CARD VIEW (≤768px): Card layout instead of horizontal scroll */}
      <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
        {transactions.map((tx) => {
          const isSelected = selectedIds.includes(tx.id);
          const isTransfer = tx.is_transfer;
          const isDebit = tx.debit !== null && tx.debit !== undefined;
          const amountDisplay = isDebit ? `−${formatINR(tx.debit!)}` : `+${formatINR(tx.credit || 0)}`;

          return (
            <div
              key={tx.id}
              data-testid="transaction-row"
              onClick={() => onRowClick(tx)}
              className={`p-4 space-y-2.5 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              {/* Line 1: Checkbox + Date + Amount */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(tx.id);
                    }}
                    className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(tx.id)}
                      className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                      aria-label={`Select ${tx.description}`}
                    />
                  </div>
                  <span className="font-tabular text-xs sm:text-sm text-slate-500 font-medium">
                    {tx.txn_date}
                  </span>
                </div>

                <div className="text-right">
                  <span
                    className={`font-heading font-bold text-sm sm:text-base font-tabular ${
                      isTransfer
                        ? 'text-slate-600 dark:text-slate-400'
                        : isDebit
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {amountDisplay}
                  </span>
                </div>
              </div>

              {/* Line 2: Description + Recurring indicator */}
              <div className="flex items-center gap-2 pl-9">
                <span className="font-medium text-slate-900 dark:text-white text-sm sm:text-base">
                  {tx.description}
                </span>
                {tx.is_recurring && (
                  <span
                    title="Recurring transaction"
                    className="inline-flex items-center text-indigo-600 dark:text-indigo-400 text-xs bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 font-semibold"
                  >
                    🔁 Recurring
                  </span>
                )}
                {tx.is_manual && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    manual
                  </span>
                )}
              </div>

              {/* Line 3: Category badge + Account */}
              <div className="flex items-center justify-between text-xs sm:text-sm pl-9 pt-0.5">
                <div className="flex items-center gap-1.5">
                  {isTransfer ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      <ArrowRightLeft className="w-3 h-3" />
                      Transfer
                    </span>
                  ) : tx.category ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            tx.category.color_index !== undefined
                              ? ['#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16', '#EAB308', '#F97316', '#EF4444', '#EC4899', '#A855F7'][
                                  tx.category.color_index % 10
                                ]
                              : '#6366F1',
                        }}
                      />
                      <span>{tx.category.name}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px] italic">Uncategorized</span>
                  )}
                </div>

                <span className="text-slate-500 font-medium text-[11px] truncate max-w-[140px]">
                  {tx.account?.name || 'Bank Account'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP TABLE VIEW (>768px): Full columnar ledger */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <th className="py-2.5 px-3.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isSomeSelected;
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Select all transactions on page"
                  className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
              <th className="py-2.5 px-3 min-w-[260px]">Description</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Account</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Debit (−)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Credit (+)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Tags / Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {transactions.map((tx) => {
              const isSelected = selectedIds.includes(tx.id);
              const isTransfer = tx.is_transfer;

              return (
                <tr
                  key={tx.id}
                  data-testid="transaction-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
                    onRowClick(tx);
                  }}
                  className={`group transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                  } ${isTransfer ? 'text-slate-500 dark:text-slate-400' : ''}`}
                >
                  <td className="py-3 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(tx.id)}
                      aria-label={`Select ${tx.description}`}
                      className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap font-tabular text-slate-700 dark:text-slate-300">
                    {tx.txn_date}
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium ${
                          isTransfer
                            ? 'text-slate-600 dark:text-slate-300 line-through-none'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {tx.description}
                      </span>
                      {tx.is_recurring && (
                        <span
                          title="Recurring transaction"
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800"
                        >
                          🔁
                        </span>
                      )}
                      {tx.is_manual && (
                        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          manual
                        </span>
                      )}
                    </div>
                    {tx.reference_number && (
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        Ref: {tx.reference_number}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isTransfer && (
                        <span
                          title="Internal Account Transfer"
                          className="inline-flex items-center p-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                        </span>
                      )}
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {tx.account?.name || 'Bank Account'}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    {isTransfer ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded">
                        ⇄ Transfer
                      </span>
                    ) : tx.category ? (
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                tx.category.color_index !== undefined
                                  ? ['#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16', '#EAB308', '#F97316', '#EF4444', '#EC4899', '#A855F7'][
                                      tx.category.color_index % 10
                                    ]
                                  : '#6366F1',
                            }}
                          />
                          <span>{tx.category.name}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">Uncategorized</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right whitespace-nowrap font-tabular">
                    {tx.debit !== null && tx.debit !== undefined ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        −{formatINR(tx.debit)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right whitespace-nowrap font-tabular">
                    {tx.credit !== null && tx.credit !== undefined ? (
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        +{formatINR(tx.credit)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right whitespace-nowrap font-tabular font-medium">
                    {tx.balance !== null && tx.balance !== undefined ? (
                      <span
                        className={
                          tx.balance < 0
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-800 dark:text-slate-200'
                        }
                      >
                        {formatINR(tx.balance)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 overflow-hidden max-w-[150px]">
                      {tx.tags && tx.tags.length > 0 ? (
                        tx.tags.map((tg) => (
                          <span
                            key={tg}
                            className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          >
                            #{tg}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Pagination */}
      {totalPages > 1 && (
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs sm:text-sm bg-slate-50/30 dark:bg-slate-900/30">
          <span className="text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
