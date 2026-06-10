import { useEffect } from 'react';
import { ClosetView } from '../components/ClosetView';
import { useItemStore } from '../store/useItemStore';
import { useAuthStore } from '../store/useAuthStore';
import type { Item } from '../types/item';

export const ClosetPage = () => {
  const { items, initializeStore, isLoading, isInitializing, error } = useItemStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && !isInitializing) {
      initializeStore(user.id);
    }
  }, [user?.id]);

  // Only show the full-screen loader on the INITIAL load (no items yet). A
  // background refresh (loadItems after a quantity check, etc.) sets isLoading
  // too — but blanking the whole page then would unmount in-progress UI like the
  // Check-Quantity panel. Keep the view mounted once we have items.
  if (!user || ((isLoading || isInitializing) && items.length === 0)) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
        <span className="font-arcade text-retro-cyan text-sm tracking-widest">
          LOADING...
        </span>
        <span className="text-gray-500 text-xs">
          user: {user?.id ?? 'none'} | loading: {String(isLoading)} | init: {String(isInitializing)}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4 p-8">
        <span className="text-red-400 text-sm font-bold">FIRESTORE ERROR</span>
        <span className="text-red-300 text-xs text-center max-w-xl break-all">{error}</span>
        <button
          onClick={() => initializeStore(user.id)}
          className="px-4 py-2 bg-red-700 text-white text-xs rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleItemClick = (item: Item) => {
    useItemStore.getState().setSelectedItem(item);
  };

  const handleImageUpload = (itemId: string, imageUrl: string) => {
    console.log('Image upload:', itemId, imageUrl);
  };

  const handleUpdate = (item: Item) => {
    console.log('Update item:', item);
  };

  const handleAddItem = () => {
    console.log('Add new item');
  };

  const handleRequestPrint = (item: Item) => {
    console.log('Print label:', item);
  };

  return (
    <ClosetView
      items={items}
      onItemClick={handleItemClick}
      onImageUpload={handleImageUpload}
      onUpdate={handleUpdate}
      onAddItem={handleAddItem}
      onRequestPrint={handleRequestPrint}
    />
  );
};
