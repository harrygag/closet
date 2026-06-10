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
      const getOAuthUrl = httpsCallable(functions, 'ebayOAuthUrl');
      const result = await getOAuthUrl({ userId: user.uid });
      const { url } = result.data as { url: string };

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

  /**
   * Delete broken items (items with empty titles from failed imports)
   * @returns {Promise<{ success: boolean; deletedCount: number }>}
   */
  async deleteBrokenItems(): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const deleteFn = httpsCallable(functions, 'deleteBrokenItems', {
        timeout: 600000 // 10 minute timeout for large deletions
      });
      const result = await deleteFn();
      return result.data as { success: boolean; deletedCount: number };
    } catch (error) {
      console.error('Failed to delete broken items:', error);
      throw error;
    }
  }

  /**
   * Backup eBay photos to Firebase Storage
   * Downloads all photos from eBay URLs and stores them persistently
   * @param {string} itemId - The eBay item ID
   * @param {string[]} photoUrls - Array of eBay photo URLs to backup
   * @returns {Promise<{ success: boolean; photosDownloaded: number; photosFailed: number; photos: any[] }>}
   */
  async backupPhotos(itemId: string, photoUrls: string[]): Promise<{
    success: boolean;
    photosDownloaded: number;
    photosFailed: number;
    photos: any[];
    errors: Array<{ url: string; order: number; error: string }>;
  }> {
    try {
      const backupPhotosFn = httpsCallable(functions, 'ebayBackupPhotos', {
        timeout: 300000 // 5 minute timeout
      });
      const result = await backupPhotosFn({ itemId, photoUrls });
      return result.data as {
        success: boolean;
        photosDownloaded: number;
        photosFailed: number;
        photos: any[];
        errors: Array<{ url: string; order: number; error: string }>;
      };
    } catch (error) {
      console.error('Failed to backup photos:', error);
      throw error;
    }
  }

  /**
   * Create a NEW eBay listing from stored item data
   * Uses all backed-up eBay data (shipping, returns, photos, specifics) to create identical listing
   * @param {Object} listingData - Complete item data with all eBay fields
   * @returns {Promise<{ success: boolean; itemId: string; listingUrl: string; listingFee: number }>}
   */
  async createListing(listingData: {
    title: string;
    subtitle?: string;
    description: string;
    price: number; // in cents
    quantity: number;
    condition: string;
    conditionID?: string;
    categoryID: string;
    itemSpecifics?: Record<string, string | string[]>;
    photosUrls?: string[];
    shippingInfo?: any;
    returnPolicy?: any;
    paymentMethods?: string[];
    buyerRequirements?: any;
  }): Promise<{
    success: boolean;
    itemId: string;
    listingUrl: string;
    listingFee: number;
  }> {
    try {
      const createListingFn = httpsCallable(functions, 'ebayCreateListing', {
        timeout: 300000 // 5 minute timeout
      });
      const result = await createListingFn(listingData);
      return result.data as {
        success: boolean;
        itemId: string;
        listingUrl: string;
        listingFee: number;
      };
    } catch (error) {
      console.error('Failed to create eBay listing:', error);
      throw error;
    }
  }

  /**
   * Get eBay item details by SKU for relisting
   */
  async getItemDetails(itemId: string): Promise<any> {
    try {
      const getItemDetailsFn = httpsCallable(functions, 'ebayGetItemDetails', {
        timeout: 60000 // 1 minute timeout
      });
      const result = await getItemDetailsFn({ itemId });
      return result.data;
    } catch (error) {
      console.error('Failed to get eBay item details:', error);
      throw error;
    }
  }

  /**
   * End an active eBay listing
   */
  /**
   * Revise eBay listing price (for active listings)
   */
  async reviseItemQuantity(itemId: string, quantity: number): Promise<{ success: boolean; itemId: string; quantity: number }> {
    const fn = httpsCallable(functions, 'ebayReviseItemQuantity', { timeout: 60000 });
    const result = await fn({ itemId, quantity });
    return result.data as { success: boolean; itemId: string; quantity: number };
  }

  async reviseItemPrice(itemId: string, newPriceCents: number): Promise<{
    success: boolean;
    itemId: string;
    newPrice: number;
  }> {
    try {
      const reviseItemPriceFn = httpsCallable(functions, 'ebayReviseItemPrice', {
        timeout: 60000
      });
      const result = await reviseItemPriceFn({ itemId, newPriceCents });
      return result.data as { success: boolean; itemId: string; newPrice: number };
    } catch (error) {
      console.error('Failed to revise item price:', error);
      throw error;
    }
  }

  async endItem(itemId: string, endingReason: string = 'NotAvailable'): Promise<{
    success: boolean;
    itemId: string;
    endTime: string;
  }> {
    try {
      const endItemFn = httpsCallable(functions, 'ebayEndItem', {
        timeout: 60000
      });
      const result = await endItemFn({ itemId, endingReason });
      return result.data as { success: boolean; itemId: string; endTime: string };
    } catch (error) {
      console.error('Failed to end eBay listing:', error);
      throw error;
    }
  }

  /**
   * Relist an ended eBay listing (automatically copies all details)
   * @param {string} itemId - The eBay item ID
   * @param {number} [newPriceCents] - Optional new price in cents to use when relisting
   */
  async relistItem(itemId: string, newPriceCents?: number): Promise<{
    success: boolean;
    itemId: string;
    listingUrl: string;
    listingFee: number;
  }> {
    try {
      const relistItemFn = httpsCallable(functions, 'ebayRelistItem', {
        timeout: 60000
      });
      const result = await relistItemFn({ itemId, newPriceCents });
      return result.data as {
        success: boolean;
        itemId: string;
        listingUrl: string;
        listingFee: number;
      };
    } catch (error) {
      console.error('Failed to relist eBay item:', error);
      throw error;
    }
  }

  /**
   * eBay Inventory API - Create/Update Inventory Item
   * Modern RESTful API approach
   */
  async inventoryCreateItem(params: {
    sku: string;
    title: string;
    description: string;
    imageUrls?: string[];
    categoryId?: string;
    condition?: string;
    conditionDescription?: string;
    itemSpecifics?: Record<string, string | string[]>;
    availability?: any;
  }): Promise<{ success: boolean; sku: string; message: string }> {
    try {
      const createItemFn = httpsCallable(functions, 'ebayInventoryCreateItem', {
        timeout: 60000
      });
      const result = await createItemFn(params);
      return result.data as { success: boolean; sku: string; message: string };
    } catch (error) {
      console.error('Failed to create inventory item:', error);
      throw error;
    }
  }

  /**
   * eBay Inventory API - Create Offer
   */
  async inventoryCreateOffer(params: {
    sku: string;
    price: number; // in cents
    quantity?: number;
    categoryId: string;
    marketplaceId?: string;
    format?: string;
    listingDescription?: string;
    listingPolicies?: any;
    merchantLocationKey?: string;
  }): Promise<{ success: boolean; offerId: string; sku: string }> {
    try {
      const createOfferFn = httpsCallable(functions, 'ebayInventoryCreateOffer', {
        timeout: 60000
      });
      const result = await createOfferFn(params);
      return result.data as { success: boolean; offerId: string; sku: string };
    } catch (error) {
      console.error('Failed to create offer:', error);
      throw error;
    }
  }

  /**
   * eBay Inventory API - Publish Offer
   */
  async inventoryPublishOffer(offerId: string): Promise<{
    success: boolean;
    listingId: string;
    listingUrl: string;
  }> {
    try {
      const publishOfferFn = httpsCallable(functions, 'ebayInventoryPublishOffer', {
        timeout: 60000
      });
      const result = await publishOfferFn({ offerId });
      return result.data as { success: boolean; listingId: string; listingUrl: string };
    } catch (error) {
      console.error('Failed to publish offer:', error);
      throw error;
    }
  }

  /**
   * eBay Inventory API - Get Listing Fees
   */
  async inventoryGetListingFees(offerIds: string[]): Promise<{
    success: boolean;
    fees: any[];
  }> {
    try {
      const getFeesFn = httpsCallable(functions, 'ebayInventoryGetListingFees', {
        timeout: 60000
      });
      const result = await getFeesFn({ offerIds });
      return result.data as { success: boolean; fees: any[] };
    } catch (error) {
      console.error('Failed to get listing fees:', error);
      throw error;
    }
  }

  /**
   * eBay Inventory API - Complete Workflow (Create Item + Offer + Publish)
   * This is the recommended method for listing items - handles everything in one call
   */
  async inventoryCreateAndPublish(params: {
    sku: string;
    title: string;
    description: string;
    imageUrls?: string[];
    categoryId: string;
    condition?: string;
    conditionDescription?: string;
    itemSpecifics?: Record<string, string | string[]>;
    price: number; // in cents
    quantity?: number;
    marketplaceId?: string;
    format?: string;
    listingPolicies?: any;
  }): Promise<{
    success: boolean;
    sku: string;
    offerId: string;
    listingId: string;
    listingUrl: string;
  }> {
    try {
      const createAndPublishFn = httpsCallable(functions, 'ebayInventoryCreateAndPublish', {
        timeout: 120000 // 2 minute timeout
      });
      const result = await createAndPublishFn(params);
      return result.data as {
        success: boolean;
        sku: string;
        offerId: string;
        listingId: string;
        listingUrl: string;
      };
    } catch (error) {
      console.error('Failed to create and publish listing:', error);
      throw error;
    }
  }

  /**
   * Withdraw (unpublish) an eBay inventory offer
   * Removes the listing from eBay but keeps the inventory item
   * @param {string} offerId - The offer ID to withdraw
   * @returns {Promise<{ success: boolean }>}
   */
  async inventoryWithdrawOffer(offerId: string): Promise<{
    success: boolean;
  }> {
    try {
      const withdrawOfferFn = httpsCallable(functions, 'ebayInventoryWithdrawOffer', {
        timeout: 60000
      });
      const result = await withdrawOfferFn({ offerId });
      return result.data as { success: boolean };
    } catch (error) {
      console.error('Failed to withdraw offer:', error);
      throw error;
    }
  }

  // ============================================================================
  // OFFER MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get all offers for a specific SKU
   * @param {string} sku - The SKU to query
   * @param {string} marketplaceId - Optional marketplace filter
   */
  async getOffersBySku(sku: string, marketplaceId?: string): Promise<any> {
    try {
      const getOffersFn = httpsCallable(functions, 'ebayGetOffers', {
        timeout: 60000
      });
      const result = await getOffersFn({ sku, marketplaceId });
      return result.data;
    } catch (error) {
      console.error('Failed to get offers:', error);
      throw error;
    }
  }

  /**
   * Get all offers (paginated)
   * @param {number} limit - Results per page
   * @param {number} offset - Starting offset
   */
  async getAllOffers(limit: number = 50, offset: number = 0): Promise<any> {
    try {
      const getAllOffersFn = httpsCallable(functions, 'ebayGetAllOffers', {
        timeout: 60000
      });
      const result = await getAllOffersFn({ limit, offset });
      return result.data;
    } catch (error) {
      console.error('Failed to get all offers:', error);
      throw error;
    }
  }

  /**
   * Get a specific offer by ID
   * @param {string} offerId - The offer ID
   */
  async getOffer(offerId: string): Promise<any> {
    try {
      const getOfferFn = httpsCallable(functions, 'ebayGetOffer', {
        timeout: 60000
      });
      const result = await getOfferFn({ offerId });
      return result.data;
    } catch (error) {
      console.error('Failed to get offer:', error);
      throw error;
    }
  }

  /**
   * Update an existing offer
   * @param {string} offerId - The offer ID
   * @param {any} updates - The fields to update
   */
  async updateOffer(offerId: string, updates: any): Promise<any> {
    try {
      const updateOfferFn = httpsCallable(functions, 'ebayUpdateOffer', {
        timeout: 60000
      });
      const result = await updateOfferFn({ offerId, updates });
      return result.data;
    } catch (error) {
      console.error('Failed to update offer:', error);
      throw error;
    }
  }

  /**
   * Delete an offer
   * @param {string} offerId - The offer ID
   */
  async deleteOffer(offerId: string): Promise<any> {
    try {
      const deleteOfferFn = httpsCallable(functions, 'ebayDeleteOffer', {
        timeout: 60000
      });
      const result = await deleteOfferFn({ offerId });
      return result.data;
    } catch (error) {
      console.error('Failed to delete offer:', error);
      throw error;
    }
  }

  // ============================================================================
  // BUSINESS POLICIES
  // ============================================================================

  /**
   * Get fulfillment (shipping) policies
   * @param {string} marketplaceId - Marketplace ID (default: EBAY_US)
   */
  async getFulfillmentPolicies(marketplaceId: string = 'EBAY_US'): Promise<any> {
    try {
      const getPoliciesFn = httpsCallable(functions, 'ebayGetFulfillmentPolicies', {
        timeout: 60000
      });
      const result = await getPoliciesFn({ marketplaceId });
      return result.data;
    } catch (error) {
      console.error('Failed to get fulfillment policies:', error);
      throw error;
    }
  }

  /**
   * Get return policies
   * @param {string} marketplaceId - Marketplace ID (default: EBAY_US)
   */
  async getReturnPolicies(marketplaceId: string = 'EBAY_US'): Promise<any> {
    try {
      const getPoliciesFn = httpsCallable(functions, 'ebayGetReturnPolicies', {
        timeout: 60000
      });
      const result = await getPoliciesFn({ marketplaceId });
      return result.data;
    } catch (error) {
      console.error('Failed to get return policies:', error);
      throw error;
    }
  }

  /**
   * Get payment policies
   * @param {string} marketplaceId - Marketplace ID (default: EBAY_US)
   */
  async getPaymentPolicies(marketplaceId: string = 'EBAY_US'): Promise<any> {
    try {
      const getPoliciesFn = httpsCallable(functions, 'ebayGetPaymentPolicies', {
        timeout: 60000
      });
      const result = await getPoliciesFn({ marketplaceId });
      return result.data;
    } catch (error) {
      console.error('Failed to get payment policies:', error);
      throw error;
    }
  }

  /**
   * Get inventory locations
   */
  async getInventoryLocations(): Promise<any> {
    try {
      const getLocationsFn = httpsCallable(functions, 'ebayGetInventoryLocations', {
        timeout: 60000
      });
      const result = await getLocationsFn();
      return result.data;
    } catch (error) {
      console.error('Failed to get inventory locations:', error);
      throw error;
    }
  }

  /**
   * Get all business policies at once
   * @param {string} marketplaceId - Marketplace ID (default: EBAY_US)
   */
  async getAllPolicies(marketplaceId: string = 'EBAY_US'): Promise<any> {
    try {
      const getAllPoliciesFn = httpsCallable(functions, 'ebayGetAllPolicies', {
        timeout: 60000
      });
      const result = await getAllPoliciesFn({ marketplaceId });
      return result.data;
    } catch (error) {
      console.error('Failed to get all policies:', error);
      throw error;
    }
  }

  // ============================================================================
  // CATEGORY SUGGESTIONS
  // ============================================================================

  /**
   * Get category suggestions based on item title
   * @param {string} query - The search query (item title)
   * @param {string} categoryTreeId - Category tree ID (default: 0 for EBAY_US)
   */
  async getCategorySuggestions(query: string, categoryTreeId: string = '0'): Promise<any> {
    try {
      const getSuggestionsFn = httpsCallable(functions, 'ebayGetCategorySuggestions', {
        timeout: 60000
      });
      const result = await getSuggestionsFn({ query, categoryTreeId });
      return result.data;
    } catch (error) {
      console.error('Failed to get category suggestions:', error);
      throw error;
    }
  }

  // ============================================================================
  // BUYER OFFERS - Send promotional offers to watchers/interested buyers
  // ============================================================================

  /**
   * Get watcher count for an item
   * @param {string} itemId - The eBay item ID
   */
  async getItemWatchers(itemId: string): Promise<any> {
    try {
      const getWatchersFn = httpsCallable(functions, 'ebayGetItemWatchers', {
        timeout: 60000
      });
      const result = await getWatchersFn({ itemId });
      return result.data;
    } catch (error) {
      console.error('Failed to get item watchers:', error);
      throw error;
    }
  }

  /**
   * Send promotional offer to buyers watching an item
   * @param {string} itemId - The eBay item ID
   * @param {number} discountPercent - Discount percentage (e.g., 10 for 10% off)
   * @param {number} duration - Offer duration in hours (default 48)
   * @param {string} message - Optional message to buyers
   */
  async sendBuyerOffer(itemId: string, discountPercent: number, duration: number = 48, message?: string): Promise<any> {
    try {
      const sendOfferFn = httpsCallable(functions, 'ebaySendBuyerOffer', {
        timeout: 60000
      });
      const result = await sendOfferFn({ itemId, discountPercent, duration, message });
      return result.data;
    } catch (error) {
      console.error('Failed to send buyer offer:', error);
      throw error;
    }
  }

  /**
   * Get market trends and pricing suggestions for an item
   * @param {string} itemId - The eBay item ID
   */
  async getMarketTrends(itemId: string): Promise<any> {
    try {
      const getTrendsFn = httpsCallable(functions, 'ebayGetMarketTrends', {
        timeout: 60000
      });
      const result = await getTrendsFn({ itemId });
      return result.data;
    } catch (error) {
      console.error('Failed to get market trends:', error);
      throw error;
    }
  }

  /**
   * BULK: Get watcher counts for multiple items at once (10x faster!)
   * @param {string[]} itemIds - Array of eBay item IDs
   */
  async getBulkWatchers(itemIds: string[]): Promise<any> {
    try {
      const getBulkWatchersFn = httpsCallable(functions, 'ebayGetBulkWatchers', {
        timeout: 540000 // 9 minutes
      });
      const result = await getBulkWatchersFn({ itemIds });
      return result.data;
    } catch (error) {
      console.error('Failed to get bulk watchers:', error);
      throw error;
    }
  }

  /**
   * BULK: Send offers to multiple items at once (much faster!)
   * @param {Array} items - Array of {itemId, currentPrice}
   * @param {number} discountPercent - Discount percentage
   */
  async sendBulkOffers(items: Array<{itemId: string, currentPrice: number}>, discountPercent: number): Promise<any> {
    try {
      const sendBulkOffersFn = httpsCallable(functions, 'ebaySendBulkOffers', {
        timeout: 540000 // 9 minutes
      });
      const result = await sendBulkOffersFn({ items, discountPercent });
      return result.data;
    } catch (error) {
      console.error('Failed to send bulk offers:', error);
      throw error;
    }
  }

  /**
   * BULK: Send offers with custom prices to multiple items
   * @param {Array} items - Array of {itemId, offerPrice, originalPrice}
   */
  async sendBulkOffersWithPrices(items: Array<{itemId: string, offerPrice: number, originalPrice: number}>): Promise<any> {
    try {
      const sendBulkOffersFn = httpsCallable(functions, 'ebaySendBulkOffersWithPrices', {
        timeout: 540000 // 9 minutes
      });
      const result = await sendBulkOffersFn({ items });
      return result.data;
    } catch (error) {
      console.error('Failed to send bulk offers with prices:', error);
      throw error;
    }
  }

  /**
   * SEND PROMOTIONAL OFFERS TO WATCHERS
   * Actually sends offers directly to buyers watching your items
   * @param {Array} items - Array of {itemId, offerPrice, message?}
   */
  async sendOffersToWatchers(items: Array<{itemId: string, offerPrice: number, message?: string}>): Promise<any> {
    try {
      const sendOffersFn = httpsCallable(functions, 'ebaySendBulkOffersToWatchers', {
        timeout: 540000 // 9 minutes
      });
      const result = await sendOffersFn({ items });
      return result.data;
    } catch (error) {
      console.error('Failed to send offers to watchers:', error);
      throw error;
    }
  }

  /**
   * Get all active buyer offers from eBay
   * Fetches Best Offers that buyers have made on your items
   * @param {string[]} itemIds - Optional array of specific item IDs to check
   */
  async getBuyerOffers(itemIds?: string[]): Promise<any> {
    try {
      const getOffersFn = httpsCallable(functions, 'ebayGetBuyerOffers', {
        timeout: 540000 // 9 minutes
      });
      const result = await getOffersFn({ itemIds });
      return result.data;
    } catch (error) {
      console.error('Failed to get buyer offers:', error);
      throw error;
    }
  }
}

/**
 * Export singleton instance
 */
export const ebayService = new EbayService();
