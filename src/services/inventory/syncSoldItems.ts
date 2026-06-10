/**
 * Sync recent sold items from marketplaceData into SaleSnapshot as `'pending'` rows.
 *
 * Use case: the LastSoldWidget's Refresh button. The user clicks Refresh → we open
 * the platform's sold-items page so the extension scrapes → after a delay we call
 * this function, which:
 *
 *   1. Reads `marketplaceData/{candidate doc ids}` (mirrors DepopIntegrationPage's
 *      resolution chain so we land on whatever doc the extension wrote).
 *   2. Filters sold listings.
 *   3. Builds `SnapshotInput[]` with image URL when present.
 *   4. Calls `writeSnapshotBatch(... 'pending')` — which **already** dedupes against
 *      ALL existing saleKeys (baseline + pending + reconciled), so the locked
 *      baseline is never re-written and we only insert genuinely-new sales.
 *
 * Baseline preservation: writeSnapshotBatch's dedup is cross-status (see
 * `getSnapshotKeySet` in saleSnapshot.ts) — the function returns `Set<saleKey>` for
 * all rows of the platform regardless of status, so `'pending'` writes that match a
 * baseline saleKey are skipped. The user's baseline stays exactly as captured.
 */

import { doc, getDoc, getFirestore, collection, getDocs } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { writeSnapshotBatch, refreshPoshmarkFromScrape, refreshDepopFromScrape, type SnapshotInput, type WriteSnapshotBatchResult, type PoshmarkScrapeMeta } from './saleSnapshot';
import { getDepopListingImage } from '../depop/extractors';
import type { SaleSnapshotPlatform } from '../../types/saleSnapshot';

const db = getFirestore(app);

interface ResolvedSyncData {
  data: Record<string, any>;
  docId: string;
}

// --- sold-doc resolution helpers ---------------------------------------------
function listingsOf(data: any): any[] { return Array.isArray(data?.listings) ? data.listings : []; }
function soldCountOf(data: any): number {
  return listingsOf(data).filter(
    (l) => l?.sold === true || l?._soldFromAPI || l?.status === 'sold' || l?.status === 'SOLD' || l?.sold_date_iso,
  ).length;
}
function syncedMsOf(data: any): number {
  const ts = data?.syncedAt ?? data?.lastSync;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') { const d = ts.toDate(); return d ? d.getTime() : 0; }
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isNaN(n) ? 0 : n; }
  return 0;
}
// Backups/snapshots we must never resolve as live sold data.
function isBackupDocId(id: string): boolean { return /_bak$|backup|prewipe|prerestore|clobbered/i.test(id); }

async function resolveDepopSyncData(_userId: string): Promise<ResolvedSyncData | null> {
  // Pick the FRESHEST `depop_sold*` doc that ACTUALLY contains sold rows.
  //
  // Why not a fixed doc id: the extension's scrape username is unreliable — the
  // same account's sold scrape has landed under the numeric id
  // (`depop_sold_265732668`), the handle, the junk value `depop_sold_products`,
  // and even double-prefixed (`depop_sold_depop_sold_265732668`). A fixed-id
  // lookup misses whichever one the latest scrape used.
  //
  // Why we must NOT fall back to the active-listings doc (`265732668`): it holds
  // ~170 ACTIVE rows with 0 sold, so the old candidate chain returned it and the
  // sold filter found nothing → "no new sales" even right after a real sale.
  // Requiring soldCount > 0 structurally excludes the active doc.
  try {
    const all = await getDocs(collection(db, 'marketplaceData'));
    let best: { data: any; docId: string; t: number } | null = null;
    for (const d of all.docs) {
      if (!d.id.toLowerCase().startsWith('depop_sold')) continue;
      if (isBackupDocId(d.id)) continue;
      const data = d.data() as any;
      if (data.platform && data.platform !== 'depop') continue;
      if (soldCountOf(data) === 0) continue;
      const t = syncedMsOf(data);
      if (!best || t > best.t) best = { data, docId: d.id, t };
    }
    if (best) {
      console.log(`[resolveDepopSyncData] freshest sold doc: ${best.docId} (${soldCountOf(best.data)} sold, synced ${new Date(best.t).toISOString()})`);
      return { data: best.data, docId: best.docId };
    }
  } catch (e) {
    console.warn('[resolveDepopSyncData] scan failed:', e);
  }
  console.warn('[resolveDepopSyncData] no depop_sold* doc with sold rows found');
  return null;
}

