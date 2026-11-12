import React from 'react';

interface ZaboraaLogoIconProps {
  className?: string;
  size?: number | string;
}

/**
 * Official Zaboraa Finance Brand Mark
 * Vector recreation of the official Zaboraa neon cloud circuit "Z" logo
 * featuring gradient strokes and circuit nodes.
 */
export const ZaboraaLogoIcon: React.FC<ZaboraaLogoIconProps> = ({
  className = '',
  size = 32,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Zaboraa Finance Official Logo"
    >
      <defs>
        {/* Outer cloud neon gradient: Cyan -> Blue -> Violet */}
        <linearGradient id="zaboraaCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="35%" stopColor="#38BDF8" />
          <stop offset="65%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>

        {/* Inner Z circuit gradient: Bright Cyan -> Electric Indigo */}
        <linearGradient id="zaboraaCircuitGrad" x1="15%" y1="20%" x2="90%" y2="85%">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>

        {/* Glow filter for authentic neon look */}
        <filter id="zaboraaGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. Outer Cloud Outline Double Strokes */}
      {/* Outer Path */}
      <path
        d="M 52 118 
           C 28 118, 12 102, 12 80 
           C 12 62, 26 48, 44 46 
           C 52 24, 76 12, 104 12 
           C 134 12, 158 28, 166 52 
           C 182 55, 194 68, 194 84 
           C 194 104, 178 118, 156 118 
           Z"
        stroke="url(#zaboraaCloudGrad)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner Cloud Offset Path */}
      <path
        d="M 56 110 
           C 36 110, 22 96, 22 80 
           C 22 66, 32 54, 48 52 
           C 56 34, 76 22, 102 22 
           C 128 22, 148 36, 156 56 
           C 170 58, 182 70, 182 84 
           C 182 98, 170 110, 152 110 
           Z"
        stroke="url(#zaboraaCloudGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      {/* 2. Stylized "Z" Circuit Core Lines */}
      {/* Top horizontal circuit of the Z */}
      <path
        d="M 64 56 L 136 56"
        stroke="url(#zaboraaCircuitGrad)"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Center diagonal circuit of the Z */}
      <path
        d="M 132 58 L 74 102"
        stroke="url(#zaboraaCircuitGrad)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* Bottom loop / circuit path of the Z */}
      <path
        d="M 74 102 L 140 102 C 152 102, 160 94, 160 84 C 160 74, 150 68, 140 70"
        stroke="url(#zaboraaCircuitGrad)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Circuit loop on the lower left */}
      <path
        d="M 44 92 C 38 82, 48 70, 60 70 C 68 70, 74 76, 74 84 L 74 100"
        stroke="url(#zaboraaCircuitGrad)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* 3. Glowing Circuit Junction Nodes (Circles with White Core) */}
      {/* Top Left Node */}
      <circle cx="64" cy="56" r="6" fill="#00E5FF" />
      <circle cx="64" cy="56" r="2.5" fill="#FFFFFF" />

      {/* Top Right Node */}
      <circle cx="136" cy="56" r="6" fill="#00E5FF" />
      <circle cx="136" cy="56" r="2.5" fill="#FFFFFF" />

      {/* Bottom Left Node */}
      <circle cx="56" cy="116" r="5.5" fill="#A855F7" />
      <circle cx="56" cy="116" r="2" fill="#FFFFFF" />

      {/* Bottom Center Node */}
      <circle cx="130" cy="102" r="5" fill="#38BDF8" />
      <circle cx="130" cy="102" r="2" fill="#FFFFFF" />

      {/* Cloud Corner Accent Node Right */}
      <circle cx="164" cy="72" r="4.5" fill="#A855F7" />
      <circle cx="164" cy="72" r="1.5" fill="#FFFFFF" />
    </svg>
  );
};
