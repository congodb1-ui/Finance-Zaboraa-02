'use client';

import React, { useState, useEffect } from 'react';
import { UploadDropzone } from '../../../components/upload/UploadDropzone';
import { UploadProgress, type UploadStep } from '../../../components/upload/UploadProgress';
import { ColumnMappingWizard } from '../../../components/upload/ColumnMappingWizard';
import { ReviewScreen } from '../../../components/upload/ReviewScreen';
import { UploadHistory } from '../../../components/upload/UploadHistory';
import { PdfPasswordModal } from '../../../components/upload/PdfPasswordModal';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  processStatementUpload,
  confirmMappingAndStaging,
  cancelUpload,
  deleteUpload,
  getUploads,
  getUploadDetails,
  checkDateOverlap,
  checkAccountMismatch,
  updateStagedTransaction,
} from '../../../lib/actions/upload';
import { apiPatch, apiPost } from '../../../lib/api-client';
import { getAccounts } from '../../../lib/actions/accounts';
import { getCategories } from '../../../lib/actions/categories';
import { useUserPreferences } from '../../../lib/contexts/UserPreferencesContext';
import {
  getAccountPdfPassword,
  hasSavedAccountPdfPassword,
  setAccountPdfPassword,
} from '../../../lib/account-local-prefs';
import type { AccountWithBalance } from '../../../types/accounts';
import type { Category } from '../../../types/categories';
import type {
  StatementUpload,
  StagedTransaction,
  ColumnMapping,
  UploadApiResponse,
  OverlapCheckResult,
} from '../../../types/uploads';
import {
  UploadCloud,
  FileSpreadsheet,
  History,
  Building2,
  AlertCircle,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Plus,
  RefreshCw,
  Mail,
  KeyRound,
} from 'lucide-react';

