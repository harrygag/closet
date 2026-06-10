/**
 * LinkedGroup — Layer 4
 * CRUD operations for cross-platform linked groups in Firestore.
 * An eBay listing anchors the group; Poshmark/Depop listings are children.
 */

import { doc, updateDoc, getDocs, query, where, collection, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import type { Item } from '../../types/item';
import type { MatchCandidate } from './listingMatcher';

const ITEM_COLLECTION = 'Item';

/**
 * Create a linked group from an anchor eBay item and child items (Poshmark/Depop).
 *
 * Uses the eBay item's ebayListingId as the linkedGroupId.
 * Batch writes all documents atomically.
 *
 * @param anchorItemId - Firestore document ID of the eBay (anchor) item
 * @param childItemIds - Firestore document IDs of child items
 * @param canonicalQty - Source-of-truth quantity from eBay
 * @returns The linkedGroupId (eBay listing ID)
 */
export async function createLinkedGroup(
  anchorItemId: string,
  childItemIds: string[],
  canonicalQty: number,
): Promise<string> {
  // Read the anchor item to get its ebayListingId
  const anchorRef = doc(db, ITEM_COLLECTION, anchorItemId);

  // We need the ebayListingId from the anchor item, but we avoid a read here
  // by requiring the caller to pass an item that has an ebayListingId.
  // The linkedGroupId IS the ebayListingId, which we retrieve from the anchor doc.
  // To avoid an extra read, we do a getDocs query for just the anchor.
  const anchorQuery = query(
    collection(db, ITEM_COLLECTION),
    where('__name__', '==', anchorItemId),
  );
  const anchorSnap = await getDocs(anchorQuery);

  if (anchorSnap.empty) {
    throw new Error(`Anchor item ${anchorItemId} not found in Firestore`);
  }

  const anchorData = anchorSnap.docs[0].data() as Item;
  const linkedGroupId = anchorData.ebayListingId;

  if (!linkedGroupId) {
    throw new Error(`Anchor item ${anchorItemId} has no ebayListingId — cannot create linked group`);
  }

  // Batch write: anchor + all children
  const batch = writeBatch(db);

  batch.update(anchorRef, {
    linkedGroupId,
    linkedGroupRole: 'anchor',
    canonicalQty,
  });

  for (const childId of childItemIds) {
    const childRef = doc(db, ITEM_COLLECTION, childId);
    batch.update(childRef, {
      linkedGroupId,
      linkedGroupRole: 'child',
    });
  }

  await batch.commit();

  return linkedGroupId;
}

/**
 * Retrieve all items in a linked group for a given user.
 *
 * @param linkedGroupId - The group ID (eBay listing ID)
 * @param userId - The user_uuid to scope the query
 * @returns Array of Items in this linked group
 */
export async function getLinkedGroup(linkedGroupId: string, userId: string): Promise<Item[]> {
  const q = query(
    collection(db, ITEM_COLLECTION),
    where('linkedGroupId', '==', linkedGroupId),
    where('user_uuid', '==', userId),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Item));
}

/**
 * Remove an item from its linked group.
 * Clears linkedGroupId, linkedGroupRole, and canonicalQty from the item.
 *
 * @param itemId - Firestore document ID of the item to unlink
 */
export async function unlinkItem(itemId: string): Promise<void> {
  const itemRef = doc(db, ITEM_COLLECTION, itemId);
  await updateDoc(itemRef, {
    linkedGroupId: deleteField(),
    linkedGroupRole: deleteField(),
    canonicalQty: deleteField(),
  });
}

/**
 * Apply a batch of auto-matched results by creating linked groups.
 * Skips items that already belong to a linked group.
 *
 * @param userId - Not used for writes but kept for future audit logging
 * @param matches - Array of MatchCandidate results from matchInventory
 * @returns Count of groups created and skipped
 */
export async function applyMatchResults(
  _userId: string,
  matches: MatchCandidate[],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const match of matches) {
    const anchor = match.ebayItem;

    // Skip if anchor already has a linked group
    if (anchor.linkedGroupId) {
      skipped++;
      continue;
    }

    // Collect child IDs (Poshmark and/or Depop items)
    const childIds: string[] = [];

    if (match.poshmarkItem) {
      // Skip if child already belongs to a group
      if (match.poshmarkItem.linkedGroupId) {
        skipped++;
        continue;
      }
      childIds.push(match.poshmarkItem.id);
    }

    if (match.depopItem) {
      // Skip if child already belongs to a group
      if (match.depopItem.linkedGroupId) {
        skipped++;
        continue;
      }
      childIds.push(match.depopItem.id);
    }

    // Nothing to link if no children
    if (childIds.length === 0) {
      skipped++;
      continue;
    }

    // Use eBay quantity as the canonical quantity (default to 1)
    const canonicalQty = anchor.ebayQuantity ?? anchor.physicalQuantity ?? 1;

    await createLinkedGroup(anchor.id, childIds, canonicalQty);
    created++;
  }

  return { created, skipped };
}
