import React, { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useUserPreferences } from '../../lib/contexts/UserPreferencesContext';
import { Mail, X } from 'lucide-react';

interface LatestSyncLog {
  last_synced_at: string;
  transactions_added: number;
  errors_count: number;
}

const DISMISS_STORAGE_KEY = 'zaboraa_gmail_banner_dismissed_sync';

function formatRelativeShort(isoString: string): string {
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return 'recently';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const GmailSyncBanner: React.FC = () => {
  const { profile } = useUserPreferences();
  const [latestLog, setLatestLog] = useState<LatestSyncLog | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const isGmailConnected = Boolean(profile?.gmail_connected);

  useEffect(() => {
    if (!isGmailConnected) {
      setLatestLog(null);
      return;
    }

    let active = true;
    async function fetchLatestSync() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('gmail_sync_log')
          .select('last_synced_at, transactions_added, errors_count')
          .eq('user_id', user.id)
          .order('last_synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;

        const syncKey = data?.last_synced_at || profile?.gmail_last_synced || 'connected';
        const dismissedKey =
          typeof window !== 'undefined' ? localStorage.getItem(DISMISS_STORAGE_KEY) : null;
        setIsDismissed(dismissedKey === syncKey);
        setLatestLog(data || null);
      } catch {
        // Non-blocking UI banner
      }
    }

    fetchLatestSync();
    return () => {
      active = false;
    };
  }, [isGmailConnected, profile?.gmail_last_synced]);

  if (!isGmailConnected || isDismissed) {
    return null;
  }

  const syncedAt = latestLog?.last_synced_at || profile?.gmail_last_synced || null;
  const added = latestLog?.transactions_added ?? 0;
  const errors = latestLog?.errors_count ?? 0;

  const handleDismiss = () => {
    const syncKey = syncedAt || 'connected';
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, syncKey); // UI-only dismiss preference
    } catch {
      // Ignore storage error
    }
    setIsDismissed(true);
  };

  return (
    <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
      <div className="flex items-center gap-2 min-w-0">
        <Mail className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="truncate">
          {!syncedAt ? (
            'Gmail: connected · Ready for first sync'
          ) : errors > 0 ? (
            `Gmail: synced ${formatRelativeShort(syncedAt)} · ${added} added · ${errors} email${
              errors === 1 ? '' : 's'
            } could not be parsed`
          ) : (
            `Gmail: synced ${formatRelativeShort(syncedAt)} · ${added} new transaction${
              added === 1 ? '' : 's'
            } today`
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss Gmail sync banner"
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
