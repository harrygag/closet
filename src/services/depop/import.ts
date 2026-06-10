import { database } from '../../lib/database/client';
import { db } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface DepopListing {
  id: string;
  slug?: string;
  title?: string; // Optional - API v3 often doesn't include this
  description?: string;

  // API v3 pricing structure
  pricing?: {
    original_price?: {
      amount?: number;
      currency?: string;
    };
    discounted_price?: {
      amount?: number;
      currency?: string;
    };
    national_shipping_cost?: {
      amount?: number;
      currency?: string;
    };
  };

  // Legacy price formats (for backwards compatibility)
  price?: number | {
    price_amount?: number; // cents
    national_price_currency?: string;
    priceAmount?: string | number;
  };

  // API v3 image structure - pictures array with numbered size keys
  pictures?: Array<{
    [size: string]: string; // e.g., "640": "https://...", "960": "https://..."
  }>;

  // API v3 preview structure
  preview?: {
    [size: string]: string;
  };

  // Legacy formats
  image?: string;
  images?: string[];

  url?: string;
  sold?: boolean;
  status?: string; // "ONSALE", "SOLD", etc.
  brand?: string | { name?: string };
  brand_id?: number;
  size?: string;
  sizes?: string[];
  condition?: string;
  category?: string;
  category_id?: number;
  categories?: Array<{ name?: string }>;
  colour?: string;
  color?: string;
  material?: string;
  style?: string | string[];
  measurements?: Record<string, string>;
  sellers?: Array<{ username?: string; firstName?: string; lastName?: string }>;
}

export interface DepopImportResult {
  imported: number;
  skipped: number; // skipped = already linked to an Item from a prior session (prior match respected)
  unmatched: number; // unmatched = no eBay item to bind → persisted to OrphanListing
  errors: Array<{ itemId: string; error: string }>;
}

function depopListingUrl(l: DepopListing): string {
  return l.url
    || (l.slug ? `https://www.depop.com/products/${l.slug}` : `https://www.depop.com/products/${l.id}`);
}

function depopListingImage(l: DepopListing): string | undefined {
  if (l.image) return l.image;
  if (Array.isArray(l.images) && l.images[0]) return l.images[0];
  if (l.preview) {
    const vals = Object.values(l.preview);
    if (vals[0]) return vals[0] as string;
  }
  if (Array.isArray(l.pictures) && l.pictures[0]) {
    const vals = Object.values(l.pictures[0]);
    if (vals[0]) return vals[0] as string;
  }
  return undefined;
}

/**
 * Upsert an OrphanListing doc. Doc id = `{userId}_{platform}_{listingId}` so
 * re-imports dedup naturally. Preserves firstSeenAt across re-upserts; updates
 * lastSeenAt + display fields each time.
 */
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
    // SKU = listing id — the natural cross-platform identifier for this orphan
    // until the user matches it to (or creates) an Item, at which point the
    // Item's existing sku takes precedence via the binding step.
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
    // Merge: keep firstSeenAt + delistedAt if already set; refresh display fields + lastSeenAt.
    await setDoc(ref, base, { merge: true });
  }
}

/** Parse the Depop product slug out of a /products/<slug> URL. */
function depopSlugFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/products\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Build the "live" key set from a captured Depop listing set. CRITICAL: Depop
 * bindings in this app are inconsistent — some Items store the numeric listing
 * `id` as `depopListingId`, others store the URL **slug**. So the live set must
 * contain BOTH the numeric id AND the slug of every captured listing, and an
 * Item is considered live if its `depopListingId` OR its url-slug matches.
 * Comparing only ids (the old bug) matched nothing and would have wiped every
 * binding.
 */
function buildDepopLiveSet(liveListings: Array<{ id?: unknown; slug?: string; url?: string }>): Set<string> {
  const live = new Set<string>();
  for (const l of liveListings) {
    if (l.id !== undefined && l.id !== null) live.add(String(l.id));
    if (l.slug) live.add(String(l.slug));
    const s = depopSlugFromUrl(l.url);
    if (s) live.add(s);
  }
  return live;
}

function itemIsLiveOnDepop(it: any, live: Set<string>): boolean {
  if (it.depopListingId && live.has(String(it.depopListingId))) return true;
  const s = depopSlugFromUrl(it.depopUrl);
  if (s && live.has(s)) return true;
  return false;
}

/**
 * Auto-clear stale Depop bindings after a full re-scrape.
 *
 * `liveListings` must be the COMPLETE set the scrape captured (every active
 * Depop listing), NOT just the rows the user chose to import. An Item whose
 * `depopListingId`/url-slug is NOT in that live set is no longer listed on
 * Depop, so its binding is cleared — dropping it back into ShouldList.
 * Reversible: re-matching re-stamps the binding.
 *
 * Guard: empty capture → no-op, so a broken scrape can never wipe everything.
 * Returns the number of bindings cleared.
 */
