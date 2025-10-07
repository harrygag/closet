import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shirt, Plus } from 'lucide-react';
import type { Item, ItemTag } from '../types/item';
import { ClosetHanger } from './ClosetHanger';
import { Button } from './ui/Button';

interface ClosetViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
  onAddItem?: () => void;
}

interface SortableHangerProps {
  item: Item;
  onItemClick: (item: Item) => void;
}

const SortableHanger: React.FC<SortableHangerProps> = ({ item, onItemClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ClosetHanger item={item} onClick={onItemClick} isDragging={isDragging} />
    </div>
  );
};

// Define the 6 racks by category
const RACKS: { number: number; category: ItemTag; label: string }[] = [
  { number: 1, category: 'Hoodie', label: 'Hoodies' },
  { number: 2, category: 'Jersey', label: 'Jerseys' },
  { number: 3, category: 'polo', label: 'Polos' },
  { number: 4, category: 'Pullover/Jackets', label: 'Pullovers & Jackets' },
  { number: 5, category: 'T-shirts', label: 'T-Shirts' },
  { number: 6, category: 'Bottoms', label: 'Bottoms' },
];

export const ClosetView: React.FC<ClosetViewProps> = ({ items, onItemClick, onAddItem }) => {
  const [sortedItems, setSortedItems] = useState(() => {
    return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSortedItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        // Get the items being swapped
        const draggedItem = items[oldIndex];
        const targetItem = items[newIndex];
        
        // Swap hanger IDs if both items have them
        if (draggedItem.hangerId && targetItem.hangerId) {
          const tempHangerId = draggedItem.hangerId;
          draggedItem.hangerId = targetItem.hangerId;
          targetItem.hangerId = tempHangerId;
          
          // Update items in the store (we'll need to call onItemClick or add an update callback)
          // For now, just swap positions in the array
        }
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Update sorted items when items prop changes
  React.useEffect(() => {
    setSortedItems([...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  }, [items]);

  const getNextHangerNumber = (rackNumber: number) => {
    // Get all items for this rack
    const rackItems = sortedItems.filter((item) =>
      item.tags.includes(RACKS[rackNumber - 1].category)
    );
    
    // Find the highest hanger number for this rack
    let maxNumber = 0;
    rackItems.forEach(item => {
      if (item.hangerId) {
        // Extract number from hanger IDs like "H1", "L32", etc.
        const match = item.hangerId.match(/\d+$/);
        if (match) {
          const num = parseInt(match[0]);
          if (num > maxNumber) maxNumber = num;
        }
      }
    });
    
    return maxNumber + 1;
  };

  const handleAddHanger = (rackNumber: number, category: ItemTag) => {
    const nextNumber = getNextHangerNumber(rackNumber);
    const hangerPrefix = rackNumber === 1 ? 'H' : 'L'; // H for hoodies, L for others
    const newHangerId = `${hangerPrefix}${nextNumber}`;
    
    // This would open the add item form with pre-filled category and hanger ID
    // For now, we'll just alert - you'll need to connect this to your onAddItem handler
    if (onAddItem) {
      // Store the category and hanger ID for the form to use
      sessionStorage.setItem('newItemCategory', category);
      sessionStorage.setItem('newItemHangerId', newHangerId);
      onAddItem();
    }
  };

  const renderRack = (rack: typeof RACKS[0]) => {
    // Get items for this category
    const rackItems = sortedItems.filter((item) => item.tags.includes(rack.category));

    return (
      <div key={rack.number} className="mb-10">
        {/* Rack Header with Add Button */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-600 text-white font-bold text-lg">
              {rack.number}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{rack.label}</h3>
              <p className="text-sm text-gray-400">{rackItems.length} items</p>
            </div>
          </div>
          
          <Button
            size="sm"
            onClick={() => handleAddHanger(rack.number, rack.category)}
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Hanger
          </Button>
        </div>

        {/* Simple closet rod */}
        <div className="h-1 bg-gradient-to-r from-gray-700 via-gray-500 to-gray-700 rounded-full mb-6 shadow-md" />

        {/* Items on the rack - Grid view to see all items */}
        {rackItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-700 rounded-lg">
            <p className="text-gray-500 text-sm">No items yet - click "Add Hanger" to add one</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rackItems.map(i => i.id)} strategy={horizontalListSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {rackItems.map((item) => (
                  <div key={item.id}>
                    <SortableHanger item={item} onItemClick={onItemClick} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shirt className="h-7 w-7 text-purple-400" />
          Your Closet
        </h2>
        <p className="mt-2 text-gray-400">
          {items.length} items across {RACKS.filter(rack => sortedItems.some(item => item.tags.includes(rack.category))).length} racks
        </p>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-700 bg-gray-900/50"
        >
          <Shirt className="h-16 w-16 text-gray-600 mb-4" />
          <p className="text-lg text-gray-400">Your closet is empty</p>
          <p className="mt-2 text-sm text-gray-500">Add items to organize them by category</p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {RACKS.map(rack => renderRack(rack))}
        </div>
      )}
    </div>
  );
};
