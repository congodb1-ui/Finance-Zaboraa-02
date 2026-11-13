import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import { formatINR } from '../../types/design-system';
import { ChevronDown, X } from 'lucide-react';

export interface CreditTransactionOption {
  id: string;
  date: string;
  amount: number;
  description: string;
  account_id: string;
}

export interface TransactionPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

function truncateDescription(text: string, maxLen = 40): string {
  const clean = (text || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen).trimEnd()}…`;
}

export const TransactionPicker: React.FC<TransactionPickerProps> = ({
  value,
  onChange,
  label = 'Link to Transaction',
  helperText,
  placeholder = 'Search credit transactions (optional)...',
  disabled = false,
  id,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [transactions, setTransactions] = useState<CreditTransactionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputId =
    id ||
    (label ? `transaction-picker-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  useEffect(() => {
    let active = true;
    async function loadCreditTransactions() {
      setLoading(true);
      try {
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !active) {
          if (active) setTransactions([]);
          return;
        }

        const { data, error } = await supabase
          .from('transactions')
          .select('id, txn_date, credit, description, account_id')
          .eq('user_id', user.id)
          .gt('credit', 0)
          .order('txn_date', { ascending: false })
          .limit(200);

        if (!active) return;
        if (error || !data) {
          setTransactions([]);
          return;
        }

        const mapped: CreditTransactionOption[] = data.map((row: any) => ({
          id: row.id,
          date: row.txn_date,
          amount: Number(row.credit) || 0,
          description: row.description || '',
          account_id: row.account_id,
        }));
        setTransactions(mapped);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCreditTransactions();
    return () => {
      active = false;
    };
  }, []);

  const selectedTransaction = useMemo(
    () => transactions.find((t) => t.id === value) || null,
    [transactions, value]
  );

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.date.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
    );
  }, [transactions, searchQuery]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-option-index="${highlightedIndex}"]`
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (txn: CreditTransactionOption) => {
    onChange(txn.id);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(null);
    setSearchQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredTransactions.length === 0 ? 0 : (prev + 1) % filteredTransactions.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredTransactions.length === 0
          ? 0
          : (prev - 1 + filteredTransactions.length) % filteredTransactions.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredTransactions[highlightedIndex];
      if (target) handleSelect(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const formatOptionLabel = (txn: CreditTransactionOption) =>
    `${txn.date} · ${truncateDescription(txn.description, 40)} · ${formatINR(txn.amount)}`;

  const displayValue = isOpen
    ? searchQuery
    : selectedTransaction
    ? formatOptionLabel(selectedTransaction)
    : value
    ? 'Linked transaction selected'
    : '';

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-1.5 relative">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          disabled={disabled}
          value={displayValue}
          placeholder={
            isOpen && selectedTransaction
              ? formatOptionLabel(selectedTransaction)
              : loading
              ? 'Loading credit transactions...'
              : placeholder
          }
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true);
              setSearchQuery('');
            }
          }}
          onChange={(e) => {
            if (!isOpen) setIsOpen(true);
            setSearchQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="w-full py-2 pl-3 pr-14 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear linked transaction"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen((prev) => !prev);
                if (!isOpen) inputRef.current?.focus();
              }
            }}
            aria-label="Toggle transaction list"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs"
        >
          {loading ? (
            <li className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
              Loading credit transactions...
            </li>
          ) : filteredTransactions.length === 0 ? (
            <li className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
              {transactions.length === 0
                ? 'No credit transactions found in your accounts.'
                : 'No matching credit transactions found.'}
            </li>
          ) : (
            filteredTransactions.map((txn, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = value === txn.id;

              return (
                <li
                  key={txn.id}
                  role="option"
                  aria-selected={isSelected}
                  data-option-index={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(txn);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200'
                      : isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="truncate flex items-center gap-2">
                    <span className="font-tabular text-slate-400 shrink-0">{txn.date}</span>
                    <span className="truncate">{truncateDescription(txn.description, 40)}</span>
                  </span>
                  <span className="font-tabular font-semibold text-green-600 dark:text-green-400 shrink-0">
                    {formatINR(txn.amount)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}

      {helperText && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
};
