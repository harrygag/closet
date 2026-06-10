/**
 * Activity Logging Service
 *
 * Tracks all user actions for analytics and audit trail
 */

import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
import { app } from '../lib/firebase/client';

const db = getFirestore(app);

export type ActivityType =
  | 'QR_PRINT'
  | 'PRICE_MARKDOWN'
  | 'MARK_SOLD'
  | 'SALE_CREATED'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DELETED'
  | 'EBAY_IMPORT'
  | 'ITEM_CLONED'
  | 'OFFER_SENT'
  | 'CHECK_IN'
  | 'PRICE_INCREASE'
  | 'PRICE_DECREASE'
  | 'SCAN'
  // ── Inventory tracking system (Calibrate + Sync Stock) ──
  | 'CALIBRATION_RUN'
  | 'SYNC_RUN'
  | 'SALE_DETECTED'
  | 'LISTING_ADDED'
  | 'LISTING_REMOVED';

interface ActivityLogBase {
  userId: string;
  activityType: ActivityType;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface QRPrintActivity extends ActivityLogBase {
  activityType: 'QR_PRINT';
  itemIds: string[];
  itemLinks: string[]; // Array of item detail URLs
  labelSize: string;
  itemCount: number;
}

interface PriceMarkdownActivity extends ActivityLogBase {
  activityType: 'PRICE_MARKDOWN';
  itemId: string;
  itemName: string;
  itemLink: string; // Link to item detail page
  oldPrice: number; // cents
  newPrice: number; // cents
  discountPercent: number;
}

interface MarkSoldActivity extends ActivityLogBase {
  activityType: 'MARK_SOLD';
  itemId: string;
  itemName: string;
  itemLink: string; // Link to item detail page
  finalPrice: number; // cents
  ebayUrl?: string;
}

interface SaleCreatedActivity extends ActivityLogBase {
  activityType: 'SALE_CREATED';
  saleId: string;
  itemId: string;
  itemName: string;
  salePrice: number; // cents
  marketplace: string;
  profit: number; // cents
}

interface ItemCreatedActivity extends ActivityLogBase {
  activityType: 'ITEM_CREATED';
  itemId: string;
  itemName: string;
  source: 'manual' | 'ebay_import' | 'clone';
}

interface ItemUpdatedActivity extends ActivityLogBase {
  activityType: 'ITEM_UPDATED';
  itemId: string;
  itemName: string;
  changes: string[];
}

interface EbayImportActivity extends ActivityLogBase {
  activityType: 'EBAY_IMPORT';
  itemCount: number;
  successCount: number;
  failCount: number;
}

interface CheckInActivity extends ActivityLogBase {
  activityType: 'CHECK_IN';
  itemId: string;
  itemName: string;
  itemBarcode?: string;
  itemLink: string;
  ebayUrl?: string;
  ebayListingId?: string;
}

interface PriceIncreaseActivity extends ActivityLogBase {
  activityType: 'PRICE_INCREASE';
  itemId: string;
  itemName: string;
  itemLink: string;
  oldPrice: number; // cents
  newPrice: number; // cents
  increasePercent: number;
}

interface PriceDecreaseActivity extends ActivityLogBase {
  activityType: 'PRICE_DECREASE';
  itemId: string;
  itemName: string;
  itemLink: string;
  oldPrice: number; // cents
  newPrice: number; // cents
  decreasePercent: number;
}

interface OfferSentActivity extends ActivityLogBase {
  activityType: 'OFFER_SENT';
  itemId?: string;
  itemName?: string;
  recipientCount?: number;
  originalPrice?: number; // cents
  offerPrice?: number; // cents
  discountPercent?: number;
}

interface ScanActivity extends ActivityLogBase {
  activityType: 'SCAN';
  itemId: string;
  itemName: string;
  itemBarcode?: string;
  itemLink: string;
  ebayUrl?: string;
  ebayListingId?: string;
  scanMethod: 'QR' | 'BARCODE' | 'URL';
}

export type ActivityLog =
  | QRPrintActivity
  | PriceMarkdownActivity
  | MarkSoldActivity
  | ItemCreatedActivity
  | ItemUpdatedActivity
  | EbayImportActivity
  | CheckInActivity
  | PriceIncreaseActivity
  | PriceDecreaseActivity
  | OfferSentActivity
  | ScanActivity;

/**
 * Generate item detail page URL
 */
function getItemLink(itemId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/items/${itemId}`;
}

/**
 * Log QR code printing activity
 */
export async function logQRPrint(
  userId: string,
  itemIds: string[],
  labelSize: string
): Promise<void> {
  try {
    const itemLinks = itemIds.map(id => getItemLink(id));

    const activity: Omit<QRPrintActivity, 'timestamp'> = {
      userId,
      activityType: 'QR_PRINT',
      itemIds,
      itemLinks,
      labelSize,
      itemCount: itemIds.length
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged QR print: ${itemIds.length} items, ${labelSize}`);
  } catch (error) {
    console.error('Failed to log QR print activity:', error);
  }
}

