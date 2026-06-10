// Zustand store for sales management
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Sale,
  SaleStats,
  SaleFilters,
  SaleSortOption,
  MarketplaceType,
  SaleSource,
} from '../types/sale';
import { calculateStats, createSale as createSaleData } from '../types/sale';
import {
  getSalesForUser,
  createSale as createSaleInDb,
  updateSale as updateSaleInDb,
  deleteSale as deleteSaleInDb,
  bulkDeleteSales,
} from '../services/saleService';
import { logSaleCreated } from '../services/activityLog';
import { useItemStore } from './useItemStore';
import { toast } from 'sonner';

/**
 * Convert each `Item.unitSales[]` entry into a transient `Sale` row so
 * Poshmark / Depop / in-person matched sales appear in the unified feed.
 * These aren't persisted to the `Sales` collection — they're synthesized at
 * read time. Skips entries that already have a matching `Sales` doc (dedup
 * by itemId + soldAt + platform). Skips eBay platform since eBay sales get
 * their own `Sales` docs via the auto-sync path.
 */
function synthesizeUnitSalesFromItems(userId: string, existingSales: Sale[]): Sale[] {
  const items = useItemStore.getState().items as any[];
  if (!items || items.length === 0) return [];

  const existingKeys = new Set(
    existingSales.map((s) => `${s.itemId}|${s.saleDate?.slice(0, 10)}|${s.marketplace}`)
  );

  const out: Sale[] = [];
  for (const it of items) {
    const list: Array<{ soldAt: string; platform: string; priceCents: number; note?: string }> =
      Array.isArray(it.unitSales) ? it.unitSales : [];
    if (list.length === 0) continue;

    list.forEach((u, idx) => {
      if (!u || !u.platform || !u.soldAt) return;
      // eBay sales already live in the Sales collection — don't double-count.
      if (u.platform === 'ebay') return;

      const dayKey = u.soldAt.slice(0, 10);
      const dedupKey = `${it.id}|${dayKey}|${u.platform}`;
      if (existingKeys.has(dedupKey)) return;
      existingKeys.add(dedupKey);

      const salePrice = typeof u.priceCents === 'number' ? u.priceCents : 0;
      const costPrice = typeof it.purchasePriceCents === 'number' ? it.purchasePriceCents : 0;
      const profit = salePrice - costPrice;
      const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

      const image = Array.isArray(it.imageUrls) ? it.imageUrls[0] : it.coverImage || undefined;
      const title = it.ebayFullTitle || it.name || it.title || '(no title)';

      out.push({
        id: `unit_${it.id}_${idx}_${dayKey}`,
        userId,
        itemId: it.id,
        itemName: title,
        itemImageUrl: image,
        saleDate: u.soldAt,
        salePrice,
        costPrice,
        profit,
        profitMargin,
        marketplace: u.platform as MarketplaceType,
        marketplaceUrl: undefined,
        saleSource: 'scan_sales' as SaleSource,
        delistStatus: { ebay: false, poshmark: false, depop: false },
        createdAt: u.soldAt,
        updatedAt: u.soldAt,
        notes: u.note,
      });
    });
  }

  return out;
}

interface SaleState {
  sales: Sale[];
  filteredSales: Sale[];
  isLoading: boolean;
  error: string | null;
  filters: SaleFilters;
  sortOption: SaleSortOption;
  selectedSales: Set<string>;

