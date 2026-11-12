import React from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

// 1. Unboxed Metadata with typographic separator (PRD & Frontend Design Zero-Pill rule)
interface MetadataRowProps {
  items: (string | React.ReactNode)[];
  separator?: string;
  className?: string;
}

export const MetadataRow: React.FC<MetadataRowProps> = ({
  items,
  separator = '·',
  className = '',
}) => {
  return (
    <div className={`flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 font-normal ${className}`}>
      {items.filter(Boolean).map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <span className="text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">
              {separator}
            </span>
          )}
          <span className="inline-flex items-center gap-1">{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

// 2. Semantic Transaction Badge (Credit, Debit, Transfer, Pending)
// Always paired with + / - or icons for colorblind safety
export interface TransactionTypeBadgeProps {
  type: 'credit' | 'debit' | 'transfer' | 'pending';
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const TransactionTypeBadge: React.FC<TransactionTypeBadgeProps> = ({
  type,
  label,
  size = 'sm',
  className = '',
}) => {
  const configs = {
    credit: {
      defaultLabel: 'Credit (+)',
      icon: <ArrowDownLeft className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />,
      styles: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200/60 dark:border-green-800/60',
    },
    debit: {
      defaultLabel: 'Debit (−)',
      icon: <ArrowUpRight className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />,
      styles: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200/60 dark:border-red-800/60',
    },
    transfer: {
      defaultLabel: 'Transfer',
      icon: <ArrowLeftRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />,
      styles: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    },
    pending: {
      defaultLabel: 'Pending Review',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
      styles: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60',
    },
  };

  const config = configs[type];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-sm gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-md whitespace-nowrap shrink-0 ${sizeClass} ${config.styles} ${className}`}
    >
      {config.icon}
      <span>{label || config.defaultLabel}</span>
    </span>
  );
};

// 3. Category Tag using Fixed 10-Color Palette
export interface CategoryBadgeProps {
  name: string;
  color?: string;
  className?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  name,
  color = '#6366F1',
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 ${className}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span>{name}</span>
    </span>
  );
};

// 4. Workspace Tag (Personal vs Business)
export const WorkspaceBadge: React.FC<{
  workspace: 'Personal' | 'Business';
  className?: string;
}> = ({ workspace, className = '' }) => {
  const isBusiness = workspace === 'Business';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap shrink-0 ${
        isBusiness
          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      } ${className}`}
    >
      {workspace}
    </span>
  );
};
