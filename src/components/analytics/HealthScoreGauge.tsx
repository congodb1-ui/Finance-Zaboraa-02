import React from 'react';

interface HealthScoreGaugeProps {
  score: number;
}

function getScoreMeta(score: number): {
  label: string;
  stroke: string;
  textClass: string;
  badgeClass: string;
} {
  if (score <= 4) {
    return {
      label: 'Needs Attention',
      stroke: '#DC2626',
      textClass: 'text-red-600 dark:text-red-400',
      badgeClass:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
    };
  }
  if (score <= 6) {
    return {
      label: 'Moderate',
      stroke: '#D97706',
      textClass: 'text-amber-600 dark:text-amber-400',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    };
  }
  if (score <= 8) {
    return {
      label: 'Healthy',
      stroke: '#16A34A',
      textClass: 'text-green-600 dark:text-green-400',
      badgeClass:
        'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-900',
    };
  }
  return {
    label: 'Excellent',
    stroke: '#059669',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
  };
}

export const HealthScoreGauge: React.FC<HealthScoreGaugeProps> = ({ score }) => {
  const clamped = Math.max(1, Math.min(10, Math.round(score || 5)));
  const meta = getScoreMeta(clamped);

  const size = 132;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clamped / 10;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="relative w-[132px] h-[132px] flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`Financial health score ${clamped} out of 10 (${meta.label})`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-800 print:text-slate-200"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={meta.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline gap-0.5 font-tabular">
            <span className={`font-heading font-bold text-3xl leading-none ${meta.textClass}`}>
              {clamped}
            </span>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">/10</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Health Score
          </span>
        </div>
      </div>

      <span
        className={`mt-2.5 inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${meta.badgeClass}`}
      >
        {meta.label}
      </span>
    </div>
  );
};
