import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface BalanceChartProps {
  data: { date: string; balance: number }[];
  accountName: string;
}

export const BalanceChart: React.FC<BalanceChartProps> = ({ data, accountName }) => {
  if (data.length === 0) {
    return (
      <Card className="p-6 text-center text-xs text-slate-400">
        No balance history recorded for this account.
      </Card>
    );
  }

  // Calculate min & max for gradient offset
  const balances = data.map((d) => d.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);

  // Calculate gradient offset (0 to 1) for y=0
  let gradientOffset = 0;
  if (maxBalance <= 0) {
    gradientOffset = 0;
  } else if (minBalance >= 0) {
    gradientOffset = 1;
  } else {
    gradientOffset = maxBalance / (maxBalance - minBalance);
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const bal = payload[0].value;
      return (
        <div className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg text-xs shadow-xl space-y-1">
          <p className="font-semibold text-slate-300">{label}</p>
          <p
            className={`font-tabular font-bold ${
              bal < 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            Running Balance: {formatINR(bal)}
          </p>
          {bal < 0 && (
            <p className="text-[10px] text-red-300 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Negative balance / liability
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Daily Running Balance Trend
        </span>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Positive Balance
          </span>
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Negative Balance
          </span>
        </div>
      </div>

      {/* Area Chart with dynamic gradient shading negative balances in red */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={gradientOffset} stopColor="#6366F1" stopOpacity={0.4} />
                <stop offset={gradientOffset} stopColor="#EF4444" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="strokeColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={gradientOffset} stopColor="#4F46E5" stopOpacity={1} />
                <stop offset={gradientOffset} stopColor="#DC2626" stopOpacity={1} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => d.slice(5)} // MM-DD
              tick={{ fontSize: 10, fill: '#94A3B8' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) =>
                `₹${val >= 100000 || val <= -100000 ? `${(val / 100000).toFixed(1)}L` : val >= 1000 || val <= -1000 ? `${(val / 1000).toFixed(0)}k` : val}`
              }
              tick={{ fontSize: 10, fill: '#94A3B8' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" strokeWidth={1.5} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="url(#strokeColor)"
              strokeWidth={2}
              fill="url(#splitColor)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
