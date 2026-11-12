import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { apiGet } from '../../lib/api-client';
import {
  ShieldCheck,
  Lock,
  Download,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Database,
  Archive,
  Info,
} from 'lucide-react';

const LAST_BACKUP_KEY = 'zaboraa_last_backup_date';

export const BackupSection: React.FC = () => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAST_BACKUP_KEY);
      if (saved) setLastBackupDate(saved);
    }
  }, []);

  // Calculate passphrase strength
  const getPassphraseStrength = (pw: string) => {
    if (pw.length < 8) return { score: 1, label: 'Too short', color: 'bg-red-500' };
    if (pw.length < 12) return { score: 2, label: 'Weak (min 12 chars needed)', color: 'bg-red-400' };

    let score = 2;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 16) score++;

    if (score >= 5) return { score: 5, label: 'Excellent', color: 'bg-emerald-500' };
    if (score >= 4) return { score: 4, label: 'Strong', color: 'bg-green-500' };
    return { score: 3, label: 'Fair', color: 'bg-amber-500' };
  };

  const strength = getPassphraseStrength(passphrase);
  const isLengthValid = passphrase.length >= 12;
  const isMatch = passphrase.length > 0 && passphrase === confirmPassphrase;
  const isReady = isLengthValid && isMatch && !isExporting;

  const handleDownloadBackup = async () => {
    if (!isReady) return;
    setIsExporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Fetch raw JSON backup envelope from server
      const envelope = await apiGet('/api/backup');

      // 2. Derive AES-256-GCM key using Web Crypto API PBKDF2 (100,000 iterations, SHA-256)
      const enc = new TextEncoder();
      const salt = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM

      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const aesKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      // 3. Encrypt payload with AES-GCM
      const plaintextBuffer = enc.encode(JSON.stringify(envelope));
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        aesKey,
        plaintextBuffer
      );

      // 4. Prepend 16-byte salt and 12-byte IV as binary header (28 bytes total header)
      const combined = new Uint8Array(16 + 12 + ciphertext.byteLength);
      combined.set(salt, 0);
      combined.set(iv, 16);
      combined.set(new Uint8Array(ciphertext), 28);

      // 5. Trigger binary download with .zab extension
      const todayStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([combined], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zaboraa-backup-${todayStr}.zab`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const nowIso = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_KEY, nowIso);
      setLastBackupDate(nowIso);
      setSuccessMsg('Encrypted backup successfully created and downloaded as .zab file.');
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err: any) {
      console.error('Backup encryption error:', err);
      setErrorMsg(err.message || 'Encryption or download failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="border-indigo-200 dark:border-indigo-900/60">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Encrypted Vault Backup</CardTitle>
          </div>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
            AES-256-GCM
          </span>
        </div>
        <CardDescription>
          Zero-knowledge client-side encrypted snapshot of your complete ledger, accounts, rules, budgets, and recurring obligations.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Warning Banner */}
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Store your passphrase safely</span>
            <p className="text-amber-800 dark:text-amber-300">
              Lost passphrase = lost data. The backup is encrypted using PBKDF2 (100,000 rounds) and AES-256-GCM. We cannot recover or decrypt it without your passphrase.
            </p>
          </div>
        </div>

        {/* Passphrase Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Backup Passphrase (min 12 characters) *
            </label>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter strong passphrase..."
              className="text-xs sm:text-sm"
            />
            {passphrase.length > 0 && (
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <div className="h-1 flex-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${strength.color}`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
                <span className="text-slate-500 text-[10px]">{strength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Confirm Passphrase *
            </label>
            <Input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm passphrase..."
              className="text-xs sm:text-sm"
            />
            {confirmPassphrase.length > 0 && (
              <span
                className={`text-[10px] mt-1 block font-medium ${
                  isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                {isMatch ? '✓ Passphrases match' : '✕ Passphrases do not match'}
              </span>
            )}
          </div>
        </div>

        {/* Actions & Last Backup Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            {lastBackupDate ? (
              <span>Last backup created: {new Date(lastBackupDate).toLocaleString('en-IN')}</span>
            ) : (
              <span>No backup generated yet</span>
            )}
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleDownloadBackup}
            disabled={!isReady}
            isLoading={isExporting}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Download Encrypted Backup (.zab)
          </Button>
        </div>

        {/* Restore Coming Soon Stub Notice */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Restore from backup — coming in a future update.</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            Coming Soon
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
