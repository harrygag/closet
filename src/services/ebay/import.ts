import type { EbayListing, ImportResult } from '../../types/ebay';
import { ebayService } from '../ebayService';
import { database } from '../../lib/database/client';
import { generateBarcode } from '../barcodes';
import { onboardImportsAsRestock, type RestockTarget } from './restockOnboard';

// Jersey chest size → letter mapping (user's sizing standard)
export const JERSEY_SIZE_MAP: Record<number, string> = {
  40: 'S', 42: 'S',
  44: 'M', 46: 'M', 48: 'M', 50: 'M',
  52: 'L', 54: 'XL',
  56: '2XL', 58: '2XL',
  60: '3XL', 62: '3XL',
  64: '4XL',
};

const WORD_SIZE_MAP: Record<string, string> = {
  'small': 'S', 'medium': 'M', 'large': 'L',
  'x-large': 'XL', 'xlarge': 'XL', 'x large': 'XL',
  'xx-large': 'XXL', 'xxlarge': 'XXL', 'xx large': 'XXL',
  'xxx-large': 'XXXL', '2x-large': '2XL', '2xl': '2XL',
  '3xl': '3XL', '4xl': '4XL', 'xxl': 'XXL', 'xxxl': 'XXXL',
};

// Normalize a raw size string — "50-M", "L", "XL", etc.
export function normalizeSize(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Already combined: "50-M", "52/L", "54 XL"
  const combinedMatch = trimmed.match(/^(\d+)[\s\-\/]+([a-z0-9]+)$/i);
  if (combinedMatch) {
    const num = parseInt(combinedMatch[1], 10);
    return `${num}-${JERSEY_SIZE_MAP[num] || combinedMatch[2].toUpperCase()}`;
  }
  // Pure number
  const numericMatch = trimmed.match(/^(\d+)$/);
  if (numericMatch) {
    const num = parseInt(numericMatch[1], 10);
    const letter = JERSEY_SIZE_MAP[num];
    return letter ? `${num}-${letter}` : trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (WORD_SIZE_MAP[lower]) return WORD_SIZE_MAP[lower];
  return trimmed.toUpperCase();
}

/**
 * Display a stored size string for UI labels.
 * Converts "50-M" format → "M". Returns raw value as-is for other formats.
 * null/undefined → "".
 */
export function displaySize(size: string | undefined | null): string {
  if (size == null || size === '') return '';
  // Match "50-M" style: digits, dash, letter portion
  const match = size.match(/^\d+-([A-Z0-9]+)$/i);
  if (match) return match[1].toUpperCase();
  return size;
}

export function extractSizeFromTitle(title: string): string {
  // 1. Letter then number: "XL (54)", "L 52", "Men's XL 54"
  const letterNumMatch = title.match(
    /\b(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\s*[\s\(\/]\s*(\d{2})\b/i
  );
  if (letterNumMatch) {
    const num = parseInt(letterNumMatch[2], 10);
    return `${num}-${JERSEY_SIZE_MAP[num] || letterNumMatch[1].toUpperCase()}`;
  }

  // 2. Number then letter/word: "Size 52 Large", "50 Medium", "52-L"
  const numLetterMatch = title.match(
    /\b(?:size\s+)?(\d{2})\s*[-\/]?\s*(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\b/i
  );
  if (numLetterMatch) {
    const num = parseInt(numLetterMatch[1], 10);
    return `${num}-${JERSEY_SIZE_MAP[num] || numLetterMatch[2].toUpperCase()}`;
  }

  // 3. Pure jersey number: "Blue 50", "Blue 52"
  const pureNumMatch = title.match(/\b(\d{2})\b/);
  if (pureNumMatch) {
    const num = parseInt(pureNumMatch[1], 10);
    if (JERSEY_SIZE_MAP[num]) return `${num}-${JERSEY_SIZE_MAP[num]}`;
  }

  // 4. Explicit "Men's SIZE" — avoids matching the bare 's' in "Men's"
  const mensMatch = title.match(
    /\bmen'?s\s+(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\b/i
  );
  if (mensMatch) return normalizeSize(mensMatch[1]);

  // 5. Word sizes
  const wordMatch = title.match(
    /\b(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|x-large|xx-large)\b/i
  );
  if (wordMatch) return normalizeSize(wordMatch[1]);

  // 6. Standalone L or M — negative lookbehind for possessives ("Men's", "King's")
  const letterMatch = title.match(/(?<!['\w])\b([lm])\b(?!')/i);
  if (letterMatch) return letterMatch[1].toUpperCase();

  return '';
}

/**
 * Fetch ALL eBay listings via Trading API Cloud Function
 * Uses getAllListings which returns ALL listings (not just managed inventory)
 */
export async function fetchEbayListings(_userId: string): Promise<EbayListing[]> {
  console.log('[fetchEbayListings] Calling getAllListings (Trading API)...');

  // Call the Trading API Cloud Function via ebayService
  const result = await ebayService.getAllListings();

  console.log('[fetchEbayListings] Got result:', {
    success: result.success,
    total: result.total,
    listingsCount: result.listings?.length
  });

  if (!result.success || !result.listings) {
    console.error('[fetchEbayListings] Failed to fetch listings');
    return [];
  }

  // Map the Trading API listing format to the EbayListing type
  // Cloud Function returns FULL data including descriptions, all images, item specifics, shipping, returns, etc.
  const mappedListings: EbayListing[] = result.listings.map((listing: any) => ({
    // Basic fields
    itemId: listing.itemId,
    title: listing.title,
    subtitle: listing.subtitle || undefined,
    price: listing.currentPrice,
    currency: listing.currency || 'USD',
    imageUrl: listing.pictureURL || listing.pictureURLs?.[0] || '',
    listingUrl: listing.viewItemURL,
    quantity: listing.quantity,
    quantitySold: listing.quantitySold || undefined,
    format: listing.listingType || 'FixedPrice',
    categoryName: listing.primaryCategoryName || '',

    // Extended fields - FULL DATA from Cloud Function
    description: listing.description || '', // Full description (truncated if >5000 chars in Cloud Function)
    condition: listing.condition || '',
    conditionID: listing.conditionID || '',
    conditionDescription: listing.conditionDescription || undefined,
    primaryCategoryID: listing.primaryCategoryID || '',
    primaryCategoryName: listing.primaryCategoryName || '',

    // ALL item specifics from eBay (Brand, Size, Color, Material, etc.)
    itemSpecifics: listing.itemSpecifics || {},
    pictureURLs: listing.pictureURLs || [], // ALL images for relisting

    // CRITICAL for relisting - new fields from enhanced Cloud Function
    shippingInfo: listing.shippingInfo || undefined,
    returnPolicy: listing.returnPolicy || undefined,
    paymentMethods: listing.paymentMethods || undefined,
    buyerRequirements: listing.buyerRequirements || undefined,
    itemLocation: listing.itemLocation || undefined,
    endTime: listing.endTime || undefined,

    // Product Identifiers
    upc: listing.upc || undefined,
    ean: listing.ean || undefined,
    isbn: listing.isbn || undefined,
    mpn: listing.mpn || undefined,
    brand: listing.brand || undefined,
    manufacturer: listing.manufacturer || undefined,

    // Best offer settings
    bestOfferEnabled: listing.bestOfferEnabled || undefined,
    autoAcceptPrice: listing.autoAcceptPrice || undefined,
    autoDeclinePrice: listing.autoDeclinePrice || undefined,

    // Auction details
    reservePrice: listing.reservePrice || undefined,
    hasReservePrice: listing.hasReservePrice || undefined,

    // Seller metadata
    sellerNotes: listing.sellerNotes || undefined,
    listingStatus: listing.listingStatus || undefined,

    // Engagement metrics
    watchCount: listing.watchCount || undefined,
    hitCount: listing.hitCount || undefined,

    // Tax and billing details
    salesTaxIncluded: listing.salesTaxIncluded || undefined,

    // Bidding details
    biddingDetails: listing.biddingDetails || undefined,
    highestBidderUserID: listing.highestBidderUserID || undefined,
  }));

  // Filter out sold-out items (quantity - quantitySold <= 0)
  const availableListings = mappedListings.filter((listing) => {
    const remaining = (listing.quantity || 0) - (listing.quantitySold || 0);
    return remaining > 0;
  });

  console.log('[fetchEbayListings] Mapped', mappedListings.length, 'listings,', availableListings.length, 'available (filtered out', mappedListings.length - availableListings.length, 'sold out)');
  return availableListings;
}

/**
 * Import selected eBay listings to Firestore Item collection
 * Creates new Item documents directly in Firestore with all eBay data for relisting
 */
export async function importEbayItems(userId: string, listings: EbayListing[]): Promise<ImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  // eBay imports are RESTOCKS: every Item that gets a fresh eBay qty (whether
  // newly created or already existing / re-imported) is re-baselined to that qty
  // and its predating pending sales are auto-reconciled. Collected here, applied
  // in one batched pass after the import loop. See ./restockOnboard.ts.
  const restockTargets: RestockTarget[] = [];

  console.log('[importEbayItems] Starting import of', listings.length, 'listings for user', userId);

  for (const listing of listings) {
    try {
      console.log('[importEbayItems] Processing listing:', listing.itemId, listing.title);

      // Skip sold-out items
      const remaining = (listing.quantity || 0) - (listing.quantitySold || 0);
      if (remaining <= 0) {
        console.log('[importEbayItems] Skipping sold-out listing:', listing.itemId, `(qty: ${listing.quantity}, sold: ${listing.quantitySold})`);
        skipped.push(listing.itemId);
        continue;
      }

      // Check if item already exists by ebayListingId
      const existingResult = await new Promise<{ data: any[]; error: any }>((resolve) => {
        database
          .from('Item')
          .select('*')
          .eq('user_uuid', userId)
          .eq('ebayListingId', listing.itemId)
          .limit(1)
          .then(resolve);
      });

      if (existingResult.error) {
        console.error('[importEbayItems] Error checking existing:', existingResult.error);
      }

      if (existingResult.data && existingResult.data.length > 0) {
        // Re-import of an existing Item == a restock. We don't overwrite the Item
        // (it may have edited fields), but the freshly-imported eBay qty IS the
        // new restock count, so re-baseline it below.
        const existing = existingResult.data[0];
        const restockQty = typeof listing.quantity === 'number' ? listing.quantity : 1;
        restockTargets.push({
          id: existing.id,
          ebayQty: restockQty,
          poshmarkListingId: existing.poshmarkListingId,
          depopListingId: existing.depopListingId,
        });
        console.log('[importEbayItems] Existing item — re-baselining as restock:', listing.itemId, `qty=${restockQty}`);
        skipped.push(listing.itemId);
        continue;
      }

      // Generate barcode for the new item
      console.log('[importEbayItems] Generating barcode...');
      const barcode = await generateBarcode(userId, database);
      console.log('[importEbayItems] Generated barcode:', barcode);

      // Helper function to remove undefined values (Firestore rejects undefined)
      const removeUndefined = (obj: any) => {
        return Object.fromEntries(
          Object.entries(obj).filter(([_, value]) => value !== undefined)
        );
      };

      // Keyword detection for gym auto-assignment
      const detectGymFromTitle = (title: string): string[] => {
        const titleLower = title.toLowerCase();
        const tags: string[] = [];

        if (titleLower.includes('hoodie') || titleLower.includes('sweatshirt')) {
          tags.push('Hoodie');
        } else if (titleLower.includes('pullover') || titleLower.includes('jacket')) {
          tags.push('Pullover/Jackets');
        } else if (titleLower.includes('t-shirt') || titleLower.includes('tee') || titleLower.includes('shirt')) {
          tags.push('T-shirts');
        }

        return tags.length > 0 ? tags : ['T-shirts']; // Default to T-shirts gym
      };

      // Simplified itemData - store only SKU, price, title, image
      // Full details will be fetched from eBay API when relisting
      const itemData = {
        user_uuid: userId,
        sku: listing.itemId,
        title: listing.title,
        description: listing.title,
        imageUrls: listing.imageUrl ? [listing.imageUrl] : [],
        manualPriceCents: Math.round(listing.price * 100),
        purchasePriceCents: 0,
        status: 'Active',

        // eBay SKU for future API lookups
        ebayListingId: listing.itemId,
        ebayUrl: listing.listingUrl, // eBay listing URL for quick access

        // eBay Quantity tracking
        ebayQuantity: listing.quantity || 1,
        ebayQuantitySold: listing.quantitySold || 0,

        // Gym assignment via keyword detection
        normalizedTags: detectGymFromTitle(listing.title),

        // Standard fields
        barcode: barcode,
        category: 'Clothing',
        marketplace: 'ebay',
        listingPlatforms: 'eBay',
        brand: (listing.itemSpecifics?.['Brand'] as string) || 'Unknown',
        size: normalizeSize(
          (listing.itemSpecifics?.['Size'] as string) ||
          (listing.itemSpecifics?.['Jersey Size'] as string) ||
          extractSizeFromTitle(listing.title)
        ),
        ebayItemSpecifics: listing.itemSpecifics && Object.keys(listing.itemSpecifics).length > 0
          ? listing.itemSpecifics
          : undefined,
        notes: 'Imported from eBay',
        purchaseDate: new Date().toISOString(),
        soldDate: null,
        soldPriceCents: null,
      };

      console.log('[importEbayItems] Inserting item to Firestore...');

      // Remove undefined values before inserting (Firestore rejects undefined)
      const cleanedItemData = removeUndefined(itemData);

      // Insert item using proper promise pattern
      const insertResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .insert([cleanedItemData])
          .select()
          .then(resolve);
      });

      if (insertResult.error) {
        console.error('[importEbayItems] Insert error:', insertResult.error);
        throw insertResult.error;
      }

      console.log('[importEbayItems] Successfully imported:', listing.itemId, 'Result:', insertResult.data);
      imported.push(listing.itemId);

      // New item from an eBay import == an initial restock baseline. Seed the
      // per-item baseline to the imported eBay qty so the stock model measures
      // future sales from here (new imports otherwise have no baseline at all).
      const newDoc = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data;
      if (newDoc?.id) {
        restockTargets.push({
          id: newDoc.id,
          ebayQty: typeof listing.quantity === 'number' ? listing.quantity : 1,
          // A brand-new eBay import has no posh/depop binding yet, but it could
          // already have predating pending rows once matched later — those will
          // be handled by a subsequent re-import once the binding exists.
        });
      }
    } catch (error) {
      console.error(`[importEbayItems] Failed to import listing ${listing.itemId}:`, error);
      errors.push({
        itemId: listing.itemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[importEbayItems] Import complete:', { imported: imported.length, skipped: skipped.length, errors: errors.length });

  // Restock onboarding — re-baseline every touched Item to its freshly-imported
  // eBay qty and auto-reconcile predating pending sales. Best-effort: a failure
  // here must NOT fail the import the user just performed.
  try {
    if (restockTargets.length > 0) {
      const r = await onboardImportsAsRestock(userId, restockTargets);
      console.log('[importEbayItems] Restock onboarding:', r);
    }
  } catch (e) {
    console.error('[importEbayItems] Restock onboarding failed (import itself succeeded):', e);
  }

  return { imported, skipped, errors };
}

