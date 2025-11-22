import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV = process.env.EBAY_ENVIRONMENT || 'PRODUCTION';
const ENDPOINTS = {
  SANDBOX: 'https://api.sandbox.ebay.com/sell/inventory/v1',
  PRODUCTION: 'https://api.ebay.com/sell/inventory/v1'
};
const API_BASE = ENDPOINTS[ENV];

/**
 * Fetch all inventory items from eBay
 */
export async function fetchInventoryItems(accessToken, limit = 100) {
  console.log('📦 Fetching inventory items from eBay...');
  
  try {
    const response = await axios.get(`${API_BASE}/inventory_item`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      params: {
        limit: limit
      }
    });
    
    const items = response.data.inventoryItems || [];
    console.log(`✅ Fetched ${items.length} items from eBay`);
    
    return {
      success: true,
      items: items,
      total: response.data.total || items.length,
      limit: response.data.limit || limit
    };
    
  } catch (error) {
    console.error('❌ Failed to fetch inventory:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      items: []
    };
  }
}

/**
 * Transform eBay item to Virtual Closet format
 */
export function transformEbayItem(ebayItem) {
  const product = ebayItem.product || {};
  const availability = ebayItem.availability || {};
  const packageWeight = ebayItem.packageWeightAndSize || {};
  
  return {
    // Basic Info
    sku: ebayItem.sku,
    title: product.title || 'Untitled Item',
    description: product.description || '',
    
    // Images
    images: product.imageUrls || [],
    primaryImage: product.imageUrls?.[0] || null,
    
    // Pricing
    price: parseFloat(ebayItem.price?.value || 0),
    currency: ebayItem.price?.currency || 'USD',
    
    // Inventory
    quantity: availability.shipToLocationAvailability?.quantity || 0,
    condition: ebayItem.condition || 'USED_EXCELLENT',
    
    // Physical attributes
    brand: product.brand || null,
    color: product.aspects?.Color?.[0] || null,
    size: product.aspects?.Size?.[0] || null,
    category: product.aspects?.Category?.[0] || null,
    
    // Dimensions
    weight: packageWeight.weight?.value || null,
    weightUnit: packageWeight.weight?.unit || 'POUND',
    
    // Metadata
    marketplace: 'ebay',
    externalId: ebayItem.sku,
    lastUpdated: new Date().toISOString(),
    
    // Raw data for reference
    rawData: ebayItem
  };
}

/**
 * Import inventory and save to file
 */
export async function importInventory(accessToken, options = {}) {
  const { limit = 100, savePath = null } = options;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 eBay Inventory Import');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Fetch items
  const result = await fetchInventoryItems(accessToken, limit);
  
  if (!result.success) {
    console.error('❌ Import failed:', result.error);
    return result;
  }
  
  // Transform items
  console.log('🔄 Transforming items to Virtual Closet format...');
  const transformedItems = result.items.map(transformEbayItem);
  
  // Save to file
  const outputPath = savePath || path.join(__dirname, 'imported-inventory.json');
  const outputData = {
    importedAt: new Date().toISOString(),
    source: 'ebay',
    environment: ENV,
    totalItems: transformedItems.length,
    items: transformedItems
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  
  console.log(`✅ Transformed ${transformedItems.length} items`);
  console.log(`💾 Saved to: ${outputPath}\n`);
  
  // Show sample
  if (transformedItems.length > 0) {
    console.log('📋 Sample Item:');
    const sample = transformedItems[0];
    console.log(`   SKU: ${sample.sku}`);
    console.log(`   Title: ${sample.title}`);
    console.log(`   Price: $${sample.price} ${sample.currency}`);
    console.log(`   Quantity: ${sample.quantity}`);
    console.log(`   Images: ${sample.images.length}\n`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Import Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    success: true,
    items: transformedItems,
    total: transformedItems.length,
    savedTo: outputPath
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const tokensPath = path.join(__dirname, 'tokens.json');
  
  if (!fs.existsSync(tokensPath)) {
    console.error('❌ No tokens.json found!');
    console.log('   Run OAuth flow first: npm test\n');
    process.exit(1);
  }
  
  const tokens = JSON.parse(fs.readFileSync(tokensPath));
  
  if (!tokens.accessToken) {
    console.error('❌ No access token found in tokens.json');
    process.exit(1);
  }
  
  importInventory(tokens.accessToken)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

