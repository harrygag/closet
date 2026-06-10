/**
 * eBay import → restock onboarding.
 *
 * The user's stock model (load-bearing):
 *   real_stock = ebayQty
 *              − Σ(non-eBay Posh/Depop sales since baseline)
 *              − (eBay qty decrease since baseline)
 * measured per-Item from a known-good snapshot:
 *   Item.ebayQuantityAtBaseline / physicalQuantityAtBaseline / baselineCalibratedAt.
 *
 * User insight: when they (re-)import eBay listings, that eBay quantity is almost
 * always a *fresh restock count* — they physically restocked and updated eBay.
 * So an eBay import must be treated as a RESTOCK: re-baseline the affected Items
 * to the freshly-imported eBay qty and stamp `baselineCalibratedAt = now`, so the
 * model measures FUTURE sales from this restock point — not from the stale old
 * calibration (which would keep subtracting old pending sales against a quantity
 * that has since been restocked).
 *
 * Pending-SaleSnapshot handling: a restocked item's existing `pending`
 * Poshmark/Depop rows predate the restock and were already accounted for when the
 * user set the new eBay qty. Leaving them `pending` would let the reconcile flow
 * subtract them AGAIN against the fresh count → double-subtraction. We therefore
 * flip those `pending` rows → `reconciled` (status flip + audit notes), stamping
 * `itemId`. Baseline rows are NEVER touched (baseline immutability has burned this
 * project repeatedly). Already-`reconciled` rows are left as-is.
 *
 * Mirrors the per-item baseline write shape from ClosetView.handleCalibrateBaseline
 * and SaleReconcileModal.handleSubmit exactly (same field names, same batch pattern,
 * Firebase v9 modular SDK).
 */

import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { getSnapshot } from '../inventory/saleSnapshot';
import type { SaleSnapshotEntry } from '../../types/saleSnapshot';

const ITEM_BATCH = 400;

export interface RestockTarget {
  /** Firestore Item doc id */
  id: string;
  /** Freshly-imported eBay quantity = the restock count */
  ebayQty: number;
  /** Poshmark listing id bound to this Item (for pending-row matching), if any */
  poshmarkListingId?: string;
  /** Depop listing id bound to this Item (for pending-row matching), if any */
  depopListingId?: string;
}

export interface RestockOnboardResult {
  itemsRebaselined: number;
  pendingRowsReconciled: number;
}

/**
 * Re-baseline the given Items to their freshly-imported eBay quantity and flip any
 * predating `pending` SaleSnapshot rows for those Items to `reconciled`.
 *
 * Idempotent / re-runnable: re-importing simply re-baselines to the latest eBay qty
 * again and reconciles any newly-appeared pending rows. Already-reconciled and
 * baseline rows are untouched.
 *
 * Best-effort: callers should not let a failure here fail the import itself.
 */
export async function onboardImportsAsRestock(
  userId: string,
  targets: RestockTarget[],
): Promise<RestockOnboardResult> {
  if (targets.length === 0) {
    return { itemsRebaselined: 0, pendingRowsReconciled: 0 };
  }

  const db = getFirestore(app);
  const baselineIso = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Re-baseline each target Item — mirror handleCalibrateBaseline exactly.
  //    ebayQuantityAtBaseline = physicalQuantityAtBaseline = the restock count.
  // ---------------------------------------------------------------------------
  let itemsRebaselined = 0;
  for (let start = 0; start < targets.length; start += ITEM_BATCH) {
    const slice = targets.slice(start, start + ITEM_BATCH);
    const batch = writeBatch(db);
    for (const t of slice) {
      const qty = Math.max(0, typeof t.ebayQty === 'number' ? t.ebayQty : 0);
      batch.update(doc(db, 'Item', t.id), {
        ebayQuantityAtBaseline: qty,
        physicalQuantityAtBaseline: qty,
        baselineCalibratedAt: baselineIso,
      });
      itemsRebaselined++;
    }
    await batch.commit();
  }

  // ---------------------------------------------------------------------------
  // 2. Flip predating `pending` SaleSnapshot rows for these Items → reconciled.
  //
  //    Query by userId only (no composite index needed) and filter client-side —
  //    the (userId, platform, status) compound where requires a Firestore
  //    composite index that doesn't exist; without it the SDK throws silently.
  //    (Same workaround SaleReconcileModal + LastSoldWidget already use.)
  // ---------------------------------------------------------------------------
  let pendingRowsReconciled = 0;

  // Map every platform-listing-id we restocked → its Item id, so pending rows
  // (which carry listingId, not itemId) can be attributed.
  const listingIdToItem = new Map<string, string>();
  const restockedItemIds = new Set<string>();
  for (const t of targets) {
    restockedItemIds.add(t.id);
    if (t.poshmarkListingId) listingIdToItem.set(String(t.poshmarkListingId), t.id);
    if (t.depopListingId) listingIdToItem.set(String(t.depopListingId), t.id);
  }

  let all: SaleSnapshotEntry[] = [];
  try {
    all = await getSnapshot(userId);
  } catch {
    // If we can't read the snapshot, the re-baseline above still stands —
    // surface zero reconciled rather than throw.
    return { itemsRebaselined, pendingRowsReconciled: 0 };
  }

  const pending = all.filter(r => r.status === 'pending');
  const toFlip: Array<{ row: SaleSnapshotEntry; itemId: string }> = [];
  for (const row of pending) {
    // Attribute the row to a restocked Item by:
    //  (a) an already-stamped itemId that we just restocked, or
    //  (b) its listingId matching a restocked Item's posh/depop listing id.
    const rowItemId = (row as { itemId?: string }).itemId;
    let itemId: string | undefined;
    if (rowItemId && restockedItemIds.has(rowItemId)) {
      itemId = rowItemId;
    } else if (row.listingId && listingIdToItem.has(String(row.listingId))) {
      itemId = listingIdToItem.get(String(row.listingId));
    }
    if (itemId) toFlip.push({ row, itemId });
  }

  for (let start = 0; start < toFlip.length; start += ITEM_BATCH) {
    const slice = toFlip.slice(start, start + ITEM_BATCH);
    const batch = writeBatch(db);
    for (const { row, itemId } of slice) {
      // Status flip only — never delete; baseline rows are filtered out above.
      batch.set(
        doc(db, 'SaleSnapshot', row.id),
        {
          status: 'reconciled',
          reconciledAt: baselineIso,
          itemId,
          notes: 'restock-auto-reconciled (eBay import re-baseline)',
        },
        { merge: true },
      );
      pendingRowsReconciled++;
    }
    await batch.commit();
  }

  return { itemsRebaselined, pendingRowsReconciled };
}
