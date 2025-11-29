import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, X } from 'lucide-react';
import type { ItemTag, ItemStatus } from '../types/item';

interface SearchAndFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: ItemStatus | 'All';
  onStatusChange: (status: ItemStatus | 'All') => void;
  tagFilters: ItemTag[];
  onTagToggle: (tag: ItemTag) => void;
  onResetFilters: () => void;
  onPresetFilter?: (presetId: string) => void;
}

const STATUS_OPTIONS: (ItemStatus | 'All')[] = ['All', 'Active', 'Inactive', 'SOLD'];
const TAG_OPTIONS: ItemTag[] = ['Hoodie', 'Jersey', 'Polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

// Smart filter presets for reselling workflow
const FILTER_PRESETS = [
  { id: 'needs-attention', label: '🔴 Needs Attention', description: 'No price or not listed' },
  { id: 'needs-photos', label: '📸 Needs Photos', description: 'Missing images' },
  { id: 'not-listed', label: '📦 Not Listed', description: 'No marketplace URLs' },
  { id: 'stale', label: '⏰ Stale', description: 'Active >30 days' },
  { id: 'high-value', label: '💰 High Value', description: 'Items >$100' },
  { id: 'quick-flips', label: '⚡ Quick Flips', description: 'Listed <7 days' },
  { id: 'loss-leaders', label: '📉 Loss Leaders', description: 'Negative profit' },
];

export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  tagFilters,
  onTagToggle,
  onResetFilters,
  onPresetFilter,
}) => {
  const hasActiveFilters = searchQuery || statusFilter !== 'All' || tagFilters.length > 0;

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      {/* Filter Presets - Mobile Optimized */}
      {onPresetFilter && (
        <div className="p-3 border-b border-gray-700">
          <div className="text-xs text-gray-400 mb-2 font-medium">Quick Filters</div>
          <div className="flex flex-wrap gap-1">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onPresetFilter(preset.id)}
                className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar - Always Visible */}
      <div className="flex items-center gap-2 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <motion.input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-lg border border-gray-600 bg-gray-900 py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all duration-200"
            whileFocus={{ 
              scale: 1.02,
              boxShadow: "0 0 0 3px rgba(147, 51, 234, 0.1)"
            }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          />
        </div>
        
        {/* Filter Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            hasActiveFilters
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <Filter className="h-4 w-4" />
          {hasActiveFilters && <span className="hidden sm:inline">Active</span>}
        </button>
        
        {/* Reset Button */}
        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
            title="Reset filters"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapsible Filters */}
      {isExpanded && (
        <div className="space-y-3 border-t border-gray-700 p-3">
          {/* Status Filter */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Status</label>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence>
                {STATUS_OPTIONS.map((status) => (
                  <motion.button
                    key={status}
                    onClick={() => onStatusChange(status)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    {status}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Tag Filter */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onTagToggle(tag)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    tagFilters.includes(tag)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
