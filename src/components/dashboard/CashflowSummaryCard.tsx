import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Scale } from 'lucide-react';

interface CashflowSummaryCardProps {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  monthlyData: { month: string; income: number; expense: number; net: number }[];
}

export const CashflowSummaryCard: React.FC<CashflowSummaryCardProps> = ({
  totalIncome,
  totalExpenses,
  netCashflow,
  monthlyData,
}) => {
  const isPositiveNet = netCashflow >= 0;

  // Custom Recharts Tooltip formatted in INR
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg text-xs shadow-xl space-y-1">
          <p className="font-semibold text-slate-300">{label}</p>
          <p className="text-emerald-400 font-tabular">
            Income: {formatINR(payload[0]?.value || 0)}
          </p>
          <p className="text-red-400 font-tabular">
            Expenses: {formatINR(payload[1]?.value || 0)}
          </p>
          <p className="text-slate-300 font-tabular pt-1 border-t border-slate-800">
            Net: {formatINR((payload[0]?.value || 0) - (payload[1]?.value || 0))}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-5 flex flex-col justify-between space-y-5">
      {/* Header and KPI Mini Strip */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Cashflow & Operating Margin
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Excludes Transfers</span>
        </div>

        {/* 3 Metric Mini Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Income */}
          <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-0.5">
              Total Inflow (Income)
            </span>
            <div className="font-heading font-bold text-xl text-emerald-700 dark:text-emerald-400 font-tabular">
              +{formatINR(totalIncome)}
            </div>
          </div>

          {/* Expenses */}
          <div className="p-3 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 block mb-0.5">
              Total Outflow (Expense)
            </span>
            <div className="font-heading font-bold text-xl text-red-700 dark:text-red-400 font-tabular">
              −{formatINR(totalExpenses)}
            </div>
          </div>

          {/* Net Cashflow */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">
              Net Surplus / Deficit
            </span>
            <div
              className={`font-heading font-bold text-xl font-tabular ${
                isPositiveNet ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatINR(netCashflow)}
            </div>
          </div>
        </div>
      </div>

      {/* 12-Month Recharts Bar Chart */}
      <div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-600 dark:text-slate-400 font-medium">
            Financial Year Monthly Inflows vs. Outflows
          </span>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] dark:bg-[#22C55E]" />
              Income
            </span>
            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626] dark:bg-[#F87171]" />
              Expense
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${val >= 100000 ? `${(val / 100000).toFixed(0)}L` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="income" name="Income" fill="#16A34A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#DC2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
};
