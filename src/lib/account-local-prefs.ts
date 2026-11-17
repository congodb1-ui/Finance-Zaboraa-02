export type StatementFormatHint =
  | 'auto'
  | 'hdfc'
  | 'icici'
  | 'sbi'
  | 'kotak'
  | 'axis'
  | 'boi'
  | 'bom'
  | 'gpay'
  | 'paytm';

export type StatementFrequency = 'monthly' | 'quarterly' | 'annual' | 'manual';

export interface AccountLocalPrefs {
  pdfPassword?: string;
  autoUseSavedPdfPassword?: boolean;
  statementFormatHint?: StatementFormatHint;
  statementFrequency?: StatementFrequency;
  customerIdOrCrn?: string;
  interestRatePct?: number | null;
  maturityDate?: string | null;
  updatedAt?: string;
}

const STORAGE_KEY = 'zaboraa_account_local_prefs_v1';

export const STATEMENT_FORMAT_OPTIONS: { value: StatementFormatHint; label: string }[] = [
  { value: 'auto', label: 'Auto-detect from statement' },
  { value: 'hdfc', label: 'HDFC Bank' },
  { value: 'icici', label: 'ICICI Bank' },
  { value: 'sbi', label: 'State Bank of India (SBI)' },
  { value: 'kotak', label: 'Kotak Mahindra Bank' },
  { value: 'axis', label: 'Axis Bank' },
  { value: 'boi', label: 'Bank of India (BOI)' },
  { value: 'bom', label: 'Bank of Maharashtra (BOM)' },
  { value: 'gpay', label: 'Google Pay (GPay)' },
  { value: 'paytm', label: 'Paytm UPI' },
];

export const STATEMENT_FREQUENCY_OPTIONS: { value: StatementFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly Statement' },
  { value: 'quarterly', label: 'Quarterly Statement' },
  { value: 'annual', label: 'Annual Statement' },
  { value: 'manual', label: 'Ad-hoc / Manual' },
];

function readAllPrefs(): Record<string, AccountLocalPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllPrefs(map: Record<string, AccountLocalPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event('zaboraa-account-prefs-changed'));
  } catch {
    // Ignore localStorage quota/private-mode errors
  }
}

export function getAccountLocalPrefs(accountId: string): AccountLocalPrefs {
  if (!accountId) return {};
  const all = readAllPrefs();
  return all[accountId] || {};
}

export function setAccountLocalPrefs(
  accountId: string,
  patch: Partial<AccountLocalPrefs>
): AccountLocalPrefs {
  if (!accountId) return {};
  const all = readAllPrefs();
  const current = all[accountId] || {};
  const next: AccountLocalPrefs = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (!next.pdfPassword || !next.pdfPassword.trim()) {
    delete next.pdfPassword;
  } else {
    next.pdfPassword = next.pdfPassword.trim();
  }

  if (!next.customerIdOrCrn || !next.customerIdOrCrn.trim()) {
    delete next.customerIdOrCrn;
  } else {
    next.customerIdOrCrn = next.customerIdOrCrn.trim();
  }

  if (!next.maturityDate) {
    delete next.maturityDate;
  }

  if (next.interestRatePct === undefined || next.interestRatePct === null || Number.isNaN(next.interestRatePct)) {
    delete next.interestRatePct;
  }

  all[accountId] = next;
  writeAllPrefs(all);
  return next;
}

export function getAccountPdfPassword(accountId: string): string | null {
  if (!accountId) return null;
  const prefs = getAccountLocalPrefs(accountId);
  if (prefs.autoUseSavedPdfPassword === false) return null;
  const pwd = prefs.pdfPassword?.trim();
  return pwd ? pwd : null;
}

export function hasSavedAccountPdfPassword(accountId: string): boolean {
  if (!accountId) return false;
  const prefs = getAccountLocalPrefs(accountId);
  return Boolean(prefs.pdfPassword && prefs.pdfPassword.trim().length > 0);
}

export function setAccountPdfPassword(accountId: string, password: string | null): void {
  if (!accountId) return;
  if (!password || !password.trim()) {
    setAccountLocalPrefs(accountId, { pdfPassword: undefined });
  } else {
    setAccountLocalPrefs(accountId, {
      pdfPassword: password.trim(),
      autoUseSavedPdfPassword: true,
    });
  }
}

export function deleteAccountLocalPrefs(accountId: string): void {
  if (!accountId) return;
  const all = readAllPrefs();
  if (accountId in all) {
    delete all[accountId];
    writeAllPrefs(all);
  }
}
