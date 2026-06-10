/**
 * Sale Snapshot Service — Firestore CRUD for the baseline-tracking sale log.
 *
 * Collections:
 *   SaleSnapshot/{entryId}                — append-only log of sold listings per platform
 *   CalibrationStatus/{userId}            — single doc per user tracking per-platform confirm state
 *
 * The first call to writeSnapshotBatch() with status='baseline' establishes the baseline.
 * Subsequent Sync Stock runs call writeSnapshotBatch() with status='pending' for any
 * sale whose saleKey isn't already in the snapshot — those land as user-actionable items
 * in the spreadsheet view.
 */

import { collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import type {
  SaleSnapshotEntry,
  SaleSnapshotPlatform,
  SaleSnapshotStatus,
  CalibrationStatus,
  PlatformCalibrationStatus,
} from '../../types/saleSnapshot';

const SNAPSHOT_COLL = 'SaleSnapshot';
const CALIBRATION_COLL = 'CalibrationStatus';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getSnapshot(
  userId: string,
  platform?: SaleSnapshotPlatform,
  status?: SaleSnapshotStatus,
): Promise<SaleSnapshotEntry[]> {
  const filters = [where('userId', '==', userId)];
  if (platform) filters.push(where('platform', '==', platform));
  if (status) filters.push(where('status', '==', status));
  const q = query(collection(db, SNAPSHOT_COLL), ...filters);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleSnapshotEntry));
}

export async function getSnapshotKeySet(
  userId: string,
  platform: SaleSnapshotPlatform,
): Promise<Set<string>> {
  const entries = await getSnapshot(userId, platform);
  return new Set(entries.map(e => e.saleKey));
}

