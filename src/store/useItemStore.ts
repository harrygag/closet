// Zustand store for item management with IndexedDB persistence
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Item, ItemStats, FilterOptions, SortOption } from '../types/item';
import {
  initDB,
  getAllItems,
  addItem as dbAddItem,
  updateItem as dbUpdateItem,
  deleteItem as dbDeleteItem,
  bulkAddItems,
} from '../utils/db';
import { INITIAL_ITEMS } from '../data/initial-items';

interface ItemState {
  items: Item[];
  filteredItems: Item[];
  isLoading: boolean;
  error: string | null;
  filterOptions: FilterOptions;
  sortOption: SortOption;
  selectedItem: Item | null;
  
  // Actions
  initializeStore: (userEmail?: string) => Promise<void>;
  loadItems: () => Promise<void>;
  addItem: (item: Omit<Item, 'id' | 'dateAdded'>) => Promise<void>;
  updateItem: (item: Item) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setFilterOptions: (options: Partial<FilterOptions>) => void;
  setSortOption: (option: SortOption) => void;
  setSelectedItem: (item: Item | null) => void;
  applyFilters: () => void;
  getStats: () => ItemStats;
  resetFilters: () => void;
}

const defaultFilterOptions: FilterOptions = {
  status: 'All',
  tags: [],
  searchQuery: '',
};

const defaultSortOption: SortOption = {
  field: 'dateAdded',
  direction: 'desc',
};

export const useItemStore = create<ItemState>()(
  immer((set, get) => ({
    items: [],
    filteredItems: [],
    isLoading: false,
    error: null,
    filterOptions: defaultFilterOptions,
    sortOption: defaultSortOption,
    selectedItem: null,

    initializeStore: async (userEmail?: string) => {
      set({ isLoading: true, error: null });
      
      try {
        // Initialize DB with user email for user-specific storage
        await initDB(userEmail);
        const existingItems = await getAllItems();
        
        // If no items exist, load initial data for this user
        if (existingItems.length === 0) {
          // Transform initial items to include id and dateAdded
          const itemsWithIds: Item[] = INITIAL_ITEMS.map((item, index) => ({
            ...item,
            id: crypto.randomUUID(),
            dateAdded: new Date(Date.now() - (INITIAL_ITEMS.length - index) * 24 * 60 * 60 * 1000).toISOString(),
          }));
          
          await bulkAddItems(itemsWithIds);
          set({ items: itemsWithIds, filteredItems: itemsWithIds });
        } else {
          set({ items: existingItems, filteredItems: existingItems });
        }
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to initialize store' });
      } finally {
        set({ isLoading: false });
      }
    },

    loadItems: async () => {
      set({ isLoading: true, error: null });
      
      try {
        const items = await getAllItems();
        set({ items, filteredItems: items });
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to load items' });
      } finally {
        set({ isLoading: false });
      }
    },

    addItem: async (itemData) => {
      set({ isLoading: true, error: null });
      
      try {
        const newItem: Item = {
          ...itemData,
          id: crypto.randomUUID(),
          dateAdded: new Date().toISOString(),
        };
        
        await dbAddItem(newItem);
        
        set((state) => {
          state.items.push(newItem);
        });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to add item' });
      } finally {
        set({ isLoading: false });
      }
    },

    updateItem: async (item) => {
      set({ isLoading: true, error: null });
      
      try {
        await dbUpdateItem(item);
        
        set((state) => {
          const index = state.items.findIndex((i) => i.id === item.id);
          if (index !== -1) {
            state.items[index] = item;
          }
        });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update item' });
      } finally {
        set({ isLoading: false });
      }
    },

    deleteItem: async (id) => {
      set({ isLoading: true, error: null });
      
      try {
        await dbDeleteItem(id);
        
        set((state) => {
          state.items = state.items.filter((item) => item.id !== id);
        });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to delete item' });
      } finally {
        set({ isLoading: false });
      }
    },

    setFilterOptions: (options) => {
      set((state) => {
        state.filterOptions = { ...state.filterOptions, ...options };
      });
      get().applyFilters();
    },

    setSortOption: (option) => {
      set({ sortOption: option });
      get().applyFilters();
    },

    setSelectedItem: (item) => {
      set({ selectedItem: item });
    },

    applyFilters: () => {
      const { items, filterOptions, sortOption } = get();
      let filtered = [...items];

      // Apply status filter
      if (filterOptions.status !== 'All') {
        filtered = filtered.filter((item) => item.status === filterOptions.status);
      }

      // Apply tag filter
      if (filterOptions.tags.length > 0) {
        filtered = filtered.filter((item) =>
          filterOptions.tags.some((tag) => item.tags.includes(tag))
        );
      }

      // Apply search filter
      if (filterOptions.searchQuery) {
        const query = filterOptions.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.size.toLowerCase().includes(query) ||
            item.notes.toLowerCase().includes(query)
        );
      }

      // Apply sorting
      filtered.sort((a, b) => {
        const aValue = a[sortOption.field];
        const bValue = b[sortOption.field];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOption.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortOption.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return 0;
      });

      set({ filteredItems: filtered });
    },

    getStats: () => {
      const { items } = get();
      
      const totalItems = items.length;
      const activeItems = items.filter((item) => item.status === 'Active').length;
      const inactiveItems = items.filter((item) => item.status === 'Inactive').length;
      const soldItems = items.filter((item) => item.status === 'SOLD').length;
      
      const totalValue = items
        .filter((item) => item.status === 'Active')
        .reduce((sum, item) => sum + item.sellingPrice, 0);
      
      const totalProfit = items
        .filter((item) => item.status === 'SOLD')
        .reduce((sum, item) => sum + item.netProfit, 0);
      
      const averageProfit = soldItems > 0 ? totalProfit / soldItems : 0;

      return {
        totalItems,
        activeItems,
        inactiveItems,
        soldItems,
        totalValue,
        totalProfit,
        averageProfit,
      };
    },

    resetFilters: () => {
      set({
        filterOptions: defaultFilterOptions,
        sortOption: defaultSortOption,
      });
      get().applyFilters();
    },
  }))
);
