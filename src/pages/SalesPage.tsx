import React, { useEffect } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { useSaleStore } from '../store/useSaleStore';
import { useAuthStore } from '../store/useAuthStore';
import { SalesStatsBar } from '../components/sales/SalesStatsBar';
import { SalesFilterBar } from '../components/sales/SalesFilterBar';
import { SalesCardGrid } from '../components/sales/SalesCardGrid';
import { Button } from '../components/ui/Button';
import { toast } from 'sonner';

interface SalesPageProps {
  /** When true, omit the page chrome (min-h-screen + bg) so this can be
   *  embedded inside another page (e.g. UnifiedSalesPage at /sales). */
  headless?: boolean;
}

export const SalesPage: React.FC<SalesPageProps> = ({ headless = false }) => {
  const user = useAuthStore((state) => state.user);
  const {
    filteredSales,
    isLoading,
    filters,
    sortOption,
    selectedSales,
    loadSales,
    updateSale,
    deleteSale,
    setFilters,
    setSortOption,
    toggleSelection,
    selectAll,
    clearSelection,
    getStats,
    exportToCSV,
  } = useSaleStore();

  useEffect(() => {
    if (user) {
      loadSales(user.id);
    }
  }, [user, loadSales]);

  const handleExportCSV = () => {
    try {
      const csv = exportToCSV();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `sales-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Sales data exported to CSV');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const stats = getStats();

  const inner = (
    <div className={headless ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
        {/* Header — hidden in headless mode since UnifiedSalesPage renders
            its own title + logo strip above this. */}
        {!headless && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <TrendingUp className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Sales Tracker</h1>
                <p className="text-gray-400 mt-1">
                  Track sales across eBay, Poshmark, Depop & in-person
                </p>
              </div>
            </div>

            <Button
              onClick={handleExportCSV}
              variant="secondary"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={filteredSales.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        )}

        {/* Headless export — when there's no header, expose Export as a small
            row above the stats so the function isn't lost. */}
        {headless && filteredSales.length > 0 && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-[#2A2D34] text-gray-300 hover:text-white hover:bg-[#1F2128] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        )}

        {/* Stats Banner */}
        <div className="mb-6">
          <SalesStatsBar stats={stats} />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <SalesFilterBar
            filters={filters}
            onFilterChange={setFilters}
            sortOption={sortOption}
            onSortChange={setSortOption}
          />
        </div>

        {/* Sales Cards */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-700 border-t-blue-500"></div>
            <p className="text-gray-400 mt-4">Loading sales...</p>
          </div>
        ) : (
          <SalesCardGrid
            sales={filteredSales}
            selectedSales={selectedSales}
            onToggleSelection={toggleSelection}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onUpdateSale={updateSale}
            onDeleteSale={deleteSale}
          />
        )}

        {/* Empty State Hint */}
        {!isLoading && filteredSales.length === 0 && filters.dateRange === 'all' && filters.marketplace === 'all' && filters.saleSource === 'all' && !filters.searchQuery && (
          <div className="mt-8 text-center text-gray-400">
            <p className="text-lg mb-2">No sales recorded yet</p>
            <p className="text-sm">
              Start tracking sales by marking items as SOLD in your inventory
            </p>
          </div>
        )}
    </div>
  );

  // Headless mode (embedded in UnifiedSalesPage): just the inner content.
  // Standalone mode (legacy /sales/grid): wrap in the original page chrome.
  if (headless) return inner;
  return <div className="min-h-screen bg-gray-950 pb-20">{inner}</div>;
};
