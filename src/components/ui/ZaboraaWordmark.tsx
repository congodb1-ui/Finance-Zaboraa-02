import React from 'react';
import { ZaboraaLogoIcon } from './ZaboraaLogoIcon';

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
      iconSize: 26,
      zaboraa: 'text-base',
      finance: 'text-sm ml-1',
    },
    md: {
      iconSize: 34,
      zaboraa: 'text-xl tracking-tight',
      finance: 'text-lg ml-1.5',
    },
    lg: {
      iconSize: 44,
      zaboraa: 'text-2xl tracking-tight',
      finance: 'text-xl ml-2',
    },
  };

  const style = sizeStyles[size];

  return (
    <div className={`inline-flex items-center select-none whitespace-nowrap shrink-0 ${className}`}>
      {showIcon && (
        <div className="mr-2.5 flex items-center justify-center transition-transform hover:scale-105">
          <ZaboraaLogoIcon size={style.iconSize} />
        </div>
      )}
      <span className={`font-heading font-extrabold text-slate-900 dark:text-white ${style.zaboraa}`}>
        Zaboraa
      </span>
      <span className={`font-sans font-normal text-indigo-600 dark:text-indigo-400 ${style.finance}`}>
        Finance
      </span>
    </div>
  );
};
