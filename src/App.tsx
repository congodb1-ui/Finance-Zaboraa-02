import React, { useState, useEffect } from 'react';
import { useAuth, signInWithGoogle, signOut, getGoogleClientId } from './lib/auth';
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
import { GoogleSignInModal } from './components/auth/GoogleSignInModal';
import { AuthNavShell } from './components/navigation/AuthNavShell';
import { DesignSystemPlayground } from './components/showcase/DesignSystemPlayground';
import { UserPreferencesProvider } from './lib/contexts/UserPreferencesContext';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<
    '/' | '/dashboard' | '/accounts' | '/account-detail' | '/upload' | '/transactions' | '/invoices' | '/invoice-view' | '/invoice-edit' | '/clients' | '/recurring' | '/budgets' | '/rules' | '/reports' | '/ai' | '/settings' | '/settings/ai' | '/playground'
  >('/');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc_hdfc_01');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [editDraftInvoice, setEditDraftInvoice] = useState<InvoiceV2 | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isGoogleSignInOpen, setIsGoogleSignInOpen] = useState(false);

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
    if (getGoogleClientId()) {
      setIsGoogleSignInOpen(true);
      return;
    }

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setAuthNotice(err?.message || 'Unable to initiate Google sign-in.');
      setTimeout(() => setAuthNotice(null), 5000);
    }
  };

  return (
    <UserPreferencesProvider isAuthenticated={isAuthenticated}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
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

      {/* Direct Google Identity Services Sign-In Modal */}
      <GoogleSignInModal
        isOpen={isGoogleSignInOpen}
        onClose={() => setIsGoogleSignInOpen(false)}
        onSuccess={() => {
          setIsGoogleSignInOpen(false);
          setCurrentRoute('/dashboard');
          window.location.hash = 'dashboard';
        }}
      />

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