export default function StatementUploadPage() {
  const { aiEnabled } = useUserPreferences();
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<UploadStep>('select');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [unfinishedUploadId, setUnfinishedUploadId] = useState<string | null>(null);

  // PDF Password modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Active upload parsing state
  const [uploadApiResponse, setUploadApiResponse] = useState<UploadApiResponse | null>(null);
  const [activeUpload, setActiveUpload] = useState<StatementUpload | null>(null);
  const [stagedTransactions, setStagedTransactions] = useState<StagedTransaction[]>([]);
  const [previewCategories, setPreviewCategories] = useState<Category[]>([]);
  const [overlapResult, setOverlapResult] = useState<OverlapCheckResult | null>(null);
  const [pendingAccountMismatch, setPendingAccountMismatch] = useState<{
    response: UploadApiResponse;
    detectedLast4: string;
    selectedLast4: string;
    message: string;
    usedLocalSavedPassword: boolean;
  } | null>(null);

  // History state & read-only viewing
  const [uploadsHistory, setUploadsHistory] = useState<StatementUpload[]>([]);
  const [isReadOnlyInspection, setIsReadOnlyInspection] = useState(false);
  const [prefsVersion, setPrefsVersion] = useState(0);

  // Sync account local prefs updates (PDF password saved/cleared)
  useEffect(() => {
    const onPrefsChanged = () => setPrefsVersion((v) => v + 1);
    window.addEventListener('zaboraa-account-prefs-changed', onPrefsChanged);
    return () => window.removeEventListener('zaboraa-account-prefs-changed', onPrefsChanged);
  }, []);

  // Helper to extract ?account=<id> from hash (#upload?account=...)
  const getRequestedAccountIdFromHash = (): string | null => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace(/^#/, '');
    const queryIdx = hash.indexOf('?');
    if (queryIdx === -1) return null;
    const params = new URLSearchParams(hash.slice(queryIdx + 1));
    return params.get('account');
  };

  // Load registered accounts and existing uploads
  useEffect(() => {
    async function loadData() {
      try {
        const [accs, hist] = await Promise.all([getAccounts(), getUploads()]);
        setAccounts(accs);
        const requestedAccountId = getRequestedAccountIdFromHash();
        if (requestedAccountId && accs.some((a) => a.id === requestedAccountId)) {
          setSelectedAccountId(requestedAccountId);
        } else if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
        setUploadsHistory(hist);
      } catch (err) {
        console.error('Failed to load initial upload data:', err);
      }
    }
    loadData();
  }, []);

  // Pre-select account when hash changes to #upload?account=<id>
  useEffect(() => {
    const syncAccountFromHash = () => {
      const requestedAccountId = getRequestedAccountIdFromHash();
      if (requestedAccountId && accounts.some((a) => a.id === requestedAccountId)) {
        setSelectedAccountId(requestedAccountId);
      }
    };
    window.addEventListener('hashchange', syncAccountFromHash);
    return () => window.removeEventListener('hashchange', syncAccountFromHash);
  }, [accounts]);

  // Handle file drop / select
  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setStatusMessage(null);
    setIsPasswordModalOpen(false);
    setPasswordError(null);
  };

  const mergeUploadBalanceMeta = (
    upload: StatementUpload | null,
    response?: UploadApiResponse | null
  ): StatementUpload | null => {
    if (!upload) return null;
    if (!response) return upload;
    return {
      ...upload,
      opening_balance: response.opening_balance ?? upload.opening_balance ?? null,
      closing_balance: response.closing_balance ?? upload.closing_balance ?? null,
      summary_closing_balance:
        response.summary_closing_balance ?? upload.summary_closing_balance ?? null,
      closing_balance_mismatch:
        response.closing_balance_mismatch ?? upload.closing_balance_mismatch,
      closing_balance_diff: response.closing_balance_diff ?? upload.closing_balance_diff,
      reconciliation_warning: response.reconciliation_warning ?? upload.reconciliation_warning,
      reconciliation_diff: response.reconciliation_diff ?? upload.reconciliation_diff,
    };
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setCurrentStep('select');
    setUploadApiResponse(null);
    setActiveUpload(null);
    setStagedTransactions([]);
    setPendingAccountMismatch(null);
    setStatusMessage(null);
    setIsReadOnlyInspection(false);
    setIsPasswordModalOpen(false);
    setPasswordError(null);
  };

  const loadCategorizePreview = async (uploadId: string) => {
    try {
      const res = await apiPost<{ transactions: StagedTransaction[]; categories: Category[] }>(
        `/api/upload/${uploadId}/categorize-preview`,
        {}
      );
      if (Array.isArray(res.transactions)) {
        setStagedTransactions(res.transactions);
      }
      if (Array.isArray(res.categories)) {
        setPreviewCategories(res.categories);
      }
    } catch {
      try {
        const cats = await getCategories();
        setPreviewCategories(cats);
      } catch {
        // ignore fallback error
      }
    }
  };

  const finalizeParsingResponse = async (
    response: UploadApiResponse,
    usedLocalSavedPassword: boolean
  ) => {
    const details = await getUploadDetails(response.upload_id);
    setActiveUpload(mergeUploadBalanceMeta(details.upload, response));

    // If auto-detection succeeded with high confidence, auto-stage; otherwise show ColumnMappingWizard
    if (!response.needs_mapping && response.column_mapping) {
      const stagedRes = await confirmMappingAndStaging(response.upload_id, response.column_mapping, false);
      const updatedDetails = await getUploadDetails(response.upload_id);
      setActiveUpload(mergeUploadBalanceMeta(updatedDetails.upload, response));
      setStagedTransactions(updatedDetails.transactions);

      const overlap = await checkDateOverlap(
        selectedAccountId,
        stagedRes.date_start,
        stagedRes.date_end,
        response.upload_id
      );
      setOverlapResult(overlap);

      await loadCategorizePreview(response.upload_id);

      setCurrentStep('review');
      setStatusMessage({
        type: 'success',
        text: `Parsed ${response.row_count} rows with ${response.detected_bank || 'Standard'} format auto-detection${
          usedLocalSavedPassword ? ' (PDF unlocked using saved local password)' : ''
        }.`,
      });
    } else {
      setCurrentStep('map');
      if (usedLocalSavedPassword) {
        setStatusMessage({
          type: 'info',
          text: 'PDF unlocked automatically using the locally saved password for this account.',
        });
      }
    }
  };

  // STEP 1-8: Trigger Upload & Parse
  const handleStartParsing = async (explicitPassword?: string, saveEnteredPassword?: boolean) => {
    if (!selectedFile) {
      setStatusMessage({ type: 'error', text: 'Please select a statement file to upload.' });
      return;
    }
    if (!selectedAccountId) {
      setStatusMessage({ type: 'error', text: 'Please select an account for this statement.' });
      return;
    }

    const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');
    const localSavedPwd = !explicitPassword && isPdf ? getAccountPdfPassword(selectedAccountId) : null;
    const usedLocalSavedPassword = Boolean(!explicitPassword && localSavedPwd);
    const passwordToUse = explicitPassword || localSavedPwd || undefined;

    setIsProcessing(true);
    setStatusMessage(null);
    setPendingAccountMismatch(null);
    setCurrentStep('parse');

    try {
      const response = await processStatementUpload(selectedFile, selectedAccountId, passwordToUse);

      // Handle duplicate file error
      if (response.error === 'DUPLICATE_FILE') {
        setStatusMessage({
          type: 'error',
          text: 'Duplicate file — already imported.',
        });
        setCurrentStep('select');
        return;
      }

      // Handle unfinished upload (resume or delete old)
      if (response.needs_resume && response.existing_upload_id) {
        setUnfinishedUploadId(response.existing_upload_id);
        setStatusMessage({
          type: 'info',
          text: 'This file was uploaded before but did not complete.',
        });
        setCurrentStep('select');
        return;
      }

      // Persist the entered PDF password locally when the user opted in
      if (explicitPassword && saveEnteredPassword && selectedAccountId) {
        setAccountPdfPassword(selectedAccountId, explicitPassword);
      }

      setIsPasswordModalOpen(false);
      setPasswordError(null);
      setUploadApiResponse(response);

      // FIX 3: Account mismatch guard — block auto-staging / auto-import and ask confirmation
      const selectedAcc = accounts.find((a) => a.id === selectedAccountId);
      const mismatch = checkAccountMismatch(
        response.detected_account_last4,
        selectedAcc?.account_number_last4
      );
      if (mismatch.isMismatch && mismatch.detectedLast4 && mismatch.selectedLast4 && mismatch.message) {
        setPendingAccountMismatch({
          response,
          detectedLast4: mismatch.detectedLast4,
          selectedLast4: mismatch.selectedLast4,
          message: mismatch.message,
          usedLocalSavedPassword,
        });
        setCurrentStep('select');
        return;
      }

      await finalizeParsingResponse(response, usedLocalSavedPassword);
    } catch (err: any) {
      console.error('Upload failed:', err);
      const isPasswordError =
        err?.code === 'PASSWORD_REQUIRED' ||
        err?.code === 'INCORRECT_PASSWORD' ||
        err?.name === 'PdfPasswordError' ||
        err?.name === 'PasswordException' ||
        err?.message?.toLowerCase().includes('password');

      if (isPasswordError) {
        setIsPasswordModalOpen(true);
        const isIncorrect =
          err?.code === 'INCORRECT_PASSWORD' ||
          err?.message?.toLowerCase().includes('incorrect');
        if (usedLocalSavedPassword && isIncorrect) {
          setPasswordError(
            'The locally saved PDF password for this account did not unlock this file. Please enter the correct password.'
          );
        } else if (isIncorrect) {
          setPasswordError('Incorrect password. Please verify and try again.');
        } else {
          setPasswordError(null);
        }
        setCurrentStep('select');
      } else {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Failed to parse statement. Please check file format.',
        });
        setCurrentStep('select');
      }
    } finally {
      setIsProcessing(false);
      setIsSubmittingPassword(false);
    }
  };

  const handlePasswordSubmit = async (password: string, saveLocally?: boolean) => {
    setIsSubmittingPassword(true);
    setPasswordError(null);
    await handleStartParsing(password, saveLocally);
  };

  const handleCancelMismatch = async () => {
    const pending = pendingAccountMismatch;
    if (!pending) return;
    setIsProcessing(true);
    try {
      await deleteUpload(pending.response.upload_id);
      const freshHistory = await getUploads();
      setUploadsHistory(freshHistory);
    } catch (e) {
      console.warn('Mismatch cancel cleanup notice:', e);
    } finally {
      handleClearFile();
      setStatusMessage({
        type: 'info',
        text: `Upload cancelled: statement belongs to ...${pending.detectedLast4}, not ...${pending.selectedLast4}.`,
      });
      setIsProcessing(false);
    }
  };

  const handleContinueMismatch = async () => {
    const pending = pendingAccountMismatch;
    if (!pending) return;
    setPendingAccountMismatch(null);
    setIsProcessing(true);
    setCurrentStep('parse');
    try {
      await finalizeParsingResponse(pending.response, pending.usedLocalSavedPassword);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to stage statement.' });
      setCurrentStep('select');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual column mapping confirmation from ColumnMappingWizard
  const handleConfirmMapping = async (mapping: ColumnMapping, skipBalance: boolean) => {
    if (!uploadApiResponse) return;

    setIsProcessing(true);
    try {
      const res = await confirmMappingAndStaging(uploadApiResponse.upload_id, mapping, skipBalance);
      const details = await getUploadDetails(uploadApiResponse.upload_id);
      setActiveUpload(mergeUploadBalanceMeta(details.upload, uploadApiResponse));
      setStagedTransactions(details.transactions);

      // Check date range overlap
      const overlap = await checkDateOverlap(
        selectedAccountId,
        res.date_start,
        res.date_end,
        uploadApiResponse.upload_id
      );
      setOverlapResult(overlap);

      await loadCategorizePreview(uploadApiResponse.upload_id);

      setCurrentStep('review');
      setStatusMessage({
        type: 'success',
        text: `Mapping confirmed: ${res.staged_count} transactions staged for review.`,
      });
    } catch (err: any) {
      console.error('Mapping confirmation failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to stage transactions.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Final Confirm & Import
  const handleConfirmImport = async (replacePreviousId?: string) => {
    if (!activeUpload) return;

    setIsProcessing(true);
    try {
      const result = await apiPost('/api/upload/finalize', {
        upload_id: activeUpload.id,
        replace_previous_id: replacePreviousId,
      });

      const [details, freshHistory] = await Promise.all([
        getUploadDetails(activeUpload.id),
        getUploads(),
      ]);

      const updated = details.upload || activeUpload;
      setActiveUpload(updated);
      setCurrentStep('imported');
      setUploadsHistory(freshHistory);

      const importedCount = result.imported ?? result.imported_count ?? updated.imported_count ?? updated.row_count ?? 0;
      const duplicatesSkipped = result.duplicates_skipped ?? result.duplicate_count ?? 0;
      const transferPairs = result.transfer_pairs_found ?? 0;
      const replacedNote = result.replaced ? ' (replaced previous overlapping upload)' : '';

      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${importedCount} transactions into ledger (${duplicatesSkipped} duplicates skipped, ${transferPairs} transfer pairs detected)${replacedNote}.`,
      });
    } catch (err: any) {
      console.error('Finalize failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to finalize import.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Cancel Upload
  const handleCancelUpload = async () => {
    if (!activeUpload) return;
    try {
      await cancelUpload(activeUpload.id);
      handleClearFile();
      const freshHistory = await getUploads();
      setUploadsHistory(freshHistory);
      setStatusMessage({ type: 'info', text: 'Upload cancelled. Staged transactions removed.' });
    } catch (err: any) {
      console.error('Cancel failed:', err);
    }
  };

  // Inspect past upload from History
  const handleInspectHistoryUpload = async (uploadOrId: StatementUpload | string) => {
    try {
      const uploadId = typeof uploadOrId === 'string' ? uploadOrId : uploadOrId.id;
      const details = await getUploadDetails(uploadId);
      setActiveUpload(details.upload);
      setStagedTransactions(details.transactions);
      const isImportedReadOnly = details.upload?.status === 'imported';
      setIsReadOnlyInspection(isImportedReadOnly);
      if (!isImportedReadOnly) {
        await loadCategorizePreview(uploadId);
      } else if (previewCategories.length === 0) {
        getCategories().then(setPreviewCategories).catch(() => {});
      }
      setCurrentStep('review');
      setActiveTab('upload');
    } catch (err) {
      console.error('Failed to inspect upload:', err);
    }
  };

  const handleUpdateStagedRow = async (stagedId: string, updates: any) => {
    await updateStagedTransaction(stagedId, updates);
    if (activeUpload) {
      const details = await getUploadDetails(activeUpload.id);
      setStagedTransactions(details.transactions);
    }
  };

  const handleUpdateStagedCategory = async (
    stagedId: string,
    categoryId: string | null,
    options: { is_transfer?: boolean; apply_to_future?: boolean }
  ) => {
    try {
      await apiPatch(`/api/staged-transactions/${stagedId}/category`, {
        category_id: categoryId,
        is_transfer: Boolean(options.is_transfer),
        apply_to_future: Boolean(options.apply_to_future),
      });
      if (activeUpload) {
        const details = await getUploadDetails(activeUpload.id);
        setStagedTransactions(details.transactions);
      }
      if (options.apply_to_future) {
        setStatusMessage({
          type: 'success',
          text: 'Rule created for this merchant — future uploads and Gmail alerts will categorize it automatically.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to update staged transaction category.',
      });
    }
  };

  // Delete upload from History
  const handleDeleteUpload = async (uploadId: string) => {
    try {
      await deleteUpload(uploadId);
      setStatusMessage({ type: 'success', text: 'Upload and associated transactions deleted.' });
      const freshHistory = await getUploads();
      setUploadsHistory(freshHistory);
    } catch (err: any) {
      console.error('Delete upload failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete upload.' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>•</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Batch 3a</span>
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
            Statement Upload & Parser
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ingest Indian bank & UPI statements (.csv, .xlsx, .pdf) with SHA-256 deduplication and audit trail
          </p>
        </div>

        {/* Tab Switcher & Gmail Import */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = '/settings';
            }}
            className="text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            leftIcon={<Mail className="w-3.5 h-3.5" />}
          >
            Import from Gmail
          </Button>

          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                setIsReadOnlyInspection(false);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'upload' && !isReadOnlyInspection
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload New</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Upload History ({uploadsHistory.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Status Notification / Resume Unfinished Banner */}
      {unfinishedUploadId ? (
        <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Unfinished Upload Detected</span>
              <p className="mt-0.5 leading-relaxed">This file was uploaded before but did not complete.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const targetId = unfinishedUploadId;
                setUnfinishedUploadId(null);
                await handleInspectHistoryUpload(targetId);
              }}
            >
              Resume
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const targetId = unfinishedUploadId;
                setUnfinishedUploadId(null);
                try {
                  await deleteUpload(targetId);
                  setStatusMessage({ type: 'success', text: 'Previous incomplete upload removed. You can now re-upload the file.' });
                  const history = await getUploads();
                  setUploadsHistory(history);
                } catch (e: any) {
                  setStatusMessage({ type: 'error', text: e.message || 'Failed to remove old upload.' });
                }
              }}
            >
              Delete old and re-upload
            </Button>
          </div>
        </div>
      ) : statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in ${
            statusMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-semibold block">
              {statusMessage.type === 'error'
                ? 'Processing Issue'
                : statusMessage.type === 'success'
                ? 'Action Completed'
                : 'Information'}
            </span>
            <p className="mt-0.5 leading-relaxed">{statusMessage.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW: UPLOAD HISTORY */}
      {activeTab === 'history' && (
        <UploadHistory
          uploads={uploadsHistory}
          onSelectUpload={handleInspectHistoryUpload}
          onDeleteUpload={handleDeleteUpload}
        />
      )}

      {/* VIEW: UPLOAD & WIZARD */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Progress Stepper (hidden during read-only inspection) */}
          {!isReadOnlyInspection && (
            <UploadProgress
              currentStep={currentStep}
              rowCount={activeUpload?.row_count || uploadApiResponse?.row_count}
            />
          )}

          {/* STEP 1: SELECT ACCOUNT & DROPZONE */}
          {currentStep === 'select' && (
            <div className="space-y-6">
              {/* Account Selector Card */}
              <Card className="p-5">
                <CardHeader className="p-0 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <CardTitle className="text-sm font-semibold">Select Destination Account</CardTitle>
                  </div>
                  <span className="text-xs text-slate-500">
                    Which registered bank account does this statement belong to?
                  </span>
                </CardHeader>

                <CardContent className="p-0 pt-2">
                  {accounts.length === 0 ? (
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800">
                      No accounts registered yet. Please create an account in the Accounts module first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-prefs-v={prefsVersion}>
                      {accounts.map((acc) => {
                        const hasPdfPwd = hasSavedAccountPdfPassword(acc.id);
                        return (
                          <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                              selectedAccountId === acc.id
                                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                                : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {acc.name}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {acc.bank_name} {acc.account_number_last4 ? `• ****${acc.account_number_last4}` : ''}
                                </div>
                              </div>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {acc.account_type.replace('_', ' ')}
                              </span>
                            </div>
                            {hasPdfPwd && (
                              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                <KeyRound className="w-2.5 h-2.5" />
                                <span>PDF Password Saved</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* File Dropzone */}
              <UploadDropzone
                onFileSelected={handleFileSelected}
                selectedFile={selectedFile}
                onClearFile={handleClearFile}
                isUploading={isProcessing}
              />

              {/* Local PDF Password Check Notice when a .pdf file is chosen */}
              {selectedFile &&
                selectedFile.name.toLowerCase().endsWith('.pdf') &&
                selectedAccountId &&
                (() => {
                  const selectedAcc = accounts.find((a) => a.id === selectedAccountId);
                  if (!selectedAcc) return null;
                  const autoPwd = getAccountPdfPassword(selectedAcc.id);
                  const hasSavedPwd = hasSavedAccountPdfPassword(selectedAcc.id);
                  return (
                    <div
                      className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs ${
                        autoPwd
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <KeyRound
                        className={`w-4 h-4 shrink-0 ${
                          autoPwd ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      <div className="flex-1 leading-relaxed">
                        {autoPwd ? (
                          <span>
                            Saved local PDF password found for <strong>{selectedAcc.name}</strong> — it will be checked and applied automatically if this PDF is encrypted.
                          </span>
                        ) : hasSavedPwd ? (
                          <span>
                            A local PDF password is saved for <strong>{selectedAcc.name}</strong>, but auto-apply is turned off in account settings. You&apos;ll be prompted if encrypted.
                          </span>
                        ) : (
                          <span>
                            No local PDF password saved for <strong>{selectedAcc.name}</strong> — if the PDF is password-protected, a pop-up will prompt you to enter it.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* Start Processing Action Bar */}
              {selectedFile && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFile}
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => handleStartParsing()}
                    isLoading={isProcessing}
                    leftIcon={<Sliders className="w-4 h-4" />}
                  >
                    Parse Statement & Detect Columns
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 / 3: COLUMN MAPPING WIZARD */}
          {currentStep === 'map' && uploadApiResponse && (
            <ColumnMappingWizard
              headers={uploadApiResponse.headers}
              sampleRows={uploadApiResponse.sample_rows || []}
              initialMapping={uploadApiResponse.column_mapping}
              confidence={uploadApiResponse.column_mapping ? 'medium' : 'none'}
              detectedBank={uploadApiResponse.detected_bank}
              onConfirm={handleConfirmMapping}
              onCancel={handleClearFile}
              isLoading={isProcessing}
            />
          )}

          {/* STEP 4: REVIEW SCREEN */}
          {currentStep === 'review' && activeUpload && (
            <ReviewScreen
              upload={activeUpload}
              transactions={stagedTransactions}
              categories={previewCategories}
              overlapInfo={overlapResult}
              onConfirmImport={handleConfirmImport}
              onCancelUpload={handleCancelUpload}
              onDeleteUpload={handleDeleteUpload}
              onUpdateStagedRow={handleUpdateStagedRow}
              onUpdateStagedCategory={handleUpdateStagedCategory}
              isReadOnly={isReadOnlyInspection}
            />
          )}

          {/* STEP 5: IMPORTED CONFIRMATION SCREEN */}
          {currentStep === 'imported' && activeUpload && (
            <Card className="p-8 text-center max-w-2xl mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 dark:text-white">
                Statement Successfully Processed
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                {activeUpload.imported_count || activeUpload.row_count} transactions have been verified and staged.
                Stored under secure Supabase Storage path with file hash uniqueness guaranteed.
              </p>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-left text-xs space-y-1.5 font-mono max-w-md mx-auto">
                <div className="flex justify-between">
                  <span className="text-slate-500">File:</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate max-w-[220px]">
                    {activeUpload.file_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {activeUpload.account?.name || 'Assigned Account'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SHA-256:</span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">
                    {activeUpload.file_hash.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Parser:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {activeUpload.parser_version}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('history')}
                  leftIcon={<History className="w-3.5 h-3.5" />}
                >
                  View All Uploads
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleClearFile}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Upload Another Statement
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Account Mismatch Guard Modal (FIX 3) */}
      {pendingAccountMismatch && (
        <div
          data-testid="account-mismatch-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                  Account Mismatch Detected
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {pendingAccountMismatch.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="mismatch-cancel-button"
                onClick={handleCancelMismatch}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="mismatch-continue-button"
                onClick={handleContinueMismatch}
                isLoading={isProcessing}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Password Modal */}
      <PdfPasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPasswordError(null);
        }}
        onSubmit={handlePasswordSubmit}
        fileName={selectedFile?.name}
        accountName={accounts.find((a) => a.id === selectedAccountId)?.name}
        error={passwordError}
        isLoading={isSubmittingPassword || isProcessing}
      />
    </div>
  );
}
