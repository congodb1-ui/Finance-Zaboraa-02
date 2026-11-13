import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { InvoiceForm } from './InvoiceForm';
import { formatINR } from '../../types/design-system';
import { CURRENCIES, formatCurrency } from '../../lib/data/currencies';
import { COUNTRIES, countryCodeToFlag } from '../../lib/data/countries';
import {
  getDisplayStatus,
  getTodayIsoDate,
  isInvoicePastDue,
} from '../../lib/invoices/displayUtils';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import type { InvoiceStatusV2, InvoiceV2, InvoiceV2FormData } from '../../types/invoicing';
import {
  getInvoicesV2,
  createInvoiceV2,
  updateInvoiceV2,
  cancelInvoice,
  deleteDraftInvoiceV2,
} from '../../lib/actions/invoicesV2';
import {
  FileText,
  Plus,
  CheckCircle2,
  Trash2,
  Pencil,
  Ban,
  Loader2,
  AlertCircle,
  Eye,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Check,
} from 'lucide-react';

export interface InvoiceListProps {
  onViewInvoice?: (id: string) => void;
}

const STATUS_FILTER_OPTIONS: { value: InvoiceStatusV2; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatWithCurrencyCode(amount: number, currencyCode: string): string {
  const code = currencyCode.toUpperCase();
  const formatted = formatCurrency(amount, code);
  if (formatted.toUpperCase().startsWith(code)) {
    return formatted;
  }
  return `${code} ${formatted}`;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({ onViewInvoice }) => {
  const navigateToInvoice = (id: string) => {
    if (onViewInvoice) {
      onViewInvoice(id);
    } else {
      window.location.hash = `invoices/${id}`;
    }
  };
  const [invoices, setInvoices] = useState<InvoiceV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceV2 | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Batch 10H client-side filter state
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<InvoiceStatusV2[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [issueDateFrom, setIssueDateFrom] = useState('');
  const [issueDateTo, setIssueDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);

  const todayIso = useMemo(() => getTodayIsoDate(), []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node)
      ) {
        setCountryDropdownOpen(false);
      }
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setCurrencyDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCountryDropdownOpen(false);
        setCurrencyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const list = await getInvoicesV2(supabase);
      setInvoices(list);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      setBanner({ type: 'error', text: err?.message || 'Failed to load invoices.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenCreate = () => {
    setEditingInvoice(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (inv: InvoiceV2) => {
    if (inv.status !== 'draft') return;
    setEditingInvoice(inv);
    setIsFormOpen(true);
  };

  const handleSave = async (formData: InvoiceV2FormData, isEdit: boolean) => {
    setActionLoading(true);
    try {
      const supabase = createSupabaseClient();
      if (isEdit && editingInvoice) {
        const updated = await updateInvoiceV2(supabase, editingInvoice.id, formData);
        setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
        setIsFormOpen(false);
        setEditingInvoice(null);
        setBanner({
          type: 'success',
          text: `Invoice ${updated.invoice_number} updated successfully.`,
        });
      } else {
        const created = await createInvoiceV2(supabase, formData);
        setInvoices((prev) => [created, ...prev]);
        setIsFormOpen(false);
        setEditingInvoice(null);
        setBanner({
          type: 'success',
          text: `Invoice ${created.invoice_number} created successfully.`,
        });
      }
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: `Failed to save invoice: ${err.message}` });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const supabase = createSupabaseClient();
      await cancelInvoice(supabase, id);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'cancelled' } : inv))
      );
      setConfirmCancelId(null);
      setBanner({ type: 'success', text: 'Invoice cancelled.' });
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to cancel invoice.' });
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      const supabase = createSupabaseClient();
      await deleteDraftInvoiceV2(supabase, id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setConfirmDeleteId(null);
      setBanner({ type: 'success', text: 'Draft invoice deleted.' });
      setTimeout(() => setBanner(null), 4000);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to delete invoice.' });
    }
  };

  // Unique countries present in loaded invoices, ordered Middle East first (matching COUNTRIES)
  const availableCountries = useMemo(() => {
    const presentCodes = new Set<string>();
    for (const inv of invoices) {
      const code = (inv.country || inv.client_snapshot?.country || '').trim().toUpperCase();
      if (code) presentCodes.add(code);
    }
    const ordered: { code: string; name: string; flag: string }[] = [];
    const seen = new Set<string>();
    for (const c of COUNTRIES) {
      if (presentCodes.has(c.code)) {
        ordered.push({
          code: c.code,
          name: c.name,
          flag: countryCodeToFlag(c.code),
        });
        seen.add(c.code);
      }
    }
    for (const code of Array.from(presentCodes).sort()) {
      if (!seen.has(code)) {
        ordered.push({
          code,
          name: code,
          flag: countryCodeToFlag(code),
        });
      }
    }
    return ordered;
  }, [invoices]);

  // Unique currencies present in loaded invoices
  const availableCurrencies = useMemo(() => {
    const present = new Set<string>();
    for (const inv of invoices) {
      const cur = (inv.currency || 'INR').trim().toUpperCase();
      if (cur) present.add(cur);
    }
    const ordered: { code: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const c of CURRENCIES) {
      if (present.has(c.code)) {
        ordered.push({ code: c.code, name: c.name });
        seen.add(c.code);
      }
    }
    for (const code of Array.from(present).sort()) {
      if (!seen.has(code)) {
        ordered.push({ code, name: code });
      }
    }
    return ordered;
  }, [invoices]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatuses.length > 0) count += 1;
    if (selectedCountries.length > 0) count += 1;
    if (selectedCurrencies.length > 0) count += 1;
    if (issueDateFrom || issueDateTo) count += 1;
    if (searchQuery.trim()) count += 1;
    return count;
  }, [selectedStatuses, selectedCountries, selectedCurrencies, issueDateFrom, issueDateTo, searchQuery]);

  const handleClearFilters = () => {
    setSelectedStatuses([]);
    setSelectedCountries([]);
    setSelectedCurrencies([]);
    setIssueDateFrom('');
    setIssueDateTo('');
    setSearchQuery('');
    setCountryDropdownOpen(false);
    setCurrencyDropdownOpen(false);
  };

  const toggleStatusFilter = (status: InvoiceStatusV2) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const toggleCountryFilter = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleCurrencyFilter = (code: string) => {
    setSelectedCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Client-side filtered invoices with displayStatus attached
  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return invoices.filter((inv) => {
      const displayStatus = getDisplayStatus(inv, todayIso);

      if (selectedStatuses.length > 0 && !selectedStatuses.includes(displayStatus)) {
        return false;
      }

      if (selectedCountries.length > 0) {
        const countryCode = (inv.country || inv.client_snapshot?.country || '')
          .trim()
          .toUpperCase();
        if (!countryCode || !selectedCountries.includes(countryCode)) {
          return false;
        }
      }

      if (selectedCurrencies.length > 0) {
        const currencyCode = (inv.currency || 'INR').trim().toUpperCase();
        if (!selectedCurrencies.includes(currencyCode)) {
          return false;
        }
      }

      const issueDate = (inv.issue_date || '').slice(0, 10);
      if (issueDateFrom && (!issueDate || issueDate < issueDateFrom)) {
        return false;
      }
      if (issueDateTo && (!issueDate || issueDate > issueDateTo)) {
        return false;
      }

      if (query) {
        const invoiceNumber = (inv.invoice_number || '').toLowerCase();
        const clientName = (inv.client_name || '').toLowerCase();
        const snapshotClientName = (inv.client_snapshot?.name || '').toLowerCase();
        const companyName = (inv.client_snapshot?.company_name || '').toLowerCase();
        if (
          !invoiceNumber.includes(query) &&
          !clientName.includes(query) &&
          !snapshotClientName.includes(query) &&
          !companyName.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    invoices,
    todayIso,
    selectedStatuses,
    selectedCountries,
    selectedCurrencies,
    issueDateFrom,
    issueDateTo,
    searchQuery,
  ]);

  // Filtered summary breakdown (per currency + INR equivalents total)
  const filteredSummary = useMemo(() => {
    const byCurrency = new Map<
      string,
      {
        count: number;
        totalInvoiced: number;
        totalReceived: number;
        totalPending: number;
      }
    >();

    let totalInrEquivalent = 0;
    let totalInrReceived = 0;

    for (const inv of filteredInvoices) {
      const displayStatus = getDisplayStatus(inv, todayIso);
      const currency = (inv.currency || 'INR').trim().toUpperCase();
      const invTotal = Number(inv.total || 0);
      const invReceived =
        inv.amount_received !== null && inv.amount_received !== undefined
          ? Number(inv.amount_received)
          : inv.status === 'paid'
          ? invTotal
          : 0;
      const invPending =
        displayStatus === 'cancelled' ? 0 : Math.max(0, invTotal - invReceived);

      const entry = byCurrency.get(currency) || {
        count: 0,
        totalInvoiced: 0,
        totalReceived: 0,
        totalPending: 0,
      };
      entry.count += 1;
      entry.totalInvoiced += invTotal;
      entry.totalReceived += invReceived;
      entry.totalPending += invPending;
      byCurrency.set(currency, entry);

      if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
        totalInrEquivalent += Number(inv.inr_equivalent) || 0;
      } else if (currency === 'INR') {
        totalInrEquivalent += invTotal;
      }

      if (inv.inr_received !== null && inv.inr_received !== undefined) {
        totalInrReceived += Number(inv.inr_received) || 0;
      } else if (currency === 'INR' && inv.status === 'paid') {
        totalInrReceived += invTotal;
      }
    }

    const currencyLines = Array.from(byCurrency.entries()).map(([currency, stats]) => ({
      currency,
      ...stats,
    }));

    return {
      currencyLines,
      totalInrEquivalent,
      totalInrReceived,
    };
  }, [filteredInvoices, todayIso]);

  const getStatusBadge = (inv: InvoiceV2, displayStatus: InvoiceStatusV2) => {
    const currencyCode = (inv.currency || 'INR').toUpperCase();

    switch (displayStatus) {
      case 'paid':
        return (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-800">
              Paid
            </span>
            {inv.paid_at && (
              <span className="text-[10px] font-tabular text-slate-400">
                {String(inv.paid_at).slice(0, 10)}
              </span>
            )}
          </div>
        );
      case 'partial':
        return (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Partial
            </span>
            <span className="text-[10px] font-tabular text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {formatCurrency(Number(inv.amount_received || 0), currencyCode)} /{' '}
              {formatCurrency(Number(inv.total || 0), currencyCode)}
            </span>
          </div>
        );
      case 'sent':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Sent
          </span>
        );
      case 'overdue':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Overdue
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 border border-slate-200 dark:border-slate-700 line-through">
            Cancelled
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Draft
          </span>
        );
    }
  };

  const outstandingInvoices = invoices.filter((inv) => {
    const ds = getDisplayStatus(inv, todayIso);
    return ds !== 'paid' && ds !== 'cancelled';
  });
  const unpricedFxOutstandingCount = outstandingInvoices.filter(
    (inv) => inv.currency !== 'INR' && inv.inr_equivalent === null
  ).length;

  const totalOutstandingINR = outstandingInvoices.reduce((acc, inv) => {
    if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
      return acc + (Number(inv.inr_equivalent) || 0);
    }
    if ((inv.currency || 'INR').toUpperCase() === 'INR') {
      return acc + (Number(inv.total) || 0);
    }
    return acc;
  }, 0);

  const totalPaidINR = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((acc, inv) => {
      if (inv.inr_received !== null && inv.inr_received !== undefined) {
        return acc + (Number(inv.inr_received) || 0);
      }
      if (inv.inr_equivalent !== null && inv.inr_equivalent !== undefined) {
        return acc + (Number(inv.inr_equivalent) || 0);
      }
      if ((inv.currency || 'INR').toUpperCase() === 'INR') {
        return acc + (Number(inv.total) || 0);
      }
      return acc;
    }, 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Client Billing</span>
          </div>
          <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
            Invoicing & Client Ledgers
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate multi-currency client invoices, track tax provisions, and match incoming receipts.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Invoice
        </Button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            banner.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
          }`}
        >
          {banner.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Outstanding (INR Eq.)</span>
          <div className="font-heading font-bold text-2xl font-tabular text-amber-600 dark:text-amber-400">
            {formatINR(totalOutstandingINR)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {unpricedFxOutstandingCount > 0
              ? `Excludes ${unpricedFxOutstandingCount} FX invoice(s) without rate`
              : 'Awaiting client payment'}
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Paid Receipts (INR)</span>
          <div className="font-heading font-bold text-2xl font-tabular text-green-600 dark:text-green-400">
            {formatINR(totalPaidINR)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Cleared client funds</span>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-slate-500 block mb-1">Total Invoices</span>
          <div className="font-heading font-bold text-2xl font-tabular text-slate-900 dark:text-white">
            {invoices.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {invoices.filter((i) => i.status === 'paid').length} paid ·{' '}
            {outstandingInvoices.length} open ·{' '}
            {invoices.filter((i) => i.status === 'cancelled').length} cancelled
          </span>
        </Card>
      </div>

      {/* Filter Bar & Always-Visible Filtered Summary */}
      <Card className="p-4 space-y-3">
        {/* Mobile Filter Toggle */}
        <div className="flex items-center justify-between md:hidden">
          <button
            type="button"
            onClick={() => setFiltersExpanded((prev) => !prev)}
            aria-expanded={filtersExpanded}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-tabular">
                {activeFilterCount}
              </span>
            )}
            {filtersExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {/* Filter Controls (collapsible on mobile, always visible on md+) */}
        <div className={`${filtersExpanded ? 'block' : 'hidden'} md:block space-y-3`}>
          {/* Status Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
              Status:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStatuses([])}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer border ${
                selectedStatuses.length === 0
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All
            </button>
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const active = selectedStatuses.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatusFilter(opt.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Search, Country Dropdown, Currency Dropdown, Date Range, Clear */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
            {/* Search */}
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Invoice #, client, or company..."
                  className="w-full h-9 pl-8 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Country Multi-Select Dropdown */}
            <div className="lg:col-span-2 relative" ref={countryDropdownRef}>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Country
              </label>
              <button
                type="button"
                onClick={() => {
                  setCurrencyDropdownOpen(false);
                  setCountryDropdownOpen((prev) => !prev);
                }}
                aria-expanded={countryDropdownOpen}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <span className="truncate">
                  {selectedCountries.length === 0
                    ? 'All Countries'
                    : selectedCountries.length === 1
                    ? `${countryCodeToFlag(selectedCountries[0])} ${selectedCountries[0]}`
                    : `${selectedCountries.length} countries`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {countryDropdownOpen && (
                <div className="absolute z-30 mt-1 w-64 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5 space-y-0.5">
                  {availableCountries.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-slate-400 text-center">
                      No countries found
                    </div>
                  ) : (
                    availableCountries.map((country) => {
                      const checked = selectedCountries.includes(country.code);
                      return (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => toggleCountryFilter(country.code)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                            checked
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            {country.flag && <span aria-hidden="true">{country.flag}</span>}
                            <span className="truncate">{country.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {country.code}
                            </span>
                          </span>
                          {checked && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Currency Multi-Select Dropdown */}
            <div className="lg:col-span-2 relative" ref={currencyDropdownRef}>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Currency
              </label>
              <button
                type="button"
                onClick={() => {
                  setCountryDropdownOpen(false);
                  setCurrencyDropdownOpen((prev) => !prev);
                }}
                aria-expanded={currencyDropdownOpen}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <span className="truncate">
                  {selectedCurrencies.length === 0
                    ? 'All Currencies'
                    : selectedCurrencies.length === 1
                    ? selectedCurrencies[0]
                    : `${selectedCurrencies.length} currencies`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {currencyDropdownOpen && (
                <div className="absolute z-30 mt-1 w-56 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5 space-y-0.5">
                  {availableCurrencies.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-slate-400 text-center">
                      No currencies found
                    </div>
                  ) : (
                    availableCurrencies.map((cur) => {
                      const checked = selectedCurrencies.includes(cur.code);
                      return (
                        <button
                          key={cur.code}
                          type="button"
                          onClick={() => toggleCurrencyFilter(cur.code)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                            checked
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="font-mono font-semibold">{cur.code}</span>
                            {cur.name !== cur.code && (
                              <span className="text-[11px] text-slate-400 truncate">
                                {cur.name}
                              </span>
                            )}
                          </span>
                          {checked && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Issue Date From */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Issue Date From
              </label>
              <input
                type="date"
                value={issueDateFrom}
                onChange={(e) => setIssueDateFrom(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {/* Issue Date To + Clear All */}
            <div className="lg:col-span-2 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Issue Date To
                </label>
                <input
                  type="date"
                  value={issueDateTo}
                  onChange={(e) => setIssueDateTo(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="hidden md:inline-flex shrink-0 h-9 px-2.5 text-xs"
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          </div>

          {/* Desktop Clear All Filters link when grid wraps or convenient quick action */}
          {activeFilterCount > 0 && (
            <div className="hidden md:flex items-center justify-end">
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Clear All Filters ({activeFilterCount} active)
              </button>
            </div>
          )}
        </div>

        {/* Always-Visible Summary Row for Filtered Set */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs font-tabular">
          {filteredSummary.currencyLines.length === 0 ? (
            <div className="text-slate-500 dark:text-slate-400">
              0 invoice(s) in current view
            </div>
          ) : (
            filteredSummary.currencyLines.map((line) => (
              <div
                key={line.currency}
                className="text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-1.5"
              >
                <span className="font-semibold text-slate-900 dark:text-white">
                  {line.count} invoice(s)
                </span>
                <span className="text-slate-400">·</span>
                <span>
                  {formatWithCurrencyCode(line.totalInvoiced, line.currency)} invoiced
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-green-700 dark:text-green-400">
                  {formatWithCurrencyCode(line.totalReceived, line.currency)} received
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-amber-700 dark:text-amber-400">
                  {formatWithCurrencyCode(line.totalPending, line.currency)} pending
                </span>
              </div>
            ))
          )}
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            ≈ {formatINR(filteredSummary.totalInrEquivalent)} invoiced ·{' '}
            {formatINR(filteredSummary.totalInrReceived)} received
          </div>
        </div>
      </Card>

      {/* Invoices Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Invoices</CardTitle>
          <span className="text-xs text-slate-500 font-mono">
            {filteredInvoices.length === invoices.length
              ? `${invoices.length} records`
              : `${filteredInvoices.length} of ${invoices.length} records`}
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Loading invoices...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-3">
              <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p>No client invoices created yet.</p>
              <Button size="sm" variant="secondary" onClick={handleOpenCreate}>
                Create First Invoice
              </Button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-3">
              <Filter className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p>No invoices match the selected filters.</p>
              <Button size="sm" variant="secondary" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Invoice #</th>
                  <th className="py-2.5 px-4 font-medium">Client</th>
                  <th className="py-2.5 px-4 font-medium">Issue / Due Date</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total Amount</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.map((inv) => {
                  const flag = countryCodeToFlag(inv.country);
                  const currencyCode = (inv.currency || 'INR').toUpperCase();
                  const isForeign = currencyCode !== 'INR';
                  const displayStatus = getDisplayStatus(inv, todayIso);
                  const isPastDue =
                    displayStatus === 'overdue' || isInvoicePastDue(inv, todayIso);

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <a
                          href={`#invoices/${inv.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateToInvoice(inv.id);
                          }}
                          className="font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          {inv.invoice_number}
                        </a>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {currencyCode}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                          {flag && <span aria-hidden="true">{flag}</span>}
                          <span>{inv.client_name}</span>
                        </div>
                        {(inv.client_email || inv.country || inv.client_snapshot?.company_name) && (
                          <div className="text-[11px] text-slate-400">
                            {[
                              inv.client_snapshot?.company_name,
                              inv.country,
                              inv.client_email,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-tabular text-slate-600 dark:text-slate-400">
                        <div>Issued: {inv.issue_date}</div>
                        {inv.due_date && (
                          <div
                            className={`text-[11px] ${
                              isPastDue
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-slate-400'
                            }`}
                          >
                            Due: {inv.due_date}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-tabular">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {formatCurrency(inv.total, currencyCode)}
                        </div>
                        {isForeign && inv.inr_equivalent !== null && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            ≈ {formatINR(inv.inr_equivalent)}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-normal">
                          incl. {inv.tax_percent}% {inv.tax_label || 'GST'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(inv, displayStatus)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigateToInvoice(inv.id)}
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded cursor-pointer"
                            title="View / Print invoice"
                            aria-label={`View invoice ${inv.invoice_number}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {inv.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(inv)}
                              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded cursor-pointer"
                              title="Edit draft invoice"
                              aria-label={`Edit draft invoice ${inv.invoice_number}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {inv.status !== 'paid' &&
                            inv.status !== 'cancelled' &&
                            (confirmCancelId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCancel(inv.id)}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
                                >
                                  Confirm Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelId(null)}
                                  className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setConfirmCancelId(inv.id);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-600 rounded cursor-pointer"
                                title="Cancel invoice"
                                aria-label={`Cancel invoice ${inv.invoice_number}`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            ))}

                          {inv.status === 'draft' &&
                            (confirmDeleteId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDraft(inv.id)}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmCancelId(null);
                                  setConfirmDeleteId(inv.id);
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                                title="Delete draft invoice"
                                aria-label={`Delete draft invoice ${inv.invoice_number}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {isFormOpen && (
        <InvoiceForm
          initialData={editingInvoice}
          onSave={handleSave}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingInvoice(null);
          }}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
};