/**
 * Log price markdown activity
 */
export async function logPriceMarkdown(
  userId: string,
  itemId: string,
  itemName: string,
  oldPrice: number,
  newPrice: number,
  discountPercent: number
): Promise<void> {
  try {
    const activity: Omit<PriceMarkdownActivity, 'timestamp'> = {
      userId,
      activityType: 'PRICE_MARKDOWN',
      itemId,
      itemName,
      itemLink: getItemLink(itemId),
      oldPrice,
      newPrice,
      discountPercent
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged price markdown: ${itemName} ${oldPrice} → ${newPrice}`);
  } catch (error) {
    console.error('Failed to log price markdown activity:', error);
  }
}

/**
 * Log mark as sold activity
 */
export async function logMarkSold(
  userId: string,
  itemId: string,
  itemName: string,
  finalPrice: number,
  ebayUrl?: string
): Promise<void> {
  try {
    const activity: Omit<MarkSoldActivity, 'timestamp'> = {
      userId,
      activityType: 'MARK_SOLD',
      itemId,
      itemName,
      itemLink: getItemLink(itemId),
      finalPrice,
      ebayUrl
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged mark sold: ${itemName} at ${finalPrice}`);
  } catch (error) {
    console.error('Failed to log mark sold activity:', error);
  }
}

/**
 * Log sale creation activity
 */
export async function logSaleCreated(
  userId: string,
  saleId: string,
  itemId: string,
  itemName: string,
  salePrice: number,
  marketplace: string,
  profit: number
): Promise<void> {
  try {
    const activity: Omit<SaleCreatedActivity, 'timestamp'> = {
      userId,
      activityType: 'SALE_CREATED',
      saleId,
      itemId,
      itemName,
      salePrice,
      marketplace,
      profit
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged sale created: ${itemName} at ${salePrice} on ${marketplace}`);
  } catch (error) {
    console.error('Failed to log sale created activity:', error);
  }
}

/**
 * Log item creation activity
 */
export async function logItemCreated(
  userId: string,
  itemId: string,
  itemName: string,
  source: 'manual' | 'ebay_import' | 'clone'
): Promise<void> {
  try {
    const activity: Omit<ItemCreatedActivity, 'timestamp'> = {
      userId,
      activityType: 'ITEM_CREATED',
      itemId,
      itemName,
      source
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged item created: ${itemName} via ${source}`);
  } catch (error) {
    console.error('Failed to log item created activity:', error);
  }
}

/**
 * Log item update activity
 */
export async function logItemUpdated(
  userId: string,
  itemId: string,
  itemName: string,
  changes: string[]
): Promise<void> {
  try {
    const activity: Omit<ItemUpdatedActivity, 'timestamp'> = {
      userId,
      activityType: 'ITEM_UPDATED',
      itemId,
      itemName,
      changes
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged item updated: ${itemName}, changes: ${changes.join(', ')}`);
  } catch (error) {
    console.error('Failed to log item updated activity:', error);
  }
}

/**
 * Log eBay import activity
 */
export async function logEbayImport(
  userId: string,
  itemCount: number,
  successCount: number,
  failCount: number
): Promise<void> {
  try {
    const activity: Omit<EbayImportActivity, 'timestamp'> = {
      userId,
      activityType: 'EBAY_IMPORT',
      itemCount,
      successCount,
      failCount
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged eBay import: ${successCount}/${itemCount} successful`);
  } catch (error) {
    console.error('Failed to log eBay import activity:', error);
  }
}

/**
 * Log check-in activity
 */
export async function logCheckIn(
  userId: string,
  itemId: string,
  itemName: string,
  itemBarcode?: string,
  ebayUrl?: string,
  ebayListingId?: string
): Promise<void> {
  try {
    const activity: Omit<CheckInActivity, 'timestamp'> = {
      userId,
      activityType: 'CHECK_IN',
      itemId,
      itemName,
      itemBarcode,
      itemLink: getItemLink(itemId),
      ebayUrl,
      ebayListingId
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged check-in: ${itemName}`);
  } catch (error) {
    console.error('Failed to log check-in activity:', error);
  }
}

/**
 * Log price increase activity
 */
export async function logPriceIncrease(
  userId: string,
  itemId: string,
  itemName: string,
  oldPrice: number,
  newPrice: number,
  increasePercent: number
): Promise<void> {
  try {
    const activity: Omit<PriceIncreaseActivity, 'timestamp'> = {
      userId,
      activityType: 'PRICE_INCREASE',
      itemId,
      itemName,
      itemLink: getItemLink(itemId),
      oldPrice,
      newPrice,
      increasePercent
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged price increase: ${itemName} ${oldPrice} → ${newPrice} (+${increasePercent}%)`);
  } catch (error) {
    console.error('Failed to log price increase activity:', error);
  }
}

