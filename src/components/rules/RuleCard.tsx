import React from 'react';
import type { TransactionRule } from '../../types/transactions';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  GripVertical,
  ArrowRight,
  Trash2,
  Tag,
  Briefcase,
  Layers,
  ArrowUp,
  ArrowDown,
  Sliders,
} from 'lucide-react';

interface RuleCardProps {
  rule: TransactionRule;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  onToggleActive,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}) => {
  return (
    <Card
      className={`p-4 transition-all ${
        rule.is_active
          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          : 'opacity-60 bg-slate-50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        {/* Left: Priority, Reorder Buttons & Match Info */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          {/* Priority Badge & Reorder Arrows */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span
              title={`Priority: ${rule.priority} (lowest number runs first)`}
              className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-800"
            >
              #{rule.priority}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                aria-label="Move priority up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                aria-label="Move priority down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Condition & Name */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-slate-900 dark:text-white text-sm truncate">
                {rule.name}
              </span>
              {!rule.is_active && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Inactive
                </span>
              )}
            </div>

            {/* Condition formula */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="text-slate-400">IF</span>
              <code className="font-mono text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">
                {rule.match_field}
              </code>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {rule.match_type.replace('_', ' ')}
              </span>
              <code className="font-mono text-slate-900 dark:text-white font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                "{rule.match_value}"
              </code>
            </div>
          </div>
        </div>

        {/* Center / Right: Action Target Tags */}
        <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0">
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" />

          {/* Category Action */}
          {rule.category ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium">
              <Tag className="w-3 h-3 text-indigo-500" />
              <span>{rule.category.name}</span>
            </span>
          ) : rule.set_category ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Category
            </span>
          ) : null}

          {/* Workspace Action */}
          {rule.workspace ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium">
              <Briefcase className="w-3 h-3 text-sky-500" />
              <span>{rule.workspace.name}</span>
            </span>
          ) : rule.set_workspace ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Workspace
            </span>
          ) : null}

          {/* Type Action */}
          {rule.set_txn_type && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {rule.set_txn_type}
            </span>
          )}

          {/* Tags */}
          {rule.set_tags && rule.set_tags.length > 0 && (
            <div className="flex items-center gap-1">
              {rule.set_tags.map((tg) => (
                <span
                  key={tg}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                >
                  #{tg}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Toggle Switch & Delete */}
        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
          {/* Active Switch */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px] text-slate-400">Active</span>
            <input
              type="checkbox"
              checked={rule.is_active}
              onChange={(e) => onToggleActive(rule.id, e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
          </label>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onDelete(rule.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            title="Delete rule"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
};
