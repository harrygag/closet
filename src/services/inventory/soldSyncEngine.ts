import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import type { Item } from '../../types/item';

const db = getFirestore(app);

// --- Interfaces ---

export interface SoldItemEvent {
  platform: 'ebay' | 'poshmark' | 'depop';
  platformListingId: string;
  soldPrice: number;           // cents
  soldDate: string;            // ISO
  buyerUsername?: string;
  quantity: number;            // usually 1
}

export interface SyncResult {
  processed: number;
  linkedGroupsUpdated: number;
  salesRecorded: number;
  errors: Array<{ event: SoldItemEvent; error: string }>;
  orphaned: SoldItemEvent[];
}

// --- Helpers ---

const UNIT_SALES_CAP = 200;
const ITEM_ACTIVITY_CAP = 50;

function findItemByPlatformListingId(
  items: Item[],
  event: SoldItemEvent
): Item | undefined {
  return items.find((item) => {
    switch (event.platform) {
      case 'ebay':
        return (
          item.ebayListingId === event.platformListingId ||
          item.ebayItemId === event.platformListingId
        );
      case 'poshmark':
        return item.poshmarkListingId === event.platformListingId;
      case 'depop':
        return item.depopListingId === event.platformListingId;
      default:
        return false;
    }
  });
}

function getLinkedGroupItems(items: Item[], linkedGroupId: string): Item[] {
  return items.filter((i) => i.linkedGroupId === linkedGroupId);
}

function getPlatformQtyField(
  platform: 'ebay' | 'poshmark' | 'depop'
): 'ebayQuantity' | 'poshmarkQuantity' | 'depopQuantity' {
  switch (platform) {
    case 'ebay':
      return 'ebayQuantity';
    case 'poshmark':
      return 'poshmarkQuantity';
    case 'depop':
      return 'depopQuantity';
  }
}

function isDuplicateSale(item: Item, event: SoldItemEvent): boolean {
  if (!item.unitSales || item.unitSales.length === 0) return false;
  return item.unitSales.some(
    (sale) =>
      sale.soldAt === event.soldDate && sale.platform === event.platform
  );
}

function cappedAppend<T>(arr: T[], entry: T, cap: number): T[] {
  const updated = [...arr, entry];
  if (updated.length > cap) {
    return updated.slice(updated.length - cap);
  }
  return updated;
}

// --- Core Functions ---

