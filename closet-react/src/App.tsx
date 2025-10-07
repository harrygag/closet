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

  const [showStats, setShowStats] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Compact Header */}
      <header className="sticky top-0 z-50 border-b border-gray-700 bg-gray-900/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Title */}
            <h1 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">
              Virtual Closet
            </h1>
            
            {/* View Mode Tabs - Compact */}
            <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('closet')}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'closet'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                title="Closet View"
              >
                <Shirt className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowStats(!showStats)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  showStats
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                title="Statistics"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button onClick={handleAddItem} size="sm">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add</span>
              </Button>
              
              <Button
                onClick={signOut}
                variant="ghost"
                size="sm"
                title={user?.name}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4">
        {/* Collapsible Stats */}
        {showStats && (
          <div className="mb-4">
            <StatsDashboard stats={stats} />
          </div>
        )}

        {/* Compact Search - Show only in list and closet views */}
        {(viewMode === 'list' || viewMode === 'closet') && (
          <div className="mb-4">
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

        {/* Content */}
        {!showStats && viewMode === 'list' && (
            <ItemList
              items={filteredItems}
              isLoading={isLoading}
              onEdit={handleEditItem}
              onDelete={handleDeleteItem}
              onImageUpload={handleImageUpload}
            />
          )}

        {!showStats && viewMode === 'closet' && (
            <ClosetView
              items={filteredItems}
              onItemClick={handleEditItem}
              onImageUpload={handleImageUpload}
              onUpdate={updateItem}
              onAddItem={handleAddItem}
            />
          )}

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