  // Actions
  loadSales: (userId: string) => Promise<void>;
  createSale: (
    userId: string,
    data: {
      itemId: string;
      itemName: string;
      itemImageUrl?: string;
      saleDate: string;
      salePrice: number;
      costPrice: number;
      marketplace: MarketplaceType;
      marketplaceUrl?: string;
      notes?: string;
      saleSource?: SaleSource;
    }
  ) => Promise<void>;
  updateSale: (id: string, updates: Partial<Sale>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  setFilters: (filters: Partial<SaleFilters>) => void;
  setSortOption: (option: SaleSortOption) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  applyFilters: () => void;
  getStats: () => SaleStats;
  exportToCSV: () => string;
}

const defaultFilters: SaleFilters = {
  dateRange: 'all',
  marketplace: 'all',
  saleSource: 'all',
  searchQuery: '',
};

const defaultSortOption: SaleSortOption = {
  field: 'saleDate',
  direction: 'desc',
};

export const useSaleStore = create<SaleState>()(
  immer((set, get) => ({
    sales: [],
    filteredSales: [],
    isLoading: false,
    error: null,
    filters: defaultFilters,
    sortOption: defaultSortOption,
    selectedSales: new Set(),

    loadSales: async (userId: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const sales = await getSalesForUser(userId);
        // Merge Posh/Depop/in-person sales from Item.unitSales[] so the
        // unified feed isn't eBay-only. Synthesized at read time, dedup'd
        // by (itemId, day, platform) against existing Sales docs.
        const synthesized = synthesizeUnitSalesFromItems(userId, sales);
        const merged = [...sales, ...synthesized].sort((a, b) =>
          (b.saleDate || '').localeCompare(a.saleDate || '')
        );
        set((state) => {
          state.sales = merged;
          state.isLoading = false;
        });
        get().applyFilters();
      } catch (error) {
        console.error('Failed to load sales:', error);
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to load sales';
          state.isLoading = false;
        });
        toast.error('Failed to load sales');
      }
    },

    createSale: async (userId, data) => {
      set((state) => {
        state.isLoading = true;
      });

      try {
        const saleData = createSaleData({
          userId,
          ...data,
        });

        const saleId = await createSaleInDb(saleData);

        const newSale: Sale = {
          id: saleId,
          ...saleData,
        };

        set((state) => {
          state.sales.unshift(newSale);
          state.isLoading = false;
        });

        // Log activity
        await logSaleCreated(
          userId,
          saleId,
          data.itemId,
          data.itemName,
          data.salePrice,
          data.marketplace,
          data.salePrice - data.costPrice
        );

        get().applyFilters();
        toast.success('Sale recorded!');
      } catch (error) {
        console.error('Failed to create sale:', error);
        set((state) => {
          state.isLoading = false;
        });
        toast.error('Failed to record sale');
        throw error;
      }
    },

    updateSale: async (id, updates) => {
      // Recalculate profit and profit margin if price fields change
      const sale = get().sales.find((s) => s.id === id);
      if (!sale) return;

      const updatedSale = { ...sale, ...updates };

      // Recalculate if prices changed
      if (updates.salePrice !== undefined || updates.costPrice !== undefined) {
        updatedSale.profit = updatedSale.salePrice - updatedSale.costPrice;
        updatedSale.profitMargin =
          updatedSale.salePrice > 0
            ? (updatedSale.profit / updatedSale.salePrice) * 100
            : 0;
      }

      try {
        await updateSaleInDb(id, updatedSale);

        set((state) => {
          const index = state.sales.findIndex((s) => s.id === id);
          if (index !== -1) {
            state.sales[index] = updatedSale;
          }
        });

        get().applyFilters();
      } catch (error) {
        console.error('Failed to update sale:', error);
        toast.error('Failed to update sale');
        throw error;
      }
    },

    deleteSale: async (id) => {
      try {
        await deleteSaleInDb(id);

        set((state) => {
          state.sales = state.sales.filter((s) => s.id !== id);
          state.selectedSales.delete(id);
        });

        get().applyFilters();
        toast.success('Sale deleted');
      } catch (error) {
        console.error('Failed to delete sale:', error);
        toast.error('Failed to delete sale');
        throw error;
      }
    },

    bulkDelete: async (ids) => {
      try {
        await bulkDeleteSales(ids);

        set((state) => {
          state.sales = state.sales.filter((s) => !ids.includes(s.id));
          ids.forEach((id) => state.selectedSales.delete(id));
        });

        get().applyFilters();
        toast.success(`Deleted ${ids.length} sale(s)`);
      } catch (error) {
        console.error('Failed to bulk delete sales:', error);
        toast.error('Failed to delete sales');
        throw error;
      }
    },

    setFilters: (filters) => {
      set((state) => {
        state.filters = { ...state.filters, ...filters };
      });
      get().applyFilters();
    },

    setSortOption: (option) => {
      set((state) => {
        state.sortOption = option;
      });
      get().applyFilters();
    },

    toggleSelection: (id) => {
      set((state) => {
        if (state.selectedSales.has(id)) {
          state.selectedSales.delete(id);
        } else {
          state.selectedSales.add(id);
        }
      });
    },

    selectAll: () => {
      set((state) => {
        state.selectedSales = new Set(state.filteredSales.map((s) => s.id));
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedSales.clear();
      });
    },

    applyFilters: () => {
      const { sales, filters, sortOption } = get();

      let filtered = [...sales];

      // Filter by date range
      if (filters.dateRange !== 'all') {
        const now = new Date();

        if (filters.dateRange === 'today') {
          const todayStart = new Date(now);
          todayStart.setHours(0, 0, 0, 0);
          filtered = filtered.filter((sale) => new Date(sale.saleDate) >= todayStart);
        } else if (filters.dateRange === 'custom') {
          if (filters.customDateStart) {
            const start = new Date(filters.customDateStart);
            start.setHours(0, 0, 0, 0);
            filtered = filtered.filter((sale) => new Date(sale.saleDate) >= start);
          }
          if (filters.customDateEnd) {
            const end = new Date(filters.customDateEnd);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter((sale) => new Date(sale.saleDate) <= end);
          }
        } else {
          const daysAgo = { '7d': 7, '30d': 30, '90d': 90 }[filters.dateRange];
          if (daysAgo) {
            const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
            filtered = filtered.filter((sale) => new Date(sale.saleDate) >= cutoffDate);
          }
        }
      }

      // Filter by marketplace
      if (filters.marketplace !== 'all') {
        filtered = filtered.filter((sale) => sale.marketplace === filters.marketplace);
      }

      // Filter by sale source
      if (filters.saleSource !== 'all') {
        filtered = filtered.filter((sale) =>
          (sale.saleSource || 'detail_page') === filters.saleSource
        );
      }

      // Filter by search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (sale) =>
            sale.itemName.toLowerCase().includes(query) ||
            sale.notes?.toLowerCase().includes(query)
        );
      }