export async function processSoldEvent(
  _userId: string,
  event: SoldItemEvent,
  items: Item[]
): Promise<{ success: boolean; error?: string }> {
  // 1. Find the matching item
  const item = findItemByPlatformListingId(items, event);
  if (!item) {
    return { success: false, error: `No item found for platformListingId: ${event.platformListingId}` };
  }

  // 2. Build the sale record
  const saleRecord = {
    soldAt: event.soldDate,
    platform: event.platform,
    priceCents: event.soldPrice,
  };

  // 3. Determine linked group
  const groupItems = item.linkedGroupId
    ? getLinkedGroupItems(items, item.linkedGroupId)
    : [item];

  // 4. Find anchor (or the item itself if no group)
  const anchor = groupItems.find((i) => i.linkedGroupRole === 'anchor') || item;

  // 5. Compute new quantities
  const currentCanonicalQty = anchor.canonicalQty ?? anchor.physicalQuantity ?? anchor.ebayQuantity ?? 1;
  const newCanonicalQty = Math.max(0, currentCanonicalQty - event.quantity);

  const platformQtyField = getPlatformQtyField(event.platform);
  const currentPlatformQty = (item[platformQtyField] as number | undefined) ?? 1;
  const newPlatformQty = Math.max(0, currentPlatformQty - event.quantity);

  // 6. Build updated unitSales (capped at 200)
  const existingSales = item.unitSales ?? [];
  const updatedSales = cappedAppend(existingSales, saleRecord, UNIT_SALES_CAP);

  // 7. Build updated itemActivity (capped at 50)
  const existingActivity = item.itemActivity ?? [];
  const activityEntry = {
    action: 'SOLD',
    timestamp: new Date().toISOString(),
    details: `Sold on ${event.platform} for $${(event.soldPrice / 100).toFixed(2)}`,
    oldValue: String(currentCanonicalQty),
    newValue: String(newCanonicalQty),
  };
  const updatedActivity = cappedAppend(existingActivity, activityEntry, ITEM_ACTIVITY_CAP);

  try {
    // 8. Update the sold item itself
    const itemUpdate: Record<string, unknown> = {
      [platformQtyField]: newPlatformQty,
      unitSales: updatedSales,
      itemActivity: updatedActivity,
      soldPlatform: event.platform,
    };

    // If platform qty reaches 0 but canonical > 0, mark this item OUT_OF_STOCK
    if (newPlatformQty === 0 && newCanonicalQty > 0) {
      itemUpdate.stockStatus = 'OUT_OF_STOCK';
    }

    await updateDoc(doc(db, 'Item', item.id), itemUpdate);

    // 9. Update anchor's canonicalQty (if anchor is different from item)
    if (anchor.id !== item.id) {
      const anchorActivity = cappedAppend(anchor.itemActivity ?? [], {
        action: 'QTY_CHANGE',
        timestamp: new Date().toISOString(),
        details: `canonicalQty decremented: sale on ${event.platform}`,
        oldValue: String(currentCanonicalQty),
        newValue: String(newCanonicalQty),
      }, ITEM_ACTIVITY_CAP);

      await updateDoc(doc(db, 'Item', anchor.id), {
        canonicalQty: newCanonicalQty,
        itemActivity: anchorActivity,
      });
    } else {
      // Anchor is the same item, update canonicalQty on it
      await updateDoc(doc(db, 'Item', item.id), {
        canonicalQty: newCanonicalQty,
      });
    }

    // 10. If canonical reaches 0, mark ALL items in group as SOLD
    if (newCanonicalQty === 0) {
      for (const groupItem of groupItems) {
        const soldUpdate: Record<string, unknown> = {
          stockStatus: 'SOLD',
          status: 'SOLD',
        };
        // Only write if not already handled above
        if (groupItem.id !== item.id) {
          const groupActivity = cappedAppend(groupItem.itemActivity ?? [], {
            action: 'STATUS_CHANGE',
            timestamp: new Date().toISOString(),
            details: `Marked SOLD: canonical quantity reached 0 (sale on ${event.platform})`,
            oldValue: groupItem.stockStatus ?? 'IN_STOCK',
            newValue: 'SOLD',
          }, ITEM_ACTIVITY_CAP);
          soldUpdate.itemActivity = groupActivity;
        }
        await updateDoc(doc(db, 'Item', groupItem.id), soldUpdate);
      }
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Firestore write failed: ${message}` };
  }
}

export async function processSoldBatch(
  userId: string,
  events: SoldItemEvent[],
  items: Item[]
): Promise<SyncResult> {
  const result: SyncResult = {
    processed: 0,
    linkedGroupsUpdated: 0,
    salesRecorded: 0,
    errors: [],
    orphaned: [],
  };

  const groupsUpdated = new Set<string>();

  for (const event of events) {
    result.processed++;

    // Check if item exists for this event
    const item = findItemByPlatformListingId(items, event);
    if (!item) {
      result.orphaned.push(event);
      continue;
    }

    // Dedup: skip if same platformListingId + soldDate already in unitSales
    if (isDuplicateSale(item, event)) {
      continue;
    }

    const outcome = await processSoldEvent(userId, event, items);
    if (outcome.success) {
      result.salesRecorded++;
      if (item.linkedGroupId) {
        groupsUpdated.add(item.linkedGroupId);
      }
    } else {
      result.errors.push({ event, error: outcome.error ?? 'Unknown error' });
    }
  }

  result.linkedGroupsUpdated = groupsUpdated.size;
  return result;
}

// --- Platform Adapter Functions ---

export function buildSoldEventFromEbayOrder(
  order: Record<string, unknown>,
  lineItem: Record<string, unknown>
): SoldItemEvent {
  const transactionPrice = lineItem.TransactionPrice as Record<string, unknown> | undefined;
  const priceCents = transactionPrice?.Value
    ? Math.round(Number(transactionPrice.Value) * 100)
    : 0;

  const paidTime = (order.PaidTime as string) || (order.CreatedTime as string) || new Date().toISOString();
  const buyer = order.BuyerUserID as string | undefined;
  const itemId = (lineItem.Item as Record<string, unknown>)?.ItemID as string || '';
  const qtyPurchased = Number(lineItem.QuantityPurchased) || 1;

  return {
    platform: 'ebay',
    platformListingId: itemId,
    soldPrice: priceCents,
    soldDate: paidTime,
    buyerUsername: buyer,
    quantity: qtyPurchased,
  };
}

export function buildSoldEventFromDepopReceipt(
  receipt: Record<string, unknown>
): SoldItemEvent {
  const priceCents = receipt.priceCents
    ? Number(receipt.priceCents)
    : receipt.price
      ? Math.round(Number(receipt.price) * 100)
      : 0;

  return {
    platform: 'depop',
    platformListingId: String(receipt.productId || receipt.listingId || ''),
    soldPrice: priceCents,
    soldDate: String(receipt.dateCompleted || receipt.soldAt || new Date().toISOString()),
    buyerUsername: receipt.buyerUsername ? String(receipt.buyerUsername) : undefined,
    quantity: Number(receipt.quantity) || 1,
  };
}

export function buildSoldEventFromPoshmarkOrder(
  order: Record<string, unknown>
): SoldItemEvent {
  const priceCents = order.priceCents
    ? Number(order.priceCents)
    : order.price
      ? Math.round(Number(order.price) * 100)
      : 0;

  return {
    platform: 'poshmark',
    platformListingId: String(order.listingId || order.id || ''),
    soldPrice: priceCents,
    soldDate: String(order.completedAt || order.soldAt || new Date().toISOString()),
    buyerUsername: order.buyerUsername ? String(order.buyerUsername) : undefined,
    quantity: Number(order.quantity) || 1,
  };
}
