import React, { useState } from 'react';
import type { ColumnMapping, MappingConfidence } from '../../types/uploads';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Building2,
  HelpCircle,
  Eye,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface ColumnMappingWizardProps {
  headers: string[];
  sampleRows: Array<Record<string, string>>;
  initialMapping: ColumnMapping | null;
  confidence: MappingConfidence;
  detectedBank?: string | null;
  onConfirm: (mapping: ColumnMapping, skipBalance: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ColumnMappingWizard: React.FC<ColumnMappingWizardProps> = ({
  headers,
  sampleRows,
  initialMapping,
  confidence,
  detectedBank,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const [mapping, setMapping] = useState<ColumnMapping>({
    date_col: initialMapping?.date_col || '',
    description_col: initialMapping?.description_col || '',
    debit_col: initialMapping?.debit_col || '',
    credit_col: initialMapping?.credit_col || '',
    balance_col: initialMapping?.balance_col || '',
    reference_col: initialMapping?.reference_col || '',
    amount_col: initialMapping?.amount_col || '',
    is_single_amount_col: initialMapping?.is_single_amount_col || false,
  });

  const [skipBalance, setSkipBalance] = useState(!initialMapping?.balance_col);
  const [useSingleAmount, setUseSingleAmount] = useState(initialMapping?.is_single_amount_col || false);

  const handleFieldChange = (field: keyof ColumnMapping, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === '__NONE__' ? null : value,
    }));
  };

  // Validation: Date, Description, and (Debit/Credit OR Amount) required
  const hasDate = !!mapping.date_col;
  const hasDescription = !!mapping.description_col;
  const hasValidAmount = useSingleAmount
    ? !!mapping.amount_col
    : !!mapping.debit_col || !!mapping.credit_col;

  const canConfirm = hasDate && hasDescription && hasValidAmount;

  const handleReset = () => {
    if (initialMapping) {
      setMapping({ ...initialMapping });
      setUseSingleAmount(initialMapping.is_single_amount_col);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;

    onConfirm(
      {
        ...mapping,
        is_single_amount_col: useSingleAmount,
        balance_col: skipBalance ? null : mapping.balance_col,
      },
      skipBalance
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header & Bank Detection Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Statement Parser</span>
            <span>•</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Step 3 of 4</span>
          </div>
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Column Mapping Wizard
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Verify and map your statement columns to standard accounting fields.
          </p>
        </div>

        {detectedBank ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
            <Building2 className="w-4 h-4" />
            <span>Format: {detectedBank}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-4 h-4" />
            <span>Unknown bank format (template will be remembered)</span>
          </div>
        )}
      </div>

      {/* Raw 5-Row Data Preview Table */}
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider">
                Raw Statement Preview (First 5 Rows)
              </CardTitle>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {headers.length} Columns detected
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <th className="py-2 px-3 font-semibold text-[11px] w-10 text-center">#</th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="py-2 px-3 font-semibold text-[11px] whitespace-nowrap border-r border-slate-200/60 dark:border-slate-800/60 last:border-r-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-[11px]">
              {sampleRows.slice(0, 5).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-slate-400 text-center font-sans font-medium">{idx + 1}</td>
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {row[h] || <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Field Mapping Grid */}
      <Card className="p-5">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
              Map Statement Columns
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select which column in your file corresponds to each accounting property.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSingleAmount}
                onChange={(e) => setUseSingleAmount(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
              />
              <span>Single Amount Column (+/-)</span>
            </label>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. Date Column */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                <span>Transaction Date</span>
                <span className="text-red-500">*</span>
              </label>
              {!mapping.date_col && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Required
                </span>
              )}
            </div>
            <select
              value={mapping.date_col || '__NONE__'}
              onChange={(e) => handleFieldChange('date_col', e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="__NONE__">— Select Date Column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Description / Narration */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                <span>Description / Narration</span>
                <span className="text-red-500">*</span>
              </label>
              {!mapping.description_col && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Required
                </span>
              )}
            </div>
            <select
              value={mapping.description_col || '__NONE__'}
              onChange={(e) => handleFieldChange('description_col', e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="__NONE__">— Select Description Column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Debit / Withdrawal (if not single amount) */}
          {!useSingleAmount ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                    <span>Debit / Withdrawal Amount</span>
                    <span className="text-slate-400 font-normal">(Money Out)</span>
                  </label>
                </div>
                <select
                  value={mapping.debit_col || '__NONE__'}
                  onChange={(e) => handleFieldChange('debit_col', e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="__NONE__">— Select Debit Column —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Credit / Deposit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                    <span>Credit / Deposit Amount</span>
                    <span className="text-slate-400 font-normal">(Money In)</span>
                  </label>
                </div>
                <select
                  value={mapping.credit_col || '__NONE__'}
                  onChange={(e) => handleFieldChange('credit_col', e.target.value)}
                  className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="__NONE__">— Select Credit Column —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            /* Single Amount Column option */
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                  <span>Net Amount Column</span>
                  <span className="text-red-500">*</span>
                </label>
              </div>
              <select
                value={mapping.amount_col || '__NONE__'}
                onChange={(e) => handleFieldChange('amount_col', e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="__NONE__">— Select Amount Column —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 5. Running Balance */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                <span>Closing / Running Balance</span>
              </label>
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipBalance}
                  onChange={(e) => setSkipBalance(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600"
                />
                <span>Skip balance</span>
              </label>
            </div>
            <select
              disabled={skipBalance}
              value={skipBalance ? '__NONE__' : mapping.balance_col || '__NONE__'}
              onChange={(e) => handleFieldChange('balance_col', e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="__NONE__">— Select Balance Column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Reference / UTR Number */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                <span>Reference / UTR / Cheque No</span>
                <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
            </div>
            <select
              value={mapping.reference_col || '__NONE__'}
              onChange={(e) => handleFieldChange('reference_col', e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="__NONE__">— Select Reference Column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Validation Error Text */}
        {!canConfirm && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Please select a <strong>Date column</strong>, <strong>Description column</strong>, and at least one{' '}
              <strong>Debit, Credit, or Net Amount column</strong> to proceed.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancel Upload
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!canConfirm || isLoading}
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Confirm Mapping & Stage Transactions
          </Button>
        </div>
      </Card>
    </form>
  );
};
