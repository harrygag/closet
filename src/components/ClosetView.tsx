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
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shirt, GripVertical } from 'lucide-react';
import type { Item } from '../types/item';
import { ClosetHanger } from './ClosetHanger';

interface ClosetViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative"
    >
      <ClosetHanger item={item} onClick={onItemClick} isDragging={isDragging} />
      
      {/* Drag handle indicator */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
};

export const ClosetView: React.FC<ClosetViewProps> = ({ items, onItemClick }) => {
  // Sort items by position or default order
  const [sortedItems, setSortedItems] = useState(() => {
    return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });

  const [activeId, setActiveId] = useState<string | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSortedItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  // Update sorted items when items prop changes
  React.useEffect(() => {
    setSortedItems([...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  }, [items]);

  // Group items by status for visual organization
  const activeItems = sortedItems.filter((item) => item.status === 'Active');
  const inactiveItems = sortedItems.filter((item) => item.status === 'Inactive');
  const soldItems = sortedItems.filter((item) => item.status === 'SOLD');

  const renderClosetSection = (title: string, sectionItems: Item[], emptyMessage: string) => {
    if (sectionItems.length === 0) {
      return (
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-bold text-white">{title}</h3>
          <p className="text-center text-gray-500 py-4">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="mb-12">
        <h3 className="mb-6 text-xl font-bold text-white flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${
            title.includes('Active') ? 'bg-green-500' :
            title.includes('Inactive') ? 'bg-yellow-500' :
            'bg-blue-500'
          }`} />
          {title}
          <span className="text-sm text-gray-400 font-normal">({sectionItems.length} items)</span>
        </h3>

        {/* Closet Rod */}
        <div className="relative mb-8">
          {/* Rod shadow */}
          <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-black/30 to-transparent rounded-full blur-sm" />
          
          {/* Main rod */}
          <motion.div
            className="relative h-2 bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600 rounded-full shadow-xl"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {/* Rod shine effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
            
            {/* Rod end caps */}
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 bg-gray-700 rounded-full shadow-md border-2 border-gray-600" />
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 bg-gray-700 rounded-full shadow-md border-2 border-gray-600" />
          </motion.div>
        </div>

        {/* Hangers - horizontal scrollable */}
        <div className="relative">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sectionItems.map(i => i.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-6 overflow-x-auto pb-4 px-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
                {sectionItems.map((item) => (
                  <div key={item.id} className="flex-shrink-0">
                    <SortableHanger item={item} onItemClick={onItemClick} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shirt className="h-7 w-7 text-purple-400" />
            Closet View
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Drag and drop to reorganize your items
          </p>
        </div>
        
        {/* Legend */}
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
            <span className="text-gray-400">Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50" />
            <span className="text-gray-400">Inactive</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
            <span className="text-gray-400">Sold</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-700 bg-gray-900/50"
        >
          <Shirt className="h-16 w-16 text-gray-600 mb-4" />
          <p className="text-lg text-gray-400 font-semibold">No items in closet</p>
          <p className="mt-2 text-sm text-gray-500">Add items to see them hanging here</p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* Active Items Section */}
          {renderClosetSection('Active Items', activeItems, 'No active items')}
          
          {/* Inactive Items Section */}
          {renderClosetSection('Inactive Items', inactiveItems, 'No inactive items')}
          
          {/* Sold Items Section */}
          {renderClosetSection('Sold Items', soldItems, 'No sold items')}
        </div>
      )}
    </div>
  );
};
