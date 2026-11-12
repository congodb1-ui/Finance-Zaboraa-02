import React from 'react';
import { Upload, FileSearch, Sliders, CheckSquare, Database } from 'lucide-react';

export type UploadStep = 'select' | 'parse' | 'map' | 'review' | 'imported';

interface UploadProgressProps {
  currentStep: UploadStep;
  rowCount?: number | null;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ currentStep, rowCount }) => {
  const steps: Array<{ id: UploadStep; label: string; icon: React.ElementType }> = [
    { id: 'select', label: 'Upload File', icon: Upload },
    { id: 'parse', label: 'Parse & Inspect', icon: FileSearch },
    { id: 'map', label: 'Map Columns', icon: Sliders },
    { id: 'review', label: 'Review & Verify', icon: CheckSquare },
    { id: 'imported', label: 'Commit Ledger', icon: Database },
  ];

  const stepOrder: Record<UploadStep, number> = {
    select: 0,
    parse: 1,
    map: 2,
    review: 3,
    imported: 4,
  };

  const currentIndex = stepOrder[currentStep];

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-2.5 shrink-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/30'
                      : isCompleted
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="hidden sm:block text-left">
                  <div
                    className={`text-xs font-semibold ${
                      isCurrent
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isCompleted
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </div>
                  {isCurrent && rowCount !== undefined && rowCount !== null && (
                    <div className="text-[10px] text-slate-500 font-mono font-medium">
                      {rowCount} rows detected
                    </div>
                  )}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 min-w-4 transition-colors ${
                    idx < currentIndex
                      ? 'bg-emerald-500/80 dark:bg-emerald-600/80'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
