import React, { useState } from 'react';
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
}

const STATUS_OPTIONS: (ItemStatus | 'All')[] = ['All', 'Active', 'Inactive', 'SOLD'];
const TAG_OPTIONS: ItemTag[] = ['Hoodie', 'Jersey', 'polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  tagFilters,
  onTagToggle,
  onResetFilters,
}) => {
  const hasActiveFilters = searchQuery || statusFilter !== 'All' || tagFilters.length > 0;

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800">
      {/* Search Bar - Always Visible */}
      <div className="flex items-center gap-2 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-lg border border-gray-600 bg-gray-900 py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusChange(status)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {status}
                </button>
              ))}
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
