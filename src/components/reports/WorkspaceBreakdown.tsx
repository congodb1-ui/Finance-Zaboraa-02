import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';
import { Briefcase, User, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface WorkspaceData {
  name: string;
  income: number;
  expenses: number;
  net: number;
  topCategories: { name: string; amount: number }[];
  sparkline: { month: number; val: number }[];
}

interface WorkspaceBreakdownProps {
  workspaces: WorkspaceData[];
}

export const WorkspaceBreakdown: React.FC<WorkspaceBreakdownProps> = ({ workspaces }) => {
  const getWorkspaceIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'personal':
        return <User className="w-4 h-4 text-sky-500" />;
      case 'business':
        return <Briefcase className="w-4 h-4 text-emerald-500" />;
      default:
        return <Layers className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getLineColor = (name: string) => {
    switch (name.toLowerCase()) {
      case 'personal':
        return '#0EA5E9'; // Sky
      case 'business':
        return '#10B981'; // Emerald
      default:
        return '#8B5CF6'; // Violet
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
            Workspace Breakdown
          </h3>
          <p className="text-xs text-slate-500">
            Segregated cashflow and category distributions across workspace contexts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {workspaces.map((ws) => {
          const isNetPositive = ws.net >= 0;
          const lineColor = getLineColor(ws.name);

          return (
            <Card key={ws.name} className="p-5 flex flex-col justify-between space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {getWorkspaceIcon(ws.name)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                      {ws.name}
                    </h4>
                    <span className="text-[11px] text-slate-500">Workspace Ledger</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                    Net Cashflow
                  </span>
                  <span
                    className={`text-sm font-bold font-tabular flex items-center justify-end gap-0.5 ${
                      isNetPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isNetPositive ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {formatINR(Math.abs(ws.net))}
                  </span>
                </div>
              </div>

              {/* Totals Strip */}
              <div className="grid grid-cols-2 gap-3 py-1">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-0.5">Total Income</span>
                  <span className="font-tabular font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    {formatINR(ws.income)}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-0.5">Total Expenses</span>
                  <span className="font-tabular font-semibold text-sm text-rose-600 dark:text-rose-400">
                    {formatINR(ws.expenses)}
                  </span>
                </div>
              </div>

              {/* Month-by-Month Sparkline (80px tall, no axes, clean trendline) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Monthly Trajectory</span>
                  <span>12 Months</span>
                </div>
                <div className="h-20 w-full overflow-hidden rounded-lg bg-slate-50/50 dark:bg-slate-900/30 p-1">
                  <ResponsiveContainer width="100%" height={72}>
                    <LineChart data={ws.sparkline}>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const val = payload[0].value as number;
                            return (
                              <div className="bg-slate-900 text-white text-[11px] font-tabular py-1 px-2 rounded shadow-lg border border-slate-800">
                                Month {payload[0].payload.month}: {formatINR(val)}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="val"
                        stroke={lineColor}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top 5 Categories by spend */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Top Outflow Categories
                </span>
                {ws.topCategories && ws.topCategories.length > 0 ? (
                  <ul className="space-y-1.5">
                    {ws.topCategories.map((cat, idx) => (
                      <li
                        key={`${cat.name}-${idx}`}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                          {cat.name}
                        </span>
                        <span className="font-tabular text-slate-800 dark:text-slate-200 font-medium shrink-0">
                          {formatINR(cat.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-2 italic text-center">
                    No categorized expenses recorded
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
