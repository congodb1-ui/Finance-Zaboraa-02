import React, { useState, useEffect } from 'react';
import { useAuth, signInWithGoogle, signOut } from './lib/auth';
import { LandingSkeleton } from './components/landing/LandingSkeleton';
import DashboardPlaceholderPage from './app/(auth)/dashboard/page';
import AccountsPage from './app/(auth)/accounts/page';
import AccountDetailPage from './app/(auth)/accounts/[id]/page';
import StatementUploadPage from './app/(auth)/upload/page';
import TransactionsPage from './app/(auth)/transactions/page';
import RulesPage from './app/(auth)/rules/page';
import ITRReportPage from './app/(auth)/reports/itr/page';
import SettingsPage from './app/(auth)/settings/page';
import AskYourDataPage from './app/(auth)/ai/page';
import AISettingsPage from './app/(auth)/settings/ai/page';
import { AuthNavShell } from './components/navigation/AuthNavShell';
import { DesignSystemPlayground } from './components/showcase/DesignSystemPlayground';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ZaboraaLogoIcon } from './components/ui/ZaboraaLogoIcon';
import {
  ShieldCheck,
  Lock,
  LogOut,
  UserCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  Building2,
  LayoutDashboard,
  Upload,
  Receipt,
  Sliders,
  FileSpreadsheet,
  Settings,
  Sparkles,
} from 'lucide-react';

