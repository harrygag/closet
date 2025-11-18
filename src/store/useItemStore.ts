// Zustand store for item management with Supabase backend
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Item, ItemStats, FilterOptions, SortOption } from '../types/item';
import { supabase } from '../lib/supabase/client';
import { INITIAL_ITEMS } from '../data/initial-items';
import { generateBarcode } from '../services/barcodes';
import { backfillBarcodes, countItemsNeedingBarcodes } from '../services/backfillBarcodes';

interface ItemState {
  items: Item[];
  filteredItems: Item[];
  isLoading: boolean;
  error: string | null;
  filterOptions: FilterOptions;
  sortOption: SortOption;
  selectedItem: Item | null;
  
  // Actions
  initializeStore: (userId?: string) => Promise<void>;
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
  backfillBarcodesForExistingItems: () => Promise<{ success: boolean; itemsUpdated: number }>;
  countItemsNeedingBarcodes: () => Promise<number>;
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

// Helper to transform database row (Item) to Item
const transformDbItem = (dbItem: any): Item => ({
  id: dbItem.id,
  name: dbItem.title || '',
  size: dbItem.size || '',
  status: dbItem.status === 'SOLD' ? 'SOLD' : dbItem.status === 'IN_STOCK' ? 'Active' : 'Inactive',
  hangerStatus: '',
  hangerId: '',
  tags: (dbItem.normalizedTags || []).slice(0, 5),
  ebayUrl: dbItem.imageUrls?.[0] || '',
  imageUrl: dbItem.imageUrls?.[0] || undefined,
  costPrice: dbItem.purchasePriceCents ? dbItem.purchasePriceCents / 100 : 0,
  sellingPrice: dbItem.manualPriceCents ? dbItem.manualPriceCents / 100 : 0,
  ebayFees: 0,
  netProfit: dbItem.soldPriceCents && dbItem.purchasePriceCents 
    ? (dbItem.soldPriceCents - dbItem.purchasePriceCents) / 100 
    : 0,
  dateField: dbItem.soldDate || dbItem.purchaseDate || dbItem.createdAt,
  notes: dbItem.notes || dbItem.conditionNotes || '',
  dateAdded: dbItem.createdAt,
  barcode: dbItem.barcode || undefined, // Include barcode from database
});

// Helper to transform Item to database format (Item schema)
const transformItemToDb = (item: Partial<Item>, userId: string) => ({
  user_uuid: userId,
  title: item.name,
  size: item.size,
  status: item.status === 'Active' ? 'IN_STOCK' : 
          item.status === 'SOLD' ? 'SOLD' : 'IN_STOCK',
  normalizedTags: item.tags || [],
  imageUrls: item.imageUrl ? [item.imageUrl] : item.ebayUrl ? [item.ebayUrl] : [],
  manualPriceCents: item.sellingPrice ? Math.round(item.sellingPrice * 100) : null,
  purchasePriceCents: item.costPrice ? Math.round(item.costPrice * 100) : null,
  soldPriceCents: item.status === 'SOLD' && item.sellingPrice 
    ? Math.round(item.sellingPrice * 100) 
    : null,
  soldDate: item.status === 'SOLD' ? item.dateField || new Date().toISOString() : null,
  purchaseDate: item.dateField || new Date().toISOString(),
  notes: `Hanger: ${item.hangerId || item.hangerStatus || 'None'}. ${item.notes || ''}`.trim(),
  conditionNotes: item.notes,
  brand: 'Unknown',
  category: 'Clothing',
  barcode: item.barcode || null, // Include barcode
});

export const useItemStore = create<ItemState>()(
  immer((set, get) => ({
    items: [],
    filteredItems: [],
    isLoading: false,
    error: null,
    filterOptions: defaultFilterOptions,
    sortOption: defaultSortOption,
    selectedItem: null,

    initializeStore: async () => {
      set({ isLoading: true, error: null });
      
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        console.log('🔐 Current user:', user?.id, user?.email);
        if (!user) {
          throw new Error('User not authenticated');
        }

        // Load items from Supabase
        console.log('📊 Fetching items for user:', user.id);
        console.log('📊 Query: SELECT * FROM Item WHERE user_uuid =', user.id);
        
        const { data: dbItems, error: fetchError } = await (supabase as any)
          .from('Item')
          .select('*')
          .eq('user_uuid', user.id)
          .order('createdAt', { ascending: false });

        console.log('📦 Fetched items:', dbItems?.length, 'Error:', fetchError);
        console.log('📦 First item:', dbItems?.[0]);
        
        if (fetchError) {
          console.error('❌ Fetch error details:', JSON.stringify(fetchError, null, 2));
          throw fetchError;
        }

        // If no items exist, load initial data for this user
        if (!dbItems || dbItems.length === 0) {
          // Transform and insert initial items
          const itemsToInsert = INITIAL_ITEMS.map((item) => 
            transformItemToDb({
              ...item,
              id: undefined, // Let database generate ID
              dateAdded: new Date(Date.now() - (INITIAL_ITEMS.length - INITIAL_ITEMS.indexOf(item)) * 24 * 60 * 60 * 1000).toISOString(),
            }, user.id)
          );

          const { data: insertedItems, error: insertError } = await (supabase as any)
            .from('Item')
            .insert(itemsToInsert as any)
            .select();

          if (insertError) throw insertError;

          const items = (insertedItems || []).map(transformDbItem);
          set({ items, filteredItems: items });
        } else {
          const items = dbItems.map(transformDbItem);
          set({ items, filteredItems: items });
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { data: dbItems, error: fetchError } = await (supabase as any)
          .from('Item')
          .select('*')
          .eq('user_uuid', user.id)
          .order('createdAt', { ascending: false });

        if (fetchError) throw fetchError;

        const items = (dbItems || []).map(transformDbItem);
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Generate barcode automatically
        console.log('🏷️ Generating barcode for new item...');
        const barcode = await generateBarcode(user.id, supabase);
        console.log('✅ Generated barcode:', barcode);

        // Add barcode to item data
        const itemWithBarcode = {
          ...itemData,
          barcode: barcode,
        };

        const dbItem = transformItemToDb(itemWithBarcode, user.id);
        
        const { data: insertedItem, error: insertError } = await (supabase as any)
          .from('Item')
          .insert([dbItem] as any)
          .select()
          .single();

        if (insertError) {
          console.error('❌ Failed to insert item:', insertError);
          throw insertError;
        }

        const newItem = transformDbItem(insertedItem);
        console.log('✅ Item created with barcode:', newItem.barcode);
        
        set((state) => {
          state.items.push(newItem);
        });
        
        get().applyFilters();
      } catch (error) {
        console.error('❌ Add item failed:', error);
        set({ error: error instanceof Error ? error.message : 'Failed to add item' });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    updateItem: async (item) => {
      set({ isLoading: true, error: null });
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const dbItem = transformItemToDb(item, user.id);
        
        const { error: updateError } = await (supabase as any)
          .from('Item')
          .update(dbItem as any)
          .eq('id', item.id);

        if (updateError) throw updateError;
        
        set((state) => {
          const index = state.items.findIndex((i) => i.id === item.id);
          if (index !== -1) {
            state.items[index] = item;
          }
        });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update item' });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    deleteItem: async (id) => {
      set({ isLoading: true, error: null });
      
      try {
        const { error: deleteError } = await (supabase as any)
          .from('Item')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;
        
        set((state) => {
          state.items = state.items.filter((item) => item.id !== id);
        });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to delete item' });
        throw error;
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

    backfillBarcodesForExistingItems: async () => {
      set({ isLoading: true, error: null });
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        console.log('🚀 Starting barcode backfill...');
        const result = await backfillBarcodes(user.id, supabase);
        
        if (result.success) {
          // Reload items to show new barcodes
          await get().loadItems();
          console.log(`✅ Backfill complete! ${result.itemsUpdated} items updated`);
        } else {
          console.error('⚠️ Backfill completed with errors:', result.errors);
        }

        return {
          success: result.success,
          itemsUpdated: result.itemsUpdated,
        };
      } catch (error) {
        console.error('❌ Backfill failed:', error);
        set({ error: error instanceof Error ? error.message : 'Failed to backfill barcodes' });
        return { success: false, itemsUpdated: 0 };
      } finally {
        set({ isLoading: false });
      }
    },

    countItemsNeedingBarcodes: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 0;

        return await countItemsNeedingBarcodes(user.id, supabase);
      } catch (error) {
        console.error('Failed to count items needing barcodes:', error);
        return 0;
      }
    },
  }))
);
