/**
 * Backfill eBay URLs for items that have ebayListingId but no ebayUrl
 * eBay item URLs follow the pattern: https://www.ebay.com/itm/{itemId}
 */

import { database } from '../lib/database/client';

export async function countItemsNeedingEbayUrls(userId: string): Promise<number> {
  try {
    const { data, error } = await (database as any)
      .from('Item')
      .select('id')
      .eq('user_uuid', userId)
      .not('ebayListingId', 'is', null)
      .is('ebayUrl', null);

    if (error) {
      console.error('[countItemsNeedingEbayUrls] Error:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('[countItemsNeedingEbayUrls] Error:', error);
    return 0;
  }
}

export async function backfillEbayUrls(userId: string): Promise<{ success: boolean; itemsUpdated: number }> {
  try {
    console.log('[backfillEbayUrls] Starting backfill for user:', userId);

    // Fetch items that need eBay URLs
    const { data: itemsNeedingUrls, error: fetchError } = await (database as any)
      .from('Item')
      .select('id, ebayListingId')
      .eq('user_uuid', userId)
      .not('ebayListingId', 'is', null)
      .is('ebayUrl', null);

    if (fetchError) {
      console.error('[backfillEbayUrls] Fetch error:', fetchError);
      return { success: false, itemsUpdated: 0 };
    }

    if (!itemsNeedingUrls || itemsNeedingUrls.length === 0) {
      console.log('[backfillEbayUrls] No items need eBay URLs');
      return { success: true, itemsUpdated: 0 };
    }

    console.log('[backfillEbayUrls] Found', itemsNeedingUrls.length, 'items needing eBay URLs');

    // Update each item with constructed eBay URL
    let updatedCount = 0;
    for (const item of itemsNeedingUrls) {
      const ebayUrl = `https://www.ebay.com/itm/${item.ebayListingId}`;

      const { error: updateError } = await (database as any)
        .from('Item')
        .update({ ebayUrl })
        .eq('id', item.id);

      if (updateError) {
        console.error('[backfillEbayUrls] Update error for item:', item.id, updateError);
      } else {
        updatedCount++;
        console.log('[backfillEbayUrls] Updated item:', item.id, 'with URL:', ebayUrl);
      }
    }

    console.log('[backfillEbayUrls] Backfill complete. Updated', updatedCount, 'items');
    return { success: true, itemsUpdated: updatedCount };
  } catch (error) {
    console.error('[backfillEbayUrls] Error:', error);
    return { success: false, itemsUpdated: 0 };
  }
}
