import { database } from '../../lib/database/client';
import { db } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface FacebookListing {
  id: string;
  listing_id?: string;
  title: string;
  description?: string;
  price: number; // dollars (float)
  imageUrl?: string | null;
  images?: string[];
  listingUrl?: string;
  listing_url?: string;
  sold?: boolean;
  status?: string; // "available", "sold", "draft", etc.
  size?: string | null;
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
}

export interface FacebookImportResult {
  imported: number;
  skipped: number;
  unmatched: number;
  errors: Array<{ itemId: string; error: string }>;
}

function facebookListingUrl(l: FacebookListing): string {
  const listingId = l.listing_id || l.id;
  return l.listingUrl || l.listing_url || `https://www.facebook.com/marketplace/item/${listingId}/`;
}

function facebookListingImage(l: FacebookListing): string | undefined {
  if (Array.isArray(l.images) && l.images[0]) return l.images[0];
  if (l.imageUrl) return l.imageUrl;
  return undefined;
}

async function upsertOrphanListing(
  userId: string,
  listing: { id: string; title?: string; url: string; imageUrl?: string },
): Promise<void> {
  const orphanId = `${userId}_facebook_${listing.id}`;
  const ref = doc(db, 'OrphanListing', orphanId);
  const snap = await getDoc(ref);
  const nowIso = new Date().toISOString();
  const base: Record<string, unknown> = {
    userId,
    platform: 'facebook',
    listingId: listing.id,
    sku: listing.id,
    title: listing.title || '',
    url: listing.url,
    lastSeenAt: nowIso,
  };
  if (listing.imageUrl) base.imageUrl = listing.imageUrl;
  if (!snap.exists()) {
    base.firstSeenAt = nowIso;
    await setDoc(ref, base);
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

/**
 * Link Facebook Marketplace listings to existing eBay-anchored Items.
 *
 * Same shape as `importPoshmarkItems` / `importDepopItems`:
 * - PRIOR MATCH PRECEDENCE: an already-linked listing keeps its prior match.
 * - NEW MATCH: write `facebookListingId` / `facebookUrl` / `facebookImportedAt`
 *   onto the matched Item.
 * - UNMATCHED: persist to `OrphanListing` so the DelistQueueWidget can surface
 *   them across sessions (qty-zero or manual link later).
 *
 * Never stamps `facebookListingId` on an Item the user hasn't explicitly matched.
 */
export async function importFacebookItems(
  listings: FacebookListing[],
  userId: string,
  ebayMatchMap?: Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>,
): Promise<FacebookImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const unmatched: FacebookListing[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  console.log('[importFacebookItems] Linking', listings.length, 'Facebook listings to eBay items');

  for (const listing of listings) {
    try {
      const listingId = listing.listing_id || listing.id;
      if (!listingId) continue;

      // PRIOR MATCH: already linked to an Item? Respect it.
      const existingResult = await new Promise<{ data: any[]; error: any }>((resolve) => {
        database
          .from('Item')
          .select('*')
          .eq('user_uuid', userId)
          .eq('facebookListingId', listingId)
          .limit(1)
          .then(resolve);
      });
      if (existingResult.data && existingResult.data.length > 0) {
        console.log('[importFacebookItems] Prior match preserved:', listingId);
        skipped.push(listingId);
        continue;
      }

      const matchInfo = ebayMatchMap?.get(listingId);
      if (!matchInfo?.ebayItemDocId) {
        console.log('[importFacebookItems] Unmatched (orphan):', listingId);
        unmatched.push(listing);
        continue;
      }

      const fbUrl = facebookListingUrl(listing);
      const updateResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .update({
            facebookListingId: listingId,
            facebookUrl: fbUrl,
            facebookQuantity: 1,
            facebookImportedAt: new Date().toISOString(),
          })
          .eq('id', matchInfo.ebayItemDocId)
          .select()
          .single()
          .then(resolve);
      });

      if (updateResult.error) {
        throw updateResult.error;
      }

      imported.push(listingId);
    } catch (err) {
      const listingId = listing.listing_id || listing.id;
      console.error(`[importFacebookItems] Failed to link ${listingId}:`, err);
      errors.push({
        itemId: listingId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Persist orphans so they appear in the DelistQueueWidget across sessions.
  let orphanPersisted = 0;
  for (const listing of unmatched) {
    const lid = listing.listing_id || listing.id;
    try {
      await upsertOrphanListing(userId, {
        id: lid,
        title: listing.title,
        url: facebookListingUrl(listing),
        imageUrl: facebookListingImage(listing),
      });
      orphanPersisted++;
    } catch (err) {
      console.error('[importFacebookItems] Failed to persist orphan', lid, err);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[importFacebookItems] Persisted ${orphanPersisted}/${unmatched.length} orphan listings`);
  }

  console.log('[importFacebookItems] Link complete:', {
    linked: imported.length,
    skipped: skipped.length,
    unmatched: unmatched.length,
    errors: errors.length,
  });
  return { imported: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors };
}
