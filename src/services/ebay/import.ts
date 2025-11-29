import type { EbayListing, ImportResult } from '../../types/ebay';
import { ebayService } from '../ebayService';
import { database } from '../../lib/database/client';
import { generateBarcode } from '../barcodes';

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
  // Note: Descriptions excluded from API response to reduce size
  const mappedListings: EbayListing[] = result.listings.map((listing: any) => ({
    itemId: listing.itemId,
    title: listing.title,
    price: listing.currentPrice,
    currency: listing.currency || 'USD',
    imageUrl: listing.pictureURL || listing.pictureURLs?.[0] || '',
    listingUrl: listing.viewItemURL,
    quantity: listing.quantity,
    format: listing.listingType || 'FixedPrice',
    categoryName: listing.primaryCategoryName || '',
    // Extended fields (reduced for response size)
    condition: listing.condition || '',
    conditionID: listing.conditionID || '',
    primaryCategoryID: listing.primaryCategoryID || '',
    primaryCategoryName: listing.primaryCategoryName || '',
    // Backend returns essential specifics: Brand, Size, Color
    itemSpecifics: listing.itemSpecifics || {},
    pictureURLs: listing.pictureURLs || [],
  }));

  console.log('[fetchEbayListings] Mapped', mappedListings.length, 'listings');
  return mappedListings;
}

/**
 * Import selected eBay listings to Firestore Item collection
 * Creates new Item documents directly in Firestore with all eBay data for relisting
 */
export async function importEbayItems(userId: string, listings: EbayListing[]): Promise<ImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ itemId: string; error: string }> = [];

  console.log('[importEbayItems] Starting import of', listings.length, 'listings for user', userId);

  for (const listing of listings) {
    try {
      console.log('[importEbayItems] Processing listing:', listing.itemId, listing.title);

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
        console.log('[importEbayItems] Skipping existing item:', listing.itemId);
        skipped.push(listing.itemId);
        continue;
      }

      // Generate barcode for the new item
      console.log('[importEbayItems] Generating barcode...');
      const barcode = await generateBarcode(userId, database);
      console.log('[importEbayItems] Generated barcode:', barcode);

      // Create Item document in Firestore with eBay data
      // Note: Full descriptions excluded from API to reduce response size
      const itemData = {
        user_uuid: userId,
        sku: listing.itemId,
        title: listing.title,
        description: listing.title, // Use title as description (full desc too large to fetch)
        imageUrls: listing.imageUrl ? [listing.imageUrl] : [],
        manualPriceCents: Math.round(listing.price * 100),
        purchasePriceCents: 0,
        status: 'IN_STOCK',
        // eBay-specific fields for relisting
        ebayListingId: listing.itemId,
        ebayUrl: listing.listingUrl,
        ebayPrice: listing.price,
        ebayCurrency: listing.currency || 'USD',
        ebayQuantity: listing.quantity || 1,
        ebayFormat: listing.format || 'FixedPriceItem',
        ebayCategory: listing.primaryCategoryName || listing.categoryName || '',
        ebayCategoryID: listing.primaryCategoryID || '',
        ebayCondition: listing.condition || 'Not Specified',
        ebayConditionID: listing.conditionID || '',
        // Item specifics (Brand, Size, Color from backend)
        ebayItemSpecifics: listing.itemSpecifics || {},
        ebayPictureURLs: listing.pictureURLs || (listing.imageUrl ? [listing.imageUrl] : []),
        marketplace: 'ebay',
        listingPlatforms: 'eBay',
        // Extract brand/size from item specifics
        brand: listing.itemSpecifics?.Brand || 'Unknown',
        size: listing.itemSpecifics?.Size || '',
        // Standard fields
        normalizedTags: ['T-shirts'], // Valid tag so items show in T-shirts gym
        barcode: barcode,
        category: 'Clothing',
        notes: 'Hanger: None. Imported from eBay',
        conditionNotes: listing.condition || '',
        purchaseDate: new Date().toISOString(),
        soldDate: null,
        soldPriceCents: null,
      };

      console.log('[importEbayItems] Inserting item to Firestore...');

      // Insert item using proper promise pattern
      const insertResult = await new Promise<{ data: any; error: any }>((resolve) => {
        database
          .from('Item')
          .insert([itemData])
          .select()
          .then(resolve);
      });

      if (insertResult.error) {
        console.error('[importEbayItems] Insert error:', insertResult.error);
        throw insertResult.error;
      }

      console.log('[importEbayItems] Successfully imported:', listing.itemId, 'Result:', insertResult.data);
      imported.push(listing.itemId);
    } catch (error) {
      console.error(`[importEbayItems] Failed to import listing ${listing.itemId}:`, error);
      errors.push({
        itemId: listing.itemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[importEbayItems] Import complete:', { imported: imported.length, skipped: skipped.length, errors: errors.length });
  return { imported, skipped, errors };
}