export async function clearStaleDepopBindings(
  userId: string,
  liveListings: Array<{ id?: unknown; slug?: string; url?: string }>,
): Promise<number> {
  if (!liveListings || liveListings.length === 0) {
    console.log('[clearStaleDepopBindings] empty capture — skipping (no-op safety guard)');
    return 0;
  }
  const live = buildDepopLiveSet(liveListings);
  const res = await new Promise<{ data: any[]; error: any }>((resolve) => {
    database.from('Item').select('*').eq('user_uuid', userId).then(resolve);
  });
  const items = res.data || [];
  let cleared = 0;
  for (const it of items) {
    if (it.depopListingId && !itemIsLiveOnDepop(it, live)) {
      await new Promise((resolve) => {
        database
          .from('Item')
          .update({ depopListingId: null, depopUrl: null, depopQuantity: null, depopImportedAt: null })
          .eq('id', it.id)
          .then(resolve);
      });
      cleared++;
      console.log('[clearStaleDepopBindings] cleared stale Depop binding on', it.id, it.name || it.ebayFullTitle || '');
    }
  }
  if (cleared > 0) console.log(`[clearStaleDepopBindings] cleared ${cleared} stale Depop binding(s)`);
  return cleared;
}

/**
 * Link Depop listings to existing eBay items in Firestore.
 *
 * Rules:
 * - PRIOR MATCH PRECEDENCE: if the listing is already linked to ANY Item
 *   (Item.depopListingId == listing.id), keep that match — do NOT re-prompt,
 *   re-match, or treat it as unmatched even if `ebayMatchMap` lacks an entry.
 *   ("if im importing items from depop or poshmark and they were already
 *   matched before then just go off of the last user match" — user rule.)
 * - NEW MATCH: if `ebayMatchMap` has an entry, write the binding to the Item.
 * - UNMATCHED: no prior link AND no new match → that listing has no eBay anchor;
 *   either the eBay item is gone/OOS or the user hasn't listed it on eBay yet.
 *   Persist it to `OrphanListing` so it surfaces in the DelistQueueWidget orphan
 *   section across sessions (the user can delist from Depop right there).
 *
 * Does NOT create new Item docs and never stamps `depopListingId` on an Item
 * that the user hasn't explicitly matched.
 */
export async function importDepopItems(
  listings: DepopListing[],
  userId: string,
  ebayMatchMap?: Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>,
): Promise<DepopImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const unmatched: DepopListing[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  console.log('[importDepopItems] Linking', listings.length, 'Depop listings to eBay items');

  for (const listing of listings) {
    try {
      if (!listing.id) continue;

      // PRIOR MATCH: already linked to an Item? Respect it; do nothing.
      const existingResult = await new Promise<{ data: any[]; error: any }>((resolve) => {
        database
          .from('Item')
          .select('*')
          .eq('user_uuid', userId)
          .eq('depopListingId', listing.id)
          .limit(1)
          .then(resolve);
      });
      if (existingResult.data && existingResult.data.length > 0) {
        console.log('[importDepopItems] Prior match preserved:', listing.id);
        skipped.push(listing.id);
        continue;
      }

      const matchInfo = ebayMatchMap?.get(listing.id);
      if (!matchInfo?.ebayItemDocId) {
        // Truly unmatched — no prior link, no new match.
        console.log('[importDepopItems] Unmatched (orphan):', listing.id);
        unmatched.push(listing);
        continue;
      }

      // NEW MATCH — stamp the binding.
      const depopUrl = depopListingUrl(listing);
      const updateResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .update({
            depopListingId: listing.id,
            depopUrl: depopUrl,
            depopQuantity: 1,
            depopImportedAt: new Date().toISOString(),
          })
          .eq('id', matchInfo.ebayItemDocId)
          .select()
          .single()
          .then(resolve);
      });

      if (updateResult.error) {
        console.error('[importDepopItems] Update error:', updateResult.error);
        throw updateResult.error;
      }

      console.log('[importDepopItems] Linked Depop', listing.id, '→ eBay item', matchInfo.ebayItemDocId);
      imported.push(listing.id);
    } catch (error) {
      console.error(`[importDepopItems] Failed to link ${listing.id}:`, error);
      errors.push({
        itemId: listing.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Persist orphans so they appear in the DelistQueueWidget across sessions.
  let orphanPersisted = 0;
  for (const listing of unmatched) {
    try {
      await upsertOrphanListing(userId, 'depop', {
        id: listing.id,
        title: listing.title,
        url: depopListingUrl(listing),
        imageUrl: depopListingImage(listing),
      });
      orphanPersisted++;
    } catch (err) {
      console.error('[importDepopItems] Failed to persist orphan', listing.id, err);
    }
  }
  if (unmatched.length > 0) {
    console.log(`[importDepopItems] Persisted ${orphanPersisted}/${unmatched.length} orphan listings to OrphanListing`);
  }

  console.log('[importDepopItems] Link complete:', { linked: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors: errors.length });
  return { imported: imported.length, skipped: skipped.length, unmatched: unmatched.length, errors };
}
