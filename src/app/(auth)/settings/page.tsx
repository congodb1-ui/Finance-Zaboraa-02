'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { signOut, useAuth } from '../../../lib/auth';
import { BackupSection } from '../../../components/settings/BackupSection';
import { BusinessProfileSection } from '../../../components/settings/BusinessProfileSection';
import { GmailIntegrationSection } from '../../../components/settings/GmailIntegrationSection';
import { PaymentInstructionList } from '../../../components/invoicing/PaymentInstructionList';
import { getProfile } from '../../../lib/actions/profile';
import { useUserPreferences } from '../../../lib/contexts/UserPreferencesContext';
import { getFYOptions } from '../../../lib/fy-utils';
import {
  SunMoon,
  LogOut,
  ShieldCheck,
  User,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lock,
  Save,
} from 'lucide-react';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

import { PageErrorBoundary } from '../../../components/ui/PageErrorBoundary';

export default function SettingsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Settings Error">
      <SettingsContent />
    </PageErrorBoundary>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const { profile, saveProfile } = useUserPreferences();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultFy, setDefaultFy] = useState('2026-27');
  const [panInput, setPanInput] = useState('');
  const [hasEncryptedPan, setHasEncryptedPan] = useState(false);
  const [isEditingPan, setIsEditingPan] = useState(false);

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const fyOptions = getFYOptions(4).map((fy) => ({
    value: fy.shortLabel,
    label: fy.label,
  }));

  useEffect(() => {
    let isMounted = true;

    async function loadProfileData() {
      setIsLoadingProfile(true);
      try {
        const current = profile || (await getProfile());
        if (!isMounted) return;

        if (current) {
          setFullName(current.full_name || '');
          setEmail(current.email || user?.email || '');
          setPhone(current.phone || '');
          setAddress(current.address || '');
          setDefaultFy(current.default_fy || '2026-27');
          setHasEncryptedPan(Boolean(current.pan_encrypted));
        } else {
          setFullName(user?.full_name || '');
          setEmail(user?.email || '');
          setDefaultFy('2026-27');
          setHasEncryptedPan(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setProfileError(err?.message || 'Unable to load profile details.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    }

    loadProfileData();
    return () => {
      isMounted = false;
    };
  }, [profile, user?.email, user?.full_name]);

  // Clear temporary plain PAN input if the user leaves Settings
  useEffect(() => {
    return () => {
      setPanInput('');
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const trimmedInput = panInput.trim().toUpperCase();

    // Determine PAN payload based on state
    let panPayload: { pan?: string; pan_number?: string; remove_pan?: boolean; skip_pan?: boolean } = {};

    if (isEditingPan) {
      if (trimmedInput.length > 0) {
        if (!PAN_REGEX.test(trimmedInput)) {
          setProfileError('Enter a valid 10-character PAN (e.g. ABCDE1234F).');
          return;
        }
        panPayload = { pan: trimmedInput, pan_number: trimmedInput };
      } else {
        // User clicked Change PAN and left it empty -> treat as remove PAN
        panPayload = { remove_pan: true, pan: '' };
      }
    } else if (hasEncryptedPan) {
      // User never clicked Change PAN -> omit PAN completely
      panPayload = { skip_pan: true };
    } else {
      // No saved PAN and not editing -> check if user provided one
      if (trimmedInput.length === 0) {
        setProfileError('PAN is required.');
        return;
      }
      if (!PAN_REGEX.test(trimmedInput)) {
        setProfileError('Enter a valid 10-character PAN (e.g. ABCDE1234F).');
        return;
      }
      panPayload = { pan: trimmedInput, pan_number: trimmedInput };
    }

    setIsSavingProfile(true);
    try {
      const updated = await saveProfile({
        full_name: fullName,
        email: email || user?.email || null,
        phone,
        address,
        default_fy: defaultFy,
        ...panPayload,
      });

      setHasEncryptedPan(Boolean(updated.pan_encrypted));
      setIsEditingPan(false);
      setPanInput('');
      setProfileError(null);
      setProfileSuccess('Profile Saved');
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to save profile settings.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Settings Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>Zaboraa Finance</span>
          <span>·</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">Portal Configuration</span>
        </div>
        <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
          Settings & Preferences
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Manage your legal tax profile, interface theme, AI settings, and encrypted vault backup
        </p>
      </div>

      {/* 1. Profile & Tax Identity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>Personal & Tax Profile</CardTitle>
            </div>
            {hasEncryptedPan && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Lock className="w-3 h-3" />
                PAN Encrypted
              </span>
            )}
          </div>
          <CardDescription>
            Stored in your private Supabase profile. PAN is encrypted client-side (AES-256-GCM) before storage and never stored in plaintext.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Legal Name (as per PAN)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Full Legal Name"
                disabled={isLoadingProfile || isSavingProfile}
              />

              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                disabled={isLoadingProfile || isSavingProfile}
              />

              <Input
                label="Mobile Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98XXXXXXXX"
                disabled={isLoadingProfile || isSavingProfile}
              />

              <Select
                label="Default Indian Financial Year"
                value={defaultFy}
                onChange={(e) => setDefaultFy(e.target.value)}
                options={fyOptions}
                disabled={isLoadingProfile || isSavingProfile}
              />

              {hasEncryptedPan && !isEditingPan ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    PAN Number (Encrypted at rest)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-mono text-sm tracking-widest flex items-center justify-between">
                      <span>••••••••••</span>
                      <span className="text-[10px] font-sans text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Encrypted
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingPan(true);
                        setPanInput('');
                        setProfileError(null);
                      }}
                    >
                      Change PAN
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Encrypted with AES-256-GCM. Click Change PAN to replace or remove.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {hasEncryptedPan ? 'New PAN Number' : 'PAN Number (Encrypted at rest)'}
                    </label>
                    {hasEncryptedPan && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingPan(false);
                          setPanInput('');
                          setProfileError(null);
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Keep Current PAN
                      </button>
                    )}
                  </div>
                  <Input
                    type="text"
                    maxLength={10}
                    autoComplete="off"
                    value={panInput}
                    onChange={(e) => {
                      setPanInput(e.target.value.toUpperCase());
                      if (profileError) setProfileError(null);
                    }}
                    placeholder={hasEncryptedPan ? 'Enter 10-char PAN or clear to remove' : 'ABCDE1234F'}
                    helperText={
                      hasEncryptedPan
                        ? 'Leave empty and click Save to remove PAN from profile.'
                        : 'Encrypted with AES-256-GCM before leaving your browser.'
                    }
                    disabled={isLoadingProfile || isSavingProfile}
                  />
                </div>
              )}

              <Input
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="City, State, PIN"
                disabled={isLoadingProfile || isSavingProfile}
              />
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSavingProfile}
                disabled={isLoadingProfile || isSavingProfile}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Save Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Business & Invoicing Profile */}
      <BusinessProfileSection />

      {/* 3. Bank & Payment Instructions */}
      <PaymentInstructionList />

      {/* 3. Theme Setting */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SunMoon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Interface Theme</CardTitle>
          </div>
          <CardDescription>
            Switch between light mode (#F8FAFC) and dark navy (#0B1120) with high-contrast accessibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-2">
          <div>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
              Theme Mode
            </span>
            <span className="text-xs text-slate-500">
              Synced to your Supabase profile (profiles.dark_mode)
            </span>
          </div>
          <ThemeToggle showText={true} />
        </CardContent>
      </Card>

      {/* 3. Gemini AI Intelligence Settings */}
      <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>Gemini AI Intelligence Engine</CardTitle>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
              Active
            </span>
          </div>
          <CardDescription>
            Master AI toggle, Gemini 2.5 Flash / Pro model telemetry, PII masking rules, and connection diagnostic tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Automated categorization, machine narration cleaning, anomaly detection, and Ask-Your-Data chat.
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => (window.location.hash = 'settings/ai')}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Configure AI
          </Button>
        </CardContent>
      </Card>

      {/* 4. Gmail Auto-Import Integration */}
      <GmailIntegrationSection />

      {/* 5. Encrypted Vault Backup */}
      <BackupSection />

      {/* 5. Session & Sign Out */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Account Session & Security</CardTitle>
          </div>
          <CardDescription>
            Currently signed in via Google OAuth. Only allowlisted emails can access this vault. Automatic 30-minute idle logout active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Signed in as:</span>
              <span className="font-medium font-mono text-slate-900 dark:text-slate-100 text-sm">
                {user?.email || 'Authenticated Owner'}
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Single-user vault protection active • 30-min idle timeout
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => signOut('/')}
              leftIcon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign out of Zaboraa Finance
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
