// Zustand store for item management with database backend
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Item, ItemStats, FilterOptions, SortOption } from '../types/item';
import { database } from '../lib/database/client';
import { generateBarcode } from '../services/barcodes';
import { backfillBarcodes, countItemsNeedingBarcodes } from '../services/backfillBarcodes';
import { backfillEbayUrls, countItemsNeedingEbayUrls } from '../services/backfillEbayUrls';

interface ItemState {
  items: Item[];
  filteredItems: Item[];
  isLoading: boolean;
  isInitializing: boolean; // Lock to prevent concurrent initializeStore calls
  error: string | null;
  filterOptions: FilterOptions;
  sortOption: SortOption;
  selectedItem: Item | null;

  // Actions
  initializeStore: (userId: string) => Promise<void>;
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
  backfillEbayUrlsForExistingItems: () => Promise<{ success: boolean; itemsUpdated: number }>;
  countItemsNeedingEbayUrls: () => Promise<number>;
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

// Extract size from an eBay listing title as a last-resort fallback
const extractSizeFromTitle = (title: string): string => {
  const sizePatterns = [
    /\b(xxs|xs|small|medium|large|x-large|xx-large|xxx-large)\b/i,
    /\b(2xs|3xs|4xs|s|m|l|xl|2xl|3xl|4xl|xxl|xxxl|xxxxl)\b/i,
    /\bsize\s*(\w+)\b/i,
    /\bmens?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i,
  ];
  for (const pattern of sizePatterns) {
    const match = title.match(pattern);
    if (match) {
      const size = match[1] || match[0];
      const sizeMap: Record<string, string> = {
        'small': 'S', 'medium': 'M', 'large': 'L',
        'x-large': 'XL', 'xx-large': 'XXL', 'xxx-large': 'XXXL',
      };
      return sizeMap[size.toLowerCase()] || size.toUpperCase();
    }
  }
  return '';
};

// Helper to transform database row (Item) to Item
const transformDbItem = (dbItem: any): Item => {
  // Extract hangerId from notes if present (format: "Hanger: H123. Other notes")
  const notesStr = dbItem.notes || '';
  const hangerMatch = notesStr.match(/Hanger:\s*([^\.\s]+)/);
  const hangerId = hangerMatch ? hangerMatch[1] : '';
  const cleanedNotes = notesStr.replace(/Hanger:\s*[^\.\s]+\.\s*/, '').trim();

  // Pull eBay item specifics from nested ebayData or top-level
  const ebayItemSpecifics: Record<string, string | string[]> =
    dbItem.ebayData?.itemSpecifics || dbItem.ebayItemSpecifics || {};

  // Use stored size (user-edited or eBay-imported) first,
  // then fall back to raw eBay item specifics,
  // finally try to extract size from the listing title
  const ebaySize =
    dbItem.size ||
    (ebayItemSpecifics['Size'] as string) ||
    (ebayItemSpecifics['Jersey Size'] as string) ||
    extractSizeFromTitle(dbItem.title || '') ||
    '';

  return {
    id: dbItem.id,
    name: dbItem.title || '',
    size: ebaySize,
    status: dbItem.status === 'SOLD' ? 'SOLD' : dbItem.status === 'IN_STOCK' ? 'Active' : 'Inactive',
    hangerStatus: hangerId !== 'None' && hangerId ? 'assigned' : '',
    hangerId: hangerId !== 'None' ? hangerId : '',
    tags: (dbItem.normalizedTags || []).slice(0, 5),
    ebayUrl: dbItem.ebayUrl || undefined,
    ebayListingId: dbItem.ebayListingId || undefined,
    poshmarkUrl: dbItem.poshmarkUrl || undefined,
    depopUrl: dbItem.depopUrl || undefined,
    imageUrl: dbItem.imageUrls?.[0] || undefined,
    costPrice: dbItem.purchasePriceCents ? dbItem.purchasePriceCents / 100 : 0,
    sellingPrice: dbItem.manualPriceCents ? dbItem.manualPriceCents / 100 : 0,
    ebayFees: 0,
    netProfit: dbItem.soldPriceCents && dbItem.purchasePriceCents
      ? (dbItem.soldPriceCents - dbItem.purchasePriceCents) / 100
      : 0,
    dateField: dbItem.soldDate || dbItem.purchaseDate || dbItem.createdAt,
    notes: cleanedNotes || dbItem.conditionNotes || '',
    dateAdded: dbItem.createdAt,
    barcode: dbItem.barcode || undefined,
    ebayQuantity: dbItem.ebayQuantity ?? undefined,
    ebayQuantitySold: dbItem.ebayQuantitySold ?? undefined,
    ebayItemId: dbItem.ebayItemId || undefined,
    ebaySku: dbItem.ebaySku || dbItem.sku || undefined,
    ebayFullTitle: dbItem.ebayFullTitle || undefined,
    ebayPrimaryImage: dbItem.ebayPrimaryImage || dbItem.imageUrls?.[0] || undefined,
    ebayPhotos: dbItem.ebayPhotos || undefined,
    ebayItemSpecifics: Object.keys(ebayItemSpecifics).length > 0 ? ebayItemSpecifics : undefined,
    delistedConfirmed: dbItem.delistedConfirmed || undefined,
    delistedConfirmedAt: dbItem.delistedConfirmedAt || undefined,
    jerseyNumber: dbItem.jerseyNumber || undefined,
    lastScannedDate: dbItem.lastScannedDate || undefined,
    scanCount: dbItem.scanCount || undefined,
    physicalLocation: dbItem.physicalLocation || undefined,
    verificationStatus: dbItem.verificationStatus || undefined,
    physicalQuantity: dbItem.physicalQuantity ?? dbItem.ebayQuantity ?? 1,
    stockStatus: dbItem.stockStatus ?? (dbItem.status === 'SOLD' ? 'SOLD' : (dbItem.physicalQuantity ?? dbItem.ebayQuantity ?? 1) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'),
    unitSales: dbItem.unitSales ?? [],
    itemActivity: dbItem.itemActivity ?? [],
    poshmarkQuantity: dbItem.poshmarkQuantity || undefined,
    depopQuantity: dbItem.depopQuantity || undefined,
    poshmarkListingId: dbItem.poshmarkListingId || undefined,
    depopListingId: dbItem.depopListingId || undefined,
    soldPlatform: dbItem.soldPlatform || undefined,
    receivedDate: dbItem.receivedDate || undefined,
    linkedGroupId: dbItem.linkedGroupId || undefined,
    linkedGroupRole: dbItem.linkedGroupRole || undefined,
    canonicalQty: dbItem.canonicalQty ?? dbItem.ebayQuantity ?? undefined,
  };
};

// Helper to transform Item to database format (Item schema)
const transformItemToDb = (item: Partial<Item>, userId: string) => ({
  user_uuid: userId,
  title: item.name,
  size: item.size,
  status: item.status === 'Active' ? 'IN_STOCK' :
          item.status === 'SOLD' ? 'SOLD' : 'IN_STOCK',
  normalizedTags: item.tags || [],
  imageUrls: item.imageUrl ? [item.imageUrl] : [],
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
  barcode: item.barcode || null,
  ebayUrl: item.ebayUrl || null,
  ebayListingId: item.ebayListingId || null,
  poshmarkUrl: item.poshmarkUrl || null,
  depopUrl: item.depopUrl || null,
  physicalQuantity: item.physicalQuantity ?? undefined,
  stockStatus: item.stockStatus ?? undefined,
  unitSales: item.unitSales ?? undefined,
  itemActivity: item.itemActivity ?? undefined,
  poshmarkQuantity: item.poshmarkQuantity ?? undefined,
  depopQuantity: item.depopQuantity ?? undefined,
  poshmarkListingId: item.poshmarkListingId ?? undefined,
  depopListingId: item.depopListingId ?? undefined,
  soldPlatform: item.soldPlatform ?? undefined,
  receivedDate: item.receivedDate ?? undefined,
});

// Helper to create a standardized activity entry for item audit trails
export function createActivityEntry(action: string, details: string, oldValue?: any, newValue?: any) {
  return {
    action,
    timestamp: new Date().toISOString(),
    details,
    oldValue: oldValue !== undefined ? String(oldValue) : undefined,
    newValue: newValue !== undefined ? String(newValue) : undefined,
  };
}

export const useItemStore = create<ItemState>()(
  immer((set, get) => ({
    items: [],
    filteredItems: [],
    isLoading: false,
    isInitializing: false,
    error: null,
    filterOptions: defaultFilterOptions,
    sortOption: defaultSortOption,
    selectedItem: null,

    initializeStore: async (userId: string) => {
      // Prevent concurrent initialization calls
      if (get().isInitializing) {
        console.log('⏳ initializeStore already in progress, skipping...');
        return;
      }

      set({ isLoading: true, isInitializing: true, error: null });

      try {
        // Load items from database using the provided userId
        console.log('📊 Fetching items for user:', userId);
        console.log('📊 Query: SELECT * FROM Item WHERE user_uuid =', userId);

        const { data: dbItems, error: fetchError } = await (database as any)
          .from('Item')
          .select('*')
          .eq('user_uuid', userId)
          .order('createdAt', { ascending: false });

        console.log('📦 Fetched items:', dbItems?.length, 'Error:', fetchError);
        console.log('📦 First item:', dbItems?.[0]);
        console.log('📦 Barcodes in fetched items:', dbItems?.map((item: any) => ({ id: item.id, barcode: item.barcode })).slice(0, 5));
        
        if (fetchError) {
          console.error('❌ Fetch error details:', JSON.stringify(fetchError, null, 2));
          throw fetchError;
        }

        const items = (dbItems || []).map(transformDbItem);
        console.log('📦 Transformed items with barcodes:', items.filter((i: Item) => i.barcode).length, 'of', items.length);
        set({ items, filteredItems: items });
        
        get().applyFilters();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to initialize store' });
      } finally {
        set({ isLoading: false, isInitializing: false });
      }
    },

    loadItems: async () => {
      set({ isLoading: true, error: null });

      try {
        const { data: { user } } = await database.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { data: dbItems, error: fetchError } = await (database as any)
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
        const { data: { user } } = await database.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Generate barcode automatically
        console.log('🏷️ Generating barcode for new item...');
        const barcode = await generateBarcode(user.id, database);
        console.log('✅ Generated barcode:', barcode);

        // Add barcode to item data
        const itemWithBarcode = {
          ...itemData,
          barcode: barcode,
        };

        const dbItem = transformItemToDb(itemWithBarcode, user.id);

        const { data: insertedItem, error: insertError } = await (database as any)
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
        const { data: { user } } = await database.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const dbItem = transformItemToDb(item, user.id);

        // Security: Add explicit user_uuid check (defense-in-depth)
        const { data: updatedItem, error: updateError } = await (database as any)
          .from('Item')
          .update(dbItem as any)
          .eq('id', item.id)
          .eq('user_uuid', user.id)
          .select()
          .single();

        if (updateError) throw updateError;
        
        // CRITICAL: Use the returned data from DB to ensure consistency
        const refreshedItem = transformDbItem(updatedItem);
        
        set((state) => {
          const index = state.items.findIndex((i) => i.id === item.id);
          if (index !== -1) {
            state.items[index] = refreshedItem;
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
        const { data: { user } } = await database.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error: deleteError } = await (database as any)
          .from('Item')
          .delete()
          .eq('id', id)
          .eq('user_uuid', user.id);

        if (deleteError) {
          console.error('[deleteItem] Firestore delete failed:', deleteError);
          throw deleteError;
        }

        console.log('[deleteItem] Successfully deleted from Firestore:', id);

        set((state) => {
          state.items = state.items.filter((item) => item.id !== id);
        });

        get().applyFilters();
      } catch (error) {
        console.error('[deleteItem] Error:', error);
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
        const { data: { user } } = await database.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        console.log('🚀 Starting barcode backfill...');
        const result = await backfillBarcodes(user.id, database);
        
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
        const { data: { user } } = await database.auth.getUser();
        if (!user) return 0;

        return await countItemsNeedingBarcodes(user.id, database);
      } catch (error) {
        console.error('Failed to count items needing barcodes:', error);
        return 0;
      }
    },

    backfillEbayUrlsForExistingItems: async () => {
      set({ isLoading: true, error: null });

      try {
        const { data: { user } } = await database.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        console.log('🚀 Starting eBay URL backfill...');
        const result = await backfillEbayUrls(user.id);

        if (result.success) {
          // Reload items to show new URLs
          await get().loadItems();
          console.log(`✅ Backfill complete! ${result.itemsUpdated} items updated`);
        }

        return {
          success: result.success,
          itemsUpdated: result.itemsUpdated,
        };
      } catch (error) {
        console.error('❌ eBay URL backfill failed:', error);
        set({ error: error instanceof Error ? error.message : 'Failed to backfill eBay URLs' });
        return { success: false, itemsUpdated: 0 };
      } finally {
        set({ isLoading: false });
      }
    },

    countItemsNeedingEbayUrls: async () => {
      try {
        const { data: { user } } = await database.auth.getUser();
        if (!user) return 0;

        return await countItemsNeedingEbayUrls(user.id);
      } catch (error) {
        console.error('Failed to count items needing eBay URLs:', error);
        return 0;
      }
    },
  }))
);
