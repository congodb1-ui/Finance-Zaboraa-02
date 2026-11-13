import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNTRIES,
  PINNED_MIDDLE_EAST_COUNT,
  countryCodeToFlag,
  getCountryByCode,
  type Country,
} from '../../lib/data/countries';
import { ChevronDown, X } from 'lucide-react';

export interface CountryPickerProps {
  value: string | null;
  onChange: (code: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  helperText?: string;
  id?: string;
}

export const CountryPicker: React.FC<CountryPickerProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  placeholder = 'Search country...',
  error,
  helperText,
  id,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selectedCountry = useMemo(() => getCountryByCode(value), [value]);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputId =
    id || (label ? `country-picker-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const pinnedCodes = useMemo(
    () => new Set(COUNTRIES.slice(0, PINNED_MIDDLE_EAST_COUNT).map((c) => c.code)),
    []
  );

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const splitIndex = useMemo(() => {
    let lastPinnedIdx = -1;
    for (let i = 0; i < filteredCountries.length; i++) {
      if (pinnedCodes.has(filteredCountries[i].code)) {
        lastPinnedIdx = i;
      } else {
        break;
      }
    }
    return lastPinnedIdx >= 0 && lastPinnedIdx < filteredCountries.length - 1
      ? lastPinnedIdx + 1
      : -1;
  }, [filteredCountries, pinnedCodes]);

  // Close dropdown on outside click
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

  const handleSelect = (country: Country) => {
    onChange(country.code);
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

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      if (e.key !== 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredCountries.length === 0 ? 0 : (prev + 1) % filteredCountries.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredCountries.length === 0
          ? 0
          : (prev - 1 + filteredCountries.length) % filteredCountries.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredCountries[highlightedIndex];
      if (target) {
        handleSelect(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const displayValue = isOpen
    ? searchQuery
    : selectedCountry
    ? `${countryCodeToFlag(selectedCountry.code)} ${selectedCountry.name}`
    : value || '';

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-1.5 relative">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {label} {required && <span className="text-red-500">*</span>}
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
          required={required && !value}
          disabled={disabled}
          value={displayValue}
          placeholder={
            isOpen && selectedCountry
              ? `${countryCodeToFlag(selectedCountry.code)} ${selectedCountry.name}`
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
          className={`w-full py-2 pl-3 pr-14 text-sm rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800 ${
            error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear country"
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
            aria-label="Toggle country list"
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
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs"
        >
          {filteredCountries.length === 0 ? (
            <li className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
              No matching countries found.
            </li>
          ) : (
            filteredCountries.map((country, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = value?.toUpperCase() === country.code;

              return (
                <React.Fragment key={country.code}>
                  {idx === splitIndex && (
                    <li
                      role="separator"
                      className="my-1 border-t border-slate-200 dark:border-slate-800"
                    />
                  )}
                  <li
                    role="option"
                    aria-selected={isSelected}
                    data-option-index={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(country);
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
                    <span className="flex items-center gap-2 truncate">
                      <span>{countryCodeToFlag(country.code)}</span>
                      <span className="truncate">{country.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {country.code} · {country.currency}
                    </span>
                  </li>
                </React.Fragment>
              );
            })
          )}
        </ul>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {helperText && !error && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
};
