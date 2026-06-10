import { getFirestore, doc, updateDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import type { Item } from '../../types/item';

const db = getFirestore(app);

const ITEM_ACTIVITY_CAP = 50;

// --- Helpers ---

function cappedAppend<T>(arr: T[], entry: T, cap: number): T[] {
  const updated = [...arr, entry];
  if (updated.length > cap) {
    return updated.slice(updated.length - cap);
  }
  return updated;
}

// --- Core Functions ---

export async function reconcileGroupAvailability(
  linkedGroupId: string,
  _userId: string
): Promise<{ canonicalQty: number; actions: string[] }> {
  const actions: string[] = [];

  // Load all items in this linked group from Firestore
  const q = query(
    collection(db, 'Item'),
    where('linkedGroupId', '==', linkedGroupId)
  );
  const snapshot = await getDocs(q);
  const groupItems: (Item & { id: string })[] = [];
  snapshot.forEach((docSnap) => {
    groupItems.push({ id: docSnap.id, ...docSnap.data() } as Item & { id: string });
  });

  if (groupItems.length === 0) {
    return { canonicalQty: 0, actions: ['No items found for group'] };
  }

  // Find anchor
  const anchor = groupItems.find((i) => i.linkedGroupRole === 'anchor');
  if (!anchor) {
    actions.push(`WARNING: No anchor found for group ${linkedGroupId}`);
    return { canonicalQty: 0, actions };
  }

  const canonicalQty = anchor.canonicalQty ?? anchor.physicalQuantity ?? anchor.ebayQuantity ?? 1;

  // If canonical is 0, mark all items SOLD
  if (canonicalQty <= 0) {
    for (const item of groupItems) {
      if (item.stockStatus !== 'SOLD' || item.status !== 'SOLD') {
        const activity = cappedAppend(item.itemActivity ?? [], {
          action: 'STATUS_CHANGE',
          timestamp: new Date().toISOString(),
          details: `Reconciled to SOLD: canonical quantity is 0`,
          oldValue: item.stockStatus ?? 'IN_STOCK',
          newValue: 'SOLD',
        }, ITEM_ACTIVITY_CAP);

        await updateDoc(doc(db, 'Item', item.id), {
          stockStatus: 'SOLD',
          status: 'SOLD',
          itemActivity: activity,
        });
        actions.push(`Marked ${item.id} (${item.name}) as SOLD`);
      }
    }
    return { canonicalQty: 0, actions };
  }

  // For each child, check platform-specific quantity
  for (const item of groupItems) {
    if (item.linkedGroupRole === 'anchor') continue;

    // Determine the relevant platform quantity for this child
    let platformQty: number | undefined;
    let platformLabel = '';

    if (item.ebayListingId || item.ebayItemId) {
      platformQty = item.ebayQuantity;
      platformLabel = 'ebay';
    } else if (item.poshmarkListingId) {
      platformQty = item.poshmarkQuantity;
      platformLabel = 'poshmark';
    } else if (item.depopListingId) {
      platformQty = item.depopQuantity;
      platformLabel = 'depop';
    }

    if (platformQty !== undefined && platformQty <= 0 && canonicalQty > 0) {
      if (item.stockStatus !== 'OUT_OF_STOCK') {
        const activity = cappedAppend(item.itemActivity ?? [], {
          action: 'STATUS_CHANGE',
          timestamp: new Date().toISOString(),
          details: `Reconciled to OUT_OF_STOCK: ${platformLabel} qty is 0 but canonical > 0`,
          oldValue: item.stockStatus ?? 'IN_STOCK',
          newValue: 'OUT_OF_STOCK',
        }, ITEM_ACTIVITY_CAP);

        await updateDoc(doc(db, 'Item', item.id), {
          stockStatus: 'OUT_OF_STOCK',
          itemActivity: activity,
        });
        actions.push(`Marked ${item.id} (${item.name}) as OUT_OF_STOCK on ${platformLabel}`);
      }
    } else if (platformQty !== undefined && platformQty > 0 && item.stockStatus === 'OUT_OF_STOCK') {
      // Platform qty restored but still marked out of stock — fix it
      const activity = cappedAppend(item.itemActivity ?? [], {
        action: 'STATUS_CHANGE',
        timestamp: new Date().toISOString(),
        details: `Reconciled to IN_STOCK: ${platformLabel} qty is ${platformQty}`,
        oldValue: 'OUT_OF_STOCK',
        newValue: 'IN_STOCK',
      }, ITEM_ACTIVITY_CAP);

      await updateDoc(doc(db, 'Item', item.id), {
        stockStatus: 'IN_STOCK',
        itemActivity: activity,
      });
      actions.push(`Restored ${item.id} (${item.name}) to IN_STOCK on ${platformLabel}`);
    }
  }

  return { canonicalQty, actions };
}

export async function auditAllGroups(
  _userId: string,
  items: Item[]
): Promise<{
  totalGroups: number;
  inconsistencies: Array<{
    linkedGroupId: string;
    issue: string;
    severity: 'critical' | 'warning';
  }>;
}> {
  const inconsistencies: Array<{
    linkedGroupId: string;
    issue: string;
    severity: 'critical' | 'warning';
  }> = [];

  // Group items by linkedGroupId
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.linkedGroupId) continue;
    const existing = groups.get(item.linkedGroupId);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.linkedGroupId, [item]);
    }
  }

  for (const [groupId, groupItems] of groups) {
    // Check: missing anchor
    const anchors = groupItems.filter((i) => i.linkedGroupRole === 'anchor');
    if (anchors.length === 0) {
      inconsistencies.push({
        linkedGroupId: groupId,
        issue: `No anchor found in group (${groupItems.length} items)`,
        severity: 'critical',
      });
      continue; // Can't do further checks without anchor
    }

    if (anchors.length > 1) {
      inconsistencies.push({
        linkedGroupId: groupId,
        issue: `Multiple anchors found (${anchors.length}), expected exactly 1`,
        severity: 'critical',
      });
    }

    const anchor = anchors[0];
    const canonicalQty = anchor.canonicalQty ?? anchor.physicalQuantity ?? anchor.ebayQuantity ?? 1;

    // Check: SOLD items with qty > 0
    for (const item of groupItems) {
      const isSold = item.stockStatus === 'SOLD' || item.status === 'SOLD';
      if (isSold && canonicalQty > 0) {
        inconsistencies.push({
          linkedGroupId: groupId,
          issue: `Item ${item.id} (${item.name}) is SOLD but canonical qty is ${canonicalQty}`,
          severity: 'critical',
        });
      }
    }

    // Check: canonical qty is 0 but items are not marked SOLD
    if (canonicalQty <= 0) {
      for (const item of groupItems) {
        if (item.stockStatus !== 'SOLD' && item.status !== 'SOLD') {
          inconsistencies.push({
            linkedGroupId: groupId,
            issue: `Item ${item.id} (${item.name}) has canonical qty 0 but status is ${item.stockStatus ?? item.status}`,
            severity: 'warning',
          });
        }
      }
    }

    // Check: platform qty exceeds canonical qty
    for (const item of groupItems) {
      if (item.linkedGroupRole === 'anchor') continue;

      const ebayQty = item.ebayQuantity ?? 0;
      const poshQty = item.poshmarkQuantity ?? 0;
      const depopQty = item.depopQuantity ?? 0;

      if (ebayQty > canonicalQty) {
        inconsistencies.push({
          linkedGroupId: groupId,
          issue: `Item ${item.id}: eBay qty (${ebayQty}) exceeds canonical qty (${canonicalQty})`,
          severity: 'warning',
        });
      }
      if (poshQty > canonicalQty) {
        inconsistencies.push({
          linkedGroupId: groupId,
          issue: `Item ${item.id}: Poshmark qty (${poshQty}) exceeds canonical qty (${canonicalQty})`,
          severity: 'warning',
        });
      }
      if (depopQty > canonicalQty) {
        inconsistencies.push({
          linkedGroupId: groupId,
          issue: `Item ${item.id}: Depop qty (${depopQty}) exceeds canonical qty (${canonicalQty})`,
          severity: 'warning',
        });
      }
    }
  }

  return { totalGroups: groups.size, inconsistencies };
}

