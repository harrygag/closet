import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BarChart3, LogOut } from 'lucide-react';
import { useItemStore } from './store/useItemStore';
import { useAuthStore } from './store/useAuthStore';
import { Button } from './components/ui/Button';
import { ItemList } from './components/ItemList';
import { ItemForm } from './components/ItemForm';
import { SearchAndFilter } from './components/SearchAndFilter';
import { StatsDashboard } from './components/StatsDashboard';
import { ClosetView } from './components/ClosetView';
import { SignIn } from './components/SignIn';
import { Toaster } from './components/ui/Toaster';
import { Drawer } from './components/ui/Drawer';
// import { ErrorBoundary } from './components/ErrorBoundary';
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

  const [viewMode, setViewMode] = useState<ViewMode>('closet');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user?.email) {
      initializeStore(user.email);
    }
  }, [isAuthenticated, user?.email]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      {/* Mobile-Optimized Header */}
      <header className="sticky top-0 z-50 border-b border-gray-700 bg-gray-900/95 backdrop-blur-sm">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Title */}
            <h1 className="bg-gradient-to-r from-gray-300 via-white to-gray-400 bg-clip-text text-lg sm:text-xl md:text-2xl font-bold text-transparent flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              Pokemon Closet Trainer
              <span className="text-2xl">⚡</span>
            </h1>
            
            {/* View Mode Tabs - Mobile Optimized */}
            <div className="flex gap-0.5 sm:gap-1 rounded-lg bg-gray-800 p-0.5 sm:p-1">
              <button
                onClick={() => {
                  setShowStats(!showStats);
                  if (!showStats) {
                    setViewMode('stats');
                  } else {
                    setViewMode('closet');
                  }
                }}
                className={`rounded px-2 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  showStats
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                title="Statistics"
              >
                <BarChart3 className="h-4 w-4 sm:h-4 sm:w-4" />
              </button>
            </div>
            
            {/* Actions - Mobile Optimized */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Button 
                onClick={handleAddItem} 
                size="sm"
                className="min-h-[44px] px-2 sm:px-3"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline text-sm">Add</span>
              </Button>
              
              <Button
                onClick={signOut}
                variant="ghost"
                size="sm"
                title={user?.name}
                className="min-h-[44px] min-w-[44px] p-2"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Mobile Optimized */}
      <main className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
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
        <AnimatePresence mode="wait">
          {!showStats && viewMode === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ItemList
                items={filteredItems}
                isLoading={isLoading}
                onEdit={handleEditItem}
                onDelete={handleDeleteItem}
                onImageUpload={handleImageUpload}
              />
            </motion.div>
          )}

          {!showStats && viewMode === 'closet' && (
            <motion.div
              key="closet"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <ClosetView
                items={filteredItems}
                onItemClick={handleEditItem}
                onImageUpload={handleImageUpload}
                onUpdate={updateItem}
                onAddItem={handleAddItem}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Item Form - Mobile Drawer / Desktop Modal */}
      {isMobile ? (
        <Drawer
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title={editingItem ? 'Edit Pokemon' : 'Catch New Pokemon'}
        >
          <ItemForm
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleFormSubmit}
            editItem={editingItem}
          />
        </Drawer>
      ) : (
        <ItemForm
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSubmit={handleFormSubmit}
          editItem={editingItem}
        />
      )}

      {/* Toast Notifications */}
      <Toaster />

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
