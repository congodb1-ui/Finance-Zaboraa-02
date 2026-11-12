import React, { useState } from 'react';
import type { Category } from '../../types/categories';
import type { Workspace } from '../../types/workspaces';
import { Button } from '../ui/Button';
import { CheckSquare, X, Tag, Briefcase, Check, ArrowRight } from 'lucide-react';

interface BulkEditBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onApplyBulkEdit: (updates: {
    category_id?: string | null;
    workspace_id?: string | null;
    append_tags?: string[];
  }) => Promise<void>;
  categories: Category[];
  workspaces: Workspace[];
}

export const BulkEditBar: React.FC<BulkEditBarProps> = ({
  selectedCount,
  onClearSelection,
  onApplyBulkEdit,
  categories,
  workspaces,
}) => {
  if (selectedCount === 0) return null;

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onApplyBulkEdit({
        category_id: selectedCategory ? selectedCategory : undefined,
        workspace_id: selectedWorkspace ? selectedWorkspace : undefined,
        append_tags: parsedTags.length > 0 ? parsedTags : undefined,
      });

      // Clear bar fields
      setSelectedCategory('');
      setSelectedWorkspace('');
      setTagsInput('');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 dark:bg-slate-900/95 text-white backdrop-blur-md border-t border-slate-700/80 px-4 py-3 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Selection Count & Clear */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/80">
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectedCount} transaction{selectedCount > 1 ? 's' : ''} selected</span>
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Clear selection</span>
          </button>
        </div>

        {/* Bulk Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Set Category */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Set Category...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Set Workspace */}
          <select
            value={selectedWorkspace}
            onChange={(e) => setSelectedWorkspace(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Set Workspace...</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Append Tags */}
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Append tags (e.g. verified)"
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg placeholder:text-slate-500 w-36 sm:w-44 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />

          {/* Apply Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            isLoading={isApplying}
            disabled={isApplying || (!selectedCategory && !selectedWorkspace && !tagsInput.trim())}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Apply to {selectedCount}
          </Button>
        </div>
      </div>
    </div>
  );
};
