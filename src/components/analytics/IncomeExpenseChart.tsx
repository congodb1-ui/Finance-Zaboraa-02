import React, { useState } from 'react';
import { formatINR } from '../../types/design-system';
import type { AnalyticsMonthRow } from '../../types/analytics';

interface IncomeExpenseChartProps {
  months: AnalyticsMonthRow[];
}

function formatAxisINR(value: number): string {
  if (value === 0) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
}

export const IncomeExpenseChart: React.FC<IncomeExpenseChartProps> = ({ months }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const displayMonths = months.slice(-24);

  if (displayMonths.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
        No monthly cash flow data available for this period.
      </div>
    );
  }

  const maxValue = Math.max(
    1000,
    ...displayMonths.flatMap((m) => [m.income, m.expense])
  );

  const paddingLeft = 64;
  const paddingRight = 20;
  const paddingTop = 18;
  const paddingBottom = 42;
  const chartHeight = 220;
  const groupWidth = Math.max(52, Math.min(76, Math.floor(760 / Math.max(1, displayMonths.length))));
  const chartWidth = Math.max(640, paddingLeft + paddingRight + displayMonths.length * groupWidth);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const activeRow =
    hoveredIdx !== null && displayMonths[hoveredIdx]
      ? displayMonths[hoveredIdx]
      : displayMonths[displayMonths.length - 1];

  return (
    <div className="space-y-3">
      {/* Interactive detail strip + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A] inline-block" />
            <span className="text-slate-600 dark:text-slate-300 font-medium">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626] inline-block" />
            <span className="text-slate-600 dark:text-slate-300 font-medium">Expense</span>
          </div>
        </div>

        {activeRow && (
          <div className="flex flex-wrap items-center gap-3 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-tabular">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {activeRow.month}
            </span>
            <span className="text-green-700 dark:text-green-400">
              In: {formatINR(activeRow.income, { showDecimals: false })}
            </span>
            <span className="text-red-700 dark:text-red-400">
              Out: {formatINR(activeRow.expense, { showDecimals: false })}
            </span>
            <span
              className={
                activeRow.net >= 0
                  ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                  : 'text-red-700 dark:text-red-400 font-semibold'
              }
            >
              Net: {formatINR(activeRow.net, { showDecimals: false, showSign: true })}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable Pure Inline SVG Grouped Bar Chart */}
      <div className="w-full overflow-x-auto pb-1">
        <svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="min-w-[600px] select-none"
          role="img"
          aria-label="Monthly Income vs Expense grouped bar chart"
        >
          {/* Horizontal gridlines + Y-axis labels */}
          {gridTicks.map((t) => {
            const y = paddingTop + plotHeight * (1 - t);
            const val = maxValue * t;
            return (
              <g key={t}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray={t === 0 ? undefined : '3 3'}
                  className="text-slate-200 dark:text-slate-800 print:text-slate-200"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  className="fill-slate-500 dark:fill-slate-400 font-mono"
                >
                  {formatAxisINR(val)}
                </text>
              </g>
            );
          })}

          {/* Monthly grouped bars */}
          {displayMonths.map((row, idx) => {
            const gx = paddingLeft + idx * groupWidth;
            const centerX = gx + groupWidth / 2;
            const barWidth = Math.max(8, Math.min(18, Math.floor((groupWidth - 16) / 2)));
            const gap = 3;

            const incomeHeight = (row.income / maxValue) * plotHeight;
            const expenseHeight = (row.expense / maxValue) * plotHeight;

            const incomeY = paddingTop + plotHeight - incomeHeight;
            const expenseY = paddingTop + plotHeight - expenseHeight;

            const incomeX = centerX - barWidth - gap / 2;
            const expenseX = centerX + gap / 2;

            const isHovered = hoveredIdx === idx;
            const [monPart, yrPart] = row.month.split(' ');
            const shortLabel = yrPart ? `${monPart} '${yrPart.slice(-2)}` : row.month;

            return (
              <g
                key={row.month}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Hover highlight column */}
                {isHovered && (
                  <rect
                    x={gx + 2}
                    y={paddingTop}
                    width={groupWidth - 4}
                    height={plotHeight}
                    rx={4}
                    className="fill-slate-100/80 dark:fill-slate-800/60"
                  />
                )}

                {/* Income Bar (Green) */}
                <rect
                  x={incomeX}
                  y={incomeY}
                  width={barWidth}
                  height={Math.max(1, incomeHeight)}
                  rx={2}
                  fill="#16A34A"
                  opacity={hoveredIdx !== null && !isHovered ? 0.65 : 1}
                >
                  <title>{`${row.month} Income: ${formatINR(row.income, { showDecimals: false })}`}</title>
                </rect>

                {/* Expense Bar (Red) */}
                <rect
                  x={expenseX}
                  y={expenseY}
                  width={barWidth}
                  height={Math.max(1, expenseHeight)}
                  rx={2}
                  fill="#DC2626"
                  opacity={hoveredIdx !== null && !isHovered ? 0.65 : 1}
                >
                  <title>{`${row.month} Expense: ${formatINR(row.expense, { showDecimals: false })}`}</title>
                </rect>

                {/* X-axis month label */}
                <text
                  x={centerX}
                  y={paddingTop + plotHeight + 18}
                  textAnchor="middle"
                  fontSize="10"
                  className={
                    isHovered
                      ? 'fill-slate-900 dark:fill-white font-semibold'
                      : 'fill-slate-500 dark:fill-slate-400'
                  }
                >
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
