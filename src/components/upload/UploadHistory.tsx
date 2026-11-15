import React from 'react';
import type { StatementUpload, UploadStatus } from '../../types/uploads';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  Building2,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

interface UploadHistoryProps {
  uploads: StatementUpload[];
  onSelectUpload: (upload: StatementUpload) => void;
  onDeleteUpload?: (uploadId: string) => void;
  onClearStuck?: () => void;
  isLoading?: boolean;
}

export const UploadHistory: React.FC<UploadHistoryProps> = ({
  uploads,
  onSelectUpload,
  onDeleteUpload,
  onClearStuck,
  isLoading = false,
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
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Statement Upload History</CardTitle>
          <span className="text-xs text-slate-500">
            {uploads.length} statement files tracked under audit isolation
          </span>
        </div>
        {onClearStuck && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearStuck}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            Clear Stuck Uploads
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800/80">
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No statement uploads yet. Upload your first CSV or XLSX statement above.
          </div>
        ) : (
          uploads.map((upload) => (
            <div
              key={upload.id}
              onClick={() => onSelectUpload(upload)}
              className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
            >
              {/* File & Account Info */}
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {upload.file_name}
                    </span>
                    <span className="uppercase text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium shrink-0">
                      {upload.file_type}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 mt-1 font-mono">
                    <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-sans">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {upload.account?.name || 'Assigned Account'}
                    </span>
                    <span>•</span>
                    <span>{formatDate(upload.created_at)}</span>
                    {upload.row_count && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 font-sans">
                          {upload.row_count} rows
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and Action */}
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                {getStatusBadge(upload.status)}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectUpload(upload);
                  }}
                  leftIcon={<Eye className="w-3.5 h-3.5" />}
                >
                  {upload.status === 'completed' || upload.status === 'imported'
                    ? 'Inspect'
                    : upload.status === 'staged' || upload.status === 'review' || upload.status === 'pending'
                    ? 'Resume'
                    : 'Inspect / Retry'}
                </Button>

                {onDeleteUpload && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Delete this upload and its ${upload.row_count || 0} transactions? This cannot be undone.`
                        )
                      ) {
                        onDeleteUpload(upload.id);
                      }
                    }}
                    className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    Delete Upload
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
