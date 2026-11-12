import React, { useState } from 'react';
import type { Transaction } from '../../types/transactions';
import type { Category } from '../../types/categories';
import { formatINR } from '../../types/design-system';
import { Button } from '../ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Filter,
  ArrowRightLeft,
  Calendar,
  Tag,
} from 'lucide-react';

interface AccountLedgerProps {
  transactions: (Transaction & { calculated_running_balance: number })[];
  categories: Category[];
  startDate: string;
  endDate: string;
  onFilterChange: (filters: {
    startDate: string;
    endDate: string;
    categoryId: string;
    txnType: string;
    search: string;
  }) => void;
  onRowClick?: (tx: Transaction) => void;
}

export const AccountLedger: React.FC<AccountLedgerProps> = ({
  transactions,
  categories,
  startDate,
  endDate,
  onFilterChange,
  onRowClick,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [txnType, setTxnType] = useState('all');
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  const pageSize = 50;
  const totalPages = Math.ceil(transactions.length / pageSize) || 1;
  const paginated = transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleApplyFilters = () => {
    setCurrentPage(1);
    onFilterChange({
      startDate: start,
      endDate: end,
      categoryId,
      txnType,
      search,
    });
  };

  const handleResetFilters = () => {
    setSearch('');
    setCategoryId('');
    setTxnType('all');
    setStart(startDate);
    setEnd(endDate);
    setCurrentPage(1);
    onFilterChange({
      startDate,
      endDate,
      categoryId: '',
      txnType: 'all',
      search: '',
    });
  };

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden flex flex-col space-y-4 p-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
        <div>
          <h3 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
            Account Transactions & Cumulative Balance Ledger
          </h3>
          <span className="text-slate-500 text-[11px]">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, transactions.length)} of {transactions.length} entries
          </span>
        </div>

        {/* Pagination buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>
            <span className="px-2 font-mono text-slate-600 dark:text-slate-400">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Filter Row: Search + Category + Type + Dates */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
            placeholder="Search description / reference..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
          />
        </div>

        {/* Category */}
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            onFilterChange({
              startDate: start,
              endDate: end,
              categoryId: e.target.value,
              txnType,
              search,
            });
          }}
          className="py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Txn Type */}
        <select
          value={txnType}
          onChange={(e) => {
            setTxnType(e.target.value);
            onFilterChange({
              startDate: start,
              endDate: end,
              categoryId,
              txnType: e.target.value,
              search,
            });
          }}
          className="py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs"
        >
          <option value="all">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
          <option value="refund">Refund</option>
        </select>

        {/* Reset button */}
        {(search || categoryId || txnType !== 'all') && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
              <th className="py-2.5 px-3 min-w-[240px]">Description</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Debit (−)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Credit (+)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                Running Balance
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {paginated.map((tx) => (
              <tr
                key={tx.id}
                onClick={() => onRowClick && onRowClick(tx)}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                <td className="py-2.5 px-3 font-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {tx.txn_date}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5 truncate">
                    {tx.is_transfer && (
                      <ArrowRightLeft className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                    <span className="font-medium text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {tx.description}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  {tx.category ? (
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
                  ) : tx.is_transfer ? (
                    <span className="text-[11px] text-slate-400">⇄ Transfer</span>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">Uncategorized</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap font-tabular">
                  {tx.debit ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      −{formatINR(tx.debit)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap font-tabular">
                  {tx.credit ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatINR(tx.credit)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                {/* Running Balance with Red styling for negative values */}
                <td className="py-2.5 px-3 text-right whitespace-nowrap font-tabular font-bold">
                  <span
                    className={
                      tx.calculated_running_balance < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-900 dark:text-white'
                    }
                  >
                    {formatINR(tx.calculated_running_balance)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                  {tx.reference_number || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
