import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CountryPicker } from '../ui/CountryPicker';
import { CurrencyPicker } from '../ui/CurrencyPicker';
import { getDefaultCurrencyForCountry } from '../../lib/data/currencies';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import { createClient as createClientRecord, updateClient } from '../../lib/actions/clients';
import type { Client, ClientFormData } from '../../types/invoicing';
import { Users, X, AlertCircle } from 'lucide-react';

export interface ClientFormProps {
  isOpen: boolean;
  initialData?: Client | null;
  onClose: () => void;
  onSaved: (client: Client) => void;
}

interface FormValues {
  name: string;
  companyName: string;
  country: string | null;
  defaultCurrency: string | null;
  paymentTermsDays: string;
  city: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
  notes: string;
}

function getInitialValues(initialData?: Client | null): FormValues {
  return {
    name: initialData?.name || '',
    companyName: initialData?.company_name || '',
    country: initialData?.country || null,
    defaultCurrency: initialData?.default_currency || 'USD',
    paymentTermsDays: String(initialData?.payment_terms_days ?? 30),
    city: initialData?.city || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    taxId: initialData?.tax_id || '',
    address: initialData?.address || '',
    notes: initialData?.notes || '',
  };
}

export const ClientForm: React.FC<ClientFormProps> = ({
  isOpen,
  initialData,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialData?.id);

  const [initialValues, setInitialValues] = useState<FormValues>(() =>
    getInitialValues(initialData)
  );
  const [name, setName] = useState(initialValues.name);
  const [companyName, setCompanyName] = useState(initialValues.companyName);
  const [country, setCountry] = useState<string | null>(initialValues.country);
  const [defaultCurrency, setDefaultCurrency] = useState<string | null>(
    initialValues.defaultCurrency
  );
  const [currencyOverridden, setCurrencyOverridden] = useState(false);
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    initialValues.paymentTermsDays
  );
  const [city, setCity] = useState(initialValues.city);
  const [email, setEmail] = useState(initialValues.email);
  const [phone, setPhone] = useState(initialValues.phone);
  const [taxId, setTaxId] = useState(initialValues.taxId);
  const [address, setAddress] = useState(initialValues.address);
  const [notes, setNotes] = useState(initialValues.notes);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const next = getInitialValues(initialData);
    setInitialValues(next);
    setName(next.name);
    setCompanyName(next.companyName);
    setCountry(next.country);
    setDefaultCurrency(next.defaultCurrency);
    // For existing clients with a customized currency, preserve unless user wants to apply suggestion
    const expectedForCountry = next.country
      ? getDefaultCurrencyForCountry(next.country)
      : 'USD';
    setCurrencyOverridden(
      Boolean(initialData?.id && next.defaultCurrency && next.defaultCurrency !== expectedForCountry)
    );
    setPaymentTermsDays(next.paymentTermsDays);
    setCity(next.city);
    setEmail(next.email);
    setPhone(next.phone);
    setTaxId(next.taxId);
    setAddress(next.address);
    setNotes(next.notes);
    setErrorMsg(null);
    setShowUnsavedConfirm(false);
  }, [isOpen, initialData]);

  const isDirty =
    name !== initialValues.name ||
    companyName !== initialValues.companyName ||
    country !== initialValues.country ||
    defaultCurrency !== initialValues.defaultCurrency ||
    paymentTermsDays !== initialValues.paymentTermsDays ||
    city !== initialValues.city ||
    email !== initialValues.email ||
    phone !== initialValues.phone ||
    taxId !== initialValues.taxId ||
    address !== initialValues.address ||
    notes !== initialValues.notes;

  useEffect(() => {
    if (!isOpen || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isDirty]);

  if (!isOpen) return null;

  const suggestedCurrency = country ? getDefaultCurrencyForCountry(country) : null;
  const showSuggestedHint = Boolean(
    suggestedCurrency &&
      currencyOverridden &&
      defaultCurrency !== suggestedCurrency
  );

  const handleCountryChange = (nextCountry: string | null) => {
    setCountry(nextCountry);
    if (nextCountry && !currencyOverridden) {
      setDefaultCurrency(getDefaultCurrencyForCountry(nextCountry));
    }
  };

  const handleCurrencyChange = (nextCurrency: string | null) => {
    setCurrencyOverridden(true);
    setDefaultCurrency(nextCurrency);
  };

  const handleRequestClose = () => {
    if (isSaving) return;
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Client name is required.');
      return;
    }

    const normalizedCurrency = (defaultCurrency || '').trim().toUpperCase();
    if (normalizedCurrency.length !== 3) {
      setErrorMsg('Please select a 3-letter default currency.');
      return;
    }

    const parsedTerms = Number(paymentTermsDays);
    if (!Number.isFinite(parsedTerms) || parsedTerms < 0) {
      setErrorMsg('Payment terms must be a non-negative number of days.');
      return;
    }

    const payload: ClientFormData = {
      name: trimmedName,
      company_name: companyName.trim() || null,
      country: country || null,
      address: address.trim() || null,
      city: city.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      tax_id: taxId.trim() || null,
      default_currency: normalizedCurrency,
      payment_terms_days: Math.round(parsedTerms),
      notes: notes.trim() || null,
    };

    setIsSaving(true);
    try {
      const supabase = createSupabaseClient();
      const saved = isEditing && initialData?.id
        ? await updateClient(supabase, initialData.id, payload)
        : await createClientRecord(supabase, payload);
      onSaved(saved);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save client.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="client-form-title"
                className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white"
              >
                {isEditing ? 'Edit Client' : 'New Client'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing
                  ? 'Update billing details, country, and default invoice currency.'
                  : 'Add an overseas or domestic client for invoicing.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Close modal"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Client Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tariq Al-Sabah"
              required
              disabled={isSaving}
            />

            <Input
              label="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Kuwait Digital Ventures W.L.L."
              disabled={isSaving}
            />

            <CountryPicker
              label="Country"
              value={country}
              onChange={handleCountryChange}
              disabled={isSaving}
              placeholder="Search country..."
            />

            <div>
              <CurrencyPicker
                label="Default Currency"
                required
                value={defaultCurrency}
                onChange={handleCurrencyChange}
                disabled={isSaving}
                placeholder="Search currency..."
              />
              {showSuggestedHint && suggestedCurrency && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Suggested for selected country:{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setDefaultCurrency(suggestedCurrency);
                      setCurrencyOverridden(false);
                    }}
                    className="font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {suggestedCurrency} (Apply)
                  </button>
                </p>
              )}
            </div>

            <Input
              label="Payment Terms (Days)"
              type="number"
              min={0}
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              placeholder="30"
              disabled={isSaving}
            />

            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Kuwait City"
              disabled={isSaving}
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accounts@client.com"
              disabled={isSaving}
            />

            <Input
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+965 9XXX XXXX"
              disabled={isSaving}
            />

            <div className="sm:col-span-2">
              <Input
                label="Tax / VAT / CR No."
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="VAT registration, Commercial Registration, or GSTIN"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="w-full flex flex-col gap-1.5">
            <label
              htmlFor="client-address"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Address
            </label>
            <textarea
              id="client-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, building, district, postal code"
              disabled={isSaving}
              className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
            />
          </div>

          <div className="w-full flex flex-col gap-1.5">
            <label
              htmlFor="client-notes"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Notes
            </label>
            <textarea
              id="client-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes, PO instructions, or archive status"
              disabled={isSaving}
              className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
            />
          </div>

          {showUnsavedConfirm && (
            <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 flex items-center justify-between gap-3 text-xs">
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
                    onClose();
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleRequestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSaving}>
              {isEditing ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
