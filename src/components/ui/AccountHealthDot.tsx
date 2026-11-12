import React from 'react';
import { AccountHealthStatus, getAccountHealth } from '../../types/design-system';

interface AccountHealthDotProps {
  daysAgo?: number;
  status?: AccountHealthStatus;
  showLabel?: boolean;
  className?: string;
}

export const AccountHealthDot: React.FC<AccountHealthDotProps> = ({
  daysAgo,
  status: statusProp,
  showLabel = true,
  className = '',
}) => {
  const healthInfo = daysAgo !== undefined ? getAccountHealth(daysAgo) : undefined;
  const status = statusProp || healthInfo?.status || 'updated';

  const configs = {
    updated: {
      dot: 'bg-green-600 dark:bg-green-500',
      ring: 'ring-green-600/20 dark:ring-green-500/20',
      label: healthInfo?.label || 'Updated (<7d)',
      text: 'text-green-700 dark:text-green-400',
    },
    warning: {
      dot: 'bg-amber-500 dark:bg-amber-400',
      ring: 'ring-amber-500/20 dark:ring-amber-400/20',
      label: healthInfo?.label || 'Pending (7–30d)',
      text: 'text-amber-700 dark:text-amber-400',
    },
    stale: {
      dot: 'bg-red-600 dark:bg-red-500',
      ring: 'ring-red-600/20 dark:ring-red-500/20',
      label: healthInfo?.label || 'Needs Update (>30d)',
      text: 'text-red-700 dark:text-red-400',
    },
  };

  const config = configs[status];

  return (
    <div className={`inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${className}`}>
      <span
        className={`w-2 h-2 rounded-full ring-2 ${config.dot} ${config.ring} shrink-0`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className={`text-xs font-medium ${config.text}`}>
          {config.label}
        </span>
      )}
    </div>
  );
};