export async function getCalibrationStatus(userId: string): Promise<CalibrationStatus> {
  const ref = doc(db, CALIBRATION_COLL, userId);
  const snap = await getDoc(ref);
  const empty: PlatformCalibrationStatus = { platform: 'ebay', isConfirmed: false };
  if (!snap.exists()) {
    return {
      userId,
      ebay: { ...empty, platform: 'ebay' },
      poshmark: { ...empty, platform: 'poshmark' },
      depop: { ...empty, platform: 'depop' },
      facebook: { ...empty, platform: 'facebook' },
      whatnot: { ...empty, platform: 'whatnot' },
      fullyCalibrated: false,
    };
  }
  const data = snap.data() as Partial<CalibrationStatus>;
  return {
    userId,
    ebay: data.ebay ?? { ...empty, platform: 'ebay' },
    poshmark: data.poshmark ?? { ...empty, platform: 'poshmark' },
    depop: data.depop ?? { ...empty, platform: 'depop' },
    facebook: data.facebook ?? { ...empty, platform: 'facebook' },
    whatnot: data.whatnot ?? { ...empty, platform: 'whatnot' },
    fullyCalibrated: data.fullyCalibrated ?? false,
    fullyCalibratedAt: data.fullyCalibratedAt,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface SnapshotInput {
  platform: SaleSnapshotPlatform;
  saleKey: string;
  listingId: string;
  title: string;
  soldAt?: string;
  salePrice?: number;
  scrapeIndex?: number;
  poshOrderStatus?: string;
  depopOrderStatus?: string;
  imageUrl?: string;
}



/**
 * Write multiple entries in batches. Skips entries whose saleKey is already in the
 * snapshot for that platform — only writes new ones.
 *
 * @param status  status to apply to NEW entries (defaults to 'baseline')
 * @returns       counts of inserted/skipped + the inserted document IDs (used by
 *                InventorySnapshot to record which SaleSnapshot rows it captured)
 */
export interface WriteSnapshotBatchResult {
  inserted: number;
  skipped: number;
  perPlatform: Record<SaleSnapshotPlatform, number>;
  insertedIds: string[];
  insertedByPlatform: Record<SaleSnapshotPlatform, string[]>;
}

export async function writeSnapshotBatch(
  userId: string,
  inputs: SnapshotInput[],
  status: SaleSnapshotStatus = 'baseline',
): Promise<WriteSnapshotBatchResult> {
  if (inputs.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      perPlatform: { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 },
      insertedIds: [],
      insertedByPlatform: { ebay: [], poshmark: [], depop: [], facebook: [], whatnot: [] },
    };
  }

  // Build per-platform dedup sets — primary by saleKey (deterministic), fallback
  // by content fingerprint (title|YYYY-MM-DD|price). The content fallback catches
  // duplicates when the import source's saleKey shape doesn't match the original
  // baseline import shape (e.g. CSV-imported baseline vs extension-scrape refresh
  // produce different saleKey formats for the same physical sale). Without this,
  // a refresh that legitimately matches a baseline sale by content would still
  // get inserted as a new 'pending' row.
  // saleKey-only dedup. Title matching is NOT used (user feedback: "just do
  // listings - baseline, don't even match the titles"). Per-platform slicing
  // to "only the most-recent N scrape rows where N = scrape_count - existing"
  // happens upstream in syncRecentSoldItems before this is called, so by the
  // time inputs arrive here, the only safety net needed is "did this exact
  // saleKey already land?".
  const platformsTouched: SaleSnapshotPlatform[] = Array.from(new Set(inputs.map(i => i.platform)));
  const existing: Map<SaleSnapshotPlatform, Set<string>> = new Map();
  for (const p of platformsTouched) {
    const entries = await getSnapshot(userId, p);
    existing.set(p, new Set(entries.map(e => e.saleKey)));
    console.log(`[writeSnapshotBatch] ${p}: ${entries.length} existing rows · saleKey-only dedup`);
  }

  const now = new Date().toISOString();
  const perPlatform: Record<SaleSnapshotPlatform, number> = { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 };
  const insertedIds: string[] = [];
  const insertedByPlatform: Record<SaleSnapshotPlatform, string[]> = { ebay: [], poshmark: [], depop: [], facebook: [], whatnot: [] };
  let inserted = 0;
  let skipped = 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let opsInBatch = 0;

  for (const input of inputs) {
    const seen = existing.get(input.platform);
    if (seen?.has(input.saleKey)) {
      skipped++;
      continue;
    }
    const entryRef = doc(collection(db, SNAPSHOT_COLL));
    const entry: Omit<SaleSnapshotEntry, 'id'> = {
      userId,
      platform: input.platform,
      saleKey: input.saleKey,
      listingId: input.listingId,
      title: input.title,
      soldAt: input.soldAt,
      salePrice: input.salePrice,
      scrapeIndex: input.scrapeIndex,
      poshOrderStatus: input.poshOrderStatus,
      depopOrderStatus: input.depopOrderStatus,
      imageUrl: input.imageUrl,
      status,
      firstSeenAt: now,
      lastSeenAt: now,
    };
    // Strip undefined fields (Firestore rejects them).
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (v !== undefined) clean[k] = v;
    }
    batch.set(entryRef, clean);
    seen?.add(input.saleKey);
    // NOTE: we do NOT decrement existingTitleCount here. Multiset dedup is
    // resolved by the count of EXISTING (DB) rows only — newly-inserted pending
    // rows don't consume baseline capacity. Re-running Refresh with stable
    // scrape data correctly inserts zero new rows because the saleKey check
    // skips within-DB-already-pending duplicates.
    if (inserted < 5) {
      console.log(`[writeSnapshotBatch] inserting (no match): saleKey=${input.saleKey} · title="${(input.title || '').slice(0, 60)}" · price=${input.salePrice}`);
    }
    inserted++;
    perPlatform[input.platform]++;
    insertedIds.push(entryRef.id);
    insertedByPlatform[input.platform].push(entryRef.id);
    opsInBatch++;
    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  return { inserted, skipped, perPlatform, insertedIds, insertedByPlatform };
}

/**
 * Re-stamp scrape-derived display fields (`scrapeIndex`, `poshOrderStatus`) on
 * existing poshmark SaleSnapshot rows from a fresh (orderId → meta) map produced
 * by the latest sold-sales scrape.
 *
 * Why scrapeIndex: Poshmark's My-Sales page shifts every row down when a new sale
 * arrives, so every previously-recorded `scrapeIndex` becomes stale.
 * `writeSnapshotBatch` dedupes by saleKey and SKIPS existing rows (correctly) —
 * but that means the old rows keep their now-wrong scrapeIndex while the new
 * rows insert with scrapeIndex 0,1,… → widget collisions.
 *
 * Why poshOrderStatus: Poshmark order rows mutate over their lifecycle
 * ("Sold" → "In Transit" → "Order Complete", or "In Transit" → "Order Cancelled").
 * Same skip-on-dedup problem — without re-stamping, statuses freeze at whatever
 * they were the day the row first landed.
 *
 * Merge-only: writes ONLY the keys whose values are defined in `meta` AND differ
 * from the current row value. Skips the row entirely if no field changed. Never
 * touches status, soldAt, title, salePrice, etc. Baseline rows are also re-stamped
 * — both fields are display state, not part of the baseline truth.
 *
 * Returns the number of rows updated.
 */
export interface PoshmarkScrapeMeta {
  scrapeIndex?: number;
  poshOrderStatus?: string;
}

export async function refreshPoshmarkFromScrape(
  userId: string,
  orderIdToMeta: Map<string, PoshmarkScrapeMeta>,
): Promise<number> {
  if (orderIdToMeta.size === 0) return 0;
  const q = query(
    collection(db, SNAPSHOT_COLL),
    where('userId', '==', userId),
    where('platform', '==', 'poshmark'),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const ORDER_ID_RE = /poshmark:order:([a-f0-9]+)/i;
  const pendingUpdates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const d of snap.docs) {
    const r = d.data() as Record<string, unknown>;
    const explicit = (r.orderId ?? r.order_id) as string | undefined;
    let orderId = explicit ? String(explicit) : '';
    if (!orderId) {
      const saleKey = String(r.saleKey ?? '');
      const m = saleKey.match(ORDER_ID_RE);
      if (m) orderId = m[1];
    }
    if (!orderId) continue;
    const meta = orderIdToMeta.get(orderId);
    if (!meta) continue;

    const patch: Record<string, unknown> = {};
    if (
      meta.scrapeIndex !== undefined &&
      Number.isFinite(meta.scrapeIndex) &&
      r.scrapeIndex !== meta.scrapeIndex
    ) {
      patch.scrapeIndex = meta.scrapeIndex;
    }
    if (
      meta.poshOrderStatus !== undefined &&
      meta.poshOrderStatus !== '' &&
      r.poshOrderStatus !== meta.poshOrderStatus
    ) {
      patch.poshOrderStatus = meta.poshOrderStatus;
    }
    if (Object.keys(patch).length === 0) continue;
    pendingUpdates.push({ id: d.id, patch });
  }

  if (pendingUpdates.length === 0) return 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let opsInBatch = 0;
  let updated = 0;
  for (const u of pendingUpdates) {
    batch.set(doc(db, SNAPSHOT_COLL, u.id), u.patch, { merge: true });
    opsInBatch++;
    updated++;
    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
  return updated;
}

/**
 * Re-stamp `depopOrderStatus` on existing depop SaleSnapshot rows from a fresh
 * (orderId → meta) map produced by the latest receipts scrape.
 *
 * Why: Depop receipts mutate over their lifecycle ("paid" → "shipped" →
 * "completed", or "shipped" → "refunded"). writeSnapshotBatch dedupes by
 * saleKey and SKIPS existing rows (correctly) — without re-stamping, statuses
 * freeze at whatever they were the day the row first landed.
 *
 * Depop saleKey format (built in syncRecentSoldItems / ClosetView):
 *   `depop:{purchaseId}:{id}` (primary) or `depop:{id|purchaseId}:{index}` (fallback)
 * — so the FIRST segment after `depop:` is the order id (`purchaseId`).
 *
 * Merge-only: writes ONLY when `depopOrderStatus` is defined in `meta` AND
 * differs from the current row value. Skips the row entirely if nothing
 * changed. Never touches status, soldAt, title, salePrice, etc. Baseline rows
 * are also re-stamped — this is display state, not part of the baseline truth.
 *
 * Returns the number of rows updated.
 */
export async function refreshDepopFromScrape(
  userId: string,
  orderIdToMeta: Map<string, { depopOrderStatus?: string }>,
): Promise<number> {
  if (orderIdToMeta.size === 0) return 0;
  const q = query(
    collection(db, SNAPSHOT_COLL),
    where('userId', '==', userId),
    where('platform', '==', 'depop'),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Depop saleKey shape: `depop:{purchaseId}:{id}` — first segment after the
  // platform prefix is the order id. Match permissively (anything that isn't a
  // colon) to handle both numeric and string purchaseIds.
  const ORDER_ID_RE = /^depop:([^:]+):/i;
  const pendingUpdates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const d of snap.docs) {
    const r = d.data() as Record<string, unknown>;
    const explicit = (r.purchaseId ?? r.orderId ?? r.order_id) as string | undefined;
    let orderId = explicit ? String(explicit) : '';
    if (!orderId) {
      const saleKey = String(r.saleKey ?? '');
      const m = saleKey.match(ORDER_ID_RE);
      if (m) orderId = m[1];
    }
    if (!orderId) continue;
    const meta = orderIdToMeta.get(orderId);
    if (!meta) continue;

    const patch: Record<string, unknown> = {};
    if (
      meta.depopOrderStatus !== undefined &&
      meta.depopOrderStatus !== '' &&
      r.depopOrderStatus !== meta.depopOrderStatus
    ) {
      patch.depopOrderStatus = meta.depopOrderStatus;
    }
    if (Object.keys(patch).length === 0) continue;
    pendingUpdates.push({ id: d.id, patch });
  }

  if (pendingUpdates.length === 0) return 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let opsInBatch = 0;
  let updated = 0;
  for (const u of pendingUpdates) {
    batch.set(doc(db, SNAPSHOT_COLL, u.id), u.patch, { merge: true });
    opsInBatch++;
    updated++;
    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
  return updated;
}

/**
 * Back-compat thin wrapper around `refreshPoshmarkFromScrape`. Old callers that
 * only know about scrapeIndex keep working unchanged — the map gets wrapped into
 * the richer meta shape and passed through. Prefer the new function for new code.
 */
export async function refreshPoshmarkScrapeIndex(
  userId: string,
  orderIdToIndex: Map<string, number>,
): Promise<number> {
  if (orderIdToIndex.size === 0) return 0;
  const wrapped = new Map<string, PoshmarkScrapeMeta>();
  for (const [orderId, idx] of orderIdToIndex) {
    wrapped.set(orderId, { scrapeIndex: idx });
  }
  return refreshPoshmarkFromScrape(userId, wrapped);
}

/**
 * Delete every SaleSnapshot row for (userId, platform) that is NOT a baseline row.
 *
 * Used to recover when a refresh wrote `pending` rows that should have been
 * deduped against existing baseline rows but weren't (saleKey shape mismatch
 * between the original baseline import path and the extension scrape path).
 *
 * Baseline rows are NEVER touched — they have `status === 'baseline'` and are
 * filtered out of the delete set. After this runs, `getSnapshot(userId, platform)`
 * returns only the locked baseline.
 *
 * Returns the count of deleted rows so the caller can confirm + toast.
 */
export async function deleteNonBaselineRows(
  userId: string,
  platform: SaleSnapshotPlatform,
): Promise<number> {
  const rows = await getSnapshot(userId, platform);
  const toDelete = rows.filter(r => r.status !== 'baseline');
  if (toDelete.length === 0) return 0;
  const { writeBatch, deleteDoc, doc } = await import('firebase/firestore');
  const BATCH_SIZE = 400;
  let deleted = 0;
  for (let start = 0; start < toDelete.length; start += BATCH_SIZE) {
    const slice = toDelete.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const r of slice) {
      batch.delete(doc(db, SNAPSHOT_COLL, r.id));
    }
    await batch.commit();
    deleted += slice.length;
  }
  // unused-import guard — deleteDoc is exported by the dynamic import but we use writeBatch
  // for atomic delete chunks. Keep the import for clarity in case future hot-fix wants it.
  void deleteDoc;
  return deleted;
}

/**
 * Mark a pending sale as applied. There is NO separate "reconciled" limbo: once
 * a sale is matched + applied (eBay decremented, Item re-baselined) it IS part
 * of the calibration floor, so it becomes `baseline`. `reconciledAt` is kept
 * purely as an audit timestamp. (Legacy `reconciled` rows are migrated by
 * scripts/_migrate-reconciled-to-baseline.ts and treated as baseline on read.)
 */
export async function markCounted(entryId: string): Promise<void> {
  await setDoc(
    doc(db, SNAPSHOT_COLL, entryId),
    { status: 'baseline' as SaleSnapshotStatus, reconciledAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function markUncounted(entryId: string): Promise<void> {
  await setDoc(
    doc(db, SNAPSHOT_COLL, entryId),
    { status: 'pending' as SaleSnapshotStatus, reconciledAt: null, needsCancelAt: null },
    { merge: true },
  );
}

/**
 * Flip a `pending` row → `needs_cancel`: this non-eBay order was oversold (the
 * unit already sold on eBay) and must be cancelled. Status flip + audit only —
 * never deletes, never touches baseline rows, never writes Item fields. Reverse
 * with markUncounted() if the user mis-taps.
 */
export async function markNeedsCancel(entryId: string, itemId?: string): Promise<void> {
  await setDoc(
    doc(db, SNAPSHOT_COLL, entryId),
    {
      status: 'needs_cancel' as SaleSnapshotStatus,
      needsCancelAt: new Date().toISOString(),
      ...(itemId ? { itemId } : {}),
      notes: 'oversold-needs-cancel (sold on eBay + Depop)',
    },
    { merge: true },
  );
}

/**
 * Explicit user "Restock" after a cancellation. Two writes:
 *   1) SaleSnapshot row: annotate with `restockedAt` + a `notes` marker. The
 *      row's `status` stays as-is (typically `needs_cancel`) so the audit
 *      trail is preserved — this is additive, not a status flip.
 *   2) Item doc: re-baseline back to the given quantity (default 1), mark
 *      IN_STOCK, clear ebayDelisted. Mirrors the inverse of the reconcile
 *      decrement in SaleReconcileModal.tsx (lines 391–401).
 *
 * Both writes run in parallel via Promise.all. Errors bubble up to the caller
 * (which surfaces them via the existing toast pattern).
 */
export async function restockItem(entryId: string, itemId: string, quantity = 1): Promise<void> {
  const iso = new Date().toISOString();
  await Promise.all([
    setDoc(
      doc(db, SNAPSHOT_COLL, entryId),
      { restockedAt: iso, notes: 'restocked-after-cancel' },
      { merge: true },
    ),
    updateDoc(doc(db, 'Item', itemId), {
      ebayQuantity: quantity,
      physicalQuantity: quantity,
      ebayQuantityAtBaseline: quantity,
      physicalQuantityAtBaseline: quantity,
      baselineCalibratedAt: iso,
      status: 'IN_STOCK',
      ebayDelisted: false,
      stockStatus: 'IN_STOCK',
      updatedAt: serverTimestamp(),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Calibration status writes
// ---------------------------------------------------------------------------

export async function confirmPlatformCount(
  userId: string,
  platform: SaleSnapshotPlatform,
  confirmedCount: number,
): Promise<void> {
  const current = await getCalibrationStatus(userId);
  const updated: PlatformCalibrationStatus = {
    platform,
    isConfirmed: true,
    confirmedCount,
    confirmedAt: new Date().toISOString(),
  };
  const merged: CalibrationStatus = {
    ...current,
    [platform]: { ...current[platform], ...updated },
  };
  // NOTE: Whatnot is intentionally NOT required here. It was added after the
  // baseline was calibrated and the user has no Whatnot sales yet, so its
  // isConfirmed is always false — requiring it would make fullyCalibrated
  // permanently false for everyone (regression). Calibration tracks the
  // platforms that existed at baseline: eBay/Poshmark/Depop/Facebook.
  merged.fullyCalibrated = merged.ebay.isConfirmed && merged.poshmark.isConfirmed && merged.depop.isConfirmed && merged.facebook.isConfirmed;
  if (merged.fullyCalibrated && !merged.fullyCalibratedAt) {
    merged.fullyCalibratedAt = new Date().toISOString();
  }
  // Strip undefined fields recursively — Firestore rejects them.
  const clean = stripUndefined(merged);
  await setDoc(doc(db, CALIBRATION_COLL, userId), clean, { merge: true });
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
  if (typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}

export async function recordBaselineSnapshot(
  userId: string,
  platform: SaleSnapshotPlatform,
  baselineCount: number,
): Promise<void> {
  await setDoc(
    doc(db, CALIBRATION_COLL, userId),
    {
      [platform]: {
        baselineSnapshotAt: new Date().toISOString(),
        baselineCount,
      },
    },
    { merge: true },
  );
}

export async function resetCalibration(userId: string): Promise<void> {
  // Wipes calibration status. Does NOT delete SaleSnapshot entries — those persist as history.
  await setDoc(doc(db, CALIBRATION_COLL, userId), {
    userId,
    ebay: { platform: 'ebay', isConfirmed: false },
    poshmark: { platform: 'poshmark', isConfirmed: false },
    depop: { platform: 'depop', isConfirmed: false },
    facebook: { platform: 'facebook', isConfirmed: false },
    whatnot: { platform: 'whatnot', isConfirmed: false },
    fullyCalibrated: false,
    resetAt: serverTimestamp(),
  });
}
