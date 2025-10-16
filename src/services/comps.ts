import { supabase } from '../lib/supabase/client';

export interface ClothingComp {
  id: string;
  source_marketplace: 'ebay' | 'poshmark' | 'mercari' | 'depop' | 'grailed';
  listing_id: string | null;
  url: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  category: string | null;
  price: number;
  original_price: number | null;
  shipping_cost: number;
  sold_date: string | null;
  image_urls: string[];
  description: string | null;
  ai_features: Record<string, any> | null;
  similarity_score: number | null;
  scraped_at: string;
  created_at: string;
}

export interface CompSearchParams {
  category?: string;
  brand?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  minSimilarity?: number;
  marketplace?: string;
  limit?: number;
}

/**
 * Search for clothing comps with optional filters
 */
export async function searchComps(params: CompSearchParams): Promise<ClothingComp[]> {
  try {
    let query = supabase
      .from('clothing_comps')
      .select('*')
      .order('similarity_score', { ascending: false, nullsFirst: false })
      .order('scraped_at', { ascending: false });

    // Apply filters
    if (params.category) {
      query = query.eq('category', params.category);
    }

    if (params.brand) {
      query = query.ilike('brand', `%${params.brand}%`);
    }

    if (params.size) {
      query = query.eq('size', params.size);
    }

    if (params.minPrice !== undefined) {
      query = query.gte('price', params.minPrice);
    }

    if (params.maxPrice !== undefined) {
      query = query.lte('price', params.maxPrice);
    }

    if (params.minSimilarity !== undefined) {
      query = query.gte('similarity_score', params.minSimilarity);
    }

    if (params.marketplace) {
      query = query.eq('source_marketplace', params.marketplace);
    }

    // Limit results
    query = query.limit(params.limit || 20);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching comps:', error);
      return [];
    }

    return data as ClothingComp[];
  } catch (error) {
    console.error('Error searching comps:', error);
    return [];
  }
}

/**
 * Get comps for a specific item based on its attributes
 */
export async function getCompsForItem(item: {
  name: string;
  size: string;
  tags: string[];
}): Promise<ClothingComp[]> {
  try {
    // Extract category from tags
    const category = item.tags[0]?.toLowerCase();

    // Extract brand from name (simple heuristic)
    const brandMatch = item.name.match(/^([A-Z][a-zA-Z]+)/);
    const brand = brandMatch ? brandMatch[1] : null;

    return await searchComps({
      category,
      brand: brand || undefined,
      size: item.size,
      minSimilarity: 0.6,
      limit: 10
    });
  } catch (error) {
    console.error('Error getting comps for item:', error);
    return [];
  }
}

/**
 * Get price statistics for comps
 */
export function getCompStats(comps: ClothingComp[]) {
  if (comps.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      medianPrice: 0,
      count: 0
    };
  }

  const prices = comps.map(c => c.price).sort((a, b) => a - b);

  return {
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    medianPrice: prices[Math.floor(prices.length / 2)],
    count: comps.length
  };
}

/**
 * Get marketplace breakdown of comps
 */
export function getMarketplaceBreakdown(comps: ClothingComp[]) {
  const breakdown = comps.reduce((acc, comp) => {
    if (!acc[comp.source_marketplace]) {
      acc[comp.source_marketplace] = {
        count: 0,
        avgPrice: 0,
        totalPrice: 0
      };
    }
    acc[comp.source_marketplace].count++;
    acc[comp.source_marketplace].totalPrice += comp.price;
    return acc;
  }, {} as Record<string, { count: number; avgPrice: number; totalPrice: number }>);

  // Calculate averages
  Object.keys(breakdown).forEach(marketplace => {
    breakdown[marketplace].avgPrice =
      breakdown[marketplace].totalPrice / breakdown[marketplace].count;
  });

  return breakdown;
}
