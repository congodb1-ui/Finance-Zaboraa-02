import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CountryPicker } from '../ui/CountryPicker';
import { CurrencyPicker } from '../ui/CurrencyPicker';
import { formatINR } from '../../types/design-system';
import {
  formatCurrency,
  getCurrencyByCode,
  getDecimalsForCurrency,
  getDefaultCurrencyForCountry,
} from '../../lib/data/currencies';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import { getClients } from '../../lib/actions/clients';
import { getPaymentInstructions } from '../../lib/actions/paymentInstructions';
import { getBusinessProfile } from '../../lib/actions/businessProfile';
import type { InvoiceLineItem } from '../../types/invoices';
import type {
  BusinessProfile,
  Client,
  InvoiceV2,
  InvoiceV2FormData,
  PaymentInstruction,
} from '../../types/invoicing';
import {
  Plus,
  Trash2,
  X,
  AlertCircle,
  Building2,
  Landmark,
  ArrowRightLeft,
  Send,
  Save,
} from 'lucide-react';

export interface InvoiceFormProps {
  initialData?: InvoiceV2 | null;
  onSave: (data: InvoiceV2FormData, isEdit: boolean) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function roundToDecimals(value: number, decimals: number): number {
  const safe = Math.max(0, Math.min(6, decimals));
  const factor = Math.pow(10, safe);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  }
  base.setDate(base.getDate() + Math.max(0, Math.round(days)));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeLineAmount(
  quantity: number,
  unitPrice: number,
  discount: number,
  decimals: number
): number {
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const p = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
  const d = Number.isFinite(discount) && discount > 0 ? discount : 0;
  return Math.max(0, roundToDecimals(q * p - d, decimals));
}

function normalizeInitialLineItems(
  items: InvoiceLineItem[] | undefined,
  decimals: number
): InvoiceLineItem[] {
  if (!items || items.length === 0) {
    return [
      {
        id: 'item_1',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        rate: 0,
        amount: 0,
      },
    ];
  }
  return items.map((it, idx) => {
    const quantity = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
    const unitPrice =
      it.unit_price !== undefined && it.unit_price !== null
        ? Number(it.unit_price)
        : Number(it.rate) || 0;
    const discount = Number(it.discount) > 0 ? Number(it.discount) : 0;
    const amount = computeLineAmount(quantity, unitPrice, discount, decimals);
    return {
      id: it.id || `item_${idx + 1}`,
      description: it.description || '',
      quantity,
      unit_price: unitPrice,
      discount,
      rate: unitPrice,
      amount,
    };
  });
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  initialData,
  onSave,
  onCancel,
  isLoading = false,
}) => {
  const isEditing = Boolean(initialData?.id);
  const todayIso = new Date().toISOString().slice(0, 10);

  const initialCurrency = (initialData?.currency || 'INR').toUpperCase();
  const initialDecimals = getDecimalsForCurrency(initialCurrency);

  const [clients, setClients] = useState<Client[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [clientId, setClientId] = useState<string>(initialData?.client_id || '');
  const [clientName, setClientName] = useState<string>(initialData?.client_name || '');
  const [clientEmail, setClientEmail] = useState<string>(initialData?.client_email || '');
  const [country, setCountry] = useState<string | null>(initialData?.country || null);
  const [currency, setCurrency] = useState<string>(initialCurrency);
  const [currencyManuallySet, setCurrencyManuallySet] = useState<boolean>(
    Boolean(initialData?.currency)
  );
  const [exchangeRate, setExchangeRate] = useState<string>(
    initialData?.exchange_rate && initialData.currency !== 'INR'
      ? String(initialData.exchange_rate)
      : ''
  );

  const [issueDate, setIssueDate] = useState<string>(initialData?.issue_date || todayIso);
  const [dueDate, setDueDate] = useState<string>(
    initialData?.due_date || addDaysToIsoDate(initialData?.issue_date || todayIso, 30)
  );
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);

  const [taxLabel, setTaxLabel] = useState<string>(initialData?.tax_label || 'GST');
  const [taxPercent, setTaxPercent] = useState<string>(
    initialData?.tax_percent !== undefined ? String(initialData.tax_percent) : '18'
  );
  const [paymentInstructionId, setPaymentInstructionId] = useState<string>(
    initialData?.payment_instruction_id || ''
  );
  const [notes, setNotes] = useState<string>(initialData?.notes || '');

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(() =>
    normalizeInitialLineItems(initialData?.line_items, initialDecimals)
  );

  const [error, setError] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<'draft' | 'sent' | null>(null);

  const buildSnapshotString = () =>
    JSON.stringify({
      clientId,
      clientName,
      clientEmail,
      country,
      currency,
      exchangeRate,
      issueDate,
      dueDate,
      taxLabel,
      taxPercent,
      paymentInstructionId,
      notes,
      lineItems,
    });

  const initialSnapshotRef = useRef<string>(buildSnapshotString());
  const notesTouchedRef = useRef<boolean>(Boolean(initialData?.notes));
  const dueDateTouchedRef = useRef<boolean>(Boolean(initialData?.due_date));

  useEffect(() => {
    let active = true;
    async function loadFormContext() {
      setContextLoading(true);
      try {
        const supabase = createSupabaseClient();
        const [clientRows, instructionRows, profile] = await Promise.all([
          getClients(supabase).catch(() => [] as Client[]),
          getPaymentInstructions(supabase).catch(() => [] as PaymentInstruction[]),
          getBusinessProfile(supabase).catch(() => null),
        ]);
        if (!active) return;

        setClients(clientRows);
        setInstructions(instructionRows);
        setBusinessProfile(profile);

        if (!isEditing && profile) {
          const defaultTerms = profile.default_payment_terms_days ?? 30;
          setPaymentTermsDays(defaultTerms);

          if (!dueDateTouchedRef.current) {
            setDueDate(addDaysToIsoDate(issueDate, defaultTerms));
          }
          if (!notesTouchedRef.current && profile.default_notes) {
            setNotes(profile.default_notes);
          }
          if (!currencyManuallySet && profile.default_currency) {
            setCurrency(profile.default_currency.toUpperCase());
          }
        }

        // Auto-select default payment instruction matching initial currency if creating
        if (!isEditing && !paymentInstructionId && instructionRows.length > 0) {
          const targetCur = (
            currencyManuallySet
              ? currency
              : profile?.default_currency || currency
          ).toUpperCase();
          const matching =
            instructionRows.find((i) => i.currency === targetCur && i.is_default) ||
            instructionRows.find((i) => i.currency === targetCur) ||
            instructionRows.find((i) => i.is_default);
          if (matching) {
            setPaymentInstructionId(matching.id);
          }
        }

        // Update clean snapshot after hydration for new invoices so pre-filled defaults aren't falsely dirty
        if (!isEditing) {
          setTimeout(() => {
            if (active) {
              initialSnapshotRef.current = buildSnapshotString();
            }
          }, 0);
        }
      } finally {
        if (active) setContextLoading(false);
      }
    }
    loadFormContext();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-round line item amounts when currency changes (e.g. 2dp -> 3dp for KWD or 0dp for JPY)
  const decimals = useMemo(() => getDecimalsForCurrency(currency), [currency]);
  const currencyMeta = useMemo(() => getCurrencyByCode(currency), [currency]);
  const priceStep = decimals === 3 ? '0.001' : decimals === 0 ? '1' : '0.01';

  useEffect(() => {
    setLineItems((prev) =>
      prev.map((item) => {
        const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
        const unitPrice =
          item.unit_price !== undefined ? Number(item.unit_price) : Number(item.rate) || 0;
        const discount = Number(item.discount) > 0 ? Number(item.discount) : 0;
        return {
          ...item,
          amount: computeLineAmount(qty, unitPrice, discount, decimals),
        };
      })
    );
  }, [decimals]);

  const isDirty = buildSnapshotString() !== initialSnapshotRef.current;

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleRequestClose = () => {
    if (isLoading || submittingMode !== null) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onCancel();
  };

  const selectMatchingInstruction = (targetCurrency: string) => {
    const cur = targetCurrency.toUpperCase();
    const match =
      instructions.find((i) => i.currency === cur && i.is_default) ||
      instructions.find((i) => i.currency === cur);
    if (match) {
      setPaymentInstructionId(match.id);
    }
  };

  const handleClientSelect = (selectedId: string) => {
    setClientId(selectedId);
    if (!selectedId) {
      return;
    }

    const client = clients.find((c) => c.id === selectedId);
    if (!client) return;

    setClientName(client.company_name || client.name);
    setClientEmail(client.email || '');
    setCountry(client.country || null);

    const nextCurrency = (client.default_currency || 'USD').toUpperCase();
    setCurrency(nextCurrency);
    setCurrencyManuallySet(true);

    if (nextCurrency === 'INR') {
      setExchangeRate('');
    }

    const terms = client.payment_terms_days ?? businessProfile?.default_payment_terms_days ?? 30;
    setPaymentTermsDays(terms);
    setDueDate(addDaysToIsoDate(issueDate, terms));
    dueDateTouchedRef.current = true;

    // Smart tax label defaults when switching client on a new invoice
    if (!isEditing) {
      if (client.country && client.country.toUpperCase() !== 'IN') {
        setTaxLabel('Export / LUT');
        setTaxPercent('0');
      } else if (client.country?.toUpperCase() === 'IN') {
        setTaxLabel('GST');
        setTaxPercent('18');
      }
    }

    selectMatchingInstruction(nextCurrency);
  };

  const handleCountryChange = (nextCountry: string | null) => {
    setCountry(nextCountry);
    if (!isEditing && nextCountry && !currencyManuallySet) {
      const suggested = getDefaultCurrencyForCountry(nextCountry);
      setCurrency(suggested);
      selectMatchingInstruction(suggested);
    }
  };

  const handleCurrencyChange = (nextCode: string | null) => {
    const normalized = (nextCode || 'INR').toUpperCase();
    setCurrency(normalized);
    setCurrencyManuallySet(true);
    if (normalized === 'INR') {
      setExchangeRate('');
    }
    selectMatchingInstruction(normalized);
  };

  const handleIssueDateChange = (nextIssue: string) => {
    setIssueDate(nextIssue);
    if (!dueDateTouchedRef.current) {
      setDueDate(addDaysToIsoDate(nextIssue, paymentTermsDays));
    }
  };

  const handleLineItemChange = (
    index: number,
    field: 'description' | 'quantity' | 'unit_price' | 'discount',
    rawValue: string
  ) => {
    setLineItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item };

        if (field === 'description') {
          next.description = rawValue;
          return next;
        }

        const parsed = parseFloat(rawValue);
        const numericVal = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

        if (field === 'quantity') {
          next.quantity = numericVal > 0 ? numericVal : 1;
        } else if (field === 'unit_price') {
          next.unit_price = numericVal;
          next.rate = numericVal;
        } else if (field === 'discount') {
          next.discount = numericVal;
        }

        const qty = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
        const unitPrice =
          next.unit_price !== undefined ? Number(next.unit_price) : Number(next.rate) || 0;
        const discount = Number(next.discount) > 0 ? Number(next.discount) : 0;
        next.amount = computeLineAmount(qty, unitPrice, discount, decimals);
        return next;
      })
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${prev.length + 1}`,
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        rate: 0,
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subtotal = useMemo(
    () =>
      roundToDecimals(
        lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
        decimals
      ),
    [lineItems, decimals]
  );

  const numericTaxPercent = useMemo(() => {
    const parsed = parseFloat(taxPercent);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [taxPercent]);

  const taxAmount = useMemo(
    () => roundToDecimals((subtotal * numericTaxPercent) / 100, decimals),
    [subtotal, numericTaxPercent, decimals]
  );

  const total = useMemo(
    () => roundToDecimals(subtotal + taxAmount, decimals),
    [subtotal, taxAmount, decimals]
  );

  const numericExchangeRate = useMemo(() => {
    if (currency === 'INR') return 1;
    const parsed = parseFloat(exchangeRate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [currency, exchangeRate]);

  const inrEquivalent = useMemo(() => {
    if (currency === 'INR') return roundToDecimals(total, 2);
    if (!numericExchangeRate) return null;
    return roundToDecimals(total * numericExchangeRate, 2);
  }, [currency, total, numericExchangeRate]);

  const sortedInstructions = useMemo(() => {
    return [...instructions].sort((a, b) => {
      const aMatch = a.currency === currency ? 0 : 1;
      const bMatch = b.currency === currency ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [instructions, currency]);

  const selectedInstruction = useMemo(
    () => instructions.find((i) => i.id === paymentInstructionId) || null,
    [instructions, paymentInstructionId]
  );

  const nextNumberPreview = useMemo(() => {
    if (isEditing && initialData?.invoice_number) {
      return initialData.invoice_number;
    }
    if (businessProfile) {
      return `${businessProfile.invoice_prefix}-${String(
        businessProfile.next_invoice_no
      ).padStart(4, '0')} (auto)`;
    }
    return 'Assigned on save';
  }, [isEditing, initialData, businessProfile]);

  const submitWithStatus = async (targetStatus: 'draft' | 'sent') => {
    setError(null);

    if (!clientName.trim()) {
      setError('Client / Business Name is required.');
      return;
    }

    if (!issueDate) {
      setError('Issue date is required.');
      return;
    }

    const validItems = lineItems.filter((it) => it.description.trim().length > 0);
    if (validItems.length === 0) {
      setError('Please enter at least one line item description.');
      return;
    }

    if (currency !== 'INR' && exchangeRate.trim() !== '' && !numericExchangeRate) {
      setError('Exchange rate must be a positive number.');
      return;
    }

    setSubmittingMode(targetStatus);
    try {
      const payload: InvoiceV2FormData = {
        client_id: clientId || null,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        country: country || null,
        currency,
        exchange_rate: numericExchangeRate,
        issue_date: issueDate,
        due_date: dueDate || null,
        line_items: validItems.map((it) => ({
          id: it.id,
          description: it.description.trim(),
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          unit_price: Number(it.unit_price ?? it.rate ?? 0),
          discount: Number(it.discount ?? 0),
          rate: Number(it.unit_price ?? it.rate ?? 0),
          amount: Number(it.amount ?? 0),
        })),
        tax_percent: numericTaxPercent,
        tax_label: taxLabel.trim() || 'GST',
        status: targetStatus,
        notes: notes.trim() || null,
        payment_instruction_id: paymentInstructionId || null,
      };

      await onSave(payload, isEditing);
    } catch (err: any) {
      setError(err?.message || 'Failed to save invoice.');
    } finally {
      setSubmittingMode(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitWithStatus('draft');
  };

  const isBusy = isLoading || submittingMode !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2.5">
                <span>{isEditing ? `Edit Draft ${initialData?.invoice_number}` : 'Create Multi-Currency Invoice'}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {nextNumberPreview}
                </span>
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isEditing
                  ? 'Update draft details before issuing. Invoice number stays locked.'
                  : 'Snapshots seller profile, client details, and bank instructions at creation.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close invoice form"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="space-y-6 pt-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {!contextLoading && !businessProfile && !isEditing && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Business Profile required for invoice numbering</p>
                    <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                      Save your Business Profile in Settings first so Zaboraa Finance can allocate sequential invoice numbers.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    window.location.hash = 'settings';
                  }}
                >
                  Open Settings
                </Button>
              </div>
            )}

            {/* Section 1: Client & Country */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Select Client"
                  value={clientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  disabled={contextLoading}
                  helperText={
                    clients.length === 0 && !contextLoading
                      ? 'No saved clients yet — fill details manually or add clients in Clients.'
                      : 'Selecting a client auto-fills country, currency, and due terms.'
                  }
                >
                  <option value="">Custom / One-off Client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name ? `${c.company_name} (${c.name})` : c.name} — {c.default_currency}
                    </option>
                  ))}
                </Select>

                <CountryPicker
                  label="Client Country"
                  value={country}
                  onChange={handleCountryChange}
                  placeholder="Select country..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Client / Business Name *"
                  placeholder="e.g. Kuwait Petroleum Consulting"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                />
                <Input
                  label="Client Email"
                  type="email"
                  placeholder="accounts@client.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Section 2: Currency, FX & Dates */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CurrencyPicker
                  label="Invoice Currency *"
                  value={currency}
                  onChange={handleCurrencyChange}
                  required
                  helperText={
                    currencyMeta
                      ? `${currencyMeta.symbol} · ${currencyMeta.decimals} decimal ${
                          currencyMeta.decimals === 1 ? 'place' : 'places'
                        }`
                      : undefined
                  }
                />

                {currency !== 'INR' ? (
                  <Input
                    label={`Indicative FX Rate (1 ${currency} = ₹ INR)`}
                    type="number"
                    step="0.000001"
                    min="0"
                    placeholder="e.g. 274.50 or 84.25"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                    className="font-tabular"
                    helperText="Optional now; shows estimated INR equivalent"
                  />
                ) : (
                  <div className="flex flex-col justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Domestic INR Billing
                    </span>
                    <span className="mt-0.5">No FX conversion needed (1 INR = ₹1.00)</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Issue Date *"
                  type="date"
                  value={issueDate}
                  onChange={(e) => handleIssueDateChange(e.target.value)}
                  className="font-tabular"
                  required
                />
                <Input
                  label="Due Date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    dueDateTouchedRef.current = true;
                    setDueDate(e.target.value);
                  }}
                  className="font-tabular"
                />
              </div>
            </div>

            {/* Section 3: Payment Instruction */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <Select
                label="Payment Instruction (Bank Coordinates Snapshot)"
                value={paymentInstructionId}
                onChange={(e) => setPaymentInstructionId(e.target.value)}
                disabled={contextLoading}
              >
                <option value="">None / Specify in notes</option>
                {sortedInstructions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    [{inst.currency}] {inst.label}
                    {inst.bank_name ? ` — ${inst.bank_name}` : ''}
                    {inst.last4 ? ` (••••${inst.last4})` : ''}
                    {inst.is_default ? ' ★ Default' : ''}
                  </option>
                ))}
              </Select>

              {selectedInstruction && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs flex items-start gap-2.5">
                  <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-slate-600 dark:text-slate-300">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {selectedInstruction.beneficiary_name} · {selectedInstruction.currency}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-tabular">
                      {selectedInstruction.bank_name && (
                        <span>Bank: {selectedInstruction.bank_name}</span>
                      )}
                      {selectedInstruction.last4 && (
                        <span>Acct: ••••{selectedInstruction.last4}</span>
                      )}
                      {selectedInstruction.swift_bic && (
                        <span>SWIFT: {selectedInstruction.swift_bic}</span>
                      )}
                      {selectedInstruction.ifsc && <span>IFSC: {selectedInstruction.ifsc}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Line Items */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Line Items ({currency})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addLineItem}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                {/* Column headers on sm+ */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-1 text-center">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Discount</div>
                  <div className="col-span-2 text-right pr-6">Amount</div>
                </div>

                {lineItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 sm:p-0 rounded-lg border sm:border-0 border-slate-200 dark:border-slate-800 bg-slate-50/50 sm:bg-transparent dark:bg-slate-800/30 sm:dark:bg-transparent"
                  >
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        placeholder="Service or deliverable description"
                        value={item.description}
                        onChange={(e) =>
                          handleLineItemChange(idx, 'description', e.target.value)
                        }
                        className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-3 sm:contents gap-2">
                      <div className="sm:col-span-1">
                        <input
                          type="number"
                          aria-label="Quantity"
                          min="0.01"
                          step="any"
                          value={item.quantity ?? 1}
                          onChange={(e) =>
                            handleLineItemChange(idx, 'quantity', e.target.value)
                          }
                          className="w-full py-1.5 px-2 text-xs text-center font-tabular rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          aria-label="Unit price"
                          placeholder={`Price (${currency})`}
                          min="0"
                          step={priceStep}
                          value={
                            item.unit_price !== undefined
                              ? item.unit_price
                              : item.rate || ''
                          }
                          onChange={(e) =>
                            handleLineItemChange(idx, 'unit_price', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 text-xs text-right font-tabular rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          aria-label="Discount"
                          placeholder="Disc."
                          min="0"
                          step={priceStep}
                          value={item.discount ?? 0}
                          onChange={(e) =>
                            handleLineItemChange(idx, 'discount', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 text-xs text-right font-tabular rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-1.5">
                      <span className="sm:hidden text-[11px] text-slate-500">Line Total</span>
                      <span className="text-xs font-tabular font-semibold text-slate-800 dark:text-slate-200">
                        {formatCurrency(item.amount || 0, currency)}
                      </span>
                      {lineItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          aria-label="Remove line item"
                          className="text-slate-400 hover:text-red-500 p-1 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="w-5" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 5: Tax & Totals Summary */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-start justify-between gap-4 text-xs">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <label
                      htmlFor="invoice-tax-label"
                      className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Tax Label
                    </label>
                    <input
                      id="invoice-tax-label"
                      type="text"
                      value={taxLabel}
                      onChange={(e) => setTaxLabel(e.target.value)}
                      placeholder="GST / VAT"
                      className="w-32 py-1 px-2 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="invoice-tax-percent"
                      className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Rate (%)
                    </label>
                    <input
                      id="invoice-tax-percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(e.target.value)}
                      className="w-20 py-1 px-2 text-xs text-center font-tabular rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setTaxLabel('GST');
                      setTaxPercent('18');
                    }}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-indigo-400 cursor-pointer"
                  >
                    GST 18%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTaxLabel('VAT');
                      setTaxPercent('5');
                    }}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-indigo-400 cursor-pointer"
                  >
                    VAT 5%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTaxLabel('Export / LUT');
                      setTaxPercent('0');
                    }}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-indigo-400 cursor-pointer"
                  >
                    Export 0% (LUT)
                  </button>
                </div>
              </div>

              <div className="space-y-1 text-right font-tabular min-w-[200px]">
                <div className="text-slate-500 dark:text-slate-400">
                  Subtotal: {formatCurrency(subtotal, currency)}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {taxLabel || 'Tax'} ({numericTaxPercent}%):{' '}
                  {formatCurrency(taxAmount, currency)}
                </div>
                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                  Total: {formatCurrency(total, currency, { includeCode: true })}
                </div>
                {currency !== 'INR' && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                    {inrEquivalent !== null
                      ? `Est. INR Equivalent: ${formatINR(inrEquivalent)}`
                      : 'INR equivalent calculated when FX rate is set'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="invoice-notes"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Notes / Payment Terms (Optional)
              </label>
              <textarea
                id="invoice-notes"
                rows={2}
                placeholder="e.g. Export of services under LUT without payment of IGST."
                value={notes}
                onChange={(e) => {
                  notesTouchedRef.current = true;
                  setNotes(e.target.value);
                }}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </CardContent>

          {showUnsavedConfirm && (
            <div className="mx-6 mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-amber-900 dark:text-amber-200">
                You have unsaved changes. Leave anyway?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUnsavedConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setShowUnsavedConfirm(false);
                    onCancel();
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}

          <CardFooter className="pt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleRequestClose}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              size="md"
              isLoading={submittingMode === 'draft'}
              disabled={isBusy}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {isEditing ? 'Save Draft' : 'Save as Draft'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={submittingMode === 'sent'}
              disabled={isBusy}
              onClick={() => submitWithStatus('sent')}
              leftIcon={<Send className="w-4 h-4" />}
            >
              {isEditing ? 'Issue & Mark Sent' : 'Create & Mark Sent'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