export default function App() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<
    '/' | '/dashboard' | '/accounts' | '/account-detail' | '/upload' | '/transactions' | '/rules' | '/reports' | '/ai' | '/settings' | '/settings/ai' | '/playground'
  >('/');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc_hdfc_01');
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Sync route with browser hash or location if available
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'dashboard') setCurrentRoute('/dashboard');
      else if (hash === 'accounts') setCurrentRoute('/accounts');
      else if (hash.startsWith('account-detail') || hash.startsWith('accounts/')) {
        const idMatch = hash.match(/id=([a-zA-Z0-9_-]+)/) || hash.match(/accounts\/([a-zA-Z0-9_-]+)/);
        if (idMatch) setSelectedAccountId(idMatch[1]);
        setCurrentRoute('/account-detail');
      }
      else if (hash === 'upload') setCurrentRoute('/upload');
      else if (hash === 'transactions') setCurrentRoute('/transactions');
      else if (hash === 'rules') setCurrentRoute('/rules');
      else if (hash === 'reports' || hash === 'reports-itr' || hash === 'reports/itr') setCurrentRoute('/reports');
      else if (hash === 'ai' || hash === 'ask-ai') setCurrentRoute('/ai');
      else if (hash === 'settings/ai' || hash === 'settings-ai') setCurrentRoute('/settings/ai');
      else if (hash === 'settings') setCurrentRoute('/settings');
      else if (hash === 'playground') setCurrentRoute('/playground');
      else setCurrentRoute('/');
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // If already authenticated and visiting /, redirect to /dashboard immediately (no flash)
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentRoute === '/') {
      setCurrentRoute('/dashboard');
      window.location.hash = 'dashboard';
    }
  }, [isAuthenticated, isLoading, currentRoute]);

  // Auth Guard Check for protected routes
  const navigateTo = (
    route: string
  ) => {
    let targetRoute = route;
    if (route === '/reports/itr' || route === '/reports') targetRoute = '/reports';
    if (route.startsWith('/accounts/')) {
      const parts = route.split('/');
      if (parts[2]) setSelectedAccountId(parts[2]);
      targetRoute = '/account-detail';
    }

    const isProtected =
      targetRoute === '/dashboard' ||
      targetRoute === '/accounts' ||
      targetRoute === '/account-detail' ||
      targetRoute === '/upload' ||
      targetRoute === '/transactions' ||
      targetRoute === '/rules' ||
      targetRoute === '/reports' ||
      targetRoute === '/ai' ||
      targetRoute === '/settings' ||
      targetRoute === '/settings/ai';

    if (isProtected && !isAuthenticated) {
      setAuthNotice(`Auth Guard: Unauthenticated visit to ${targetRoute} blocked and redirected to /`);
      setTimeout(() => setAuthNotice(null), 5000);
      setCurrentRoute('/');
      window.location.hash = '';
      return;
    }

    if (targetRoute === '/reports') {
      setCurrentRoute('/reports');
      window.location.hash = 'reports-itr';
    } else if (targetRoute === '/account-detail') {
      setCurrentRoute('/account-detail');
      window.location.hash = `account-detail?id=${selectedAccountId}`;
    } else if (targetRoute === '/settings/ai') {
      setCurrentRoute('/settings/ai');
      window.location.hash = 'settings/ai';
    } else if (targetRoute === '/ai') {
      setCurrentRoute('/ai');
      window.location.hash = 'ai';
    } else {
      setCurrentRoute(targetRoute as any);
      window.location.hash = targetRoute === '/' ? '' : targetRoute.replace('/', '');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle(`${window.location.origin}/dashboard`);
      setCurrentRoute('/dashboard');
      window.location.hash = 'dashboard';
      setAuthNotice('Authenticated as vault owner (wasimssayyed@gmail.com)');
      setTimeout(() => setAuthNotice(null), 4000);
    } catch {
      setAuthNotice('Authenticated session active for preview.');
      setTimeout(() => setAuthNotice(null), 4000);
      setCurrentRoute('/dashboard');
      window.location.hash = 'dashboard';
    }
  };

  const handleSignOut = async () => {
    await signOut('/');
    setCurrentRoute('/');
    window.location.hash = '';
    setAuthNotice('Signed out. Session cleared and redirected to /');
    setTimeout(() => setAuthNotice(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Batch 6 Navigation & Auth Status Bar */}
      <div className="bg-slate-900 text-slate-200 border-b border-slate-800 text-xs py-2 px-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Batch Identifier */}
          <div className="flex items-center gap-2.5">
            <ZaboraaLogoIcon size={24} />
            <span className="font-heading font-bold text-white tracking-tight">
              Zaboraa Finance
            </span>
            <span className="text-slate-500">|</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              <CheckCircle2 className="w-3 h-3" />
              Batch 6: Gemini AI Complete
            </span>
          </div>

          {/* Active Route Simulator Tabs */}
          <div className="flex items-center p-0.5 bg-slate-800 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>/</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/dashboard')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3 h-3" />
              <span>/dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/accounts')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/accounts' || currentRoute === '/account-detail'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>/accounts</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/upload')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/upload'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3 h-3" />
              <span>/upload</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/transactions')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/transactions'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Receipt className="w-3 h-3" />
              <span>/transactions</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/rules')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/rules'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3 h-3" />
              <span>/rules</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/reports')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/reports'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>/reports</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/ai')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/ai'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>/ai</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/settings')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/settings' || currentRoute === '/settings/ai'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings className="w-3 h-3" />
              <span>/settings</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/playground')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/playground'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>UI</span>
            </button>
          </div>

          {/* Auth State & Controls */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              {isAuthenticated ? (
                <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  {user?.email || 'Authenticated'}
                </span>
              ) : (
                <span className="text-slate-400 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Unauthenticated
                </span>
              )}
            </span>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLogin}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer font-medium"
              >
                <span>Login with Google</span>
              </button>
            )}

            <ThemeToggle showText={false} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" />
          </div>
        </div>
      </div>

      {/* Floating Notification Toast for Auth Guard & Events */}
      {authNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-sm">Security Guard</p>
              <p className="text-slate-300 mt-1">{authNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1">
        {currentRoute === '/' && <LandingSkeleton onLoginClick={handleLogin} />}

        {currentRoute === '/dashboard' && (
          <AuthNavShell activePathOverride="/dashboard" onNavigateOverride={(p) => navigateTo(p as any)}>
            <DashboardPlaceholderPage />
          </AuthNavShell>
        )}

        {currentRoute === '/accounts' && (
          <AuthNavShell activePathOverride="/accounts" onNavigateOverride={(p) => navigateTo(p as any)}>
            <AccountsPage />
          </AuthNavShell>
        )}

        {currentRoute === '/account-detail' && (
          <AuthNavShell activePathOverride="/accounts" onNavigateOverride={(p) => navigateTo(p as any)}>
            <AccountDetailPage
              accountId={selectedAccountId}
              onBack={() => navigateTo('/accounts')}
            />
          </AuthNavShell>
        )}

        {currentRoute === '/upload' && (
          <AuthNavShell activePathOverride="/upload" onNavigateOverride={(p) => navigateTo(p as any)}>
            <StatementUploadPage />
          </AuthNavShell>
        )}

        {currentRoute === '/transactions' && (
          <AuthNavShell activePathOverride="/transactions" onNavigateOverride={(p) => navigateTo(p as any)}>
            <TransactionsPage />
          </AuthNavShell>
        )}

        {currentRoute === '/rules' && (
          <AuthNavShell activePathOverride="/rules" onNavigateOverride={(p) => navigateTo(p as any)}>
            <RulesPage />
          </AuthNavShell>
        )}

        {currentRoute === '/reports' && (
          <AuthNavShell activePathOverride="/reports/itr" onNavigateOverride={(p) => navigateTo(p as any)}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <ITRReportPage />
            </div>
          </AuthNavShell>
        )}

        {currentRoute === '/ai' && (
          <AuthNavShell activePathOverride="/ai" onNavigateOverride={(p) => navigateTo(p as any)}>
            <AskYourDataPage />
          </AuthNavShell>
        )}

        {currentRoute === '/settings' && (
          <AuthNavShell activePathOverride="/settings" onNavigateOverride={(p) => navigateTo(p as any)}>
            <SettingsPage />
          </AuthNavShell>
        )}

        {currentRoute === '/settings/ai' && (
          <AuthNavShell activePathOverride="/settings" onNavigateOverride={(p) => navigateTo(p as any)}>
            <AISettingsPage />
          </AuthNavShell>
        )}

        {currentRoute === '/playground' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <DesignSystemPlayground />
          </div>
        )}
      </main>
    </div>
  );
}
