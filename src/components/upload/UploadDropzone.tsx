import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, FileText, Trash2, AlertCircle } from 'lucide-react';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClearFile: () => void;
  isUploading?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileSelected,
  selectedFile,
  onClearFile,
  isUploading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleValidateAndSelect = (file: File) => {
    setErrorMessage(null);

    // Max 20 MB = 20 * 1024 * 1024 bytes
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMessage(`File exceeds the 20 MB maximum size limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    const name = file.name.toLowerCase();
    const isSupported = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.pdf');

    if (!isSupported) {
      setErrorMessage('Unsupported format. Please upload a PDF (.pdf), CSV (.csv), or Excel (.xlsx) bank statement.');
      return;
    }

    onFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleValidateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleValidateAndSelect(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isPDF = selectedFile?.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 flex items-start gap-2.5 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Dropzone Area or Selected File Card */}
      {!selectedFile ? (
        <div
          data-testid="upload-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl min-h-[200px] p-6 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
            isDragging
              ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 scale-[1.005]'
              : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleInputChange}
            accept=".csv, .xlsx, .pdf, application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 ring-8 ring-indigo-50/50 dark:ring-indigo-950/30">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            Drop your statement here, or{' '}
            <span className="text-indigo-600 dark:text-indigo-400 underline underline-offset-4 hover:text-indigo-700">
              browse files
            </span>
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
            Supports PDF (.pdf), CSV (.csv), and Excel (.xlsx) statement exports from HDFC, SBI, ICICI, Kotak, Axis, Paytm & UPI.
          </p>

          <div className="mt-5 flex items-center gap-4 text-[11px] text-slate-400">
            <span>• Single file at a time</span>
            <span>• Max size: 20 MB</span>
            <span>• SHA-256 dedup active</span>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                isPDF
                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                  : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {isPDF ? <FileText className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                {selectedFile.name}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                <span>{formatFileSize(selectedFile.size)}</span>
                <span>•</span>
                <span
                  className={`uppercase text-[10px] font-semibold ${
                    isPDF
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  {isPDF
                    ? 'PDF Document'
                    : selectedFile.name.endsWith('.csv')
                    ? 'CSV File'
                    : 'Excel Spreadsheet'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClearFile}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
