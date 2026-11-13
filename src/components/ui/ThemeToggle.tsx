import React from 'react';
import { Sun, Moon, Check, Loader2 } from 'lucide-react';
import { useUserPreferences } from '../../lib/contexts/UserPreferencesContext';

interface ThemeToggleProps {
  className?: string;
  showText?: boolean;
}

/**
 * Flash-prevention cache for dark mode before Supabase profile resolves.
 */
export function themeFlashCache(mode?: 'dark' | 'light'): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return mode ? (localStorage.setItem('zaboraa_theme', mode), mode) : localStorage.getItem('zaboraa_theme'); // UI-ONLY, safe to keep local — not synced
  } catch {
    return null;
  }
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showText = false,
}) => {
  const {
    isDark,
    isSyncingTheme,
    themeSyncMessage,
    themeSyncError,
    toggleDarkMode,
  } = useUserPreferences();

  const handleToggle = async () => {
    await toggleDarkMode();
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSyncingTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={themeSyncError || themeSyncMessage || (isDark ? 'Switch to light mode' : 'Switch to dark mode')}
        className={`inline-flex items-center justify-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer disabled:opacity-70 ${className}`}
      >
        {isSyncingTheme ? (
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
        ) : isDark ? (
          <Sun className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <Moon className="w-4 h-4 text-slate-600 shrink-0" />
        )}
        {showText && (
          <span className="text-xs font-medium">
            {isDark ? 'Light' : 'Dark'}
          </span>
        )}
      </button>

      {showText && themeSyncMessage && !themeSyncError && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="w-3 h-3" />
          {themeSyncMessage}
        </span>
      )}
      {showText && themeSyncError && (
        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {themeSyncError}
        </span>
      )}
    </div>
  );
};
