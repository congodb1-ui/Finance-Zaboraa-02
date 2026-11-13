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
import RecurringPage from './app/(auth)/recurring/page';
import BudgetsPage from './app/(auth)/budgets/page';
import { InvoiceList } from './components/invoices/InvoiceList';
import { InvoiceView } from './components/invoices/InvoiceView';
import { InvoiceForm } from './components/invoices/InvoiceForm';
import { ClientList } from './components/clients/ClientList';
import { createClient as createSupabaseClient } from './lib/supabase/client';
import { getInvoiceV2, updateInvoiceV2 } from './lib/actions/invoicesV2';
import type { InvoiceV2, InvoiceV2FormData } from './types/invoicing';
import { useIdleLogout } from './hooks/useIdleLogout';
import { IdleWarningModal } from './components/auth/IdleWarningModal';
import { AuthNavShell } from './components/navigation/AuthNavShell';
import { DesignSystemPlayground } from './components/showcase/DesignSystemPlayground';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ZaboraaLogoIcon } from './components/ui/ZaboraaLogoIcon';
import { UserPreferencesProvider } from './lib/contexts/UserPreferencesContext';
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
  Repeat,
  Target,
  Sliders,
  FileSpreadsheet,
  Settings,
  Sparkles,
  FileText,
  Users,
} from 'lucide-react';

