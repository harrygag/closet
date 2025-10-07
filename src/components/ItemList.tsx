import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Item } from '../types/item';
import { ItemCard } from './ItemCard';

interface ItemListProps {
  items: Item[];
  isLoading: boolean;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}

export const ItemList: React.FC<ItemListProps> = ({ items, isLoading, onEdit, onDelete }) => {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-gray-400">Loading items...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-700">
        <p className="text-lg text-gray-400">No items found</p>
        <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or add a new item</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
};
