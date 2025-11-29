/**
 * eBay Service Layer
 *
 * Handles all API calls to Firebase Cloud Functions for eBay integration
 * Provides type-safe methods for eBay operations
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { app } from '../lib/firebase/client';

const functions = getFunctions(app);
const auth = getAuth(app);

/**
 * Type Definitions
 */
export interface EbayConnectionStatus {
  connected: boolean;
  hasToken: boolean;
  ebayUsername?: string | null;
  lastSync: string | null;
  tokenExpiry: string | null;
  isExpired?: boolean;
}

export interface EbayStats {
  totalListings: number;
  activeListings: number;
  totalOrders: number;
  revenue: number;
  lastSync?: string;
  error?: string;
}

export interface EbayListing {
  sku: string;
  title: string;
  description?: string;
  price: number;
  quantity: number;
  condition: string;
  images: string[];
  locale?: string;
}

export interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  buyer: string;
  pricingSummary: any;
  lineItems: any[];
  creationDate: string;
  lastModifiedDate: string;
}

export interface SyncResult {
  success: boolean;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
}

export interface TradingAPIListing {
  itemId: string;
  title: string;
  currentPrice: number;
  currency: string;
  quantity: number;
  listingType: string;
  viewItemURL: string;
  pictureURL: string;
  pictureURLs: string[];
  sku: string;
  condition: string;
}

// Lightweight listing for fast preview display
export interface ListingPreview {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  quantity: number;
  imageUrl: string;
  condition: string;
}

/**
 * eBay Service Class
 */
class EbayService {
  /**
   * Connect eBay account via OAuth
   * Opens a popup window for OAuth authorization
   */
  async connectAccount(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to connect eBay account');
    }

    try {
      // Get OAuth URL from Cloud Function
      const response = await fetch(`/api/ebay/oauth-url?userId=${user.uid}`);

      if (!response.ok) {
        throw new Error('Failed to get OAuth URL');
      }

      const { url } = await response.json();

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        'eBay OAuth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no`
      );

      // Wait for OAuth callback
      return new Promise((resolve, reject) => {
        // Listen for messages from popup
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'EBAY_AUTH_SUCCESS') {
            window.removeEventListener('message', messageHandler);
            popup?.close();
            resolve();
          } else if (event.data.type === 'EBAY_AUTH_FAILED') {
            window.removeEventListener('message', messageHandler);
            popup?.close();
            reject(new Error(event.data.error || 'OAuth failed'));
          }
        };

        window.addEventListener('message', messageHandler);

        // Also listen via BroadcastChannel
        try {
          const bc = new BroadcastChannel('ebay_auth');
          bc.addEventListener('message', (event) => {
            if (event.data.type === 'EBAY_AUTH_SUCCESS') {
              bc.close();
              window.removeEventListener('message', messageHandler);
              popup?.close();
              resolve();
            } else if (event.data.type === 'EBAY_AUTH_FAILED') {
              bc.close();
              window.removeEventListener('message', messageHandler);
              popup?.close();
              reject(new Error(event.data.error || 'OAuth failed'));
            }
          });
        } catch (e) {
          console.warn('BroadcastChannel not available');
        }

