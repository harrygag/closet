/**
 * eBay Service Layer
 * 
 * Handles all API calls to the eBay backend
 * Provides type-safe methods for eBay operations
 */

import { EBAY_ENDPOINTS } from '../config/ebay';

/**
 * Type Definitions
 */
export interface EbayConnectionStatus {
  connected: boolean;
  hasToken: boolean;
  lastSync: string | null;
  tokenExpiry: string | null;
  timestamp: number;
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
  category: string;
  images: string[];
  status: 'active' | 'inactive' | 'sold';
  createdAt: string;
  updatedAt: string;
}

export interface EbayOrder {
  orderId: string;
  buyer: string;
  total: number;
  status: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  createdAt: string;
}

export interface SyncResult {
  success: boolean;
  total: number;
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
}

/**
 * eBay Service Class
 */
class EbayService {
  /**
   * Check eBay connection status
   * @returns {Promise<EbayConnectionStatus>} Connection status
   */
  async checkConnection(): Promise<EbayConnectionStatus> {
    try {
      const response = await fetch(EBAY_ENDPOINTS.STATUS);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to check eBay connection:', error);
      throw error;
    }
  }

  /**
   * Get eBay statistics
   * @returns {Promise<EbayStats>} eBay stats (listings, orders, revenue)
   */
  async getStats(): Promise<EbayStats> {
    try {
      const response = await fetch(EBAY_ENDPOINTS.STATS);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Not authenticated. Please connect your eBay account.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch eBay stats:', error);
      throw error;
    }
  }

  /**
   * Sync inventory from eBay
   * @returns {Promise<SyncResult>} Sync operation result
   */
  async syncInventory(): Promise<SyncResult> {
    try {
      const response = await fetch(EBAY_ENDPOINTS.IMPORT_INVENTORY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to sync inventory:', error);
      throw error;
    }
  }

  /**
   * Get all eBay listings
   * @param {Object} options - Query options (limit, offset, filter)
   * @returns {Promise<EbayListing[]>} Array of listings
   */
  async getListings(options?: {
    limit?: number;
    offset?: number;
    status?: 'active' | 'inactive' | 'sold';
  }): Promise<EbayListing[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());
      if (options?.status) params.append('status', options.status);
      
      const url = `${EBAY_ENDPOINTS.GET_LISTINGS}?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch listings:', error);
      throw error;
    }
  }

  /**
   * Get eBay orders
   * @param {Object} options - Query options (limit, offset, status)
   * @returns {Promise<EbayOrder[]>} Array of orders
   */
  async getOrders(options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<EbayOrder[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());
      if (options?.status) params.append('status', options.status);
      
      const url = `${EBAY_ENDPOINTS.GET_ORDERS}?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      throw error;
    }
  }

  /**
   * Create a new eBay listing
   * @param {Partial<EbayListing>} listing - Listing data
   * @returns {Promise<EbayListing>} Created listing
   */
  async createListing(listing: Partial<EbayListing>): Promise<EbayListing> {
    try {
      const response = await fetch(EBAY_ENDPOINTS.CREATE_LISTING, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(listing),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to create listing:', error);
      throw error;
    }
  }

  /**
   * Update an existing eBay listing
   * @param {string} sku - Listing SKU
   * @param {Partial<EbayListing>} updates - Fields to update
   * @returns {Promise<EbayListing>} Updated listing
   */
  async updateListing(sku: string, updates: Partial<EbayListing>): Promise<EbayListing> {
    try {
      const response = await fetch(`${EBAY_ENDPOINTS.UPDATE_LISTING}/${sku}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to update listing:', error);
      throw error;
    }
  }

  /**
   * Delete an eBay listing
   * @param {string} sku - Listing SKU
   * @returns {Promise<void>}
   */
  async deleteListing(sku: string): Promise<void> {
    try {
      const response = await fetch(`${EBAY_ENDPOINTS.DELETE_LISTING}/${sku}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete listing:', error);
      throw error;
    }
  }

  /**
   * Disconnect eBay account
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    try {
      const response = await fetch(EBAY_ENDPOINTS.AUTH_LOGOUT);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to disconnect eBay:', error);
      throw error;
    }
  }
}

/**
 * Export singleton instance
 */
export const ebayService = new EbayService();

