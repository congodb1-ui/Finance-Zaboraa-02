'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ZaboraaWordmark } from '../ui/ZaboraaWordmark';
import { ThemeToggle } from '../ui/ThemeToggle';
import { signOut, useAuth } from '../../lib/auth';
import {
  LayoutDashboard,
  Building2,
  Upload,
  Receipt,
  Repeat,
  Target,
  Sliders,
  FileSpreadsheet,
  Settings,
  LogOut,
  User,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface AuthNavShellProps {
  children: React.ReactNode;
  activePathOverride?: string;
  onNavigateOverride?: (path: string) => void;
}

export const AuthNavShell: React.FC<AuthNavShellProps> = ({
  children,
  activePathOverride,
  onNavigateOverride,
}) => {
  const currentPath = activePathOverride || (typeof window !== 'undefined' ? window.location.pathname : '/dashboard');
  const { user } = useAuth();

  interface NavItem {
    name: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
    placeholder?: boolean;
  }

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Accounts', path: '/accounts', icon: Building2 },
    { name: 'Upload Statements', path: '/upload', icon: Upload },
    { name: 'Transactions', path: '/transactions', icon: Receipt },
    { name: 'Recurring', path: '/recurring', icon: Repeat },
    { name: 'Budgets', path: '/budgets', icon: Target },
    { name: 'Rules', path: '/rules', icon: Sliders },
    { name: 'Reports', path: '/reports/itr', icon: FileSpreadsheet },
    { name: 'Ask AI', path: '/ai', icon: Sparkles },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const mobileNavItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Ledger', path: '/transactions', icon: Receipt },
    { name: 'Upload', path: '/upload', icon: Upload },
    { name: 'Ask AI', path: '/ai', icon: Sparkles },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const handleNavClick = (e: React.MouseEvent, path: string, isPlaceholder?: boolean) => {
    if (onNavigateOverride) {
      e.preventDefault();
      onNavigateOverride(path);
    }
  };

  const displayName = user?.full_name || 'Owner';
  const displayEmail = user?.email || 'wasimssayyed@gmail.com';
  const avatarUrl = user?.avatar_url;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Desktop Persistent Left Sidebar (260px) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] shrink-0 sticky top-0 h-screen z-30">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800">
          <ZaboraaWordmark size="md" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path || currentPath.startsWith(item.path + '/');

            return (
              <a
                key={item.name}
                href={item.path}
                onClick={(e) => handleNavClick(e, item.path, item.placeholder)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.placeholder && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                      isActive ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    Soon
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        {/* User Profile & Footer Area */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate" title={displayEmail}>
                  {displayEmail}
                </div>
              </div>
            </div>
            <ThemeToggle showText={false} />
          </div>

          <button
            type="button"
            onClick={() => signOut('/')}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] sticky top-0 z-30">
        <ZaboraaWordmark size="sm" />
        <div className="flex items-center gap-2">
          <ThemeToggle showText={false} />
          <button
            type="button"
            onClick={() => signOut('/')}
            className="text-slate-500 hover:text-red-600 p-1.5 cursor-pointer"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <main className="flex-1">{children}</main>
      </div>

      {/* Mobile Bottom Tab Bar (5 main destinations, min 44x44px touch targets) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 z-30">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));

          return (
            <a
              key={item.name}
              href={item.path}
              onClick={(e) => handleNavClick(e, item.path, item.placeholder)}
              className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] py-1 px-2 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5px] text-indigo-600 dark:text-indigo-400' : 'stroke-[1.75px]'}`} />
              <span>{item.name}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
};
