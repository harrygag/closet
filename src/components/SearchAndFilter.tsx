import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { ItemTag, ItemStatus } from '../types/item';
import { Button } from './ui/Button';

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

  return (
    <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search items by name, size, or notes..."
          className="w-full rounded-lg border border-gray-600 bg-gray-900 py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Status Filter */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <label className="text-sm font-medium text-gray-300">Status</label>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => onStatusChange(status)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
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
        <label className="mb-2 block text-sm font-medium text-gray-300">Tags</label>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
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

      {/* Reset Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" onClick={onResetFilters} className="w-full">
          <X className="mr-1 h-4 w-4" />
          Reset Filters
        </Button>
      )}
    </div>
  );
};
