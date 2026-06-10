import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

// Note: admin.initializeApp() is called in index.ts
// Don't initialize here to avoid duplicate app error

const getDb = () => admin.firestore();

// Initialize Anthropic client
const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY || functions.config().anthropic?.api_key;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }
  return new Anthropic({ apiKey });
};

// Types
interface AIAssistantRequest {
  message: string;
  userId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface ItemContext {
  id: string;
  name: string;
  tags: string[];
  ebayListingId?: string;
  ebayPrice?: number;
  dateAdded?: string;
  status: string;
  brand?: string;
  size?: string;
  daysOld?: number;
  currentPrice?: number;
  description?: string;
  condition?: string;
  imageCount?: number;
  hasEbayData?: boolean;
}

// Tool definitions for Anthropic
const tools: Anthropic.Tool[] = [
  {
    name: 'find_items',
    description: 'Find items in the inventory based on filters. Returns all matching items. Use result.itemIds for the item IDs. Can search by SKU, barcode, or item ID.',
    input_schema: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Find item by exact SKU/barcode match (ebaySku or barcode field)',
        },
        itemId: {
          type: 'string',
          description: 'Find item by exact Firestore document ID',
        },
        nameSearch: {
          type: 'string',
          description: 'Search items by name (partial match)',
        },
        brand: {
          type: 'string',
          description: 'Filter by brand name (e.g., "Nike", "Adidas")',
        },
        category: {
          type: 'string',
          description: 'Filter by category/tag (e.g., "Hoodie", "Jersey", "T-shirts")',
        },
        minDays: {
          type: 'number',
          description: 'Find items listed at least this many days ago',
        },
        maxDays: {
          type: 'number',
          description: 'Find items listed at most this many days ago',
        },
        status: {
          type: 'string',
          description: 'Filter by status (e.g., "Active", "Inactive", "SOLD")',
        },
        hasEbayData: {
          type: 'boolean',
          description: 'Filter items that have eBay listing data',
        },
        minPrice: {
          type: 'number',
          description: 'Minimum price',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price',
        },
      },
    },
  },
  {
    name: 'get_item_details',
    description: 'Get detailed information about specific items by their IDs',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs to get details for',
        },
      },
      required: ['itemIds'],
    },
  },
  {
    name: 'calculate_price_changes',
    description: 'Calculate new prices for items based on percentage or fixed amount change',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs to calculate price changes for',
        },
        changeType: {
          type: 'string',
          enum: ['percentage', 'fixed'],
          description: 'Type of price change',
        },
        amount: {
          type: 'number',
          description: 'Amount to change (e.g., 20 for 20% or $20)',
        },
        direction: {
          type: 'string',
          enum: ['increase', 'decrease'],
          description: 'Direction of price change',
        },
      },
      required: ['itemIds', 'changeType', 'amount', 'direction'],
    },
  },
  {
    name: 'get_inventory_insights',
    description: 'Get insights and analytics about the inventory - avg prices, age distribution, status breakdown, top brands, etc.',
    input_schema: {
      type: 'object',
      properties: {
        includeDetails: {
          type: 'boolean',
          description: 'Include detailed breakdown by category/brand',
        },
      },
    },
  },
  {
    name: 'relist_to_ebay',
    description: 'Relist items to eBay using stored item data (photos, descriptions, specifics). Finds items by SKU or title pattern.',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs to relist to eBay',
        },
        priceAdjustment: {
          type: 'object',
          description: 'Optional price adjustment before relisting',
          properties: {
            type: { type: 'string', enum: ['percentage', 'fixed'] },
            amount: { type: 'number' },
            direction: { type: 'string', enum: ['increase', 'decrease'] },
          },
        },
      },
      required: ['itemIds'],
    },
  },
  {
    name: 'update_prices',
    description: 'Update prices in Firestore for specific items. Does NOT update live eBay listings.',
    input_schema: {
      type: 'object',
      properties: {
        priceChanges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              newPrice: { type: 'number', description: 'New price in cents' },
            },
            required: ['itemId', 'newPrice'],
          },
          description: 'Array of item ID and new price pairs',
        },
      },
      required: ['priceChanges'],
    },
  },
  {
    name: 'search_by_sku_or_title',
    description: 'Search for items by SKU or title pattern. Useful before relisting or price updates.',
    input_schema: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Search by exact SKU',
        },
        titlePattern: {
          type: 'string',
          description: 'Search by title (case-insensitive contains)',
        },
      },
    },
  },
  {
    name: 'get_market_trends',
    description: 'Get market intelligence for items - watch count, view stats, and suggested pricing based on engagement metrics',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs to analyze for market trends',
        },
      },
      required: ['itemIds'],
    },
  },
  {
    name: 'get_sold_comps',
    description: 'Find recently sold comparable items on eBay for pricing research. Returns sold prices, averages, and price ranges.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Nike Hoodie", "Adidas Jersey"). Combine brand + item type for best results.',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (e.g., "Hoodie", "Jersey", "T-shirts")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default 10, max 20)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_performance',
    description: 'Analyze listing performance metrics - combines watch count, days listed, and pricing data to identify underperforming items',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of item IDs to analyze',
        },
      },
      required: ['itemIds'],
    },
  },
];

