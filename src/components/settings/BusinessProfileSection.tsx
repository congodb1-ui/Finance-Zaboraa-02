import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { CountryPicker } from '../ui/CountryPicker';
import { CurrencyPicker } from '../ui/CurrencyPicker';
import { getDefaultCurrencyForCountry } from '../../lib/data/currencies';
import { createClient } from '../../lib/supabase/client';
import {
  getBusinessProfile,
  upsertBusinessProfile,
  uploadLogo,
  getLogoSignedUrl,
  validateLogoFile,
} from '../../lib/actions/businessProfile';
import {
  Building2,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BusinessProfileSection: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);

  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [gstin, setGstin] = useState('');
  const [iec, setIec] = useState('');
  const [lutNumber, setLutNumber] = useState('');
  const [lutDate, setLutDate] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('INR');
  const [currencyOverridden, setCurrencyOverridden] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState('30');
  const [defaultNotes, setDefaultNotes] = useState('');
  const [defaultFooter, setDefaultFooter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBusinessProfile() {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const existing = await getBusinessProfile(supabase);
        if (!isMounted) return;

        if (existing) {
          setCompanyName(existing.company_name || '');
          setLogoPath(existing.logo_path || null);
          setAddress(existing.address || '');
          setCountry(existing.country || '');
          setEmail(existing.email || '');
          setPhone(existing.phone || '');
          setWebsite(existing.website || '');
          setGstin(existing.gstin || '');
          setIec(existing.iec || '');
          setLutNumber(existing.lut_number || '');
          setLutDate(existing.lut_date || '');
          setDefaultCurrency(existing.default_currency || 'INR');
          if (
            existing.country &&
            existing.default_currency &&
            existing.default_currency !== getDefaultCurrencyForCountry(existing.country)
          ) {
            setCurrencyOverridden(true);
          }
          setInvoicePrefix(existing.invoice_prefix || 'INV');
          setDefaultPaymentTermsDays(
            String(existing.default_payment_terms_days ?? 30)
          );
          setDefaultNotes(existing.default_notes || '');
          setDefaultFooter(existing.default_footer || '');

          if (existing.logo_path) {
            try {
              const signed = await getLogoSignedUrl(supabase, existing.logo_path);
              if (isMounted) setLogoSignedUrl(signed);
            } catch {
              if (isMounted) setLogoSignedUrl(null);
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setSaveError(err?.message || 'Unable to load business profile.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadBusinessProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    setLogoSuccess(null);

    const file = e.target.files?.[0];
    if (!file) {
      setSelectedLogoFile(null);
      return;
    }

    const validation = validateLogoFile(file);
    if (validation.valid === false) {
      setSelectedLogoFile(null);
      setLogoError(validation.error);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedLogoFile(file);
  };

  const handleUploadLogo = async () => {
    if (!selectedLogoFile) return;

    setLogoError(null);
    setLogoSuccess(null);

    const validation = validateLogoFile(selectedLogoFile);
    if (validation.valid === false) {
      setLogoError(validation.error);
      return;
    }

    setIsUploadingLogo(true);
    try {
      const supabase = createClient();
      const uploadedPath = await uploadLogo(supabase, selectedLogoFile);
      await upsertBusinessProfile(supabase, { logo_path: uploadedPath });
      const signed = await getLogoSignedUrl(supabase, uploadedPath);

      setLogoPath(uploadedPath);
      setLogoSignedUrl(signed);
      setSelectedLogoFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setLogoSuccess('Logo uploaded and saved.');
    } catch (err: any) {
      setLogoError(err?.message || 'Failed to upload logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const trimmedCurrency = defaultCurrency.trim().toUpperCase();
    if (trimmedCurrency.length !== 3) {
      setSaveError('Please select a 3-letter Default Currency (e.g. INR, USD, KWD).');
      return;
    }

    const trimmedCountry = country.trim().toUpperCase();
    if (trimmedCountry && trimmedCountry.length !== 2) {
      setSaveError('Country must be a 2-letter ISO code (e.g. IN, US).');
      return;
    }

    const trimmedPrefix = invoicePrefix.trim();
    if (!trimmedPrefix || trimmedPrefix.length > 10) {
      setSaveError('Invoice Prefix must be between 1 and 10 characters.');
      return;
    }

    const parsedTerms = Number(defaultPaymentTermsDays);
    if (!Number.isFinite(parsedTerms) || parsedTerms < 0) {
      setSaveError('Default Payment Terms must be a non-negative number of days.');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const saved = await upsertBusinessProfile(supabase, {
        company_name: companyName.trim() || null,
        logo_path: logoPath,
        address: address.trim() || null,
        country: trimmedCountry || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        iec: iec.trim().toUpperCase() || null,
        lut_number: lutNumber.trim() || null,
        lut_date: lutDate || null,
        default_currency: trimmedCurrency || 'INR',
        invoice_prefix: trimmedPrefix,
        default_payment_terms_days: Math.round(parsedTerms),
        default_notes: defaultNotes.trim() || null,
        default_footer: defaultFooter.trim() || null,
      });

      setDefaultCurrency(saved.default_currency);
      setInvoicePrefix(saved.invoice_prefix);
      setDefaultPaymentTermsDays(String(saved.default_payment_terms_days));
      setSaveSuccess('Saved');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save business profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <CardTitle>Business & Invoicing Profile</CardTitle>
        </div>
        <CardDescription>
          Seller identity, export credentials (GSTIN, IEC, LUT), logo, and default billing preferences used on your invoices.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          {saveError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* Brand Logo Upload */}
          <div className="flex flex-col sm:flex-row items-start gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="w-[120px] h-[120px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
              {logoSignedUrl ? (
                <img
                  src={logoSignedUrl}
                  alt="Business logo preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-slate-400" aria-hidden="true" />
              )}
            </div>

            <div className="flex-1 space-y-2 w-full">
              <label
                htmlFor="business-logo-input"
                className="text-xs font-medium text-slate-700 dark:text-slate-300 block"
              >
                Business Logo (PNG, JPG, or WebP — max 1 MB)
              </label>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  id="business-logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileSelect}
                  disabled={isLoading || isUploadingLogo}
                  className="text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 dark:file:border-slate-700 file:text-xs file:font-medium file:bg-white dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-50 dark:hover:file:bg-slate-700 cursor-pointer"
                />

                {selectedLogoFile && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleUploadLogo}
                    isLoading={isUploadingLogo}
                    disabled={isLoading || isUploadingLogo}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                  >
                    Upload Logo
                  </Button>
                )}
              </div>

              {selectedLogoFile && !logoError && (
                <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                  Selected: {selectedLogoFile.name} ({formatBytes(selectedLogoFile.size)})
                </p>
              )}

              {logoError && (
                <p className="text-xs text-red-600 dark:text-red-400">{logoError}</p>
              )}

              {logoSuccess && !logoError && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{logoSuccess}</p>
              )}

              {!selectedLogoFile && !logoError && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stored privately in your encrypted vault and rendered via temporary signed URLs.
                </p>
              )}
            </div>
          </div>

          {/* Company & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Zaboraa Technologies"
              disabled={isLoading || isSaving}
            />

            <CountryPicker
              label="Country"
              value={country || null}
              onChange={(code) => {
                setCountry(code || '');
                if (code && !currencyOverridden) {
                  setDefaultCurrency(getDefaultCurrencyForCountry(code));
                }
              }}
              placeholder="Search country..."
              disabled={isLoading || isSaving}
            />

            <Input
              label="Business Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="billing@company.com"
              disabled={isLoading || isSaving}
            />

            <Input
              label="Business Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98XXXXXXXX"
              disabled={isLoading || isSaving}
            />

            <Input
              label="Website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={isLoading || isSaving}
            />

            <Input
              label="GSTIN"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              disabled={isLoading || isSaving}
            />

            <Input
              label="IEC / Import Export Code"
              value={iec}
              onChange={(e) => setIec(e.target.value.toUpperCase())}
              placeholder="e.g. ABCDE1234F"
              disabled={isLoading || isSaving}
            />

            <div>
              <CurrencyPicker
                label="Default Currency"
                value={defaultCurrency || null}
                onChange={(code) => {
                  setCurrencyOverridden(true);
                  setDefaultCurrency(code || '');
                }}
                placeholder="Search currency..."
                disabled={isLoading || isSaving}
              />
              {country &&
                currencyOverridden &&
                defaultCurrency !== getDefaultCurrencyForCountry(country) && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Suggested for country:{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultCurrency(getDefaultCurrencyForCountry(country));
                        setCurrencyOverridden(false);
                      }}
                      className="font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {getDefaultCurrencyForCountry(country)} (Apply)
                    </button>
                  </p>
                )}
            </div>

            <Input
              label="LUT No."
              value={lutNumber}
              onChange={(e) => setLutNumber(e.target.value)}
              placeholder="e.g. AD270426000123A"
              disabled={isLoading || isSaving}
            />

            <Input
              label="LUT Valid Until"
              type="date"
              value={lutDate}
              onChange={(e) => setLutDate(e.target.value)}
              disabled={isLoading || isSaving}
            />

            <Input
              label="Invoice Prefix"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              placeholder="INV"
              maxLength={10}
              disabled={isLoading || isSaving}
            />

            <Input
              label="Default Payment Terms (Days)"
              type="number"
              min={0}
              value={defaultPaymentTermsDays}
              onChange={(e) => setDefaultPaymentTermsDays(e.target.value)}
              placeholder="30"
              disabled={isLoading || isSaving}
            />
          </div>

          {/* Address */}
          <div className="w-full flex flex-col gap-1.5">
            <label
              htmlFor="business-address"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Business Address
            </label>
            <textarea
              id="business-address"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Registered office street, city, state, PIN"
              disabled={isLoading || isSaving}
              className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
            />
          </div>

          {/* Default Notes & Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="w-full flex flex-col gap-1.5">
              <label
                htmlFor="business-default-notes"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Default Notes
              </label>
              <textarea
                id="business-default-notes"
                rows={3}
                value={defaultNotes}
                onChange={(e) => setDefaultNotes(e.target.value)}
                placeholder="Thank you for your business..."
                disabled={isLoading || isSaving}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
              />
            </div>

            <div className="w-full flex flex-col gap-1.5">
              <label
                htmlFor="business-default-footer"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Invoice Footer / Banking Note
              </label>
              <textarea
                id="business-default-footer"
                rows={3}
                value={defaultFooter}
                onChange={(e) => setDefaultFooter(e.target.value)}
                placeholder="Supply meant for export under LUT without payment of IGST..."
                disabled={isLoading || isSaving}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              disabled={isLoading || isSaving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Business Profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