        // Timeout after 5 minutes
        setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          if (popup && !popup.closed) {
            popup.close();
          }
          reject(new Error('OAuth timeout'));
        }, 5 * 60 * 1000);
      });
    } catch (error) {
      console.error('Failed to connect eBay account:', error);
      throw error;
    }
  }

  /**
   * Check eBay connection status
   * @returns {Promise<EbayConnectionStatus>} Connection status
   */
  async checkConnection(): Promise<EbayConnectionStatus> {
    try {
      const statusFn = httpsCallable(functions, 'ebayStatus');
      const result = await statusFn();
      return result.data as EbayConnectionStatus;
    } catch (error) {
      console.error('Failed to check eBay connection:', error);
      throw error;
    }
  }

  /**
   * Fetch eBay inventory (listings)
   * @param {Object} options - Query options (limit, offset)
   * @returns {Promise<{ success: boolean; total: number; listings: EbayListing[] }>}
   */
  async fetchInventory(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; total: number; listings: EbayListing[] }> {
    try {
      const fetchInventoryFn = httpsCallable(functions, 'ebayFetchInventory');
      const result = await fetchInventoryFn(options || {});
      return result.data as { success: boolean; total: number; listings: EbayListing[] };
    } catch (error) {
      console.error('Failed to fetch eBay inventory:', error);
      throw error;
    }
  }

  /**
   * Sync eBay listings to Firestore
   * @returns {Promise<SyncResult>} Sync operation result
   */
  async syncListings(): Promise<SyncResult> {
    try {
      const syncListingsFn = httpsCallable(functions, 'ebaySyncListings');
      const result = await syncListingsFn();
      return result.data as SyncResult;
    } catch (error) {
      console.error('Failed to sync eBay listings:', error);
      throw error;
    }
  }

  /**
   * Get eBay orders
   * @param {Object} options - Query options (limit, offset)
   * @returns {Promise<{ success: boolean; total: number; orders: EbayOrder[] }>}
   */
  async getOrders(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; total: number; orders: EbayOrder[] }> {
    try {
      const getOrdersFn = httpsCallable(functions, 'ebayGetOrders');
      const result = await getOrdersFn(options || {});
      return result.data as { success: boolean; total: number; orders: EbayOrder[] };
    } catch (error) {
      console.error('Failed to fetch eBay orders:', error);
      throw error;
    }
  }

  /**
   * Disconnect eBay account
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    try {
      const disconnectFn = httpsCallable(functions, 'ebayDisconnect');
      await disconnectFn();
    } catch (error) {
      console.error('Failed to disconnect eBay:', error);
      throw error;
    }
  }

  /**
   * Get eBay statistics (listings, orders, revenue)
   * @returns {Promise<EbayStats>} Stats data
   */
  async getStats(): Promise<EbayStats> {
    try {
      const getStatsFn = httpsCallable(functions, 'ebayGetStats');
      const result = await getStatsFn();
      return result.data as EbayStats;
    } catch (error) {
      console.error('Failed to get eBay stats:', error);
      throw error;
    }
  }

  /**
   * Get eBay listings using Trading API GetSellerList (with pagination)
   * Returns full listing details including description and all item specifics
   * @param {number} page - Page number (1-based, default 1)
   * @param {number} pageSize - Items per page (default 100, max 200)
   * @returns {Promise<{ success: boolean; total: number; listings: TradingAPIListing[]; page: number; totalPages: number }>}
   */
  async getAllListings(page: number = 1, pageSize: number = 100): Promise<{
    success: boolean;
    total: number;
    listings: TradingAPIListing[];
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    try {
      const getAllListingsFn = httpsCallable(functions, 'ebayGetAllListings', {
        timeout: 300000 // 5 minute timeout on client side too
      });
      const result = await getAllListingsFn({ page, pageSize });
      return result.data as {
        success: boolean;
        total: number;
        listings: TradingAPIListing[];
        page: number;
        pageSize: number;
        totalPages: number;
      };
    } catch (error) {
      console.error('Failed to get all eBay listings:', error);
      throw error;
    }
  }

  /**
   * FAST: Get total listing count only (~50ms)
   * Uses EntriesPerPage=1 to minimize data transfer
   * @returns {Promise<{ success: boolean; total: number }>}
   */
  async getListingCount(): Promise<{ success: boolean; total: number }> {
    try {
      const getCountFn = httpsCallable(functions, 'ebayGetListingCount');
      const result = await getCountFn();
      return result.data as { success: boolean; total: number };
    } catch (error) {
      console.error('Failed to get listing count:', error);
      throw error;
    }
  }

  /**
   * FAST: Get listings preview for display (~200ms per page)
   * Minimal fields - only what's needed to show in UI
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Items per page (default 25 for speed)
   * @returns {Promise<{ success: boolean; listings: ListingPreview[]; page: number; totalPages: number; total: number; hasMore: boolean }>}
   */
  async getListingsPreview(page: number = 1, pageSize: number = 25): Promise<{
    success: boolean;
    listings: ListingPreview[];
    page: number;
    pageSize: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  }> {
    try {
      const getPreviewFn = httpsCallable(functions, 'ebayGetListingsPreview');
      const result = await getPreviewFn({ page, pageSize });
      return result.data as {
        success: boolean;
        listings: ListingPreview[];
        page: number;
        pageSize: number;
        totalPages: number;
        total: number;
        hasMore: boolean;
      };
    } catch (error) {
      console.error('Failed to get listings preview:', error);
      throw error;
    }
  }

  /**
   * Delete all items for the current user
   * @returns {Promise<{ success: boolean; deletedCount: number }>}
   */
  async deleteAllItems(): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const deleteAllFn = httpsCallable(functions, 'deleteAllItems');
      const result = await deleteAllFn();
      return result.data as { success: boolean; deletedCount: number };
    } catch (error) {
      console.error('Failed to delete all items:', error);
      throw error;
    }
  }

  /**
   * Import ALL eBay listings directly to Firestore
   * This is an all-in-one function that fetches from eBay and saves to DB
   * @param {boolean} deleteExisting - If true, delete all existing items first
   * @returns {Promise<{ success: boolean; totalFromEbay: number; imported: number; skipped: number }>}
   */
  async importAllFromEbay(deleteExisting: boolean = false): Promise<{
    success: boolean;
    totalFromEbay: number;
    imported: number;
    skipped: number;
  }> {
    try {
      const importAllFn = httpsCallable(functions, 'ebayImportAll', {
        timeout: 600000 // 10 minute timeout
      });
      const result = await importAllFn({ deleteExisting });
      return result.data as {
        success: boolean;
        totalFromEbay: number;
        imported: number;
        skipped: number;
      };
    } catch (error) {
      console.error('Failed to import from eBay:', error);
      throw error;
    }
  }

  /**
   * Import ONE page of eBay listings (fast, shows progress)
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Items per page (default 200)
   */
  async importPage(page: number = 1, pageSize: number = 200): Promise<{
    success: boolean;
    page: number;
    totalPages: number;
    totalEntries: number;
    hasMoreItems: boolean;
    imported: number;
    skipped: number;
    pageItems: number;
  }> {
    try {
      const importPageFn = httpsCallable(functions, 'ebayImportPage');
      const result = await importPageFn({ page, pageSize });
      return result.data as {
        success: boolean;
        page: number;
        totalPages: number;
        totalEntries: number;
        hasMoreItems: boolean;
        imported: number;
        skipped: number;
        pageItems: number;
      };
    } catch (error) {
      console.error('Failed to import page:', error);
      throw error;
    }
  }

  /**
   * Delete items that don't have an eBay listing ID
   * @returns {Promise<{ success: boolean; deletedCount: number; totalItems: number; remainingItems: number }>}
   */
  async deleteItemsWithoutEbay(): Promise<{
    success: boolean;
    deletedCount: number;
    totalItems: number;
    remainingItems: number;
  }> {
    try {
      const deleteFn = httpsCallable(functions, 'deleteItemsWithoutEbay');
      const result = await deleteFn();
      return result.data as {
        success: boolean;
        deletedCount: number;
        totalItems: number;
        remainingItems: number;
      };
    } catch (error) {
      console.error('Failed to delete non-eBay items:', error);
      throw error;
    }
  }
}

/**
 * Export singleton instance
 */
export const ebayService = new EbayService();
