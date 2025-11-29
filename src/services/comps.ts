import { database } from '../lib/database/client';

export interface ClothingComp {
  id: string;
  search_query: string;
  marketplace: 'ebay' | 'poshmark' | 'mercari' | 'depop' | 'grailed';
  title: string;
  price: number | null;
  sold_date: string | null;
  shipping_cost: number | null;
  image_url: string | null;
  listing_url: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  condition: string | null;
  ai_similarity_score: number | null;
  scraped_at: string | null;
  created_at: string;
}

export interface CompSearchParams {
  name?: string;
  brand?: string;
  size?: string;
  tags?: string[];
  minSimilarity?: number;
  limit?: number;
}

/**
 * Search for clothing comps based on item attributes
 */
export async function searchComps(params: CompSearchParams): Promise<ClothingComp[]> {
  try {
    // Build search query from item name, brand, size, and tags
    const searchTerms = [];
    
    if (params.brand) {
      searchTerms.push(params.brand);
    }
    
    if (params.tags && params.tags.length > 0) {
      searchTerms.push(params.tags[0]); // Use first tag as category
    }
    
    if (params.size) {
      searchTerms.push(`Size ${params.size}`);
    }
    
    const searchQuery = searchTerms.join(' ');
    
    console.log('Searching comps with query:', searchQuery);

    let query = database
      .from('clothing_comps')
      .select('*')
      .order('ai_similarity_score', { ascending: false })
      .order('scraped_at', { ascending: false });

    // Search by query string
    if (searchQuery) {
      query = query.ilike('search_query', `%${searchQuery}%`);
    }

    // Filter by similarity score
    if (params.minSimilarity !== undefined) {
      query = query.gte('ai_similarity_score', params.minSimilarity);
    }

    // Limit results
    query = query.limit(params.limit || 10);

    const result = await (query as any);
    const { data, error } = result;

    if (error) {
      console.error('Error fetching comps:', error);
      return [];
    }

    console.log('Found comps:', data?.length || 0);
    return ((data as unknown) as ClothingComp[]) || [];
  } catch (error) {
    console.error('Error searching comps:', error);
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

  const prices = comps
    .map(c => c.price)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      medianPrice: 0,
      count: 0
    };
  }

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
    if (!comp.price) return acc;
    
    if (!acc[comp.marketplace]) {
      acc[comp.marketplace] = {
        count: 0,
        avgPrice: 0,
        totalPrice: 0
      };
    }
    acc[comp.marketplace].count++;
    acc[comp.marketplace].totalPrice += comp.price;
    return acc;
  }, {} as Record<string, { count: number; avgPrice: number; totalPrice: number }>);

  // Calculate averages
  Object.keys(breakdown).forEach(marketplace => {
    breakdown[marketplace].avgPrice =
      breakdown[marketplace].totalPrice / breakdown[marketplace].count;
  });

  return breakdown;
}
