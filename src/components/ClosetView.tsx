import React, { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonCard } from './SkeletonCard';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  useDroppable,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
  DroppableContainer,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Camera, Wrench } from 'lucide-react';
import type { Item, ItemTag } from '../types/item';
import { ClosetHanger } from './ClosetHanger';
import { Button } from './ui/Button';
import { useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase/client';
import { toast } from 'sonner';

interface ClosetViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  onAddItem?: () => void;
  onRequestPrint?: (item: Item) => void;
}

interface SortableHangerProps {
  item: Item;
  onItemClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  onPrintLabel?: (item: Item) => void;
  position?: number;
}

const SortableHanger: React.FC<SortableHangerProps> = memo(({ item, onItemClick, onImageUpload, onUpdate, onPrintLabel, position }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none', // Required for pointer events to work properly
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragging ? 'ring-4 ring-yellow-400 rounded-xl scale-105' : ''}
    >
      <ClosetHanger
        item={item}
        onClick={onItemClick}
        onImageUpload={onImageUpload}
        onUpdate={onUpdate}
        onPrintLabel={onPrintLabel}
        isDragging={isDragging}
        position={position}
      />
    </div>
  );
});

SortableHanger.displayName = 'SortableHanger';

// Droppable gym zone component
interface DroppableGymProps {
  id: string;
  category: ItemTag;
  children: React.ReactNode;
  isOver?: boolean;
}

