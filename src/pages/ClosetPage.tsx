import { useEffect, useState } from 'react';
import { ClosetView } from '../components/ClosetView';
import { useItemStore } from '../store/useItemStore';
import type { Item } from '../types/item';

export const ClosetPage = () => {
  const { items, initializeStore, setSelectedItem } = useItemStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      initializeStore().then(() => {
        setIsInitialized(true);
      });
    }
  }, [isInitialized, initializeStore]);

  const handleItemClick = (item: Item) => {
    setSelectedItem(item);
    // You can add modal or detail view logic here
  };

  const handleImageUpload = (itemId: string, imageUrl: string) => {
    // Handle image upload logic
    console.log('Image upload:', itemId, imageUrl);
  };

  const handleUpdate = (item: Item) => {
    // Handle item update logic
    console.log('Update item:', item);
  };

  const handleAddItem = () => {
    // Handle add item logic
    console.log('Add new item');
  };

  const handleRequestPrint = (item: Item) => {
    // Handle print label logic
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

