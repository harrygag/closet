import React from 'react';
import { Search, Filter } from 'lucide-react';
import type { SaleFilters, MarketplaceType, SaleSource, SaleSortOption, SaleSortField } from '../../types/sale';

interface SalesFilterBarProps {
  filters: SaleFilters;
  onFilterChange: (filters: Partial<SaleFilters>) => void;
  sortOption: SaleSortOption;
  onSortChange: (option: SaleSortOption) => void;
}

export const SalesFilterBar: React.FC<SalesFilterBarProps> = ({
  filters,
  onFilterChange,
  sortOption,
  onSortChange,
}) => {
  const dateRangeOptions: { value: SaleFilters['dateRange']; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'custom', label: 'Custom Range' },
    { value: 'all', label: 'All time' },
  ];

  const marketplaceOptions: { value: 'all' | MarketplaceType; label: string }[] = [
    { value: 'all', label: 'All Marketplaces' },
    { value: 'ebay', label: 'eBay' },
    { value: 'poshmark', label: 'Poshmark' },
    { value: 'depop', label: 'Depop' },
    { value: 'in_person', label: 'In-Person' },
  ];

  const sourceOptions: { value: 'all' | SaleSource; label: string }[] = [
    { value: 'all', label: 'All Sources' },
    { value: 'auto_ebay_sync', label: 'Auto (eBay Sync)' },
    { value: 'detail_page', label: 'Manual (Detail Page)' },
    { value: 'sell_search', label: 'Sell Search' },
    { value: 'dot_sold', label: 'Dot Sold' },
    { value: 'scan_sales', label: 'Scan (Sales Mode)' },
    { value: 'scan_detail', label: 'Scan (Detail)' },
    { value: 'stock_check', label: 'Stock Check' },
    { value: 'bulk_status', label: 'Bulk Status' },
    { value: 'quantity_zero', label: 'Qty Zero' },
  ];

  const sortOptions: { value: string; label: string; field: SaleSortField; direction: 'asc' | 'desc' }[] = [
    { value: 'date_desc', label: 'Newest first', field: 'saleDate', direction: 'desc' },
    { value: 'date_asc', label: 'Oldest first', field: 'saleDate', direction: 'asc' },
    { value: 'price_desc', label: 'Price (high-low)', field: 'salePrice', direction: 'desc' },
    { value: 'price_asc', label: 'Price (low-high)', field: 'salePrice', direction: 'asc' },
    { value: 'profit_desc', label: 'Profit (high-low)', field: 'profit', direction: 'desc' },
    { value: 'profit_asc', label: 'Profit (low-high)', field: 'profit', direction: 'asc' },
  ];

  const currentSortValue = `${sortOption.field}_${sortOption.direction}`;

  return (
    <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/50 space-y-3">
      <div className="flex items-center gap-2 text-gray-300 mb-2">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Date Range */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date Range</label>
          <select
            value={filters.dateRange}
            onChange={(e) => onFilterChange({ dateRange: e.target.value as any })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {dateRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Inputs */}
        {filters.dateRange === 'custom' && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={filters.customDateStart || ''}
                onChange={(e) => onFilterChange({ customDateStart: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={filters.customDateEnd || ''}
                onChange={(e) => onFilterChange({ customDateEnd: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </>
        )}

        {/* Marketplace */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Marketplace</label>
          <select
            value={filters.marketplace}
            onChange={(e) => onFilterChange({ marketplace: e.target.value as any })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {marketplaceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Source */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source</label>
          <select
            value={filters.saleSource}
            onChange={(e) => onFilterChange({ saleSource: e.target.value as any })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Sort by</label>
          <select
            value={currentSortValue}
            onChange={(e) => {
              const opt = sortOptions.find((o) => o.value === e.target.value);
              if (opt) onSortChange({ field: opt.field, direction: opt.direction });
            }}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className={filters.dateRange === 'custom' ? 'lg:col-span-5' : ''}>
          <label className="block text-xs text-gray-400 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={filters.searchQuery}
              onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
              className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
