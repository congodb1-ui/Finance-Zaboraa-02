import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { PaymentInstructionForm } from './PaymentInstructionForm';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import {
  getPaymentInstructions,
  updatePaymentInstruction,
  deletePaymentInstruction,
  decryptPaymentInstruction,
} from '../../lib/actions/paymentInstructions';
import type { PaymentInstruction } from '../../types/invoicing';
import {
  Landmark,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Star,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface RevealedState {
  accountNumber: string | null;
  iban: string | null;
  secondsLeft: number;
}

const REVEAL_DURATION_SECONDS = 10;

export const PaymentInstructionList: React.FC = () => {
  const [instructions, setInstructions] = useState<PaymentInstruction[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] =
    useState<PaymentInstruction | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const [revealedById, setRevealedById] = useState<Record<string, RevealedState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const clearTimerFor = (id: string) => {
    if (timersRef.current[id]) {
      clearInterval(timersRef.current[id]);
      delete timersRef.current[id];
    }
  };

  useEffect(() => {
    return () => {
      for (const id of Object.keys(timersRef.current)) {
        clearInterval(timersRef.current[id]);
      }
      timersRef.current = {};
    };
  }, []);

  const fetchInstructions = async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const rows = await getPaymentInstructions(supabase);
      setInstructions(rows);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to load payment instructions.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstructions();
  }, []);

  const handleOpenNew = () => {
    setEditingInstruction(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: PaymentInstruction) => {
    setEditingInstruction(item);
    setIsFormOpen(true);
  };

  const handleSaved = (saved: PaymentInstruction) => {
    setInstructions((prev) => {
      const exists = prev.some((row) => row.id === saved.id);
      const mapped = exists
        ? prev.map((row) => (row.id === saved.id ? saved : row))
        : [...prev, saved];

      // Reflect cleared defaults for the same currency if saved.is_default === true
      const normalized = saved.is_default
        ? mapped.map((row) =>
            row.currency === saved.currency && row.id !== saved.id
              ? { ...row, is_default: false }
              : row
          )
        : mapped;

      return normalized.sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    });

    // Re-mask any revealed copy if edited
    clearTimerFor(saved.id);
    setRevealedById((prev) => {
      if (!prev[saved.id]) return prev;
      const next = { ...prev };
      delete next[saved.id];
      return next;
    });

    setIsFormOpen(false);
    setEditingInstruction(null);
    setBanner({
      type: 'success',
      text: editingInstruction
        ? `Updated "${saved.label}".`
        : `Saved "${saved.label}".`,
    });
  };

  const handleHide = (id: string) => {
    clearTimerFor(id);
    setRevealedById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleReveal = async (instruction: PaymentInstruction) => {
    setBanner(null);
    setRevealingId(instruction.id);
    try {
      const decrypted = await decryptPaymentInstruction(instruction);

      clearTimerFor(instruction.id);
      setRevealedById((prev) => ({
        ...prev,
        [instruction.id]: {
          accountNumber: decrypted.account_number,
          iban: decrypted.iban,
          secondsLeft: REVEAL_DURATION_SECONDS,
        },
      }));

      timersRef.current[instruction.id] = setInterval(() => {
        setRevealedById((prev) => {
          const current = prev[instruction.id];
          if (!current) {
            clearTimerFor(instruction.id);
            return prev;
          }
          if (current.secondsLeft <= 1) {
            clearTimerFor(instruction.id);
            const next = { ...prev };
            delete next[instruction.id];
            return next;
          }
          return {
            ...prev,
            [instruction.id]: {
              ...current,
              secondsLeft: current.secondsLeft - 1,
            },
          };
        });
      }, 1000);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Unable to decrypt payment details.',
      });
    } finally {
      setRevealingId(null);
    }
  };

  const handleSetDefault = async (instruction: PaymentInstruction) => {
    setSettingDefaultId(instruction.id);
    setBanner(null);
    try {
      const supabase = createSupabaseClient();
      const updated = await updatePaymentInstruction(supabase, instruction.id, {
        is_default: true,
      });
      handleSaved(updated);
      setBanner({
        type: 'success',
        text: `"${updated.label}" set as default for ${updated.currency}.`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to update default instruction.',
      });
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleConfirmDelete = async (instruction: PaymentInstruction) => {
    setDeletingId(instruction.id);
    setBanner(null);
    try {
      const supabase = createSupabaseClient();
      await deletePaymentInstruction(supabase, instruction.id);
      clearTimerFor(instruction.id);
      setRevealedById((prev) => {
        const next = { ...prev };
        delete next[instruction.id];
        return next;
      });
      setInstructions((prev) => prev.filter((item) => item.id !== instruction.id));
      setConfirmDeleteId(null);
      setBanner({
        type: 'success',
        text: `Deleted "${instruction.label}".`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to delete payment instruction.',
      });
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Bank & Payment Instructions</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Beneficiary bank accounts, SWIFT/IBAN, and correspondent details per currency. Account numbers and IBANs are AES-256-GCM encrypted at rest.
          </CardDescription>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleOpenNew}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Bank Account
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {banner && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              banner.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-[11px] underline cursor-pointer opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Loading payment instructions...</span>
          </div>
        ) : instructions.length === 0 ? (
          <div className="py-10 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Landmark className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">
              No payment instructions yet. Add your first bank or wire payout account.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={handleOpenNew}>
              Add Payment Instruction
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instructions.map((item) => {
              const revealed = revealedById[item.id];
              const isRevealing = revealingId === item.id;
              const isConfirmingDelete = confirmDeleteId === item.id;
              const hasEncryptedSecrets = Boolean(
                item.account_number_encrypted || item.iban_encrypted
              );
              const maskedAccount = item.account_number_encrypted
                ? `••••${item.last4 || '••••'}`
                : 'Not set';

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                    item.is_default
                      ? 'border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-indigo-950/15'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top row: Label & badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-heading font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {item.label}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {item.beneficiary_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {item.currency}
                        </span>
                        {item.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            <Star className="w-3 h-3 fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bank info */}
                    {(item.bank_name || item.bank_address) && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {item.bank_name && (
                          <div className="font-medium text-slate-700 dark:text-slate-200">
                            {item.bank_name}
                          </div>
                        )}
                        {item.bank_address && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {item.bank_address}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sensitive Account / IBAN box */}
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Account No.
                        </span>
                        <span className="font-mono font-medium text-slate-900 dark:text-slate-100 select-all">
                          {revealed
                            ? revealed.accountNumber || 'Not set'
                            : maskedAccount}
                        </span>
                      </div>

                      {item.iban_encrypted && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">IBAN</span>
                          <span className="font-mono font-medium text-slate-900 dark:text-slate-100 select-all">
                            {revealed ? revealed.iban || '—' : '••••••••••••••••'}
                          </span>
                        </div>
                      )}

                      {hasEncryptedSecrets && (
                        <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800/80">
                          {revealed ? (
                            <>
                              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                                Auto-masks in {revealed.secondsLeft}s
                              </span>
                              <button
                                type="button"
                                onClick={() => handleHide(item.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              >
                                <EyeOff className="w-3 h-3" />
                                Hide
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] text-slate-400">
                                Encrypted at rest
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReveal(item)}
                                disabled={isRevealing}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer disabled:opacity-50"
                              >
                                <Eye className="w-3 h-3" />
                                {isRevealing ? 'Decrypting...' : 'Reveal'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Routing / SWIFT / IFSC / Intermediary */}
                    {(item.swift_bic || item.ifsc || item.intermediary_bank) && (
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.swift_bic && (
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                              SWIFT / BIC
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">
                              {item.swift_bic}
                            </span>
                          </div>
                        )}
                        {item.ifsc && (
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                              IFSC
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">
                              {item.ifsc}
                            </span>
                          </div>
                        )}
                        {item.intermediary_bank && (
                          <div className="col-span-2">
                            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                              Intermediary Bank
                            </span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {item.intermediary_bank}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      {!item.is_default && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(item)}
                          disabled={settingDefaultId === item.id}
                          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {settingDefaultId === item.id
                            ? 'Updating...'
                            : `Set default (${item.currency})`}
                        </button>
                      )}
                    </div>

                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-1 rounded-lg">
                        <span className="text-[11px] text-red-800 dark:text-red-200 font-medium">
                          Delete?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(item)}
                          disabled={deletingId === item.id}
                          className="px-2 py-0.5 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
                        >
                          {deletingId === item.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === item.id}
                          className="px-2 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded cursor-pointer"
                          title="Edit payment instruction"
                          aria-label={`Edit ${item.label}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                          title="Delete payment instruction"
                          aria-label={`Delete ${item.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <PaymentInstructionForm
        isOpen={isFormOpen}
        initialData={editingInstruction}
        onClose={() => {
          setIsFormOpen(false);
          setEditingInstruction(null);
        }}
        onSaved={handleSaved}
      />
    </Card>
  );
};