/**
 * Log price decrease activity
 */
export async function logPriceDecrease(
  userId: string,
  itemId: string,
  itemName: string,
  oldPrice: number,
  newPrice: number,
  decreasePercent: number
): Promise<void> {
  try {
    const activity: Omit<PriceDecreaseActivity, 'timestamp'> = {
      userId,
      activityType: 'PRICE_DECREASE',
      itemId,
      itemName,
      itemLink: getItemLink(itemId),
      oldPrice,
      newPrice,
      decreasePercent
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged price decrease: ${itemName} ${oldPrice} → ${newPrice} (-${decreasePercent}%)`);
  } catch (error) {
    console.error('Failed to log price decrease activity:', error);
  }
}

/**
 * Log scan activity
 */
export async function logScan(
  userId: string,
  itemId: string,
  itemName: string,
  scanMethod: 'QR' | 'BARCODE' | 'URL',
  itemBarcode?: string,
  ebayUrl?: string,
  ebayListingId?: string
): Promise<void> {
  try {
    const activity: Omit<ScanActivity, 'timestamp'> = {
      userId,
      activityType: 'SCAN',
      itemId,
      itemName,
      itemBarcode,
      itemLink: getItemLink(itemId),
      ebayUrl,
      ebayListingId,
      scanMethod
    };

    await addDoc(collection(db, 'ActivityLog'), {
      ...activity,
      timestamp: Timestamp.now()
    });

    console.log(`✓ Logged scan: ${itemName} via ${scanMethod}`);
  } catch (error) {
    console.error('Failed to log scan activity:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory tracking — calibration / sync run / per-listing events
// These are append-only audit-log entries written by Calibrate + Sync Stock.
// All metadata goes through the generic `metadata` field on ActivityLogBase
// so Firestore doesn't need new indexes for each event type.
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryRunTotals {
  ebay:     { activeListings: number; activeUnits: number; sales: number };
  poshmark: { activeListings: number; sales: number };
  depop:    { activeListings: number; sales: number };
  facebook: { activeListings: number; sales: number };
  whatnot:  { activeListings: number; sales: number };
}

export async function logCalibrationRun(
  userId: string,
  metadata: {
    snapshotId: string;
    totals: InventoryRunTotals;
    salesInserted: number;
    salesSkipped: number;
    listingsUpserted: number;
    unmatchedByPlatform: { ebay: number; poshmark: number; depop: number; facebook?: number };
    durationMs: number;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'ActivityLog'), {
      userId,
      activityType: 'CALIBRATION_RUN' as ActivityType,
      timestamp: Timestamp.now(),
      metadata,
    });
    console.log('✓ Logged CALIBRATION_RUN', metadata.snapshotId);
  } catch (error) {
    console.error('Failed to log CALIBRATION_RUN:', error);
  }
}

export async function logSyncRun(
  userId: string,
  metadata: {
    snapshotId: string;
    totals: InventoryRunTotals;
    newSalesDetected: number;
    listingsAdded: number;
    listingsRemoved: number;
    durationMs: number;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'ActivityLog'), {
      userId,
      activityType: 'SYNC_RUN' as ActivityType,
      timestamp: Timestamp.now(),
      metadata,
    });
    console.log('✓ Logged SYNC_RUN', metadata.snapshotId);
  } catch (error) {
    console.error('Failed to log SYNC_RUN:', error);
  }
}

export async function logSaleDetected(
  userId: string,
  metadata: {
    platform: 'ebay' | 'poshmark' | 'depop' | 'facebook' | 'whatnot';
    listingId: string;
    saleKey: string;
    itemId?: string;
    salePrice?: number;
    soldAt?: string;
    saleSnapshotId: string;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'ActivityLog'), {
      userId,
      activityType: 'SALE_DETECTED' as ActivityType,
      timestamp: Timestamp.now(),
      metadata,
    });
  } catch (error) {
    console.error('Failed to log SALE_DETECTED:', error);
  }
}

export async function logListingAdded(
  userId: string,
  metadata: {
    platform: 'ebay' | 'poshmark' | 'depop';
    listingId: string;
    title: string;
    itemId?: string;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'ActivityLog'), {
      userId,
      activityType: 'LISTING_ADDED' as ActivityType,
      timestamp: Timestamp.now(),
      metadata,
    });
  } catch (error) {
    console.error('Failed to log LISTING_ADDED:', error);
  }
}

export async function logListingRemoved(
  userId: string,
  metadata: {
    platform: 'ebay' | 'poshmark' | 'depop';
    listingId: string;
    title: string;
    lastSeenAt: string;
    itemId?: string;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'ActivityLog'), {
      userId,
      activityType: 'LISTING_REMOVED' as ActivityType,
      timestamp: Timestamp.now(),
      metadata,
    });
  } catch (error) {
    console.error('Failed to log LISTING_REMOVED:', error);
  }
}