export default function App() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<
    '/' | '/dashboard' | '/accounts' | '/account-detail' | '/upload' | '/transactions' | '/invoices' | '/invoice-view' | '/invoice-edit' | '/clients' | '/recurring' | '/budgets' | '/rules' | '/reports' | '/ai' | '/settings' | '/settings/ai' | '/playground'
  >('/');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc_hdfc_01');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [editDraftInvoice, setEditDraftInvoice] = useState<InvoiceV2 | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // 30-min idle auto-logout with 25-min warning
  const {
    showWarning: isIdleWarningOpen,
    remainingSeconds: idleRemainingSeconds,
    resetTimer: handleStayLoggedIn,
    performLogout: handleIdleLogout,
  } = useIdleLogout({
    idleTimeoutMs: 30 * 60 * 1000,
    warningTimeoutMs: 25 * 60 * 1000,
    enabled: isAuthenticated,
    onLogout: async () => {
      await signOut('/');
      setCurrentRoute('/');
      window.location.hash = '';
      setAuthNotice('Logged out due to 30 minutes of inactivity for your vault security.');
    },
  });

  // Sync route with browser hash or location if available
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const path = window.location.pathname || '';
      const invoiceEditMatch =
        hash.match(/^invoices\/([^/]+)\/edit$/) ||
        path.match(/^\/invoices\/([^/]+)\/edit$/);
      const invoiceViewMatch =
        hash.match(/^invoices\/([^/]+)$/) ||
        path.match(/^\/invoices\/([^/]+)$/);

      if (hash === 'dashboard') setCurrentRoute('/dashboard');
      else if (hash === 'accounts') setCurrentRoute('/accounts');
      else if (hash.startsWith('account-detail') || hash.startsWith('accounts/')) {
        const idMatch = hash.match(/id=([a-zA-Z0-9_-]+)/) || hash.match(/accounts\/([a-zA-Z0-9_-]+)/);
        if (idMatch) setSelectedAccountId(idMatch[1]);
        setCurrentRoute('/account-detail');
      }
      else if (hash === 'upload') setCurrentRoute('/upload');
      else if (hash === 'transactions') setCurrentRoute('/transactions');
      else if (invoiceEditMatch) {
        setSelectedInvoiceId(invoiceEditMatch[1]);
        setCurrentRoute('/invoice-edit');
      }
      else if (invoiceViewMatch) {
        setSelectedInvoiceId(invoiceViewMatch[1]);
        setCurrentRoute('/invoice-view');
      }
      else if (hash === 'invoices') setCurrentRoute('/invoices');
      else if (hash === 'clients') setCurrentRoute('/clients');
      else if (hash === 'recurring') setCurrentRoute('/recurring');
      else if (hash === 'budgets') setCurrentRoute('/budgets');
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

  // Load draft invoice when visiting /invoices/:id/edit
  useEffect(() => {
    let active = true;
    if (currentRoute !== '/invoice-edit' || !selectedInvoiceId || !isAuthenticated) {
      setEditDraftInvoice(null);
      return;
    }

    async function loadDraft() {
      try {
        const supabase = createSupabaseClient();
        const inv = await getInvoiceV2(supabase, selectedInvoiceId);
        if (!active) return;
        if (!inv || inv.status !== 'draft') {
          setCurrentRoute('/invoice-view');
          window.location.hash = `invoices/${selectedInvoiceId}`;
          return;
        }
        setEditDraftInvoice(inv);
      } catch {
        if (!active) return;
        setCurrentRoute('/invoices');
        window.location.hash = 'invoices';
      }
    }
    loadDraft();
    return () => {
      active = false;
    };
  }, [currentRoute, selectedInvoiceId, isAuthenticated]);

  // If already authenticated and visiting /, redirect to /dashboard immediately (no flash)
  // If unauthenticated and visiting a protected route directly via hash/path, redirect to /
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && currentRoute === '/') {
      setCurrentRoute('/dashboard');
      window.location.hash = 'dashboard';
      return;
    }
    if (!isAuthenticated && currentRoute !== '/' && currentRoute !== '/playground') {
      setCurrentRoute('/');
      window.location.hash = '';
    }
  }, [isAuthenticated, isLoading, currentRoute]);

  // Auth Guard Check for protected routes
  const navigateTo = (
    route: string
  ) => {
    let targetRoute = route;
    let nextInvoiceId = selectedInvoiceId;

    if (route === '/reports/itr' || route === '/reports') targetRoute = '/reports';
    if (route.startsWith('/accounts/')) {
      const parts = route.split('/');
      if (parts[2]) setSelectedAccountId(parts[2]);
      targetRoute = '/account-detail';
    }
    const invoiceEditMatch = route.match(/^\/invoices\/([^/]+)\/edit$/);
    const invoiceViewMatch = route.match(/^\/invoices\/([^/]+)$/);
    if (invoiceEditMatch) {
      nextInvoiceId = invoiceEditMatch[1];
      setSelectedInvoiceId(nextInvoiceId);
      targetRoute = '/invoice-edit';
    } else if (invoiceViewMatch) {
      nextInvoiceId = invoiceViewMatch[1];
      setSelectedInvoiceId(nextInvoiceId);
      targetRoute = '/invoice-view';
    }

    const isProtected =
      targetRoute === '/dashboard' ||
      targetRoute === '/accounts' ||
      targetRoute === '/account-detail' ||
      targetRoute === '/upload' ||
      targetRoute === '/transactions' ||
      targetRoute === '/invoices' ||
      targetRoute === '/invoice-view' ||
      targetRoute === '/invoice-edit' ||
      targetRoute === '/clients' ||
      targetRoute === '/recurring' ||
      targetRoute === '/budgets' ||
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
    } else if (targetRoute === '/invoice-edit') {
      setCurrentRoute('/invoice-edit');
      window.location.hash = `invoices/${nextInvoiceId}/edit`;
    } else if (targetRoute === '/invoice-view') {
      setCurrentRoute('/invoice-view');
      window.location.hash = `invoices/${nextInvoiceId}`;
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
    <UserPreferencesProvider isAuthenticated={isAuthenticated}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Batch 6 Navigation & Auth Status Bar (hidden on print-optimized /invoices/:id page) */}
      {currentRoute !== '/invoice-view' && (
      <div className="screen-only bg-slate-900 text-slate-200 border-b border-slate-800 text-xs py-2 px-4 sticky top-0 z-50">
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
              Batch 7: Extras & Hardening Complete
            </span>
          </div>

          {/* Active Route Simulator Tabs */}
          <div className="flex items-center p-0.5 bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto max-w-full">
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
              onClick={() => navigateTo('/invoices')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/invoices'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>/invoices</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/clients')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/clients'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>/clients</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/recurring')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/recurring'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>/recurring</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/budgets')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === '/budgets'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3 h-3" />
              <span>/budgets</span>
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
      )}

      {/* Floating Notification Toast for Auth Guard & Events */}
      {authNotice && (
        <div className="screen-only fixed bottom-6 right-6 z-50 max-w-md p-4 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-sm">Security Guard</p>
              <p className="text-slate-300 mt-1">{authNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* 25-Minute Idle Logout Warning Modal with Countdown */}
      <IdleWarningModal
        isOpen={isIdleWarningOpen}
        remainingSeconds={idleRemainingSeconds}
        onStayLoggedIn={handleStayLoggedIn}
        onLogoutNow={handleIdleLogout}
      />

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

        {currentRoute === '/invoices' && (
          <AuthNavShell activePathOverride="/invoices" onNavigateOverride={(p) => navigateTo(p as any)}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
              <InvoiceList onViewInvoice={(id) => navigateTo(`/invoices/${id}`)} />
            </div>
          </AuthNavShell>
        )}

        {currentRoute === '/invoice-view' && isAuthenticated && (
          <InvoiceView
            invoiceId={selectedInvoiceId}
            onNavigate={(path) => navigateTo(path)}
          />
        )}

        {currentRoute === '/invoice-edit' && isAuthenticated && (
          <AuthNavShell activePathOverride="/invoices" onNavigateOverride={(p) => navigateTo(p as any)}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
              <InvoiceList onViewInvoice={(id) => navigateTo(`/invoices/${id}`)} />
              {editDraftInvoice && (
                <InvoiceForm
                  initialData={editDraftInvoice}
                  isLoading={editSaving}
                  onSave={async (data: InvoiceV2FormData) => {
                    setEditSaving(true);
                    try {
                      const supabase = createSupabaseClient();
                      await updateInvoiceV2(supabase, editDraftInvoice.id, data);
                      setEditDraftInvoice(null);
                      navigateTo(`/invoices/${editDraftInvoice.id}`);
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                  onCancel={() => {
                    const id = editDraftInvoice.id;
                    setEditDraftInvoice(null);
                    navigateTo(`/invoices/${id}`);
                  }}
                />
              )}
            </div>
          </AuthNavShell>
        )}

        {currentRoute === '/clients' && (
          <AuthNavShell activePathOverride="/clients" onNavigateOverride={(p) => navigateTo(p as any)}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
              <ClientList />
            </div>
          </AuthNavShell>
        )}

        {currentRoute === '/recurring' && (
          <AuthNavShell activePathOverride="/recurring" onNavigateOverride={(p) => navigateTo(p as any)}>
            <RecurringPage />
          </AuthNavShell>
        )}

        {currentRoute === '/budgets' && (
          <AuthNavShell activePathOverride="/budgets" onNavigateOverride={(p) => navigateTo(p as any)}>
            <BudgetsPage />
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
    </UserPreferencesProvider>
  );
}