      // Sort
      filtered.sort((a, b) => {
        const field = sortOption.field;
        let aVal: any = a[field];
        let bVal: any = b[field];

        if (field === 'saleDate') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        }

        if (field === 'marketplace' || field === 'itemName') {
          aVal = aVal?.toLowerCase() || '';
          bVal = bVal?.toLowerCase() || '';
        }

        if (sortOption.direction === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });

      set((state) => {
        state.filteredSales = filtered;
      });
    },

    getStats: () => {
      const { filteredSales } = get();
      return calculateStats(filteredSales);
    },

    exportToCSV: () => {
      const { filteredSales } = get();

      const headers = [
        'Date',
        'Item Name',
        'Sale Price',
        'Cost',
        'Profit',
        'Profit %',
        'Marketplace',
        'Source',
        'eBay Delisted',
        'Poshmark Delisted',
        'Depop Delisted',
        'Marketplace URL',
        'Notes',
      ];

      const rows = filteredSales.map((sale) => [
        new Date(sale.saleDate).toLocaleDateString(),
        sale.itemName,
        (sale.salePrice / 100).toFixed(2),
        (sale.costPrice / 100).toFixed(2),
        (sale.profit / 100).toFixed(2),
        sale.profitMargin.toFixed(2),
        sale.marketplace,
        sale.saleSource || 'detail_page',
        sale.delistStatus.ebay ? 'Yes' : 'No',
        sale.delistStatus.poshmark ? 'Yes' : 'No',
        sale.delistStatus.depop ? 'Yes' : 'No',
        sale.marketplaceUrl || '',
        sale.notes || '',
      ]);

      const escapeCsvField = (field: string): string => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      const csv = [
        headers.join(','),
        ...rows.map((row) => row.map(escapeCsvField).join(',')),
      ].join('\n');

      return csv;
    },
  }))
);
