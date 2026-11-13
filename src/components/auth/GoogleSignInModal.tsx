import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { ZaboraaWordmark } from '../ui/ZaboraaWordmark';
import { exchangeGoogleIdToken, getGoogleClientId } from '../../lib/auth';
import { loadGoogleIdentityScript } from '../../lib/google-gis';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [loadingScript, setLoadingScript] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = getGoogleClientId();

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setVerifying(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !verifying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, verifying, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function initGis() {
      if (!clientId) {
        setLoadingScript(false);
        setError('Google Client ID (VITE_GOOGLE_CLIENT_ID) is not configured.');
        return;
      }

      setLoadingScript(true);
      setError(null);

      try {
        const gis = await loadGoogleIdentityScript();
        if (cancelled) return;

        gis.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async (response) => {
            if (!response?.credential) {
              setError('Google did not return a valid ID token.');
              return;
            }
            setVerifying(true);
            setError(null);
            try {
              await exchangeGoogleIdToken(response.credential);
              if (!cancelled) {
                onSuccess();
              }
            } catch (err: any) {
              if (!cancelled) {
                setError(err?.message || 'Google authentication failed.');
                setVerifying(false);
              }
            }
          },
        });

        if (buttonContainerRef.current) {
          buttonContainerRef.current.innerHTML = '';
          const isDark = document.documentElement.classList.contains('dark');
          gis.renderButton(buttonContainerRef.current, {
            type: 'standard',
            theme: isDark ? 'filled_black' : 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 300,
          });
        }

        setLoadingScript(false);
      } catch (err: any) {
        if (!cancelled) {
          setLoadingScript(false);
          setError(err?.message || 'Failed to load Google Sign-In.');
        }
      }
    }

    initGis();

    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId, onSuccess]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-signin-title"
      data-testid="google-signin-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !verifying) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <ZaboraaWordmark size="sm" />
            <h2
              id="google-signin-title"
              className="font-heading font-bold text-lg text-slate-900 dark:text-white pt-2"
            >
              Sign in to your private vault
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Direct Google authentication for <span className="font-mono">finance.zaboraa.com</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={verifying}
            aria-label="Close sign-in dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="py-3 flex flex-col items-center justify-center min-h-[68px]">
          {verifying ? (
            <div className="flex items-center gap-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying allowlist &amp; opening vault...</span>
            </div>
          ) : (
            <>
              {loadingScript && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Loading Google Sign-In...</span>
                </div>
              )}
              <div
                ref={buttonContainerRef}
                className="flex items-center justify-center min-h-[44px]"
              />
            </>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>
            Verified by Zaboraa Finance server allowlist with strict Supabase Row-Level Security.
          </span>
        </div>
      </div>
    </div>
  );
};
