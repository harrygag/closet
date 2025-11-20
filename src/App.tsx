import { useEffect, useState } from 'react';
import { Plus, Shirt, BarChart3, LogOut, User, Download, Barcode, ShoppingCart, Link2 } from 'lucide-react';
import { useItemStore } from './store/useItemStore';
import { useAuthStore } from './store/useAuthStore';
import { Button } from './components/ui/Button';
import { ItemForm } from './components/ItemForm';
import { SearchAndFilter } from './components/SearchAndFilter';
import { StatsDashboard } from './components/StatsDashboard';
import { ClosetView } from './components/ClosetView';
import { SignIn } from './components/SignIn';
import { LabelPrintModal } from './components/LabelPrintModal';
import { BulkBarcodePrintModal } from './components/BulkBarcodePrintModal';
import { BarcodeScanModal } from './components/BarcodeScanModal';
import { VendooImporter } from './components/VendooImporter';
import { MarketplaceImporter } from './components/MarketplaceImporter';
import { MarketplacesPage } from './pages/MarketplacesPage';
import { quickBackup } from './utils/recover-inventory';
import type { Item, ItemTag, ItemStatus } from './types/item';

type ViewMode = 'closet' | 'stats' | 'marketplaces';

function App() {
  const {
    filteredItems,
    filterOptions,
    initializeStore,
    addItem,
    updateItem,
    setFilterOptions,
    resetFilters,
    getStats,
    backfillBarcodesForExistingItems,
    countItemsNeedingBarcodes,
  } = useItemStore();

  const { isAuthenticated, user, signOut, initialize } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('closet');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemsNeedingBarcodes, setItemsNeedingBarcodes] = useState<number>(0);
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printingItem, setPrintingItem] = useState<Item | null>(null);
  const [isBulkPrintModalOpen, setIsBulkPrintModalOpen] = useState(false);
  
  // Barcode scan modal state
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  
  // Vendoo importer modal state
  const [isVendooImporterOpen, setIsVendooImporterOpen] = useState(false);
  
  // Marketplace importer modal state
  const [isMarketplaceImporterOpen, setIsMarketplaceImporterOpen] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Initialize store when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initializeStore();
      // Check how many items need barcodes
      countItemsNeedingBarcodes().then(count => {
        setItemsNeedingBarcodes(count);
      });
    }
  }, [initializeStore, isAuthenticated, countItemsNeedingBarcodes]);

  // Show sign-in screen if not authenticated
  if (!isAuthenticated) {
    return <SignIn />;
  }

  const handleAddItem = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (itemData: Omit<Item, 'id' | 'dateAdded'> | Item) => {
    if ('id' in itemData) {
      // Editing existing item
      await updateItem(itemData as Item);
    } else {
      // Adding new item
      await addItem(itemData);
    }
  };

  const handleSearchChange = (query: string) => {
    setFilterOptions({ searchQuery: query });
  };

  const handleStatusChange = (status: ItemStatus | 'All') => {
    setFilterOptions({ status });
  };

  const handleTagToggle = (tag: ItemTag) => {
    const newTags = filterOptions.tags.includes(tag)
      ? filterOptions.tags.filter((t) => t !== tag)
      : [...filterOptions.tags, tag];
    setFilterOptions({ tags: newTags });
  };

  const handleBackfillBarcodes = async () => {
    if (isBackfilling) return;
    
    const confirmed = window.confirm(
      `This will generate barcodes for ${itemsNeedingBarcodes} items. Continue?`
    );
    
    if (!confirmed) return;
    
    setIsBackfilling(true);
    try {
      const result = await backfillBarcodesForExistingItems();
      if (result.success) {
        alert(`✅ Success! Generated barcodes for ${result.itemsUpdated} items`);
        setItemsNeedingBarcodes(0);
      } else {
        alert('⚠️ Backfill completed with some errors. Check console for details.');
      }
    } catch (error) {
      alert('❌ Failed to backfill barcodes. Check console for details.');
      console.error(error);
    } finally {
      setIsBackfilling(false);
    }
  };

  const handlePrintLabel = (item: Item) => {
    setPrintingItem(item);
    setIsPrintModalOpen(true);
  };

  const handleBulkPrint = () => {
    setIsBulkPrintModalOpen(true);
  };

  const handleScanBarcode = () => {
    setIsScanModalOpen(true);
  };
  
  const handleOpenVendooImporter = () => {
    setIsVendooImporterOpen(true);
  };

  const handleMarkAsSold = async (item: Item) => {
    await updateItem({
      ...item,
      status: 'SOLD',
      dateField: new Date().toISOString(),
    });
  };

  const handleViewCard = (item: Item) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent">
                Virtual Closet
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Manage your apparel inventory with ease
              </p>
            </div>
            
            {/* User Info & Actions */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2">
                <User className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-300">{user?.display_name || user?.email}</span>
              </div>
              
              <Button
                onClick={quickBackup}
                variant="secondary"
                size="lg"
                title="Backup your inventory"
              >
                <Download className="h-5 w-5" />
                <span className="ml-2 hidden sm:inline">Backup</span>
              </Button>
              
              {itemsNeedingBarcodes > 0 && (
                <Button
                  onClick={handleBackfillBarcodes}
                  variant="secondary"
                  size="lg"
                  disabled={isBackfilling}
                  title={`Generate barcodes for ${itemsNeedingBarcodes} items`}
                  className="border-yellow-600 bg-yellow-600/20 hover:bg-yellow-600/30"
                >
                  <Barcode className="h-5 w-5 text-yellow-400" />
                  <span className="ml-2 hidden sm:inline text-yellow-400">
                    {isBackfilling ? 'Generating...' : `Fix ${itemsNeedingBarcodes} Barcodes`}
                  </span>
                </Button>
              )}

              <Button
                onClick={handleScanBarcode}
                variant="secondary"
                size="lg"
                title="Scan barcode to find item"
                className="border-green-600 bg-green-600/20 hover:bg-green-600/30"
              >
                <Barcode className="h-5 w-5 text-green-400" />
                <span className="ml-2 hidden sm:inline text-green-400">Scan</span>
              </Button>

              <Button
                onClick={handleOpenVendooImporter}
                variant="secondary"
                size="lg"
                title="Import from Vendoo"
                className="border-purple-600 bg-purple-600/20 hover:bg-purple-600/30"
              >
                <Download className="h-5 w-5 text-purple-400" />
                <span className="ml-2 hidden sm:inline text-purple-400">Vendoo</span>
              </Button>

              <Button
                onClick={() => setIsMarketplaceImporterOpen(true)}
                variant="secondary"
                size="lg"
                title="Import from eBay, Poshmark, Depop"
                className="border-blue-600 bg-blue-600/20 hover:bg-blue-600/30"
              >
                <ShoppingCart className="h-5 w-5 text-blue-400" />
                <span className="ml-2 hidden sm:inline text-blue-400">Markets</span>
              </Button>

              <Button
                onClick={handleBulkPrint}
                variant="secondary"
                size="lg"
                title="Print barcode labels for all items"
                className="border-purple-600 bg-purple-600/20 hover:bg-purple-600/30"
              >
                <Barcode className="h-5 w-5 text-purple-400" />
                <span className="ml-2 hidden sm:inline text-purple-400">Print Labels</span>
              </Button>
              
              <Button onClick={handleAddItem} size="lg">
                <Plus className="mr-2 h-5 w-5" />
                Add Item
              </Button>
              
              <Button
                onClick={signOut}
                variant="ghost"
                size="lg"
                className="border border-gray-600 hover:bg-gray-800"
              >
                <LogOut className="h-5 w-5" />
                <span className="ml-2 hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* View Mode Tabs with Slide Animation */}
        <div className="mb-6 flex gap-2 rounded-lg border border-gray-700 bg-gray-800 p-1 relative overflow-hidden">
          <button
            onClick={() => setViewMode('closet')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all duration-300 ${
              viewMode === 'closet'
                ? 'bg-purple-600 text-white scale-105 shadow-lg'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Shirt className="h-5 w-5" />
            <span className="hidden sm:inline">Closet</span>
          </button>
          <button
            onClick={() => setViewMode('marketplaces')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all duration-300 ${
              viewMode === 'marketplaces'
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white scale-105 shadow-lg'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Link2 className="h-5 w-5" />
            <span className="hidden sm:inline">Marketplaces</span>
          </button>
          <button
            onClick={() => setViewMode('stats')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all duration-300 ${
              viewMode === 'stats'
                ? 'bg-purple-600 text-white scale-105 shadow-lg'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span className="hidden sm:inline">Stats</span>
          </button>
        </div>

        {/* Stats Dashboard - Always visible at top */}
        <div className="mb-6">
          <StatsDashboard stats={stats} />
        </div>

        {/* Search and Filter - Show only in closet view */}
        {viewMode === 'closet' && (
          <div className="mb-6">
            <SearchAndFilter
              searchQuery={filterOptions.searchQuery}
              onSearchChange={handleSearchChange}
              statusFilter={filterOptions.status}
              onStatusChange={handleStatusChange}
              tagFilters={filterOptions.tags}
              onTagToggle={handleTagToggle}
              onResetFilters={resetFilters}
            />
          </div>
        )}

        {/* Content based on view mode with slide animation */}
        <div className="mb-6 relative overflow-hidden">
          <div 
            className="transition-transform duration-500 ease-in-out"
            style={{
              transform: viewMode === 'closet' ? 'translateX(0%)' : 
                        viewMode === 'marketplaces' ? 'translateX(-100%)' : 
                        'translateX(-200%)'
            }}
          >
            <div className="flex">
              {/* Closet View */}
              <div className="w-full flex-shrink-0">
                {viewMode === 'closet' && (
                  <ClosetView items={filteredItems} onItemClick={handleEditItem} onAddItem={handleAddItem} onRequestPrint={handlePrintLabel} />
                )}
              </div>

              {/* Marketplaces View */}
              <div className="w-full flex-shrink-0">
                {viewMode === 'marketplaces' && (
                  <div className="rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
                    <MarketplacesPage />
                  </div>
                )}
              </div>

              {/* Stats View */}
              <div className="w-full flex-shrink-0">
                {viewMode === 'stats' && (
                  <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
                    <h2 className="mb-4 text-2xl font-bold text-white">Detailed Statistics</h2>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-gray-300">
                  <div>
                    <p className="text-sm text-gray-400">Total Items:</p>
                    <p className="text-2xl font-bold text-white">{stats.totalItems}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Active:</p>
                    <p className="text-2xl font-bold text-green-400">{stats.activeItems}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Inactive:</p>
                    <p className="text-2xl font-bold text-yellow-400">{stats.inactiveItems}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Sold:</p>
                    <p className="text-2xl font-bold text-blue-400">{stats.soldItems}</p>
                  </div>
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                  <h3 className="mb-3 text-lg font-semibold text-white">Financial Overview</h3>
                  <div className="space-y-2 text-gray-300">
                    <div className="flex justify-between">
                      <span>Total Inventory Value (Active):</span>
                      <span className="font-semibold text-yellow-400">
                        ${stats.totalValue.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Profit (Sold Items):</span>
                      <span className="font-semibold text-green-400">
                        ${stats.totalProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Profit Per Item:</span>
                      <span className="font-semibold text-cyan-400">
                        ${stats.averageProfit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                      {stats.soldItems > 0 && (
                        <div className="border-t border-gray-700 pt-4">
                          <h3 className="mb-3 text-lg font-semibold text-white">Performance Metrics</h3>
                          <div className="space-y-2 text-gray-300">
                            <div className="flex justify-between">
                              <span>Sell-through Rate:</span>
                              <span className="font-semibold text-purple-400">
                                {((stats.soldItems / stats.totalItems) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Active Inventory:</span>
                              <span className="font-semibold text-green-400">
                                {((stats.activeItems / stats.totalItems) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Item Form Modal */}
      <ItemForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleFormSubmit}
        editItem={editingItem}
      />

      {/* Print Label Modal */}
      <LabelPrintModal
        item={printingItem}
        open={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setPrintingItem(null);
        }}
        userId={user?.id}
      />

      {/* Bulk Print Modal */}
      <BulkBarcodePrintModal
        items={filteredItems}
        open={isBulkPrintModalOpen}
        onClose={() => setIsBulkPrintModalOpen(false)}
      />

      {/* Barcode Scan Modal */}
      <BarcodeScanModal
        open={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        items={filteredItems}
        onMarkAsSold={handleMarkAsSold}
        onViewCard={handleViewCard}
      />

      {/* Vendoo Importer Modal */}
      <VendooImporter
        open={isVendooImporterOpen}
        onClose={() => setIsVendooImporterOpen(false)}
      />

      {/* Marketplace Importer Modal */}
      <MarketplaceImporter
        open={isMarketplaceImporterOpen}
        onOpenChange={setIsMarketplaceImporterOpen}
        onImportComplete={() => {
          initializeStore();
        }}
      />

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-gray-900/50 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>Virtual Closet Management System • Built with React + TypeScript + Tailwind</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
