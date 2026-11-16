import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { apiGet, apiPatch, apiPost } from '../../lib/api-client';
import { requestGmailReadonlyGrant } from '../../lib/firebase-gmail';
import { useAuth } from '../../lib/auth';
import { useUserPreferences } from '../../lib/contexts/UserPreferencesContext';
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';

interface GmailStatusResponse {
  gmail_connected: boolean;
  gmail_email: string | null;
  gmail_last_synced: string | null;
  gmail_sync_enabled: boolean;
  has_offline_refresh_support?: boolean;
  last_sync_summary: {
    last_synced_at: string;
    emails_processed: number;
    transactions_added: number;
    errors_count: number;
  } | null;
}

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return 'Never';

  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

export const GmailIntegrationSection: React.FC = () => {
  const { user } = useAuth();
  const { refreshPreferences } = useUserPreferences();

  const [status, setStatus] = useState<GmailStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const extractErrorMessage = (err: any, fallback: string): string => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string' && err.message.trim().length > 0) return err.message;
    if (typeof err.error === 'string' && err.error.trim().length > 0) return err.error;
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== '{}') return serialized;
    } catch {}
    return fallback;
  };

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<GmailStatusResponse>('/api/gmail/status');
      setStatus(data);
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Unable to load Gmail status.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsConnecting(true);
    try {
      const grant = await requestGmailReadonlyGrant({
        loginHint: user?.email || undefined,
        preferCodeFlow: Boolean(status?.has_offline_refresh_support),
      });

      const connected = await apiPost<{ gmail_connected: boolean; gmail_email: string | null }>(
        '/api/gmail/connect',
        grant.mode === 'code'
          ? { code: grant.code }
          : { access_token: grant.access_token, expires_in: grant.expires_in }
      );

      setInfoMsg(
        `Gmail connected${connected.gmail_email ? ` (${connected.gmail_email})` : ''} in read-only mode.`
      );
      await Promise.all([loadStatus(), refreshPreferences()]);
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Failed to connect Gmail.'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSyncing(true);
    try {
      const result = await apiPost<{
        emails_processed: number;
        transactions_added: number;
        errors_count: number;
        last_synced_at: string;
      }>('/api/gmail/sync', {});

      const parts = [
        `${result.emails_processed} email${result.emails_processed === 1 ? '' : 's'} checked`,
        `${result.transactions_added} transaction${result.transactions_added === 1 ? '' : 's'} added`,
      ];
      if (result.errors_count > 0) {
        parts.push(`${result.errors_count} parse warning${result.errors_count === 1 ? '' : 's'}`);
      }
      setInfoMsg(`Sync complete: ${parts.join(' · ')}.`);
      await Promise.all([loadStatus(), refreshPreferences()]);
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Gmail sync failed.'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!status) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsToggling(true);
    try {
      const nextVal = !status.gmail_sync_enabled;
      const res = await apiPatch<{ gmail_sync_enabled: boolean }>('/api/gmail/settings', {
        gmail_sync_enabled: nextVal,
      });
      setStatus((prev) =>
        prev ? { ...prev, gmail_sync_enabled: res.gmail_sync_enabled } : prev
      );
      await refreshPreferences();
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Failed to update auto-sync setting.'));
    } finally {
      setIsToggling(false);
    }
  };

  const handleDisconnect = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsDisconnecting(true);
    try {
      await apiPost('/api/gmail/disconnect', {});
      setConfirmDisconnect(false);
      setInfoMsg('Gmail disconnected and OAuth token removed from Vault.');
      await Promise.all([loadStatus(), refreshPreferences()]);
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Failed to disconnect Gmail.'));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = Boolean(status?.gmail_connected);
  const lastAdded = status?.last_sync_summary?.transactions_added;

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Gmail Integration</CardTitle>
          </div>
          {isConnected ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3" />
              Read-only Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Not Connected
            </span>
          )}
        </div>
        <CardDescription>
          Automatically imports HDFC, BOM, and BOI transactions from bank alert emails every 6 hours.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-xs text-slate-500 py-2">Loading Gmail status...</div>
        ) : !isConnected ? (
          <div className="space-y-3">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                Automatically imports HDFC, BOM, and BOI transactions from alert emails.
              </p>
              <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                No emails are stored — only transaction data is extracted (`gmail.readonly` scope only).
              </p>
            </div>
            <div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnect}
                isLoading={isConnecting}
                leftIcon={<Mail className="w-3.5 h-3.5" />}
              >
                Connect Gmail
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Gmail connected — {status?.gmail_email || user?.email || 'Connected Account'}
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  Last synced: {formatRelativeTime(status?.gmail_last_synced)}
                  {typeof lastAdded === 'number' && status?.gmail_last_synced
                    ? ` (${lastAdded} new transaction${lastAdded === 1 ? '' : 's'})`
                    : ''}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSyncNow}
                  isLoading={isSyncing}
                  disabled={isSyncing || isDisconnecting}
                  leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
                >
                  Sync Now
                </Button>

                {!confirmDisconnect ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={isSyncing || isDisconnecting}
                    leftIcon={<Unplug className="w-3.5 h-3.5" />}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisconnect}
                      isLoading={isDisconnecting}
                    >
                      Confirm Disconnect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDisconnect(false)}
                      disabled={isDisconnecting}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-1 text-xs">
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200 block">
                  Auto-sync every 6 hours: {status?.gmail_sync_enabled ? 'ON' : 'OFF'}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Runs in the background via scheduled sync (`profiles.gmail_sync_enabled`)
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(status?.gmail_sync_enabled)}
                onClick={handleToggleAutoSync}
                disabled={isToggling}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
                  status?.gmail_sync_enabled
                    ? 'bg-indigo-600'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                    status?.gmail_sync_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