export async function runHistoricalValidation(
  _userId: string,
  items: Item[]
): Promise<{
  expectedSold: number;
  actualSold: number;
  discrepancies: Array<{ itemId: string; issue: string }>;
}> {
  const discrepancies: Array<{ itemId: string; issue: string }> = [];
  let expectedSold = 0;
  let actualSold = 0;

  for (const item of items) {
    const salesCount = item.unitSales?.length ?? 0;
    expectedSold += salesCount;

    // Check if item is marked SOLD
    const isSold = item.stockStatus === 'SOLD' || item.status === 'SOLD';
    if (isSold) {
      actualSold++;
    }

    // Discrepancy: has unitSales but not marked SOLD and canonical qty is 0
    const canonicalQty = item.canonicalQty ?? item.physicalQuantity ?? item.ebayQuantity ?? 1;
    if (salesCount > 0 && canonicalQty <= 0 && !isSold) {
      discrepancies.push({
        itemId: item.id,
        issue: `Has ${salesCount} recorded sale(s) and canonical qty is 0, but not marked SOLD`,
      });
    }

    // Discrepancy: marked SOLD but no unitSales recorded
    if (isSold && salesCount === 0) {
      discrepancies.push({
        itemId: item.id,
        issue: `Marked SOLD but has no unitSales records`,
      });
    }

    // Discrepancy: unitSales count exceeds original quantity
    // Original quantity is hard to reconstruct, but we can check if salesCount > physicalQuantity when physicalQuantity is set
    const originalQty = item.physicalQuantity ?? item.ebayQuantity;
    if (originalQty !== undefined && salesCount > originalQty) {
      discrepancies.push({
        itemId: item.id,
        issue: `unitSales count (${salesCount}) exceeds tracked quantity (${originalQty})`,
      });
    }

    // Discrepancy: canonical qty > 0 but item is marked SOLD
    if (isSold && canonicalQty > 0) {
      discrepancies.push({
        itemId: item.id,
        issue: `Marked SOLD but canonical qty is ${canonicalQty} (should be 0)`,
      });
    }
  }

  return { expectedSold, actualSold, discrepancies };
}
