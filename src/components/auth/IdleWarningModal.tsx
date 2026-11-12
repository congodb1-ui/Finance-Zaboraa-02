import React from 'react';
import { Button } from '../ui/Button';
import { ShieldAlert, Clock, LogOut } from 'lucide-react';

interface IdleWarningModalProps {
  isOpen: boolean;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
  remainingSeconds: number;
}

export const IdleWarningModal: React.FC<IdleWarningModalProps> = ({
  isOpen,
  onStayLoggedIn,
  onLogoutNow,
  remainingSeconds,
}) => {
  if (!isOpen) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl border border-amber-200 dark:border-amber-900/60 shadow-2xl p-6 space-y-5 text-center"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center mx-auto">
          <Clock className="w-7 h-7 animate-pulse" />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
            Idle Session Warning
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            You've been inactive for 25 minutes. For your vault security, you will be automatically logged out in:
          </p>
          <div className="pt-2 font-mono font-bold text-2xl text-amber-600 dark:text-amber-400 font-tabular">
            {formattedTime}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={onStayLoggedIn}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Stay logged in
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={onLogoutNow}
            leftIcon={<LogOut className="w-4 h-4" />}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Sign out now
          </Button>
        </div>
      </div>
    </div>
  );
};
