import React from 'react';
import { CATEGORY_PALETTE, formatINR } from '../../types/design-system';
import type { AnalyticsCategoryRow } from '../../types/analytics';

interface CategorySpendingChartProps {
  categories: AnalyticsCategoryRow[];
}

export const CategorySpendingChart: React.FC<CategorySpendingChartProps> = ({
  categories,
}) => {
  const topExpenseCategories = categories
    .filter((c) => c.type === 'expense' && c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (topExpenseCategories.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
        No expense categories recorded in this period.
      </div>
    );
  }

  const maxSpend = Math.max(1, ...topExpenseCategories.map((c) => c.total));
  const rowHeight = 36;
  const svgHeight = topExpenseCategories.length * rowHeight + 8;
  const svgWidth = 760;
  const labelWidth = 185;
  const valueWidth = 155;
  const barMaxWidth = svgWidth - labelWidth - valueWidth - 20;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="min-w-[540px]"
        role="img"
        aria-label="Top 10 spending categories horizontal bar chart"
      >
        {topExpenseCategories.map((cat, idx) => {
          const y = idx * rowHeight + 6;
          const barW = Math.max(6, (cat.total / maxSpend) * barMaxWidth);
          const color = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
          const truncatedName =
            cat.category.length > 24 ? `${cat.category.slice(0, 23)}…` : cat.category;

          return (
            <g key={`${cat.category}-${idx}`}>
              {/* Category label */}
              <text
                x={0}
                y={y + 18}
                fontSize="12"
                fontWeight="500"
                className="fill-slate-700 dark:fill-slate-200 print:fill-slate-900"
              >
                {truncatedName}
                <title>{cat.category}</title>
              </text>

              {/* Track */}
              <rect
                x={labelWidth}
                y={y + 6}
                width={barMaxWidth}
                height={16}
                rx={4}
                className="fill-slate-100 dark:fill-slate-800/80 print:fill-slate-100"
              />

              {/* Value bar */}
              <rect
                x={labelWidth}
                y={y + 6}
                width={barW}
                height={16}
                rx={4}
                fill={color}
              >
                <title>
                  {`${cat.category}: ${formatINR(cat.total, { showDecimals: false })} (${cat.pct}%)`}
                </title>
              </rect>

              {/* Right-aligned ₹ total and % */}
              <text
                x={svgWidth}
                y={y + 18}
                textAnchor="end"
                fontSize="12"
                className="fill-slate-800 dark:fill-slate-200 print:fill-slate-900 font-mono font-tabular"
              >
                {`${formatINR(cat.total, { showDecimals: false })} (${cat.pct}%)`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
