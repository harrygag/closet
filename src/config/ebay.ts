/**
 * eBay API Configuration
 * 
 * Centralized configuration for eBay integration
 * Uses environment variables for different deployment environments
 */

/**
 * Get eBay API base URL from environment
 * Falls back to localhost for development
 */
export const EBAY_API_BASE_URL = 
  import.meta.env.VITE_EBAY_API_URL || 
  'http://localhost:3002';

/**
 * eBay API Endpoints
 * All endpoints used in the application
 */
export const EBAY_ENDPOINTS = {
  // Authentication
  AUTH_CONNECT: `${EBAY_API_BASE_URL}/auth/ebay`,
  AUTH_CALLBACK: `${EBAY_API_BASE_URL}/auth/ebay/callback`,
  AUTH_LOGOUT: `${EBAY_API_BASE_URL}/auth/logout`,
  
  // Status & Stats
  STATUS: `${EBAY_API_BASE_URL}/api/ebay/status`,
  STATS: `${EBAY_API_BASE_URL}/api/ebay/stats`,
  
  // Inventory Operations
  IMPORT_INVENTORY: `${EBAY_API_BASE_URL}/api/ebay/import/inventory`,
  TEST_INVENTORY: `${EBAY_API_BASE_URL}/api/ebay/test/inventory`,
  SYNC_INVENTORY: `${EBAY_API_BASE_URL}/api/ebay/sync`,
  
  // Listing Management
  GET_LISTINGS: `${EBAY_API_BASE_URL}/api/ebay/listings`,
  CREATE_LISTING: `${EBAY_API_BASE_URL}/api/ebay/listings/create`,
  UPDATE_LISTING: `${EBAY_API_BASE_URL}/api/ebay/listings/update`,
  DELETE_LISTING: `${EBAY_API_BASE_URL}/api/ebay/listings/delete`,
  
  // Orders
  GET_ORDERS: `${EBAY_API_BASE_URL}/api/ebay/orders`,
  GET_ORDER: `${EBAY_API_BASE_URL}/api/ebay/orders/:id`,
  
  // Analytics
  GET_ANALYTICS: `${EBAY_API_BASE_URL}/api/ebay/analytics`,
  GET_TRAFFIC: `${EBAY_API_BASE_URL}/api/ebay/analytics/traffic`,
} as const;

/**
 * OAuth Configuration
 */
export const OAUTH_CONFIG = {
  POPUP_WIDTH: 600,
  POPUP_HEIGHT: 700,
  POPUP_TITLE: 'eBay OAuth',
  
  // Message types for cross-window communication
  MESSAGE_TYPES: {
    AUTH_SUCCESS: 'EBAY_AUTH_SUCCESS',
    AUTH_FAILED: 'EBAY_AUTH_FAILED',
    AUTH_CANCELLED: 'EBAY_AUTH_CANCELLED',
  },
  
  // LocalStorage keys
  STORAGE_KEYS: {
    AUTH_COMPLETE: 'ebay_auth_complete',
    LAST_SYNC: 'ebay_last_sync',
  },
  
  // BroadcastChannel name
  BROADCAST_CHANNEL: 'ebay_auth',
} as const;

/**
 * Polling Configuration
 */
export const POLLING_CONFIG = {
  STATUS_INTERVAL: 30000, // 30 seconds
  STATS_INTERVAL: 60000,  // 1 minute
} as const;

/**
 * Feature Flags
 * Enable/disable features for different environments
 */
export const FEATURES = {
  ENABLE_AUTO_SYNC: true,
  ENABLE_ANALYTICS: true,
  ENABLE_BULK_OPERATIONS: true,
  ENABLE_ADVANCED_FILTERS: true,
} as const;