async function resolvePoshmarkSyncData(userId: string): Promise<ResolvedSyncData | null> {
  // Poshmark sold items land at `marketplaceData/poshmark_sold_{username}` — the
  // extension writes there from /order/sales. Active listings go to the legacy
  // `{userId}` doc. Try the sold-specific docs first, then legacy fallbacks.
  const userIdentifiers: string[] = [userId];
  // Known username fallback — observed in logs: poshmark_sold_retrothriftc0
  for (const id of ['retrothriftc0', 'retrothriftco']) {
    if (!userIdentifiers.includes(id)) userIdentifiers.push(id);
  }

  const candidateDocIds: string[] = [];
  for (const id of userIdentifiers) candidateDocIds.push(`poshmark_sold_${id}`);
  for (const id of userIdentifiers) candidateDocIds.push(id);

  for (const docId of candidateDocIds) {
    try {
      const snap = await getDoc(doc(db, 'marketplaceData', docId));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (!data.platform || data.platform === 'poshmark') {
          if (Array.isArray(data.listings) && data.listings.length > 0) {
            return { data, docId };
          }
        }
      }
    } catch {}
  }
  try {
    const subSnap = await getDoc(doc(db, 'users', userId, 'marketplaceData', 'sync'));
    if (subSnap.exists()) {
      const data = subSnap.data() as any;
      if (!data.platform || data.platform === 'poshmark') return { data, docId: 'subcollection' };
    }
  } catch {}
  // Last resort: scan for any `poshmark_sold_*` doc with listings, then any
  // poshmark-tagged doc with listings.
  try {
    const all = await getDocs(collection(db, 'marketplaceData'));
    for (const docSnap of all.docs) {
      if (!docSnap.id.startsWith('poshmark_sold_')) continue;
      const data = docSnap.data() as any;
      if (Array.isArray(data.listings) && data.listings.length > 0) {
        return { data, docId: docSnap.id };
      }
    }
    for (const docSnap of all.docs) {
      const data = docSnap.data() as any;
      if (data.platform === 'poshmark' && Array.isArray(data.listings) && data.listings.length > 0) {
        return { data, docId: docSnap.id };
      }
    }
  } catch {}
  return null;
}

/**
 * Read marketplaceData and write any newly-detected sold items to SaleSnapshot as
 * 'pending'. Returns the writeSnapshotBatch result so the caller can toast counts.
 *
 * Baseline rows are NEVER overwritten — the dedup in writeSnapshotBatch sees a
 * matching saleKey and skips the insert. Only genuinely-new sales land.
 */
