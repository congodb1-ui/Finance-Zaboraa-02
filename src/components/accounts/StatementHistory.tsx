import React from 'react';
import type { StatementUpload, UploadStatus } from '../../types/uploads';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

interface StatementHistoryProps {
  uploads: StatementUpload[];
  onSelectUpload?: (upload: StatementUpload) => void;
}

export const StatementHistory: React.FC<StatementHistoryProps> = ({
  uploads,
  onSelectUpload,
}) => {
  const getStatusBadge = (status: UploadStatus) => {
    switch (status) {
      case 'imported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            Imported
          </span>
        );
      case 'review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Clock className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Pending
          </span>
        );
      case 'replaced':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <RotateCcw className="w-3 h-3" />
            Replaced
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Statement Upload History
        </span>
        <span className="text-slate-400">{uploads.length} statement files</span>
      </div>

      {uploads.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No statement files uploaded for this account yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium text-[11px]">
                <th className="py-2 px-3">File Name</th>
                <th className="py-2 px-3">Upload Date</th>
                <th className="py-2 px-3">Statement Period</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Rows Imported</th>
                <th className="py-2 px-3 text-right">Duplicates</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {uploads.map((up) => (
                <tr
                  key={up.id}
                  onClick={() => onSelectUpload && onSelectUpload(up)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    {up.file_type === 'pdf' ? (
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                    <span className="truncate max-w-[200px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {up.file_name}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-tabular whitespace-nowrap">
                    {new Date(up.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-tabular whitespace-nowrap">
                    {up.statement_period_start && up.statement_period_end
                      ? `${up.statement_period_start} → ${up.statement_period_end}`
                      : 'N/A'}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">{getStatusBadge(up.status)}</td>
                  <td className="py-3 px-3 text-right font-tabular text-slate-700 dark:text-slate-300 font-medium">
                    {up.imported_count || up.row_count || 0}
                  </td>
                  <td className="py-3 px-3 text-right font-tabular text-slate-400">
                    {up.duplicate_count || 0}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Inspect statement review"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
