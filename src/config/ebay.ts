/**
 * eBay API Configuration
 * 
 * Centralized configuration for eBay integration
 * Uses environment variables for different deployment environments
 */

/**
 * Firebase Cloud Functions base URL for eBay API
 */
export const FIREBASE_FUNCTIONS_URL = 'https://us-central1-closet-da8f2.cloudfunctions.net';

/**
 * Legacy base URL (for local development only)
 */
export const EBAY_API_BASE_URL =
  import.meta.env.VITE_EBAY_API_URL ||
  FIREBASE_FUNCTIONS_URL;

/**
 * eBay API Endpoints - Using Firebase Cloud Functions
 * All endpoints used in the application
 */
export const EBAY_ENDPOINTS = {
  // Authentication - Firebase Cloud Functions
  AUTH_CONNECT: `${FIREBASE_FUNCTIONS_URL}/ebayOAuthUrl`,
  AUTH_CALLBACK: `${FIREBASE_FUNCTIONS_URL}/ebayCallback`,
  AUTH_LOGOUT: `${FIREBASE_FUNCTIONS_URL}/ebayDisconnect`,

  // Status & Stats
  STATUS: `${FIREBASE_FUNCTIONS_URL}/ebayStatus`,
  STATS: `${FIREBASE_FUNCTIONS_URL}/ebayStatus`,

  // Inventory Operations
  IMPORT_INVENTORY: `${FIREBASE_FUNCTIONS_URL}/ebayFetchInventory`,
  TEST_INVENTORY: `${FIREBASE_FUNCTIONS_URL}/ebayFetchInventory`,
  SYNC_INVENTORY: `${FIREBASE_FUNCTIONS_URL}/ebaySyncListings`,

  // Listing Management
  GET_LISTINGS: `${FIREBASE_FUNCTIONS_URL}/ebaySyncListings`,
  CREATE_LISTING: `${FIREBASE_FUNCTIONS_URL}/ebaySyncListings`,
  UPDATE_LISTING: `${FIREBASE_FUNCTIONS_URL}/ebaySyncListings`,
  DELETE_LISTING: `${FIREBASE_FUNCTIONS_URL}/ebaySyncListings`,

  // Orders
  GET_ORDERS: `${FIREBASE_FUNCTIONS_URL}/ebayGetOrders`,
  GET_ORDER: `${FIREBASE_FUNCTIONS_URL}/ebayGetOrders`,

  // Analytics
  GET_ANALYTICS: `${FIREBASE_FUNCTIONS_URL}/ebayStatus`,
  GET_TRAFFIC: `${FIREBASE_FUNCTIONS_URL}/ebayStatus`,
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

