/**
 * Sale Snapshot — baseline tracking for Sync Stock reconciliation.
 *
 * Each entry represents one sold listing on a marketplace. Status states:
 *   baseline    — Captured at calibration. Already accounted for in current eBay qty.
 *                 Should NOT decrement stock further.
 *   pending     — A new sale detected post-calibration. Needs user review.
 *                 Will eventually be promoted to 'reconciled' (counted) or dropped.
 *   reconciled  — User confirmed this new sale was applied (eBay qty already updated for it).
 *
 * Firestore path: SaleSnapshot/{entryId}
 * Dedupe key (saleKey): same composite keys we already compute in the extension —
 *   Depop:    `${purchaseId}:${listingId}` or `${purchaseId}-${bundleIndex}` for bundles
 *   Poshmark: `order:{orderId}` or `listing:{id}:{date}` fallback
 *   eBay:     `${itemId}:${transactionId}` (if we track eBay sales here)
 */

export type SaleSnapshotPlatform = 'ebay' | 'poshmark' | 'depop' | 'facebook' | 'whatnot';
/**
 * needs_cancel — an oversold order: the unit already sold on eBay, so this
 * non-eBay sale can't be fulfilled and the buyer's order must be cancelled
 * (with a replacement-or-refund message). Like a terminal `reconciled` it is
 * NOT `pending`, so the reconcile flow will NOT decrement eBay stock for it
 * (the eBay sale already consumed the unit). Never auto-deleted.
 */
export type SaleSnapshotStatus = 'baseline' | 'pending' | 'reconciled' | 'needs_cancel';

export interface SaleSnapshotEntry {
  id: string;
  userId: string;
  platform: SaleSnapshotPlatform;
  saleKey: string;
  listingId: string;
  title: string;
  soldAt?: string;
  salePrice?: number;
  /** DOM scrape position from Poshmark's sold list (0 = top = newest). Used to
   *  render rows in Poshmark's real page order instead of the unreliable
   *  ObjectId-derived soldAt. Optional — only newly-scraped Poshmark rows have it. */
  scrapeIndex?: number;
  /** Raw Poshmark order_status string from the marketplaceData scrape (e.g.
   *  "Order Complete", "In Transit", "Sold"). Poshmark-only, additive display
   *  field — does NOT replace `status` (baseline/pending/needs_cancel). Optional
   *  because older rows + non-poshmark rows don't have it. */
  poshOrderStatus?: string;
  /** Raw Depop order_status string from the receipt scrape (e.g. "shipped",
   *  "completed", "refunded", "cancelled", "dispute"). Depop-only, additive
   *  display field — does NOT replace `status` (baseline/pending/needs_cancel).
   *  Optional because older rows + non-depop rows don't have it. */
  depopOrderStatus?: string;
  // Picture URL captured at sale-detection time. Optional because baseline rows
  // were written before this field existed — only newly-detected pending rows
  // get an image. Widgets render gracefully when missing.
  imageUrl?: string;
  status: SaleSnapshotStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  reconciledAt?: string;
  /** Stamped when a row is attributed to an Item (reconcile / restock / needs-cancel). */
  itemId?: string;
  /** Stamped when status flips to needs_cancel (oversold → cancel the order). */
  needsCancelAt?: string;
  /** ISO timestamp set when the user explicitly restocked the item after a
   *  cancellation. Optional, additive — when present, this row no longer
   *  counts as a consumption event in oversold detection. Status is left
   *  unchanged (audit-preserving). */
  restockedAt?: string;
  notes?: string;
}

export interface PlatformCalibrationStatus {
  platform: SaleSnapshotPlatform;
  isConfirmed: boolean;
  confirmedCount?: number;
  confirmedAt?: string;
  baselineSnapshotAt?: string;
  baselineCount?: number;
}

export interface CalibrationStatus {
  userId: string;
  ebay: PlatformCalibrationStatus;
  poshmark: PlatformCalibrationStatus;
  depop: PlatformCalibrationStatus;
  facebook: PlatformCalibrationStatus;
  whatnot: PlatformCalibrationStatus;
  fullyCalibrated: boolean;
  fullyCalibratedAt?: string;
}
