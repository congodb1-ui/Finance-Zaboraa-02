import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '../supabase/client';
import {
  getProfile,
  upsertProfile,
  type ProfileRecord,
  type ProfileUpsertInput,
} from '../actions/profile';
import {
  getAiSettings,
  upsertAiSettings,
  type AiSettingsRecord,
  type AiSettingsUpsertInput,
} from '../actions/aiSettings';
import { themeFlashCache } from '../../components/ui/ThemeToggle';

interface UserPreferencesContextValue {
  profile: ProfileRecord | null;
  aiSettings: AiSettingsRecord;
  aiEnabled: boolean;
  isDark: boolean;
  isPreferencesLoaded: boolean;
  isSyncingTheme: boolean;
  themeSyncMessage: string | null;
  themeSyncError: string | null;
  refreshPreferences: () => Promise<void>;
  saveProfile: (data: ProfileUpsertInput) => Promise<ProfileRecord>;
  saveAiSettings: (data: AiSettingsUpsertInput) => Promise<AiSettingsRecord>;
  toggleDarkMode: () => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_AI_SETTINGS: AiSettingsRecord = {
  ai_enabled: true,
  feature_toggles: {},
};

function getInitialFlashDark(): boolean {
  if (typeof window === 'undefined') return false;
  const cached = themeFlashCache();
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return cached === 'dark' || (!cached && prefersDark);
}

function applyDarkClass(dark: boolean): void {
  if (typeof document === 'undefined') return;
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  profile: null,
  aiSettings: DEFAULT_AI_SETTINGS,
  aiEnabled: true,
  isDark: false,
  isPreferencesLoaded: false,
  isSyncingTheme: false,
  themeSyncMessage: null,
  themeSyncError: null,
  refreshPreferences: async () => {},
  saveProfile: async () => {
    throw new Error('UserPreferencesProvider is not mounted');
  },
  saveAiSettings: async () => {
    throw new Error('UserPreferencesProvider is not mounted');
  },
  toggleDarkMode: async () => ({ success: false, error: 'Provider not mounted' }),
});

interface UserPreferencesProviderProps {
  isAuthenticated: boolean;
  children: React.ReactNode;
}

export const UserPreferencesProvider: React.FC<UserPreferencesProviderProps> = ({
  isAuthenticated,
  children,
}) => {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsRecord>(DEFAULT_AI_SETTINGS);
  const [isDark, setIsDark] = useState<boolean>(() => getInitialFlashDark());
  const [isPreferencesLoaded, setIsPreferencesLoaded] = useState<boolean>(false);
  const [isSyncingTheme, setIsSyncingTheme] = useState<boolean>(false);
  const [themeSyncMessage, setThemeSyncMessage] = useState<string | null>(null);
  const [themeSyncError, setThemeSyncError] = useState<string | null>(null);

  // Apply initial flash-prevention theme to DOM before Supabase resolves
  useEffect(() => {
    applyDarkClass(isDark);
  }, []);

  const refreshPreferences = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setAiSettings(DEFAULT_AI_SETTINGS);
      const localDark = getInitialFlashDark();
      setIsDark(localDark);
      applyDarkClass(localDark);
      setIsPreferencesLoaded(true);
      return;
    }

    try {
      const supabase = createClient();
      const [loadedProfile, loadedAi] = await Promise.all([
        getProfile(supabase),
        getAiSettings(supabase),
      ]);

      setProfile(loadedProfile);
      setAiSettings(loadedAi);

      // profiles.dark_mode is the source of truth when authenticated; overwrite flash cache
      const dbDark = Boolean(loadedProfile?.dark_mode ?? false);
      setIsDark(dbDark);
      applyDarkClass(dbDark);
      themeFlashCache(dbDark ? 'dark' : 'light');
    } catch (err) {
      console.error('Failed to load user preferences from Supabase:', err);
    } finally {
      setIsPreferencesLoaded(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshPreferences();
  }, [refreshPreferences]);

  const saveProfile = useCallback(async (data: ProfileUpsertInput): Promise<ProfileRecord> => {
    const supabase = createClient();
    const updated = await upsertProfile(supabase, data);
    setProfile(updated);

    if (typeof updated.dark_mode === 'boolean') {
      setIsDark(updated.dark_mode);
      applyDarkClass(updated.dark_mode);
      themeFlashCache(updated.dark_mode ? 'dark' : 'light');
    }

    return updated;
  }, []);

  const saveAiSettings = useCallback(
    async (data: AiSettingsUpsertInput): Promise<AiSettingsRecord> => {
      const supabase = createClient();
      const updated = await upsertAiSettings(supabase, data);
      setAiSettings(updated);
      return updated;
    },
    []
  );

  const toggleDarkMode = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const prevDark = isDark;
    const nextDark = !prevDark;

    // Instant visual feedback + flash-cache update
    setIsDark(nextDark);
    applyDarkClass(nextDark);
    themeFlashCache(nextDark ? 'dark' : 'light');
    setThemeSyncMessage(null);
    setThemeSyncError(null);

    if (!isAuthenticated) {
      return { success: true };
    }

    setIsSyncingTheme(true);
    try {
      const supabase = createClient();
      const updated = await upsertProfile(supabase, { dark_mode: nextDark });
      setProfile(updated);
      setThemeSyncMessage('Saved to profile');
      setTimeout(() => setThemeSyncMessage(null), 2500);
      return { success: true };
    } catch (err: any) {
      // Revert optimistic DOM/cache change if Supabase persistence failed
      setIsDark(prevDark);
      applyDarkClass(prevDark);
      themeFlashCache(prevDark ? 'dark' : 'light');
      const errMsg = err?.message || 'Failed to save theme preference.';
      setThemeSyncError(errMsg);
      setTimeout(() => setThemeSyncError(null), 4000);
      return { success: false, error: errMsg };
    } finally {
      setIsSyncingTheme(false);
    }
  }, [isDark, isAuthenticated]);

  return (
    <UserPreferencesContext.Provider
      value={{
        profile,
        aiSettings,
        aiEnabled: aiSettings.ai_enabled,
        isDark,
        isPreferencesLoaded,
        isSyncingTheme,
        themeSyncMessage,
        themeSyncError,
        refreshPreferences,
        saveProfile,
        saveAiSettings,
        toggleDarkMode,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
};

export function useUserPreferences(): UserPreferencesContextValue {
  return useContext(UserPreferencesContext);
}
