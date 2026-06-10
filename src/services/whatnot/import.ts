import { database } from '../../lib/database/client';
import { db } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface WhatnotListing {
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

export interface WhatnotImportResult {
  imported: number;
  skipped: number;
  unmatched: number;
  errors: Array<{ itemId: string; error: string }>;
}

function whatnotListingUrl(l: WhatnotListing): string {
  const listingId = l.listing_id || l.id;
  return l.listingUrl || l.listing_url || `https://www.whatnot.com/listing/${listingId}`;
}

function whatnotListingImage(l: WhatnotListing): string | undefined {
  if (Array.isArray(l.images) && l.images[0]) return l.images[0];
  if (l.imageUrl) return l.imageUrl;
  return undefined;
}

async function upsertOrphanListing(
  userId: string,
  listing: { id: string; title?: string; url: string; imageUrl?: string },
): Promise<void> {
  const orphanId = `${userId}_whatnot_${listing.id}`;
  const ref = doc(db, 'OrphanListing', orphanId);
  const snap = await getDoc(ref);
  const nowIso = new Date().toISOString();
  const base: Record<string, unknown> = {
    userId,
    platform: 'whatnot',
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
 * Link Whatnot listings to existing eBay-anchored Items. Same shape as the
 * Poshmark/Depop/Facebook importers:
 * - PRIOR MATCH PRECEDENCE: an already-linked listing keeps its prior match.
 * - NEW MATCH: write `whatnotListingId` / `whatnotUrl` / `whatnotImportedAt`.
 * - UNMATCHED: persist to `OrphanListing` so the delist queue can surface them.
 *
 * Never stamps `whatnotListingId` on an Item the user hasn't explicitly matched.
 */
export async function importWhatnotItems(
  listings: WhatnotListing[],
  userId: string,
  ebayMatchMap?: Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>,
): Promise<WhatnotImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const unmatched: WhatnotListing[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  console.log('[importWhatnotItems] Linking', listings.length, 'Whatnot listings to eBay items');

  for (const listing of listings) {
    try {
      const listingId = listing.listing_id || listing.id;
      if (!listingId) continue;

      const existingResult = await new Promise<{ data: any[]; error: any }>((resolve) => {
        database
          .from('Item')
          .select('*')
          .eq('user_uuid', userId)
          .eq('whatnotListingId', listingId)
          .limit(1)
          .then(resolve);
      });
      if (existingResult.data && existingResult.data.length > 0) {
        console.log('[importWhatnotItems] Prior match preserved:', listingId);
        skipped.push(listingId);
        continue;
      }

      const matchInfo = ebayMatchMap?.get(listingId);
      if (!matchInfo?.ebayItemDocId) {
        console.log('[importWhatnotItems] Unmatched (orphan):', listingId);
        unmatched.push(listing);
        continue;
      }

      const wnUrl = whatnotListingUrl(listing);
      const updateResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .update({
            whatnotListingId: listingId,
            whatnotUrl: wnUrl,
            whatnotQuantity: 1,
            whatnotImportedAt: new Date().toISOString(),
          })
          .eq('id', matchInfo.ebayItemDocId)
          .select()
          .single()
          .then(resolve);
      });

      if (updateResult.error) throw updateResult.error;
      imported.push(listingId);
    } catch (err) {
      const listingId = listing.listing_id || listing.id;
      console.error(`[importWhatnotItems] Failed to link ${listingId}:`, err);
      errors.push({ itemId: listingId, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  let orphanPersisted = 0;
  for (const listing of unmatched) {
    const lid = listing.listing_id || listing.id;
    try {
      await upsertOrphanListing(userId, {
        id: lid,
        title: listing.title,
        url: whatnotListingUrl(listing),
        imageUrl: whatnotListingImage(listing),
      });
      orphanPersisted++;
    } catch (err) {
      console.error('[importWhatnotItems] Failed to persist orphan', lid, err);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[importWhatnotItems] Persisted ${orphanPersisted}/${unmatched.length} orphan listings`);
  }

  console.log('[importWhatnotItems] Link complete:', {
    linked: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors: errors.length,
  });
  return { imported: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors };
}

/**
 * Auto-clear stale Whatnot bindings after a full re-scrape. `liveListingIds` must
 * be the COMPLETE captured set. Any Item bound to a Whatnot listing NOT in that
 * set is no longer live → its binding is cleared (returns to should-list when
 * stock remains). Empty capture → no-op safety guard. Returns count cleared.
 */
export async function clearStaleWhatnotBindings(
  userId: string,
  liveListingIds: string[],
): Promise<number> {
  if (!liveListingIds || liveListingIds.length === 0) {
    console.log('[clearStaleWhatnotBindings] empty capture — skipping (no-op safety guard)');
    return 0;
  }
  const live = new Set(liveListingIds.map(String));
  const res = await new Promise<{ data: any[]; error: any }>((resolve) => {
    database.from('Item').select('*').eq('user_uuid', userId).then(resolve);
  });
  const items = res.data || [];
  let cleared = 0;
  for (const it of items) {
    if (it.whatnotListingId && !live.has(String(it.whatnotListingId))) {
      await new Promise((resolve) => {
        database
          .from('Item')
          .update({ whatnotListingId: null, whatnotUrl: null, whatnotQuantity: null, whatnotImportedAt: null })
          .eq('id', it.id)
          .then(resolve);
      });
      cleared++;
      console.log('[clearStaleWhatnotBindings] cleared stale Whatnot binding on', it.id);
    }
  }
  if (cleared > 0) console.log(`[clearStaleWhatnotBindings] cleared ${cleared} stale Whatnot binding(s)`);
  return cleared;
}