const DroppableGym: React.FC<DroppableGymProps> = ({ id, category, children }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    data: { category },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-200 ${
        isOver ? 'ring-4 ring-yellow-400 ring-opacity-50 bg-yellow-900/20' : ''
      }`}
    >
      {children}
    </div>
  );
};

// Define the 6 racks by category
const RACKS: { number: number; category: ItemTag; label: string; energyType: string }[] = [
  { number: 1, category: 'Hoodie', label: 'Hoodies', energyType: 'Psychic' },
  { number: 2, category: 'Jersey', label: 'Jerseys', energyType: 'Grass' },
  { number: 3, category: 'Polo', label: 'Polos', energyType: 'Steel' },
  { number: 4, category: 'Pullover/Jackets', label: 'Pullovers & Jackets', energyType: 'Fire' },
  { number: 5, category: 'T-shirts', label: 'T-Shirts', energyType: 'Water' },
  { number: 6, category: 'Bottoms', label: 'Bottoms', energyType: 'Fighting' },
];

export const ClosetView: React.FC<ClosetViewProps> = ({ items, onItemClick, onImageUpload, onUpdate, onAddItem, onRequestPrint }) => {
  const [isLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [sortedItems, setSortedItems] = useState(() => {
    return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const navigate = useNavigate();

  // Fix data function - removes duplicates, fixes tags, adds barcodes
  const handleFixData = async () => {
    setIsFixing(true);
    try {
      const functions = getFunctions(app);
      const fixItemDataFn = httpsCallable(functions, 'fixItemData');
      const result = await fixItemDataFn();
      const data = result.data as any;

      toast.success(`Fixed! Removed ${data.duplicatesRemoved} duplicates, updated ${data.itemsFixed} items. ${data.remainingItems} items remaining.`);

      // Refresh the page to show updated data
      window.location.reload();
    } catch (error: any) {
      console.error('Fix data error:', error);
      toast.error(`Fix failed: ${error.message}`);
    } finally {
      setIsFixing(false);
    }
  };

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

  // Custom collision detection - sortable items for reordering, gym zones for cross-gym drops
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // First try pointer detection for sortable items (for reordering)
    const pointerCollisions = pointerWithin(args);

    // If we're directly over a sortable item, use that for reordering
    const sortableCollision = pointerCollisions.find(
      c => !c.id.toString().startsWith('gym-')
    );
    if (sortableCollision) {
      return [sortableCollision];
    }

    // Otherwise check gym droppable zones for cross-gym drops
    const gymCollisions = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container: DroppableContainer) => container.id.toString().startsWith('gym-')
      ),
    });

    return gymCollisions.length > 0 ? gymCollisions : pointerCollisions;
  }, []);

  // Handle drag start - track the active item
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const item = sortedItems.find(i => i.id === active.id);
    console.log('🚀 DRAG START:', active.id, item?.name, 'tags:', item?.tags);
    if (item) {
      setActiveItem(item);
    }
  }, [sortedItems]);

  // Handle drag end - detect cross-gym drops and update category
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    console.log('🏁 DRAG END - active:', active.id, 'over:', over?.id);
    setActiveItem(null);

    if (!over) {
      console.log('❌ No drop target');
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a gym zone (gym-1, gym-2, etc.)
    if (overId.startsWith('gym-')) {
      console.log('🏟️ Dropped on gym zone:', overId);
      const targetRackNumber = parseInt(overId.replace('gym-', ''));
      const targetRack = RACKS.find(r => r.number === targetRackNumber);

      if (targetRack) {
        const draggedItem = sortedItems.find(i => i.id === activeId);
        console.log('📦 Dragged item:', draggedItem?.name, 'current tags:', draggedItem?.tags);
        console.log('🎯 Target rack:', targetRack.category);

        if (draggedItem && !draggedItem.tags.includes(targetRack.category)) {
          console.log('✅ Moving item to new gym!');
          // Item dropped in a different gym - update its category!
          const updatedItem: Item = {
            ...draggedItem,
            tags: [targetRack.category], // Change to new category
          };

          // Update local state immediately for smooth UX
          setSortedItems(items =>
            items.map(item => item.id === activeId ? updatedItem : item)
          );

          // Persist to database
          if (onUpdate) {
            onUpdate(updatedItem);
            toast.success(`Moved "${draggedItem.name}" to ${targetRack.label}!`);
            console.log(`🎯 Moved item to ${targetRack.category}: ${draggedItem.name}`);
          }
        } else {
          console.log('⚠️ Item already in this gym or not found');
        }
      }
      return;
    }

    console.log('🔄 Within-gym reordering, overId:', overId);

    // Handle within-gym reordering
    if (active.id !== over.id) {
      setSortedItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return items;

        // Get the items being swapped
        const draggedItem = items[oldIndex];
        const targetItem = items[newIndex];

        // Swap hanger IDs if both items have them and persist to database
        if (draggedItem.hangerId && targetItem.hangerId && onUpdate) {
          const tempHangerId = draggedItem.hangerId;
          const updatedDraggedItem = { ...draggedItem, hangerId: targetItem.hangerId };
          const updatedTargetItem = { ...targetItem, hangerId: tempHangerId };

          // Persist both items to database
          Promise.all([
            onUpdate(updatedDraggedItem),
            onUpdate(updatedTargetItem)
          ]).catch(error => {
            console.error('❌ Failed to save drag-and-drop hanger swap:', error);
          });

          console.log(`🔄 Swapped hangers: ${draggedItem.name} (${tempHangerId} → ${targetItem.hangerId}) ↔ ${targetItem.name} (${targetItem.hangerId} → ${tempHangerId})`);
        }

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, [sortedItems, onUpdate]);

  // Update sorted items when items prop changes
  React.useEffect(() => {
    setSortedItems([...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  }, [items]);

  // Wrap onUpdate to also update local state immediately (for category switcher)
  const handleItemUpdate = useCallback((updatedItem: Item) => {
    // Update local state immediately for smooth UX
    setSortedItems(currentItems =>
      currentItems.map(item => item.id === updatedItem.id ? updatedItem : item)
    );

    // Persist to database via parent callback
    if (onUpdate) {
      onUpdate(updatedItem);
    }
  }, [onUpdate]);

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
    // Get items for this category and sort by priority: Active -> Yellow warnings -> Red warnings
    const rackItems = sortedItems
      .filter((item) => item.tags.includes(rack.category))
      .sort((a, b) => {
        // Helper function to get priority
        const getPriority = (item: Item) => {
          const hasMarketplaceUrl = !!(item.ebayUrl || (item.marketplaceUrls && item.marketplaceUrls.some(m => m.url)));
          const hasPrice = item.sellingPrice && item.sellingPrice > 0;
          const hasPhotos = item.imageUrl && item.imageUrl.length > 0;

          // RED WARNINGS (Priority 3) - Blocking issues
          if (!hasPrice || !hasMarketplaceUrl) return 3;

          // YELLOW WARNINGS (Priority 2) - Non-blocking issues
          const daysListed = item.dateAdded ? Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 60 * 60 * 24)) : 0;
          if ((item.status === 'Active' && daysListed > 30) || !hasPhotos) return 2;

          // ACTIVE LISTINGS (Priority 1) - Good to go
          return 1;
        };

        return getPriority(a) - getPriority(b);
      });

    return (
      <DroppableGym key={rack.number} id={`gym-${rack.number}`} category={rack.category}>
        <div className="mb-8 sm:mb-12 bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-2xl">
          {/* Gym Header with Add Button - Black Theme */}
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-700 text-white font-bold text-xl sm:text-2xl shadow-lg border-2 border-gray-600">
                {rack.number}
              </div>
              <div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white">{rack.energyType} ({rack.label})</h3>
                <p className="text-sm sm:text-base text-gray-400 font-medium">{rackItems.length} Pokemon cards</p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => handleAddHanger(rack.number, rack.category)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start min-h-[44px] bg-gray-700 hover:bg-gray-600 text-white font-bold shadow-lg rounded-lg border border-gray-600"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm sm:text-base">Catch Pokemon</span>
            </Button>
          </div>

          {/* Items on the rack - Black Theme */}
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                className="grid grid-rows-3 grid-flow-col gap-3 auto-cols-max min-w-max"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-full"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <SkeletonCard />
                  </motion.div>
                ))}
              </motion.div>
            ) : rackItems.length === 0 ? (
              <motion.div
                className="flex items-center justify-center h-24 sm:h-32 border-2 border-dashed border-gray-600 rounded-lg p-4 bg-yellow-900/20"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <p className="text-gray-400 text-xs sm:text-sm text-center font-medium">Drop Pokemon here or tap "Catch Pokemon" to add one</p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <SortableContext items={rackItems.map(i => i.id)} strategy={horizontalListSortingStrategy}>
                  <div className="relative overflow-x-auto overflow-y-hidden pb-4">
                    <motion.div
                      className="grid grid-rows-3 grid-flow-col gap-3 auto-cols-max min-w-max px-4"
                      layout
                    >
                      {rackItems.map((item, index) => (
                        <motion.div
                          key={item.id}
                          className="w-full"
                          initial={{ opacity: 0, y: 20, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -20, scale: 0.9 }}
                          transition={{
                            delay: index * 0.05,
                            type: "spring",
                            stiffness: 300,
                            damping: 20
                          }}
                          layout
                        >
                          <SortableHanger
                            item={item}
                            onItemClick={onItemClick}
                            onImageUpload={onImageUpload}
                            onUpdate={handleItemUpdate}
                            onPrintLabel={onRequestPrint}
                            position={index + 1}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                </SortableContext>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DroppableGym>
    );
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 sm:p-6 shadow-2xl">
      {/* Pokemon Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 rounded-full flex items-center justify-center shadow-lg border border-gray-600">
              <span className="text-2xl">⚡</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Pokemon Collection
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleFixData}
              disabled={isFixing}
              size="sm"
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white min-h-[44px]"
            >
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">{isFixing ? 'Fixing...' : 'Fix Data'}</span>
            </Button>
            <Button
              onClick={() => navigate('/scan')}
              size="sm"
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white min-h-[44px]"
            >
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Scan</span>
            </Button>
          </div>
        </div>
        <p className="text-sm sm:text-base text-gray-400 font-medium">
          {items.length} Pokemon cards across {RACKS.filter(rack => sortedItems.some(item => item.tags.includes(rack.category))).length} gyms
        </p>
      </div>

      {/* Card counter and scroll indicator */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Swipe to view more cards →
        </div>
        <div className="text-sm text-gray-500">
          {items.length} total cards
        </div>
      </div>

      {/* Empty state - Black Theme */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-48 sm:h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/50 p-4"
        >
          <div className="text-6xl sm:text-8xl mb-4">🎒</div>
          <p className="text-lg sm:text-xl text-white text-center font-bold">Your Pokemon collection is empty!</p>
          <p className="mt-2 text-sm sm:text-base text-gray-400 text-center">Start your journey by adding Pokemon cards</p>
        </motion.div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-4 sm:space-y-8">
            {/* Quick gym navigation */}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2 snap-x">
              {RACKS.map(rack => (
                <button
                  key={rack.number}
                  type="button"
                  onClick={() => {
                    const element = document.querySelector(`[id="gym-${rack.number}"]`);
                    element?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }}
                  className="flex-shrink-0 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white text-sm font-medium border border-gray-600 snap-center"
                >
                  {rack.label}
                </button>
              ))}
            </div>

            {RACKS.map(rack => renderRack(rack))}
          </div>

          {/* Drag overlay - shows the item being dragged */}
          <DragOverlay>
            {activeItem ? (
              <div className="opacity-80 transform scale-105">
                <ClosetHanger
                  item={activeItem}
                  onClick={() => {}}
                  isDragging={true}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};
