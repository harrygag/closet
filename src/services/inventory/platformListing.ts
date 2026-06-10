/**
 * PlatformListing service — current state of every listing on every platform.
 *
 * Collection: PlatformListing/{listingKey}
 *   listingKey = `${userId}:${platform}:${listingId}` (deterministic for upsert).
 *
 * - upsertListings: batched write, used by Calibrate and reconcile-mode Sync Stock.
 *   Sets firstSeenAt only on first insert; bumps lastSeenAt every call.
 * - markRemovedListings: any row whose lastSeenAt is older than the run's start
 *   timestamp gets status='removed' + removedAt set. That's how we detect
 *   listings that disappeared between syncs (likely silent sales / manual delists).
 * - getListings / getActive: simple queries for the spreadsheet view.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import {
  type PlatformListing,
  type PlatformListingStatus,
  platformListingKey,
} from '../../types/inventorySnapshot';

export { platformListingKey };
import type { SaleSnapshotPlatform } from '../../types/saleSnapshot';

const COLL = 'PlatformListing';

export interface UpsertListingInput {
  platform: SaleSnapshotPlatform;
  listingId: string;
  title: string;
  price?: number;
  qty?: number;
  qtySold?: number;
  itemId?: string;
  // 'low_price' = listing under threshold (probable junk).
  // 'backlog'   = user explicitly marked "None of these" in import flow → not in
  //               eBay inventory, treated as overstock when sync stock runs.
  flagged?: 'low_price' | 'backlog';
  // Scraper-extracted fields used by the deterministic matcher.
  description?: string;
  brand?: string;
  sizeRaw?: string;
  color?: string;
  category?: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Upsert PlatformListing rows in batches. Sets status='active' for everything written here.
 *
 * firstSeenAt is intentionally NOT in the payload — it's set exactly once by the
 * `platformListingFirstSeen` Cloud Function `onCreate` trigger when the doc is first
 * created. That preserves the original calibration baseline timestamp across all
 * subsequent Sync Stock / Calibrate runs. Only `lastSeenAt` is bumped here.
 */
export async function upsertListings(
  userId: string,
  inputs: UpsertListingInput[],
): Promise<UpsertResult> {
  if (inputs.length === 0) return { inserted: 0, updated: 0, total: 0 };

  const now = new Date().toISOString();
  let written = 0;

  const BATCH_SIZE = 400;
  for (let start = 0; start < inputs.length; start += BATCH_SIZE) {
    const slice = inputs.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const input of slice) {
      const id = platformListingKey(userId, input.platform, input.listingId);
      const payload: Record<string, unknown> = {
        userId,
        platform: input.platform,
        listingId: input.listingId,
        title: input.title,
        status: 'active' as PlatformListingStatus,
        lastSeenAt: now,
      };
      if (typeof input.price === 'number') payload.price = input.price;
      if (typeof input.qty === 'number') payload.qty = input.qty;
      if (typeof input.qtySold === 'number') payload.qtySold = input.qtySold;
      if (input.itemId) payload.itemId = input.itemId;
      if (input.flagged) payload.flagged = input.flagged;
      if (input.description) payload.description = input.description;
      if (input.brand) payload.brand = input.brand;
      if (input.sizeRaw) payload.sizeRaw = input.sizeRaw;
      if (input.color) payload.color = input.color;
      if (input.category) payload.category = input.category;
      // Always merge — works for both new (CREATE) and existing (UPDATE) docs.
      batch.set(doc(db, COLL, id), payload, { merge: true });
      written++;
    }

    await batch.commit();
  }

  return { inserted: written, updated: 0, total: written };
}

/**
 * Mark every PlatformListing whose lastSeenAt is older than the cutoff as removed.
 * Called at the end of a Sync Stock run with cutoff = run start time.
 * Returns the rows that were transitioned (so the caller can emit LISTING_REMOVED events).
 */
