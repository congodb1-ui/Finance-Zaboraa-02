import React, { useState, useEffect } from 'react';
import type { TransactionFiltersState } from '../../types/transactions';
import type { AccountWithBalance } from '../../types/accounts';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import {
  Search,
  Filter,
  X,
  Calendar,
  Building2,
  Tag,
  Briefcase,
  Layers,
  ChevronDown,
  Check,
} from 'lucide-react';

interface TransactionFiltersProps {
  filters: TransactionFiltersState;
  onChange: (newFilters: TransactionFiltersState) => void;
  accounts: AccountWithBalance[];
  categories: Category[];
  workspaces: Workspace[];
  totalFilteredCount: number;
}

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  filters,
  onChange,
  accounts,
  categories,
  workspaces,
  totalFilteredCount,
}) => {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Debounce search by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters, onChange]);

  // Compute active filters count (excluding default FY date range)
  let activeCount = 0;
  if (filters.accountIds.length > 0) activeCount += filters.accountIds.length;
  if (filters.categoryIds.length > 0) activeCount += filters.categoryIds.length;
  if (filters.workspaceId && filters.workspaceId !== 'all') activeCount += 1;
  if (filters.txnType && filters.txnType !== 'all') activeCount += 1;
  if (filters.search.trim()) activeCount += 1;
  // If dates differ from standard defaults
  if (filters.startDate !== '2026-04-01' || filters.endDate !== '2027-03-31') activeCount += 1;

  const handleClearFilters = () => {
    setSearchInput('');
    onChange({
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      accountIds: [],
      categoryIds: [],
      workspaceId: 'all',
      txnType: 'all',
      search: '',
    });
  };

  const toggleAccountId = (id: string) => {
    const exists = filters.accountIds.includes(id);
    const newIds = exists ? filters.accountIds.filter((x) => x !== id) : [...filters.accountIds, id];
    onChange({ ...filters, accountIds: newIds });
  };

  const toggleCategoryId = (id: string) => {
    const exists = filters.categoryIds.includes(id);
    const newIds = exists ? filters.categoryIds.filter((x) => x !== id) : [...filters.categoryIds, id];
    onChange({ ...filters, categoryIds: newIds });
  };

  return (
    <div className="sticky top-11 md:top-0 z-20 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-3 px-4 sm:px-6 transition-colors shadow-2xs">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Top Filter Bar: Search, Type, Quick Status */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              data-testid="filter-search"
              placeholder="Search description, reference, UTR..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Transaction Type Filter Tabs */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-medium">
            {([
              { key: 'all', label: 'All' },
              { key: 'expense', label: 'Expense' },
              { key: 'income', label: 'Income' },
              { key: 'transfer', label: 'Transfers' },
              { key: 'refund', label: 'Refund' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ ...filters, txnType: key })}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filters.txnType === key
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Active Filter Count Badge & Clear All */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <Filter className="w-3 h-3" />
                {activeCount} active filter{activeCount > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Secondary Filters Bar: Date Range, Accounts, Categories, Workspace */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs">
          {/* Date Range Picker (From - To) */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-400 font-medium">FY:</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-mono text-[11px] focus:outline-hidden"
              title="Start date (April 1 default)"
            />
            <span className="text-slate-400 text-[11px]">→</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-mono text-[11px] focus:outline-hidden"
              title="End date (March 31 default)"
            />
          </div>

          {/* Account Multi-Select Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAccountDropdownOpen(!accountDropdownOpen);
                setCategoryDropdownOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                filters.accountIds.length > 0
                  ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {filters.accountIds.length === 0
                  ? 'All Accounts'
                  : `${filters.accountIds.length} Account${filters.accountIds.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>

            {accountDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 z-40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1">
                  Filter by Account
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {accounts.map((acc) => {
                    const isSelected = filters.accountIds.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => toggleAccountId(acc.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-medium block truncate">{acc.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {acc.bank_name} {acc.account_number_last4 ? `• ${acc.account_number_last4}` : ''}
                          </span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Category Multi-Select Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setCategoryDropdownOpen(!categoryDropdownOpen);
                setAccountDropdownOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                filters.categoryIds.length > 0
                  ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {filters.categoryIds.length === 0
                  ? 'All Categories'
                  : `${filters.categoryIds.length} Categor${filters.categoryIds.length > 1 ? 'ies' : 'y'}`}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>

            {categoryDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 z-40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1">
                  Filter by Category
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {categories.map((cat) => {
                    const isSelected = filters.categoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategoryId(cat.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-medium truncate">{cat.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Workspace Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filters.workspaceId}
              onChange={(e) => onChange({ ...filters, workspaceId: e.target.value })}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          {/* Total Matching Results Counter */}
          <span className="ml-auto text-[11px] text-slate-500 font-medium font-mono">
            {totalFilteredCount} record{totalFilteredCount === 1 ? '' : 's'} matching
          </span>
        </div>
      </div>
    </div>
  );
};
