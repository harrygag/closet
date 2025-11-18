import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface EbayListingToImport {
  itemId: string;
  title: string;
  price: number;
  imageUrl?: string;
  listingUrl: string;
  itemSpecifics?: Array<{ name: string; value: string }>;
  categoryName?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, listings } = req.body as { userId: string; listings: EbayListingToImport[] };

    if (!userId || !listings || listings.length === 0) {
      return res.status(400).json({ error: 'userId and listings are required' });
    }

    const results = {
      imported: [] as string[],
      skipped: [] as string[],
      errors: [] as Array<{ itemId: string; error: string }>,
    };

    for (const listing of listings) {
      try {
        // Check if already imported
        const { data: existing } = await supabase
          .from('Item')
          .select('id')
          .eq('user_uuid', userId)
          .eq('ebay_item_id', listing.itemId)
          .single();

        if (existing) {
          results.skipped.push(listing.itemId);
          continue;
        }

        // Transform eBay listing to Item format
        const item = transformEbayListing(listing, userId);

        // Insert into database
        const { data: inserted, error: insertError } = await supabase
          .from('Item')
          .insert(item)
          .select('id')
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          results.errors.push({ itemId: listing.itemId, error: insertError.message });
        } else {
          results.imported.push(inserted.id);
        }
      } catch (error) {
        console.error(`Error importing ${listing.itemId}:`, error);
        results.errors.push({ 
          itemId: listing.itemId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('Error importing items:', error);
    res.status(500).json({ error: 'Failed to import items' });
  }
}

function transformEbayListing(listing: EbayListingToImport, userId: string) {
  // Extract size from item specifics
  const size = extractSpecific(listing.itemSpecifics, ['Size', 'US Size', 'Size Type']) || '';
  
  // Extract brand from item specifics or parse from title
  const brand = extractSpecific(listing.itemSpecifics, ['Brand', 'Manufacturer']) || parseBrandFromTitle(listing.title);
  
  // Map category to tags
  const category = mapCategoryToTag(listing.categoryName, listing.title);
  
  return {
    user_uuid: userId,
    title: listing.title,
    brand: brand || null,
    category: category || 'Clothing',
    size: size || null,
    imageUrls: listing.imageUrl ? [listing.imageUrl] : [],
    manualPriceCents: Math.round(listing.price * 100),
    status: 'IN_STOCK',
    ebay_item_id: listing.itemId,
    imported_from: 'ebay',
    ebay_imported_at: new Date().toISOString(),
    notes: `Imported from eBay: ${listing.listingUrl}`,
    normalizedTags: category ? [category] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function extractSpecific(specifics: Array<{ name: string; value: string }> | undefined, possibleNames: string[]): string | null {
  if (!specifics) return null;
  
  for (const specific of specifics) {
    if (possibleNames.some(name => specific.name.toLowerCase().includes(name.toLowerCase()))) {
      return specific.value;
    }
  }
  
  return null;
}

function parseBrandFromTitle(title: string): string | null {
  // Common brand patterns
  const brands = ['Nike', 'Adidas', 'Puma', 'Reebok', 'Under Armour', 'Champion', 'Jordan', 'Yeezy'];
  const titleLower = title.toLowerCase();
  
  for (const brand of brands) {
    if (titleLower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  
  return null;
}

function mapCategoryToTag(categoryName?: string, title?: string): string | null {
  const tags = ['Hoodie', 'Jersey', 'polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];
  
  const searchText = `${categoryName || ''} ${title || ''}`.toLowerCase();
  
  if (searchText.includes('hoodie') || searchText.includes('sweatshirt')) return 'Hoodie';
  if (searchText.includes('jersey')) return 'Jersey';
  if (searchText.includes('polo')) return 'polo';
  if (searchText.includes('jacket') || searchText.includes('pullover')) return 'Pullover/Jackets';
  if (searchText.includes('shirt') || searchText.includes('tee')) return 'T-shirts';
  if (searchText.includes('pants') || searchText.includes('shorts') || searchText.includes('jeans')) return 'Bottoms';
  
  return null;
}



