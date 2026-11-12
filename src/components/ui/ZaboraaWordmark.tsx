import React from 'react';

interface ZaboraaWordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const ZaboraaWordmark: React.FC<ZaboraaWordmarkProps> = ({
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const sizeStyles = {
    sm: {
      icon: 'w-6 h-6 text-xs rounded-md',
      zaboraa: 'text-base',
      finance: 'text-sm ml-1',
    },
    md: {
      icon: 'w-8 h-8 text-sm rounded-lg',
      zaboraa: 'text-xl tracking-tight',
      finance: 'text-lg ml-1.5',
    },
    lg: {
      icon: 'w-10 h-10 text-base rounded-xl',
      zaboraa: 'text-2xl tracking-tight',
      finance: 'text-xl ml-2',
    },
  };

  const style = sizeStyles[size];

  return (
    <div className={`inline-flex items-center select-none whitespace-nowrap shrink-0 ${className}`}>
      {showIcon && (
        <div
          className={`${style.icon} bg-indigo-600 text-white font-heading font-bold flex items-center justify-center mr-2.5 shadow-xs`}
          aria-hidden="true"
        >
          Z
        </div>
      )}
      <span className={`font-heading font-bold text-slate-900 dark:text-white ${style.zaboraa}`}>
        Zaboraa
      </span>
      <span className={`font-sans font-normal text-indigo-600 dark:text-indigo-400 ${style.finance}`}>
        Finance
      </span>
    </div>
  );
};
