/**
 * Inventory Snapshot + Platform Listing types.
 *
 * InventorySnapshot — point-in-time, immutable record of "what was true on this date":
 *   total active listings + total sales captured per platform, plus refs to the
 *   SaleSnapshot rows written that run.
 *
 * PlatformListing — live row representing one listing on one platform. Upserted
 *   on every Calibrate / Sync Stock run. `lastSeenAt` is bumped each time the
 *   listing is observed; `status:'removed'` is set when a sync run no longer sees it.
 *
 * Together with the existing SaleSnapshot + CalibrationStatus + ActivityLog (extended
 *   with new event types in src/services/activityLog.ts), this forms the full
 *   inventory-tracking system.
 */

import type { SaleSnapshotPlatform } from './saleSnapshot';

export interface InventorySnapshotTotals {
  ebay: { activeListings: number; activeUnits: number; sales: number };
  poshmark: { activeListings: number; sales: number };
  depop: { activeListings: number; sales: number };
  facebook: { activeListings: number; sales: number };
  whatnot: { activeListings: number; sales: number };
}

export interface InventorySnapshot {
  id: string;
  userId: string;
  takenAt: string;                      // ISO
  reason: 'calibration' | 'sync';
  totals: InventorySnapshotTotals;
  saleSnapshotIds: string[];            // refs into SaleSnapshot for the rows written this run
  notes?: string;
}

export type PlatformListingStatus = 'active' | 'sold_out' | 'removed';

export interface PlatformListing {
  id: string;                           // listingKey: `${userId}:${platform}:${listingId}`
  userId: string;
  platform: SaleSnapshotPlatform;
  listingId: string;
  title: string;
  price?: number;                       // listing price (used for filtering out cheap/used items)
  qty?: number;                         // eBay only — Poshmark/Depop are 1-per-listing
  qtySold?: number;                     // eBay only
  status: PlatformListingStatus;
  flagged?: 'low_price';                // sub-$40 listings flagged for review/cleanup
  itemId?: string;                      // FK into local Item collection if matched
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt?: string;
  // Scraper-extracted fields used by the deterministic matcher. Persisted on every
  // Sync Stock / Calibrate run; matcher reads these to score candidates.
  description?: string;                 // Depop: ≤200 chars; Poshmark: full where available
  brand?: string;
  sizeRaw?: string;                     // raw scraper size string ("XL", "Large", "54")
  color?: string;
  category?: string;
}

/** Compute the deterministic doc id used as the primary key for PlatformListing upserts. */
export function platformListingKey(userId: string, platform: SaleSnapshotPlatform, listingId: string): string {
  return `${userId}:${platform}:${listingId}`;
}
