import { useEffect, useState } from 'react';
import { Plus, List, Shirt, BarChart3, LogOut, User } from 'lucide-react';
import { useItemStore } from './store/useItemStore';
import { useAuthStore } from './store/useAuthStore';
import { Button } from './components/ui/Button';
import { ItemList } from './components/ItemList';
import { ItemForm } from './components/ItemForm';
import { SearchAndFilter } from './components/SearchAndFilter';
import { StatsDashboard } from './components/StatsDashboard';
import { ClosetView } from './components/ClosetView';
import { SignIn } from './components/SignIn';
import type { Item, ItemTag, ItemStatus } from './types/item';

type ViewMode = 'list' | 'closet' | 'stats';

function App() {
  const {
    filteredItems,
    isLoading,
    filterOptions,
    initializeStore,
    addItem,
    updateItem,
    deleteItem,
    setFilterOptions,
    resetFilters,
    getStats,
  } = useItemStore();

  const { isAuthenticated, user, signOut } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.email) {
      initializeStore(user.email);
    }
  }, [initializeStore, isAuthenticated, user?.email]);

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

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
  };

  const handleImageUpload = async (itemId: string, imageUrl: string) => {
    const item = filteredItems.find(i => i.id === itemId);
    if (item) {
      await updateItem({
        ...item,
        imageUrl,
      });
    }
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
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2">
                <User className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-300">{user?.name}</span>
              </div>
              
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
        {/* View Mode Tabs */}
        <div className="mb-6 flex gap-2 rounded-lg border border-gray-700 bg-gray-800 p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <List className="h-5 w-5" />
            List View
          </button>
          <button
            onClick={() => setViewMode('closet')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              viewMode === 'closet'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Shirt className="h-5 w-5" />
            Closet View
          </button>
          <button
            onClick={() => setViewMode('stats')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              viewMode === 'stats'
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            Statistics
          </button>
        </div>

        {/* Stats Dashboard - Always visible at top */}
        <div className="mb-6">
          <StatsDashboard stats={stats} />
        </div>

        {/* Search and Filter - Show only in list and closet views */}
        {(viewMode === 'list' || viewMode === 'closet') && (
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

        {/* Content based on view mode */}
        <div className="mb-6">
          {viewMode === 'list' && (
            <ItemList
              items={filteredItems}
              isLoading={isLoading}
              onEdit={handleEditItem}
              onDelete={handleDeleteItem}
            />
          )}

          {viewMode === 'closet' && (
            <ClosetView
              items={filteredItems}
              onItemClick={handleEditItem}
              onImageUpload={handleImageUpload}
              onUpdate={updateItem}
              onAddItem={handleAddItem}
            />
          )}

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
      </main>

      {/* Item Form Modal */}
      <ItemForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleFormSubmit}
        editItem={editingItem}
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
