import { useState, useEffect, useRef, useCallback } from 'react';
import { signOut } from '../lib/auth';

interface UseIdleLogoutOptions {
  idleTimeoutMs?: number; // default: 30 min (1,800,000 ms)
  warningTimeoutMs?: number; // default: 25 min (1,500,000 ms)
  onLogout?: () => void;
  enabled?: boolean;
}

export function useIdleLogout({
  idleTimeoutMs = 30 * 60 * 1000,
  warningTimeoutMs = 25 * 60 * 1000,
  onLogout,
  enabled = true,
}: UseIdleLogoutOptions = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    Math.round((idleTimeoutMs - warningTimeoutMs) / 1000)
  );

  const lastActivityTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number | null>(null);
  const isHiddenRef = useRef<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );

  const performLogout = useCallback(async () => {
    setShowWarning(false);
    if (onLogout) {
      onLogout();
    } else {
      await signOut('/');
    }
  }, [onLogout]);

  const resetTimer = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    setShowWarning(false);
    setRemainingSeconds(Math.round((idleTimeoutMs - warningTimeoutMs) / 1000));
  }, [idleTimeoutMs, warningTimeoutMs]);

  // Debounced activity handler
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let debounceTimeout: NodeJS.Timeout | null = null;
    const handleUserActivity = () => {
      // If modal is currently warning, activity doesn't auto-close without explicit button click
      if (showWarning) return;

      if (!debounceTimeout) {
        lastActivityTimeRef.current = Date.now();
        debounceTimeout = setTimeout(() => {
          debounceTimeout = null;
        }, 1000); // 1-second debounce
      }
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Visibility change handling: pause timer if tab is hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        isHiddenRef.current = true;
        pausedTimeRef.current = Date.now();
      } else {
        isHiddenRef.current = false;
        if (pausedTimeRef.current) {
          // Add paused duration to lastActivityTime so inactive background time is not counted
          const pausedDuration = Date.now() - pausedTimeRef.current;
          lastActivityTimeRef.current += pausedDuration;
          pausedTimeRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Interval checker running every 1 second
    const interval = setInterval(() => {
      if (isHiddenRef.current) return;

      const elapsed = Date.now() - lastActivityTimeRef.current;

      if (elapsed >= idleTimeoutMs) {
        // Inactivity exceeded 30 minutes -> log out immediately
        clearInterval(interval);
        performLogout();
      } else if (elapsed >= warningTimeoutMs) {
        // Inactivity between 25 and 30 minutes -> show warning modal and update remaining seconds
        setShowWarning(true);
        const rem = Math.max(0, Math.round((idleTimeoutMs - elapsed) / 1000));
        setRemainingSeconds(rem);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [enabled, idleTimeoutMs, warningTimeoutMs, showWarning, performLogout]);

  return {
    showWarning,
    remainingSeconds,
    resetTimer,
    performLogout,
  };
}
