import type { Item } from '../types/item';
import { generateBarcode } from './barcodes';
import { database } from '../lib/database/client';
import { ebayService } from './ebayService';
import { toast } from 'sonner';

/**
 * Create a new item from eBay listing data for relisting
 * Fetches fresh eBay data using SKU, creates new listing with complete details
 */
export async function createRelistingFromItem(sourceItem: Item, userId: string): Promise<Item> {
  const barcode = await generateBarcode(userId, database);

  // If item has eBay SKU, fetch fresh details from eBay API
  let ebayDetails = null;
  if (sourceItem.ebayListingId) {
    try {
      toast.info('Fetching item details from eBay...');
      const result = await ebayService.getItemDetails(sourceItem.ebayListingId);
      if (result.success && result.item) {
        ebayDetails = result.item;
        toast.success('eBay details loaded');
      }
    } catch (error) {
      console.error('Failed to fetch eBay details:', error);
      toast.warning('Using stored data (eBay fetch failed)');
    }
  }

  // Create new item with eBay data pre-populated
  const relistingItem: Item = {
    // Generate new ID - this will be assigned by the database
    id: '',

    // Title from eBay
    name: ebayDetails?.title || sourceItem.name,

    // Use primary image from eBay
    imageUrl: ebayDetails?.pictureURLs?.[0] || sourceItem.imageUrl || '',

    // Pricing - use original eBay price as reference
    costPrice: 0,
    sellingPrice: ebayDetails ? Math.round(ebayDetails.currentPrice * 100) : (sourceItem.sellingPrice || 0),

    // Status - Active for relisting
    status: 'Active' as const,

    // Size from eBay item specifics
    size: ebayDetails?.itemSpecifics?.Size || sourceItem.size || '',

    // Hanger status
    hangerStatus: sourceItem.hangerStatus || 'On Hanger',
    hangerId: sourceItem.hangerId || '',

    // Tags - keep same category
    tags: sourceItem.tags || [],

    // eBay related fields
    ebayUrl: ebayDetails?.viewItemURL || sourceItem.ebayUrl || '',
    ebayFees: 0,
    netProfit: 0,

    // Original listing identifiers
    ebayListingId: sourceItem.ebayListingId,

    // Barcode
    barcode: barcode,

    // Notes - include eBay details for reference
    notes: `Relisted from eBay SKU ${sourceItem.ebayListingId}.\n\nCondition: ${ebayDetails?.condition || 'Unknown'}\n\nDescription:\n${ebayDetails?.description || sourceItem.name}`,

    // Dates
    dateAdded: new Date().toISOString(),
    dateField: new Date().toISOString(),
  };

  return relistingItem;
}

/**
 * Helper to fetch and format eBay data for display/copying
 * Fetches fresh data from eBay API using SKU
 */
export async function formatEbayDataForRelisting(item: Item): Promise<string> {
  const lines: string[] = [];

  // Fetch fresh data from eBay if SKU exists
  if (item.ebayListingId) {
    try {
      const result = await ebayService.getItemDetails(item.ebayListingId);
      if (result.success && result.item) {
        const ebay = result.item;

        lines.push(`Title: ${ebay.title}`);
        lines.push(`Condition: ${ebay.condition}`);
        lines.push(`Price: $${ebay.currentPrice.toFixed(2)} ${ebay.currency}`);
        lines.push(`Quantity: ${ebay.quantity}`);
        lines.push(`Category: ${ebay.primaryCategoryName}`);

        if (ebay.description) {
          lines.push(`\nDescription:\n${ebay.description}`);
        }

        if (ebay.itemSpecifics && Object.keys(ebay.itemSpecifics).length > 0) {
          lines.push(`\nItem Specifics:`);
          Object.entries(ebay.itemSpecifics).forEach(([key, value]) => {
            lines.push(`  ${key}: ${value}`);
          });
        }

        return lines.join('\n');
      }
    } catch (error) {
      console.error('Failed to fetch eBay details:', error);
    }
  }

  // Fallback to stored data
  lines.push(`Title: ${item.name}`);
  lines.push(`SKU: ${item.ebayListingId || 'Unknown'}`);

  return lines.join('\n');
}