// Tool execution functions
async function executeFindItems(userId: string, filters: any): Promise<{
  itemIds: string[];
  totalFound: number;
  showing: number;
  hasMore: boolean;
}> {
  console.log('[AI] Executing find_items with filters:', filters);
  console.log('[AI] User ID:', userId);

  try {
    const db = getDb();

    // Handle exact ID lookup
    if (filters.itemId) {
      const doc = await db.collection('Item').doc(filters.itemId).get();
      if (doc.exists && doc.data()?.user_uuid === userId) {
        return {
          itemIds: [doc.id],
          totalFound: 1,
          showing: 1,
          hasMore: false
        };
      } else {
        return {
          itemIds: [],
          totalFound: 0,
          showing: 0,
          hasMore: false
        };
      }
    }

    // Handle SKU lookup (search both ebaySku and barcode fields)
    if (filters.sku) {
      const skuQuery = db.collection('Item')
        .where('user_uuid', '==', userId)
        .where('ebaySku', '==', filters.sku);
      const barcodeQuery = db.collection('Item')
        .where('user_uuid', '==', userId)
        .where('barcode', '==', filters.sku);

      const [skuSnapshot, barcodeSnapshot] = await Promise.all([
        skuQuery.get(),
        barcodeQuery.get()
      ]);

      const foundItems = new Map();
      skuSnapshot.docs.forEach(doc => foundItems.set(doc.id, doc));
      barcodeSnapshot.docs.forEach(doc => foundItems.set(doc.id, doc));

      const itemIds = Array.from(foundItems.keys());
      return {
        itemIds,
        totalFound: itemIds.length,
        showing: itemIds.length,
        hasMore: false
      };
    }

    let query: FirebaseFirestore.Query = db.collection('Item').where('user_uuid', '==', userId);

    // Apply filters
    if (filters.brand) {
      query = query.where('brand', '==', filters.brand);
    }
    if (filters.category) {
      query = query.where('tags', 'array-contains', filters.category);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.hasEbayData !== undefined) {
      if (filters.hasEbayData) {
        query = query.where('ebayListingId', '>', '');
      }
    }

    console.log('[AI] Executing Firestore query...');
    const snapshot = await query.get();
    console.log('[AI] Query returned', snapshot.docs.length, 'documents');

    let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    // Apply name search filter (client-side)
    if (filters.nameSearch) {
      const searchTerm = filters.nameSearch.toLowerCase();
      items = items.filter(item =>
        (item.name || '').toLowerCase().includes(searchTerm) ||
        (item.title || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply client-side filters
    if (filters.minDays !== undefined || filters.maxDays !== undefined) {
      const now = new Date();
      items = items.filter(item => {
        const dateAdded = item.dateAdded || item.dateField;
        if (!dateAdded) return false;

        const itemDate = new Date(dateAdded);
        const daysOld = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

        if (filters.minDays !== undefined && daysOld < filters.minDays) return false;
        if (filters.maxDays !== undefined && daysOld > filters.maxDays) return false;
        return true;
      });
    }

    if (filters.minPrice !== undefined) {
      items = items.filter(item => (item.sellingPrice || 0) >= filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      items = items.filter(item => (item.sellingPrice || 0) <= filters.maxPrice);
    }

    console.log(`[AI] Found ${items.length} items matching filters`);

    return {
      itemIds: items.map(item => item.id),
      totalFound: items.length,
      showing: items.length,
      hasMore: false
    };
  } catch (error) {
    console.error('[AI] Error in executeFindItems:', error);
    throw error;
  }
}

async function executeGetItemDetails(userId: string, itemIds: string[]): Promise<ItemContext[]> {
  console.log('[AI] Executing get_item_details for', itemIds.length, 'items');

  try {
    const db = getDb();
    const items: ItemContext[] = [];
    for (const itemId of itemIds) {
      const doc = await db.collection('Item').doc(itemId).get();
      if (doc.exists && doc.data()?.user_uuid === userId) {
        const data = doc.data()!;

        // Calculate days since added
        const dateAdded = data.dateAdded || data.dateField;
        let daysOld = 0;
        if (dateAdded) {
          const addedDate = new Date(dateAdded);
          daysOld = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        items.push({
          id: doc.id,
          name: data.name || data.title || 'Unnamed',
          tags: data.tags || data.normalizedTags || [],
          ebayListingId: data.ebayListingId,
          ebayPrice: data.ebayPrice,
          dateAdded: dateAdded,
          status: data.status || 'Active',
          brand: data.brand,
          size: data.size,
          daysOld,
          currentPrice: data.manualPriceCents || data.sellingPrice || data.ebayPrice || 0,
          description: data.ebayDescription || data.description || data.title || '',
          condition: data.ebayCondition || data.condition || '',
          imageCount: (data.images || data.imageUrls || []).length,
          hasEbayData: !!data.ebayListingId,
        });
      }
    }

    console.log(`[AI] Retrieved details for ${items.length} items`);
    return items;
  } catch (error) {
    console.error('[AI] Error in executeGetItemDetails:', error);
    throw error;
  }
}

async function executeCalculatePriceChanges(
  userId: string,
  itemIds: string[],
  changeType: 'percentage' | 'fixed',
  amount: number,
  direction: 'increase' | 'decrease'
): Promise<Array<{ itemId: string; itemName: string; oldPrice: number; newPrice: number; change: number }>> {
  console.log('[AI] Executing calculate_price_changes');

  try {
    const db = getDb();
    const items = await executeGetItemDetails(userId, itemIds);
    const results = [];

    for (const item of items) {
      const doc = await db.collection('Item').doc(item.id).get();
      const data = doc.data();
      // Database uses manualPriceCents, not sellingPrice
      const oldPrice = data?.manualPriceCents || data?.sellingPrice || 0;

      let newPrice: number;
      if (changeType === 'percentage') {
        const multiplier = direction === 'increase' ? (1 + amount / 100) : (1 - amount / 100);
        newPrice = Math.round(oldPrice * multiplier);
      } else {
        newPrice = direction === 'increase' ? oldPrice + amount : oldPrice - amount;
      }

      newPrice = Math.max(0, newPrice); // Ensure price doesn't go negative

      results.push({
        itemId: item.id,
        itemName: item.name,
        oldPrice,
        newPrice,
        change: newPrice - oldPrice,
      });
    }

    return results;
  } catch (error) {
    console.error('[AI] Error in executeCalculatePriceChanges:', error);
    throw error;
  }
}

async function executeGetInventoryInsights(userId: string, includeDetails: boolean = false) {
  console.log('[AI] Executing get_inventory_insights');

  try {
    const db = getDb();
    const snapshot = await db.collection('Item').where('user_uuid', '==', userId).get();

    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    if (items.length === 0) {
      return {
        totalItems: 0,
        message: 'No items in inventory yet. Start by importing items from eBay or adding them manually.',
      };
    }

    const now = new Date();
    const insights: any = {
      totalItems: items.length,
      statusBreakdown: {},
      avgPrice: 0,
      totalValue: 0,
      ageDistribution: {
        under7Days: 0,
        under30Days: 0,
        under90Days: 0,
        over90Days: 0,
      },
      withEbayData: items.filter(i => i.ebayListingId).length,
      categories: {},
      brands: {},
    };

    let totalPrice = 0;
    let itemsWithPrice = 0;

    for (const item of items) {
      // Status breakdown
      const status = item.status || 'Unknown';
      insights.statusBreakdown[status] = (insights.statusBreakdown[status] || 0) + 1;

      // Price analytics
      const price = item.sellingPrice || item.ebayPrice || 0;
      if (price > 0) {
        totalPrice += price;
        itemsWithPrice++;
      }
      insights.totalValue += price;

      // Age distribution
      const dateAdded = item.dateAdded || item.dateField;
      if (dateAdded) {
        const daysOld = Math.floor((now.getTime() - new Date(dateAdded).getTime()) / (1000 * 60 * 60 * 24));
        if (daysOld < 7) insights.ageDistribution.under7Days++;
        else if (daysOld < 30) insights.ageDistribution.under30Days++;
        else if (daysOld < 90) insights.ageDistribution.under90Days++;
        else insights.ageDistribution.over90Days++;
      }

      // Category breakdown
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => {
          insights.categories[tag] = (insights.categories[tag] || 0) + 1;
        });
      }

      // Brand breakdown
      if (item.brand) {
        insights.brands[item.brand] = (insights.brands[item.brand] || 0) + 1;
      }
    }

    insights.avgPrice = itemsWithPrice > 0 ? Math.round(totalPrice / itemsWithPrice) : 0;

    // Top brands and categories
    if (includeDetails) {
      insights.topBrands = Object.entries(insights.brands)
        .sort(([, a]: any, [, b]: any) => b - a)
        .slice(0, 5)
        .map(([brand, count]) => ({ brand, count }));

      insights.topCategories = Object.entries(insights.categories)
        .sort(([, a]: any, [, b]: any) => b - a)
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));
    }

    console.log('[AI] Generated inventory insights');
    return insights;
  } catch (error) {
    console.error('[AI] Error in executeGetInventoryInsights:', error);
    throw error;
  }
}

async function executeSearchBySkuOrTitle(userId: string, sku?: string, titlePattern?: string): Promise<string[]> {
  console.log('[AI] Executing search_by_sku_or_title', { sku, titlePattern });

  try {
    const db = getDb();
    let query: FirebaseFirestore.Query = db.collection('Item').where('user_uuid', '==', userId);

    if (sku) {
      query = query.where('ebaySku', '==', sku);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    // Filter by title pattern if provided (client-side)
    if (titlePattern && !sku) {
      const pattern = titlePattern.toLowerCase();
      items = items.filter(item => {
        const title = (item.ebayFullTitle || item.name || '').toLowerCase();
        return title.includes(pattern);
      });
    }

    console.log(`[AI] Found ${items.length} items matching search`);
    return items.map(item => item.id);
  } catch (error) {
    console.error('[AI] Error in executeSearchBySkuOrTitle:', error);
    throw error;
  }
}

async function executeUpdatePrices(userId: string, priceChanges: Array<{ itemId: string; newPrice: number }>) {
  console.log('[AI] Executing update_prices for', priceChanges.length, 'items');

  try {
    const db = getDb();
    const results = [];

    // IMPORTANT: This function only VALIDATES and PREPARES the price changes
    // It does NOT actually update the database - that happens after user confirmation
    for (const { itemId, newPrice } of priceChanges) {
      const doc = await db.collection('Item').doc(itemId).get();

      if (!doc.exists || doc.data()?.user_uuid !== userId) {
        results.push({ itemId, success: false, error: 'Item not found or access denied' });
        continue;
      }

      const data = doc.data()!;
      const oldPrice = data.manualPriceCents || data.sellingPrice || 0;

      results.push({
        itemId,
        itemName: data.name || data.title || 'Unnamed',
        success: true,
        oldPrice,
        newPrice,
        change: newPrice - oldPrice,
      });
    }

    console.log(`[AI] Prepared ${results.filter(r => r.success).length} price changes`);
    return results;
  } catch (error) {
    console.error('[AI] Error in executeUpdatePrices:', error);
    throw error;
  }
}

async function executeRelistToEbay(
  userId: string,
  itemIds: string[],
  priceAdjustment?: { type: 'percentage' | 'fixed'; amount: number; direction: 'increase' | 'decrease' }
) {
  console.log('[AI] Executing relist_to_ebay for', itemIds.length, 'items');

  try {
    const db = getDb();
    const results = [];

    for (const itemId of itemIds) {
      const doc = await db.collection('Item').doc(itemId).get();

      if (!doc.exists || doc.data()?.user_uuid !== userId) {
        results.push({ itemId, success: false, error: 'Item not found or access denied' });
        continue;
      }

      const item = doc.data()!;

      // Check if item has required eBay data
      if (!item.ebayFullTitle || !item.ebayCategoryID) {
        results.push({
          itemId,
          success: false,
          error: 'Missing required eBay data (title or category)',
        });
        continue;
      }

      // Calculate price (with optional adjustment)
      let price = item.ebayPrice || item.sellingPrice || 0;
      if (priceAdjustment) {
        if (priceAdjustment.type === 'percentage') {
          const multiplier = priceAdjustment.direction === 'increase'
            ? (1 + priceAdjustment.amount / 100)
            : (1 - priceAdjustment.amount / 100);
          price = Math.round(price * multiplier);
        } else {
          price = priceAdjustment.direction === 'increase'
            ? price + priceAdjustment.amount
            : price - priceAdjustment.amount;
        }
      }

      // Prepare listing data - IMPORTANT: This is a preview/validation step
      // The actual eBay API call would need to be made by calling the ebayInventoryCreateAndPublish function
      const listingData = {
        sku: item.ebaySku || `RELIST-${itemId}`,
        title: item.ebayFullTitle,
        description: item.ebayFullDescription || item.ebayDescription || '',
        price,
        categoryId: item.ebayCategoryID,
        condition: item.ebayCondition || 'Used',
        imageUrls: item.ebayPhotos?.map((p: any) => p.firebaseStorageUrl || p.ebayUrl) || [],
        itemSpecifics: item.ebayItemSpecifics || {},
      };

      results.push({
        itemId,
        success: true,
        message: 'Listing data prepared (requires user confirmation to actually list)',
        listingData,
        estimatedPrice: price,
      });
    }

    console.log(`[AI] Prepared ${results.filter(r => r.success).length} items for relisting`);
    return {
      message: `Prepared ${results.filter(r => r.success).length} items for relisting. Note: This is a preview only. To actually list to eBay, you need to confirm the action.`,
      results,
    };
  } catch (error) {
    console.error('[AI] Error in executeRelistToEbay:', error);
    throw error;
  }
}

async function executeGetMarketTrends(userId: string, itemIds: string[]) {
  console.log('[AI] Executing get_market_trends for', itemIds.length, 'items');

  try {
    const db = getDb();
    const results = [];

    for (const itemId of itemIds) {
      try {
        const doc = await db.collection('Item').doc(itemId).get();

        if (!doc.exists || doc.data()?.user_uuid !== userId) {
          results.push({ itemId, success: false, error: 'Item not found or access denied' });
          continue;
        }

        const data = doc.data()!;

        // Calculate age-based trends (no eBay API needed for speed)
        const dateAdded = data.dateAdded || data.dateField;
        let daysOld = 0;
        if (dateAdded) {
          const addedDate = new Date(dateAdded);
          daysOld = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Simplified market trend calculation
        let suggestedDiscount = 5; // Base 5% discount
        if (daysOld > 90) {
          suggestedDiscount = 12; // Old items need bigger discounts
        } else if (daysOld > 60) {
          suggestedDiscount = 10;
        } else if (daysOld > 30) {
          suggestedDiscount = 8;
        }

        const currentPrice = data.manualPriceCents || data.sellingPrice || 0;
        const suggestedPrice = Math.round(currentPrice * (1 - suggestedDiscount / 100));

        results.push({
          itemId,
          itemName: data.name || 'Unnamed',
          success: true,
          daysListed: daysOld,
          currentPrice,
          suggestedDiscount,
          suggestedPrice,
          watchCount: 0, // Would come from eBay API in real implementation
          engagement: daysOld > 60 ? 'low' : daysOld > 30 ? 'medium' : 'normal',
        });
      } catch (error) {
        console.error(`Failed to get trends for item ${itemId}:`, error);
        results.push({ itemId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    console.log(`[AI] Retrieved market trends for ${results.filter(r => r.success).length}/${itemIds.length} items`);
    return results;
  } catch (error) {
    console.error('[AI] Error in executeGetMarketTrends:', error);
    throw error;
  }
}

async function executeGetSoldComps(userId: string, query: string, category?: string, maxResults: number = 10) {
  console.log('[AI] Executing get_sold_comps for query:', query, 'category:', category);

  try {
    // In a real implementation, this would call the ebayGetCompletedItems Cloud Function
    // For now, we'll simulate the response structure
    // NOTE: When deployed, this should make an HTTP call to the Firebase function

    // Simulated response - in production this would come from eBay Finding API
    const mockResponse = {
      success: true,
      query,
      category,
      totalFound: 0,
      averagePrice: 0,
      priceRange: { min: 0, max: 0 },
      results: [],
      message: 'Market comps feature available - integrate with ebayGetCompletedItems function to fetch real data',
    };

    console.log('[AI] Sold comps query completed (using mock data - integrate with ebayGetCompletedItems for real data)');
    return mockResponse;
  } catch (error) {
    console.error('[AI] Error in executeGetSoldComps:', error);
    throw error;
  }
}

async function executeAnalyzePerformance(userId: string, itemIds: string[]) {
  console.log('[AI] Executing analyze_performance for', itemIds.length, 'items');

  try {
    const db = getDb();
    const results = [];

    for (const itemId of itemIds) {
      try {
        const doc = await db.collection('Item').doc(itemId).get();

        if (!doc.exists || doc.data()?.user_uuid !== userId) {
          results.push({ itemId, success: false, error: 'Item not found or access denied' });
          continue;
        }

        const data = doc.data()!;

        // Calculate performance metrics
        const dateAdded = data.dateAdded || data.dateField;
        let daysOld = 0;
        if (dateAdded) {
          const addedDate = new Date(dateAdded);
          daysOld = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        const currentPrice = data.manualPriceCents || data.sellingPrice || 0;
        const hasEbayData = !!data.ebayListingId;

        // Performance analysis
        let performanceRating: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Age-based performance
        if (daysOld > 90) {
          performanceRating = 'poor';
          issues.push('Listed for over 90 days - stale inventory');
          recommendations.push('Consider 10-12% price reduction or remove from sale');
        } else if (daysOld > 60) {
          performanceRating = 'fair';
          issues.push('Listed for over 60 days - slow mover');
          recommendations.push('Try 8-10% price reduction to stimulate sales');
        } else if (daysOld < 7) {
          performanceRating = 'excellent';
        }

        // eBay data check
        if (!hasEbayData) {
          issues.push('Missing eBay listing data');
          recommendations.push('Import from eBay or add eBay-specific details');
        }

        // Price check
        if (currentPrice === 0) {
          performanceRating = 'poor';
          issues.push('No price set');
          recommendations.push('Set a competitive price based on market research');
        }

        results.push({
          itemId,
          itemName: data.name || 'Unnamed',
          success: true,
          daysListed: daysOld,
          currentPrice,
          performanceRating,
          issues,
          recommendations,
          hasEbayData,
        });
      } catch (error) {
        console.error(`Failed to analyze performance for item ${itemId}:`, error);
        results.push({ itemId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    console.log(`[AI] Analyzed performance for ${results.filter(r => r.success).length}/${itemIds.length} items`);
    return results;
  } catch (error) {
    console.error('[AI] Error in executeAnalyzePerformance:', error);
    throw error;
  }
}

// Main AI Assistant Function
export const aiAssistant = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes for complex AI operations with multiple tool calls
    memory: '512MB', // Increased memory for AI processing
  })
  .https.onCall(async (data: AIAssistantRequest, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { message, userId, conversationHistory = [] } = data;

  if (!message) {
    throw new functions.https.HttpsError('invalid-argument', 'Message is required');
  }

  if (context.auth.uid !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'User ID mismatch');
  }

  try {
    const anthropic = getAnthropicClient();

    // Build messages array
    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    // Call Claude with tool use
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools,
      messages,
      system: `You are an AI assistant helping manage an eBay reselling inventory. The user has a collection of clothing items stored in Firebase.

Your capabilities:
1. **Find items** - Search by brand, category, age, price, status, eBay data
2. **Get item details** - Access full info: name, price, condition, description, images, days old, brand, size
3. **Calculate price changes** - Show new prices before applying changes
4. **Inventory insights** - Analyze patterns: avg price, age distribution, top brands/categories, status breakdown
5. **Search by SKU/Title** - Find items by eBay SKU or title pattern for relisting
6. **Update prices** - Update item prices in the database
7. **Relist to eBay** - Prepare items for relisting to eBay (with price adjustments)
8. **Market trends** - Get watch count, engagement metrics, and suggested pricing for items
9. **Sold comps** - Research recently sold comparable items for accurate market pricing
10. **Performance analysis** - Identify underperforming items needing attention

When helping the user:
- ALWAYS use get_inventory_insights first to understand their inventory
- Show specific numbers (e.g., "You have 23 items, avg price $45, 12 over 90 days old")
- Reference trends (e.g., "Most of your inventory is Hoodies and Jerseys")
- Be proactive - suggest price drops for old items, highlight stale inventory
- When asked to relist items, use search_by_sku_or_title first, then relist_to_ebay
- For repricing, use calculate_price_changes to preview, then update_prices to apply
- Give actionable advice based on the data
- find_items returns {itemIds, totalFound, showing, hasMore} - use result.itemIds for IDs

CRITICAL PRICING BEHAVIOR - FAST & SMART:
When the user asks to reduce/increase/change prices:
1. Find ALL matching items
2. **OPTIONAL Market Analysis** - Only use if needed:
   - For simple requests (e.g., "reduce Nike prices by 10%"): Skip market tools, calculate directly
   - For vague requests (e.g., "lower prices on old stuff"): Use get_market_trends(itemIds) for age-based discounts
   - ONLY call get_sold_comps if user explicitly asks for "market research" or "check comps"
   - analyze_performance is redundant with get_market_trends - use ONE or the other, not both
3. Smart pricing rules (no tools needed):
   - User specifies %: Use exact percentage
   - User says "old items": >90 days = 12%, >60 days = 10%, >30 days = 8%
   - User says "stale inventory": Same as above
   - User says "reduce prices": Default 8-10% based on age
4. Call calculate_price_changes with your determined percentages - BE FAST
5. Keep explanations brief: "Reducing 8 Nike items by 10% (average 45 days old)"
6. DO NOT call multiple market tools - choose the fastest path

Modal shows all changes - user confirms there. Be decisive and data-driven.

IMPORTANT - Structured Data Format:
When you use update_prices or relist_to_ebay tools, include the tool results in a special JSON code block for the UI:

For price updates, after showing the user what you calculated, add:
\`\`\`json:price_update
{"priceChanges": [result from calculate_price_changes tool]}
\`\`\`

For relisting, after showing what items are ready, add:
\`\`\`json:relist
{result from relist_to_ebay tool}
\`\`\`

This allows the UI to show a confirmation dialog before actually executing the action.

Available categories: Hoodie, Jersey, Polo, Pullover/Jackets, T-shirts, Bottoms

Be concise, data-driven, and helpful. Learn from their inventory patterns to give personalized advice.`,
    });

    console.log('[AI] Initial response stop_reason:', response.stop_reason);

    // Track tool results for automatic modal triggering
    const toolResults: any = {};

    // Handle tool use
    while (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUseBlock) break;

      console.log('[AI] Tool requested:', toolUseBlock.name);

      let toolResult: any;
      try {
        switch (toolUseBlock.name) {
          case 'find_items':
            toolResult = await executeFindItems(userId, toolUseBlock.input);
            break;
          case 'get_item_details':
            toolResult = await executeGetItemDetails(userId, (toolUseBlock.input as any).itemIds);
            break;
          case 'calculate_price_changes':
            const priceInput = toolUseBlock.input as any;
            toolResult = await executeCalculatePriceChanges(
              userId,
              priceInput.itemIds,
              priceInput.changeType,
              priceInput.amount,
              priceInput.direction
            );
            // Store for automatic modal triggering
            toolResults.priceChanges = toolResult;
            break;
          case 'get_inventory_insights':
            const insightsInput = toolUseBlock.input as any;
            toolResult = await executeGetInventoryInsights(userId, insightsInput?.includeDetails || false);
            break;
          case 'search_by_sku_or_title':
            const searchInput = toolUseBlock.input as any;
            toolResult = await executeSearchBySkuOrTitle(userId, searchInput?.sku, searchInput?.titlePattern);
            break;
          case 'update_prices':
            const updateInput = toolUseBlock.input as any;
            toolResult = await executeUpdatePrices(userId, updateInput.priceChanges);
            break;
          case 'relist_to_ebay':
            const relistInput = toolUseBlock.input as any;
            toolResult = await executeRelistToEbay(userId, relistInput.itemIds, relistInput.priceAdjustment);
            // Store for automatic modal triggering
            toolResults.relistItems = toolResult;
            break;
          case 'get_market_trends':
            const trendsInput = toolUseBlock.input as any;
            toolResult = await executeGetMarketTrends(userId, trendsInput.itemIds);
            break;
          case 'get_sold_comps':
            const compsInput = toolUseBlock.input as any;
            toolResult = await executeGetSoldComps(
              userId,
              compsInput.query,
              compsInput.category,
              compsInput.maxResults
            );
            break;
          case 'analyze_performance':
            const perfInput = toolUseBlock.input as any;
            toolResult = await executeAnalyzePerformance(userId, perfInput.itemIds);
            break;
          default:
            toolResult = { error: 'Unknown tool' };
        }
        console.log('[AI] Tool execution completed, result:', typeof toolResult, Array.isArray(toolResult) ? `array(${toolResult.length})` : 'object');
      } catch (error) {
        console.error('[AI] Tool execution error:', error);
        toolResult = { error: error instanceof Error ? error.message : 'Tool execution failed' };
      }

      // Continue conversation with tool result
      messages.push({
        role: 'assistant',
        content: response.content,
      });
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      });

      console.log('[AI] Sending follow-up request to Anthropic...');
      try {
        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          tools,
          messages,
        system: `You are an AI assistant helping manage an eBay reselling inventory. The user has a collection of clothing items stored in Firebase.

Your capabilities:
1. **Find items** - Search by brand, category, age, price, status, eBay data
2. **Get item details** - Access full info: name, price, condition, description, images, days old, brand, size
3. **Calculate price changes** - Show new prices before applying changes
4. **Inventory insights** - Analyze patterns: avg price, age distribution, top brands/categories, status breakdown
5. **Search by SKU/Title** - Find items by eBay SKU or title pattern for relisting
6. **Update prices** - Update item prices in the database
7. **Relist to eBay** - Prepare items for relisting to eBay (with price adjustments)
8. **Market trends** - Get watch count, engagement metrics, and suggested pricing for items
9. **Sold comps** - Research recently sold comparable items for accurate market pricing
10. **Performance analysis** - Identify underperforming items needing attention

When helping the user:
- ALWAYS use get_inventory_insights first to understand their inventory
- Show specific numbers (e.g., "You have 23 items, avg price $45, 12 over 90 days old")
- Reference trends (e.g., "Most of your inventory is Hoodies and Jerseys")
- Be proactive - suggest price drops for old items, highlight stale inventory
- When asked to relist items, use search_by_sku_or_title first, then relist_to_ebay
- For repricing, use calculate_price_changes to preview, then update_prices to apply
- Give actionable advice based on the data
- find_items returns {itemIds, totalFound, showing, hasMore} - use result.itemIds for IDs

CRITICAL PRICING BEHAVIOR - FAST & SMART:
When the user asks to reduce/increase/change prices:
1. Find ALL matching items
2. **OPTIONAL Market Analysis** - Only use if needed:
   - For simple requests (e.g., "reduce Nike prices by 10%"): Skip market tools, calculate directly
   - For vague requests (e.g., "lower prices on old stuff"): Use get_market_trends(itemIds) for age-based discounts
   - ONLY call get_sold_comps if user explicitly asks for "market research" or "check comps"
   - analyze_performance is redundant with get_market_trends - use ONE or the other, not both
3. Smart pricing rules (no tools needed):
   - User specifies %: Use exact percentage
   - User says "old items": >90 days = 12%, >60 days = 10%, >30 days = 8%
   - User says "stale inventory": Same as above
   - User says "reduce prices": Default 8-10% based on age
4. Call calculate_price_changes with your determined percentages - BE FAST
5. Keep explanations brief: "Reducing 8 Nike items by 10% (average 45 days old)"
6. DO NOT call multiple market tools - choose the fastest path

Modal shows all changes - user confirms there. Be decisive and data-driven.

IMPORTANT - Structured Data Format:
When you use update_prices or relist_to_ebay tools, include the tool results in a special JSON code block for the UI:

For price updates, after showing the user what you calculated, add:
\`\`\`json:price_update
{"priceChanges": [result from calculate_price_changes tool]}
\`\`\`

For relisting, after showing what items are ready, add:
\`\`\`json:relist
{result from relist_to_ebay tool}
\`\`\`

This allows the UI to show a confirmation dialog before actually executing the action.

Available categories: Hoodie, Jersey, Polo, Pullover/Jackets, T-shirts, Bottoms

Be concise, data-driven, and helpful. Learn from their inventory patterns to give personalized advice.`,
        });
        console.log('[AI] Follow-up response stop_reason:', response.stop_reason);
      } catch (error) {
        console.error('[AI] Error calling Anthropic API for follow-up:', error);
        throw error;
      }
    }

    // Extract final text response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const result: any = {
      success: true,
      message: textBlock?.text || 'No response generated',
      usage: response.usage,
    };

    // Include tool results for automatic modal triggering
    if (Object.keys(toolResults).length > 0) {
      result.toolResults = toolResults;
    }

    return result;
  } catch (error) {
    console.error('[AI] Error:', error);
    throw new functions.https.HttpsError(
      'internal',
      `AI Assistant error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});