export async function markRemovedListings(
  userId: string,
  platform: SaleSnapshotPlatform,
  cutoffIso: string,
): Promise<PlatformListing[]> {
  // Query active rows with lastSeenAt older than cutoff.
  const q = query(
    collection(db, COLL),
    where('userId', '==', userId),
    where('platform', '==', platform),
    where('status', '==', 'active'),
  );
  const snap = await getDocs(q);
  const stale = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as PlatformListing))
    .filter(r => (r.lastSeenAt || '') < cutoffIso);

  if (stale.length === 0) return [];

  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  for (let start = 0; start < stale.length; start += BATCH_SIZE) {
    const slice = stale.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const row of slice) {
      batch.set(
        doc(db, COLL, row.id),
        { status: 'removed' as PlatformListingStatus, removedAt: now },
        { merge: true },
      );
    }
    await batch.commit();
  }

  return stale;
}

export async function getListings(
  userId: string,
  platform?: SaleSnapshotPlatform,
  status?: PlatformListingStatus,
): Promise<PlatformListing[]> {
  const filters = [where('userId', '==', userId)];
  if (platform) filters.push(where('platform', '==', platform));
  if (status) filters.push(where('status', '==', status));
  const q = query(collection(db, COLL), ...filters);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PlatformListing));
}

export async function getActiveListings(
  userId: string,
  platform?: SaleSnapshotPlatform,
): Promise<PlatformListing[]> {
  return getListings(userId, platform, 'active');
}

/**
 * Update an existing PlatformListing row's itemId field — used by the fuzzy-match
 * backfill to link rows to local Items by title similarity.
 */
export async function setListingItemId(
  userId: string,
  platform: SaleSnapshotPlatform,
  listingId: string,
  itemId: string,
): Promise<void> {
  const id = platformListingKey(userId, platform, listingId);
  const batch = writeBatch(db);
  batch.set(doc(db, COLL, id), { itemId, lastSeenAt: new Date().toISOString() }, { merge: true });
  await batch.commit();
}

/**
 * Mark listings the user explicitly identified as having NO eBay match (clicked
 * "None of these" in DepopImportModal). Upserts the row with `flagged='backlog'`
 * + `backloggedAt` so sync-stock can later treat these as overstock candidates
 * during reconciliation. Does NOT write to the Item collection — these are not
 * inventory bindings, just tracking markers.
 */
export async function markListingsAsBacklog(
  userId: string,
  inputs: Array<{
    platform: SaleSnapshotPlatform;
    listingId: string;
    title: string;
    price?: number;
    description?: string;
  }>,
): Promise<number> {
  if (inputs.length === 0) return 0;
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  let written = 0;
  for (let start = 0; start < inputs.length; start += BATCH_SIZE) {
    const slice = inputs.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const input of slice) {
      const id = platformListingKey(userId, input.platform, input.listingId);
      const payload: Record<string, unknown> = {
        userId,
        platform: input.platform,
        listingId: input.listingId,
        title: input.title,
        status: 'active' as PlatformListingStatus,
        flagged: 'backlog',
        backloggedAt: now,
        // Explicitly clear any prior itemId — the user said this listing has no match.
        itemId: null,
        lastSeenAt: now,
      };
      if (typeof input.price === 'number') payload.price = input.price;
      if (input.description) payload.description = input.description;
      batch.set(doc(db, COLL, id), payload, { merge: true });
      written++;
    }
    await batch.commit();
  }
  return written;
}

/**
 * Bulk-update multiple PlatformListing rows' itemId fields in batches.
 */
export async function bulkSetListingItemIds(
  userId: string,
  updates: Array<{ platform: SaleSnapshotPlatform; listingId: string; itemId: string }>,
): Promise<number> {
  if (updates.length === 0) return 0;
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  let written = 0;
  for (let start = 0; start < updates.length; start += BATCH_SIZE) {
    const slice = updates.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const u of slice) {
      const id = platformListingKey(userId, u.platform, u.listingId);
      batch.set(doc(db, COLL, id), { itemId: u.itemId, lastSeenAt: now }, { merge: true });
    }
    await batch.commit();
    written += slice.length;
  }
  return written;
}
