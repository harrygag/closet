// Zustand store for inventory scanning and spreadsheet management
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Item, ItemStatus, ItemTag, PhysicalLocation } from '../types/item';
import { logScan, logCheckIn } from '../services/activityLog';
import { toast } from 'sonner';
import {
  getFirestore,
  doc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { app } from '../lib/firebase/client';

const db = getFirestore(app);

interface ColumnVisibility {
  name: boolean;
  size: boolean;
  status: boolean;
  tags: boolean;
  price: boolean;
  costPrice: boolean;
  ebaySku: boolean;
  lastScanned: boolean;
  location: boolean;
  notes: boolean;
  barcode: boolean;
}

interface FilterConfig {
  status: ItemStatus[];
  tags: ItemTag[];
  lastScanned: '1d' | '7d' | '30d' | 'never' | 'all';
  verificationStatus: ('verified' | 'needs-verification' | 'overdue' | 'all')[];
  searchQuery: string;
}

interface SortConfig {
  field: keyof Item;
  direction: 'asc' | 'desc';
}

interface ScanProgress {
  scanned: number;
  total: number;
  percent: number;
}

interface InventoryScanState {
  // Spreadsheet state
  columnVisibility: ColumnVisibility;
  sortConfig: SortConfig;
  filterConfig: FilterConfig;
  selectedRows: Set<string>;

  // Scan tracking
  dailyScanGoal: number;
  todayScans: Set<string>; // Item IDs scanned today
  scanHistory: Map<string, Date>;

  // Batch scan mode
  isBatchScanMode: boolean;
  batchScanQueue: string[];

  // Loading state
  isProcessing: boolean;

  // Actions
  recordScan: (itemId: string, userId: string, itemName: string, scanMethod?: 'QR' | 'BARCODE' | 'URL') => Promise<void>;
  recordCheckIn: (itemId: string, userId: string, itemName: string) => Promise<void>;
  getTodayScanCount: () => number;
  getScanProgress: (totalItems: number) => ScanProgress;
  getItemsNeedingScan: (items: Item[], daysThreshold: number) => Item[];
  getNeverScannedItems: (items: Item[]) => Item[];
  bulkUpdateLocation: (itemIds: string[], location: PhysicalLocation) => Promise<void>;
  bulkCheckIn: (itemIds: string[], userId: string, items: Item[]) => Promise<void>;
  exportToCSV: (items: Item[]) => string;

  // Spreadsheet actions
  setColumnVisibility: (columns: Partial<ColumnVisibility>) => void;
  setSortConfig: (config: SortConfig) => void;
  setFilterConfig: (config: Partial<FilterConfig>) => void;
  toggleRowSelection: (id: string) => void;
  selectAllRows: (itemIds: string[]) => void;
  clearRowSelection: () => void;

  // Batch scan mode
  enableBatchScanMode: () => void;
  disableBatchScanMode: () => void;
  addToBatchQueue: (itemId: string) => void;
  clearBatchQueue: () => void;

  // Daily scan reset
  resetDailyScanTracking: () => void;
  setDailyScanGoal: (goal: number) => void;
}

const defaultColumnVisibility: ColumnVisibility = {
  name: true,
  size: true,
  status: true,
  tags: true,
  price: true,
  costPrice: false,
  ebaySku: true,
  lastScanned: true,
  location: true,
  notes: false,
  barcode: true,
};

const defaultFilterConfig: FilterConfig = {
  status: [],
  tags: [],
  lastScanned: 'all',
  verificationStatus: [],
  searchQuery: '',
};

const defaultSortConfig: SortConfig = {
  field: 'lastScannedDate',
  direction: 'asc',
};

export const useInventoryScanStore = create<InventoryScanState>()(
  immer((set, get) => ({
    // Initial state
    columnVisibility: defaultColumnVisibility,
    sortConfig: defaultSortConfig,
    filterConfig: defaultFilterConfig,
    selectedRows: new Set(),
    dailyScanGoal: 120,
    todayScans: new Set(),
    scanHistory: new Map(),
    isBatchScanMode: false,
    batchScanQueue: [],
    isProcessing: false,

    // Record a scan
    recordScan: async (itemId: string, userId: string, itemName: string, scanMethod: 'QR' | 'BARCODE' | 'URL' = 'QR') => {
      try {
        set((state) => {
          state.isProcessing = true;
        });

        // Log to ActivityLog (source of truth) — Cloud Function handles Item updates
        await logScan(userId, itemId, itemName, scanMethod);

        // Update local tracking
        const now = new Date();
        set((state) => {
          state.todayScans.add(itemId);
          state.scanHistory.set(itemId, now);
          state.isProcessing = false;
        });

        if (!get().isBatchScanMode) {
          toast.success('Item scanned successfully');
        }
      } catch (error) {
        console.error('Failed to record scan:', error);
        set((state) => {
          state.isProcessing = false;
        });
        toast.error('Failed to record scan');
        throw error;
      }
    },

    // Record a check-in
    recordCheckIn: async (itemId: string, userId: string, itemName: string) => {
      try {
        set((state) => {
          state.isProcessing = true;
        });

        // Log to ActivityLog — Cloud Function handles Item updates
        await logCheckIn(userId, itemId, itemName);

        set((state) => {
          state.isProcessing = false;
        });

        toast.success('Item checked in');
      } catch (error) {
        console.error('Failed to record check-in:', error);
        set((state) => {
          state.isProcessing = false;
        });
        toast.error('Failed to check in item');
        throw error;
      }
    },

    // Get today's scan count
    getTodayScanCount: () => {
      return get().todayScans.size;
    },

    // Get scan progress
    getScanProgress: (totalItems: number): ScanProgress => {
      const scanned = get().todayScans.size;
      const percent = totalItems > 0 ? (scanned / totalItems) * 100 : 0;
      return { scanned, total: totalItems, percent };
    },

    // Get items needing scan (overdue)
    getItemsNeedingScan: (items: Item[], daysThreshold: number): Item[] => {
      const now = new Date();
      return items.filter((item) => {
        if (!item.lastScannedDate) return true;
        const lastScan = new Date(item.lastScannedDate);
        const daysSince = (now.getTime() - lastScan.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > daysThreshold;
      });
    },

    // Get items never scanned
    getNeverScannedItems: (items: Item[]): Item[] => {
      return items.filter((item) => !item.lastScannedDate);
    },

    // Bulk update location
    bulkUpdateLocation: async (itemIds: string[], location: PhysicalLocation) => {
      try {
        set((state) => {
          state.isProcessing = true;
        });

        const batch = writeBatch(db);

        itemIds.forEach((itemId) => {
          const itemRef = doc(db, 'Item', itemId);
          batch.update(itemRef, {
            physicalLocation: location,
            updatedAt: Timestamp.now(),
          });
        });

        await batch.commit();

        set((state) => {
          state.isProcessing = false;
        });

        toast.success(`Updated location for ${itemIds.length} item(s)`);
      } catch (error) {
        console.error('Failed to update locations:', error);
        set((state) => {
          state.isProcessing = false;
        });
        toast.error('Failed to update locations');
        throw error;
      }
    },

    // Bulk check-in
    bulkCheckIn: async (itemIds: string[], userId: string, items: Item[]) => {
      try {
        set((state) => {
          state.isProcessing = true;
        });

        const promises = itemIds.map((itemId) => {
          const item = items.find((i) => i.id === itemId);
          if (!item) return Promise.resolve();
          return get().recordCheckIn(itemId, userId, item.name);
        });

        await Promise.all(promises);

        set((state) => {
          state.isProcessing = false;
        });

        toast.success(`Checked in ${itemIds.length} item(s)`);
      } catch (error) {
        console.error('Failed to bulk check-in:', error);
        set((state) => {
          state.isProcessing = false;
        });
        toast.error('Failed to check in items');
        throw error;
      }
    },

    // Export to CSV
    exportToCSV: (items: Item[]): string => {
      const headers = [
        'Name',
        'Size',
        'Status',
        'Tags',
        'Selling Price',
        'Cost Price',
        'eBay SKU',
        'Last Scanned',
        'Scan Count',
        'Location (Zone)',
        'Location (Shelf)',
        'Location (Bin)',
        'Barcode',
        'Notes',
      ];

      const rows = items.map((item) => [
        item.name,
        item.size,
        item.status,
        item.tags.join('; '),
        (item.sellingPrice / 100).toFixed(2),
        (item.costPrice / 100).toFixed(2),
        item.ebaySku || '',
        item.lastScannedDate ? new Date(item.lastScannedDate).toLocaleDateString() : 'Never',
        item.scanCount?.toString() || '0',
        item.physicalLocation?.zone || '',
        item.physicalLocation?.shelf || '',
        item.physicalLocation?.bin || '',
        item.barcode || '',
        item.notes || '',
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

    // Spreadsheet actions
    setColumnVisibility: (columns: Partial<ColumnVisibility>) => {
      set((state) => {
        state.columnVisibility = { ...state.columnVisibility, ...columns };
      });
    },

    setSortConfig: (config: SortConfig) => {
      set((state) => {
        state.sortConfig = config;
      });
    },

    setFilterConfig: (config: Partial<FilterConfig>) => {
      set((state) => {
        state.filterConfig = { ...state.filterConfig, ...config };
      });
    },

    toggleRowSelection: (id: string) => {
      set((state) => {
        if (state.selectedRows.has(id)) {
          state.selectedRows.delete(id);
        } else {
          state.selectedRows.add(id);
        }
      });
    },

    selectAllRows: (itemIds: string[]) => {
      set((state) => {
        state.selectedRows = new Set(itemIds);
      });
    },

    clearRowSelection: () => {
      set((state) => {
        state.selectedRows.clear();
      });
    },

    // Batch scan mode
    enableBatchScanMode: () => {
      set((state) => {
        state.isBatchScanMode = true;
        state.batchScanQueue = [];
      });
      toast.success('Batch scan mode enabled');
    },

    disableBatchScanMode: () => {
      set((state) => {
        state.isBatchScanMode = false;
      });
      toast.success(`Batch scan complete: ${get().batchScanQueue.length} items scanned`);
    },

    addToBatchQueue: (itemId: string) => {
      set((state) => {
        state.batchScanQueue.push(itemId);
      });
    },

    clearBatchQueue: () => {
      set((state) => {
        state.batchScanQueue = [];
      });
    },

    // Daily scan reset (call at midnight or on app load)
    resetDailyScanTracking: () => {
      const lastReset = localStorage.getItem('lastScanReset');
      const today = new Date().toDateString();

      if (lastReset !== today) {
        set((state) => {
          state.todayScans = new Set();
        });
        localStorage.setItem('lastScanReset', today);
      }
    },

    setDailyScanGoal: (goal: number) => {
      set((state) => {
        state.dailyScanGoal = goal;
      });
      localStorage.setItem('dailyScanGoal', goal.toString());
    },
  }))
);

// Initialize from localStorage safely after store is created
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const savedGoal = localStorage.getItem('dailyScanGoal');
    if (savedGoal) {
      useInventoryScanStore.getState().setDailyScanGoal(parseInt(savedGoal, 10));
    }
    useInventoryScanStore.getState().resetDailyScanTracking();
  }, 0);
}
