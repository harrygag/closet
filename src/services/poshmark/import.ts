import { database } from '../../lib/database/client';
import { db } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface PoshmarkListing {
  id: string;
  listing_id?: string;
  title: string;
  description?: string;
  price: number; // dollars (float)
  originalPrice?: number;
  original_price?: number;
  imageUrl?: string | null;
  cover_shot?: string | null;
  images?: string[];
  listingUrl?: string;
  listing_url?: string;
  sold?: boolean;
  status?: string; // "available", "sold", "not_for_sale", etc.
  size?: string | null;
  brand?: string | null;
  department?: string | null;
  category?: string | null;
  color?: string | null;
  condition?: string | null;
}

export interface PoshmarkImportResult {
  imported: number;
  skipped: number; // skipped = already linked to an Item from a prior session
  unmatched: number; // unmatched = no eBay item to bind → persisted to OrphanListing
  errors: Array<{ itemId: string; error: string }>;
}

function poshmarkListingUrl(l: PoshmarkListing): string {
  const listingId = l.listing_id || l.id;
  return l.listingUrl || l.listing_url || `https://poshmark.com/listing/${listingId}`;
}

/**
 * Auto-clear stale Poshmark bindings after a full re-scrape.
 *
 * `liveListingIds` must be the COMPLETE set of listing ids the scrape captured
 * (every active Poshmark listing), NOT just the rows the user chose to import.
 * Any Item still carrying a `poshmarkListingId` not in that live set is no longer
 * listed on Poshmark, so its binding is cleared — dropping it back into the
 * ShouldList queue. Reversible via re-match. Empty capture = no-op safety guard.
 *
 * Returns the number of bindings cleared.
 */
/** Poshmark listing ids are 24-hex ObjectIds; one is also embedded at the tail
 *  of every listing URL. Match either so a binding stored only via URL counts. */
function poshIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/([0-9a-f]{24})(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

export async function clearStalePoshmarkBindings(
  userId: string,
  liveListingIds: string[],
): Promise<number> {
  if (!liveListingIds || liveListingIds.length === 0) {
    console.log('[clearStalePoshmarkBindings] empty capture — skipping (no-op safety guard)');
    return 0;
  }
  const live = new Set(liveListingIds.map(String));
  const res = await new Promise<{ data: any[]; error: any }>((resolve) => {
    database.from('Item').select('*').eq('user_uuid', userId).then(resolve);
  });
  const items = res.data || [];
  let cleared = 0;
  for (const it of items) {
    const urlId = poshIdFromUrl(it.poshmarkUrl);
    const isLive = (it.poshmarkListingId && live.has(String(it.poshmarkListingId))) || (urlId && live.has(urlId));
    if (it.poshmarkListingId && !isLive) {
      await new Promise((resolve) => {
        database
          .from('Item')
          .update({ poshmarkListingId: null, poshmarkUrl: null, poshmarkQuantity: null, poshmarkImportedAt: null })
          .eq('id', it.id)
          .then(resolve);
      });
      cleared++;
      console.log('[clearStalePoshmarkBindings] cleared stale Poshmark binding on', it.id, it.name || it.ebayFullTitle || '');
    }
  }
  if (cleared > 0) console.log(`[clearStalePoshmarkBindings] cleared ${cleared} stale Poshmark binding(s)`);
  return cleared;
}

function poshmarkListingImage(l: PoshmarkListing): string | undefined {
  if (typeof l.cover_shot === 'string' && l.cover_shot) return l.cover_shot;
  if (Array.isArray(l.images) && l.images[0]) return l.images[0];
  if (l.imageUrl) return l.imageUrl;
  return undefined;
}

async function upsertOrphanListing(
  userId: string,
  platform: 'depop' | 'poshmark',
  listing: { id: string; title?: string; url: string; imageUrl?: string },
): Promise<void> {
  const orphanId = `${userId}_${platform}_${listing.id}`;
  const ref = doc(db, 'OrphanListing', orphanId);
  const snap = await getDoc(ref);
  const nowIso = new Date().toISOString();
  const base: Record<string, unknown> = {
    userId,
    platform,
    listingId: listing.id,
    sku: listing.id, // cross-platform marker; Item.sku takes over after match.
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
 * Link Poshmark listings to existing eBay items in Firestore.
 *
 * Rules (same as Depop side — see services/depop/import.ts for the full rationale):
 * - PRIOR MATCH PRECEDENCE: already-linked listings keep their prior match.
 * - NEW MATCH: write binding to the matched Item.
 * - UNMATCHED: persist to `OrphanListing` so the DelistQueueWidget orphan section
 *   shows them across sessions (the user can qty-zero them in place).
 *
 * Never stamps `poshmarkListingId` on an Item the user hasn't explicitly matched.
 */
export async function importPoshmarkItems(
  listings: PoshmarkListing[],
  userId: string,
  ebayMatchMap?: Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>,
): Promise<PoshmarkImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const unmatched: PoshmarkListing[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  console.log('[importPoshmarkItems] Linking', listings.length, 'Poshmark listings to eBay items');

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
          .eq('poshmarkListingId', listingId)
          .limit(1)
          .then(resolve);
      });
      if (existingResult.data && existingResult.data.length > 0) {
        console.log('[importPoshmarkItems] Prior match preserved:', listingId);
        skipped.push(listingId);
        continue;
      }

      const matchInfo = ebayMatchMap?.get(listingId);
      if (!matchInfo?.ebayItemDocId) {
        console.log('[importPoshmarkItems] Unmatched (orphan):', listingId);
        unmatched.push(listing);
        continue;
      }

      // NEW MATCH — stamp the binding.
      const poshUrl = poshmarkListingUrl(listing);
      const updateResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .update({
            poshmarkListingId: listingId,
            poshmarkUrl: poshUrl,
            poshmarkQuantity: 1,
            poshmarkImportedAt: new Date().toISOString(),
          })
          .eq('id', matchInfo.ebayItemDocId)
          .select()
          .single()
          .then(resolve);
      });

      if (updateResult.error) {
        console.error('[importPoshmarkItems] Update error:', updateResult.error);
        throw updateResult.error;
      }

      console.log('[importPoshmarkItems] Linked Poshmark', listingId, '→ eBay item', matchInfo.ebayItemDocId);
      imported.push(listingId);
    } catch (err) {
      const listingId = listing.listing_id || listing.id;
      console.error(`[importPoshmarkItems] Failed to link ${listingId}:`, err);
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
      await upsertOrphanListing(userId, 'poshmark', {
        id: lid,
        title: listing.title,
        url: poshmarkListingUrl(listing),
        imageUrl: poshmarkListingImage(listing),
      });
      orphanPersisted++;
    } catch (err) {
      console.error('[importPoshmarkItems] Failed to persist orphan', lid, err);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[importPoshmarkItems] Persisted ${orphanPersisted}/${unmatched.length} orphan listings to OrphanListing`);
  }

  console.log('[importPoshmarkItems] Link complete:', { linked: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors: errors.length });
  return { imported: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors };
}