export async function syncRecentSoldItems(
  userId: string,
  platform: SaleSnapshotPlatform,
): Promise<WriteSnapshotBatchResult> {
  if (platform === 'ebay') {
    // eBay sold items come through the eBay API sync (handleReconciliationFromSyncData),
    // not the extension. Return empty to be safe — the widget's Refresh button is
    // disabled for eBay anyway.
    return {
      inserted: 0,
      skipped: 0,
      perPlatform: { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 },
      insertedIds: [],
      insertedByPlatform: { ebay: [], poshmark: [], depop: [], facebook: [], whatnot: [] },
    };
  }

  const resolved = platform === 'depop'
    ? await resolveDepopSyncData(userId)
    : await resolvePoshmarkSyncData(userId);

  if (!resolved) {
    console.warn(`[syncRecentSoldItems] no marketplaceData found for ${platform}`);
    return {
      inserted: 0,
      skipped: 0,
      perPlatform: { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 },
      insertedIds: [],
      insertedByPlatform: { ebay: [], poshmark: [], depop: [], facebook: [], whatnot: [] },
    };
  }

  const listings: any[] = Array.isArray(resolved.data.listings) ? resolved.data.listings : [];
  console.log(`[syncRecentSoldItems] ${platform}: ${listings.length} total listings at marketplaceData/${resolved.docId}`);

  const inputs: SnapshotInput[] = [];

  if (platform === 'depop') {
    for (const item of listings) {
      const sold = item?.sold || item?._soldFromAPI || item?.status === 'sold' || item?.status === 'SOLD';
      if (!sold) continue;
      // Cancelled/refunded sales DO enter SaleSnapshot as consumption events —
      // user rule: a cancelled order leaves the item OOS until an explicit
      // Restock action. The depopOrderStatus field tells the UI it's cancelled.
      const purchaseId = String(item._purchaseId || item.purchaseId || '');
      const id = String(item.id || item.slug || '');
      if (!id && !purchaseId) continue;
      const saleKey = purchaseId && id ? `depop:${purchaseId}:${id}` : `depop:${id || purchaseId}:${inputs.length}`;
      const imageUrl = getDepopListingImage(item) || undefined;
      inputs.push({
        platform: 'depop',
        saleKey,
        listingId: id || purchaseId,
        title: String(item.title || item.description || '(no title)'),
        soldAt: item._soldDate || item.soldDate,
        salePrice: typeof item._soldPrice === 'number' ? item._soldPrice
                  : typeof item.soldPrice === 'number' ? item.soldPrice
                  : undefined,
        depopOrderStatus: item.order_status,
        imageUrl,
      });
    }
  } else if (platform === 'poshmark') {
    for (const row of listings) {
      const sold = row?.sold || row?.status === 'sold' || row?.status === 'SOLD' || row?.sold_date_iso;
      if (!sold) continue;
      // Cancelled/refunded sales DO enter SaleSnapshot as consumption events —
      // user rule: a cancelled order leaves the item OOS until an explicit
      // Restock action. The poshOrderStatus field tells the UI it's cancelled.
      const orderId = String(row.order_id || row.orderId || '');
      const listingId = String(row.listing_id || row.listingId || row.id || '');
      const saleKey = orderId
        ? `poshmark:order:${orderId}`
        : listingId
          ? `poshmark:listing:${listingId}:${row.sold_date_iso || inputs.length}`
          : `poshmark:row:${inputs.length}`;
      // Poshmark scraper image fields vary; try common ones.
      const imageUrl: string | undefined =
        row.cover_shot?.url ||
        row.coverShot?.url ||
        row.imageUrl ||
        (Array.isArray(row.pictures) && row.pictures[0]) ||
        (Array.isArray(row.images) && row.images[0]) ||
        undefined;
      inputs.push({
        platform: 'poshmark',
        saleKey,
        listingId: listingId || orderId,
        title: String(row.title || row.description || '(no title)'),
        scrapeIndex: row.scrape_index,
        poshOrderStatus: row.order_status,
        soldAt: row.sold_date_iso ?? row.sold_date ?? row.soldDate,
        salePrice: typeof row.sale_price === 'number' ? row.sale_price
                  : typeof row.salePrice === 'number' ? row.salePrice
                  : undefined,
        imageUrl,
      });
    }
  }

  if (inputs.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      perPlatform: { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 },
      insertedIds: [],
      insertedByPlatform: { ebay: [], poshmark: [], depop: [], facebook: [], whatnot: [] },
    };
  }

  // Pass ALL scraped sales to writeSnapshotBatch — it dedupes by saleKey
  // against every existing row (baseline / pending / reconciled / needs_cancel),
  // so only genuinely-new orders insert as `pending`. The old count-based slice
  // (`inputs.length − existingTotal`) capped new rows to a tiny number and
  // dropped ~all of a 312-order scrape (it wrongly assumed existingTotal ==
  // true-sold count). Removed: Poshmark/Depop saleKeys are stable & unique per
  // order (`poshmark:order:{id}` / `depop:{purchaseId}:{id}`), so saleKey dedup
  // alone is correct and can't re-insert duplicates.
  console.log(`[syncRecentSoldItems] ${platform}: scrape=${inputs.length} → saleKey-dedupe (no count slice)`);
  const result = await writeSnapshotBatch(userId, inputs, 'pending');
  console.log(`[syncRecentSoldItems] ${platform}: inserted=${result.inserted} skipped=${result.skipped} (skipped = matched existing baseline/pending/reconciled rows)`);

  // Self-heal scrapeIndex on EXISTING poshmark rows. When a new sale arrives at
  // the top of Poshmark's My-Sales page, every existing row's scrape_index
  // shifts. writeSnapshotBatch dedupes by saleKey and skips existing rows, so
  // without this step the old rows keep their stale scrapeIndex and collide
  // with the freshly-inserted ones (multiple rows sharing scrapeIndex 0/1 →
  // widget order jumbles). The poshmark scrape itself is the source of truth.
  if (platform === 'poshmark') {
    try {
      const orderIdToMeta = new Map<string, PoshmarkScrapeMeta>();
      for (const row of listings) {
        const orderId = String(row?.order_id || row?.orderId || '');
        const idx = row?.scrape_index;
        if (!orderId) continue;
        const meta: PoshmarkScrapeMeta = {};
        if (Number.isFinite(idx)) meta.scrapeIndex = idx as number;
        if (row?.order_status) meta.poshOrderStatus = String(row.order_status);
        if (meta.scrapeIndex === undefined && meta.poshOrderStatus === undefined) continue;
        orderIdToMeta.set(orderId, meta);
      }
      const refreshed = await refreshPoshmarkFromScrape(userId, orderIdToMeta);
      console.log(`[syncRecentSoldItems][poshmark] refreshed scrapeIndex/poshOrderStatus on ${refreshed} existing rows`);
    } catch (err) {
      console.warn('[syncRecentSoldItems][poshmark] refreshPoshmarkFromScrape failed (non-fatal):', err);
    }
  }

  // Self-heal depopOrderStatus on EXISTING depop rows. Depop receipt status
  // mutates over the order lifecycle ("paid" → "shipped" → "completed", or
  // "shipped" → "refunded"). writeSnapshotBatch dedupes by saleKey and skips
  // existing rows, so without this step the old rows keep their stale status.
  // The depop scrape itself is the source of truth. Keying: the saleKey first
  // segment is `_purchaseId`, so the map MUST use `_purchaseId` to align with
  // refreshDepopFromScrape's regex extraction (`/^depop:([^:]+):/`).
  if (platform === 'depop') {
    try {
      const orderIdToMeta = new Map<string, { depopOrderStatus?: string }>();
      for (const row of listings) {
        const orderId = String(row?._purchaseId || row?.purchaseId || row?.order_id || row?.orderId || row?.id || '');
        if (!orderId) continue;
        if (row?.order_status) orderIdToMeta.set(orderId, { depopOrderStatus: String(row.order_status) });
      }
      const refreshed = await refreshDepopFromScrape(userId, orderIdToMeta);
      console.log(`[syncRecentSoldItems][depop] refreshed depopOrderStatus on ${refreshed} existing rows`);
    } catch (err) {
      console.warn('[syncRecentSoldItems][depop] refreshDepopFromScrape failed (non-fatal):', err);
    }
  }

  // Per-platform breakdown so the user can see exactly which platform got new rows.
  for (const p of Object.keys(result.perPlatform) as Array<keyof typeof result.perPlatform>) {
    const n = result.perPlatform[p];
    if (n > 0) console.log(`[syncRecentSoldItems]   ${p}: +${n} new`);
  }
  return result;
}
