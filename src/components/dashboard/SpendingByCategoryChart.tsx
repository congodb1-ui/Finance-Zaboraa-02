import React from 'react';
import { Card } from '../ui/Card';
import { formatINR } from '../../types/design-system';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieIcon, ArrowRight } from 'lucide-react';

interface CategorySpendItem {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

interface SpendingByCategoryChartProps {
  categories: CategorySpendItem[];
  onSelectCategory?: (categoryId: string) => void;
}

export const SpendingByCategoryChart: React.FC<SpendingByCategoryChartProps> = ({
  categories,
  onSelectCategory,
}) => {
  const totalAmount = categories.reduce((sum, c) => sum + c.amount, 0);

  const handleSliceClick = (entry: any) => {
    if (onSelectCategory && entry && entry.id) {
      onSelectCategory(entry.id);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as CategorySpendItem;
      return (
        <div className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg text-xs shadow-xl space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: data.color }}
            />
            {data.name}
          </p>
          <p className="text-slate-300 font-tabular">
            {formatINR(data.amount)} ({data.percentage}%)
          </p>
          <span className="text-[10px] text-slate-400 block pt-0.5">
            Click to view transactions
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-5 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <PieIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Category Spending Breakdown
        </span>
        <span className="text-[11px] font-mono text-slate-500">
          Total: <strong className="font-tabular font-bold">{formatINR(totalAmount)}</strong>
        </span>
      </div>

      {categories.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-xs text-slate-400">
          No expense transactions recorded in this period.
        </div>
      ) : (
        <>
          {/* Recharts Donut Pie Chart */}
          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={categories}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={2}
                  onClick={handleSliceClick}
                  className="cursor-pointer"
                >
                  {categories.map((entry) => (
                    <Cell
                      key={`cell-${entry.id}`}
                      fill={entry.color}
                      className="hover:opacity-80 transition-opacity"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center Summary Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Expenses
              </span>
              <span className="font-heading font-bold text-base text-slate-900 dark:text-white font-tabular">
                {formatINR(totalAmount, { compact: true })}
              </span>
            </div>
          </div>

          {/* Interactive Legend with Percentage and formatINR */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSliceClick(cat)}
                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-slate-700 dark:text-slate-300 font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {cat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-tabular shrink-0 ml-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatINR(cat.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 w-8 text-right">
                      {cat.percentage}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
