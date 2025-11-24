/**
 * Script to push inventory items from Supabase to Shopify
 * Uses Shopify Admin GraphQL API via environment variables
 */

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || 'your-store.myshopify.com';
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hqmujfbifgpcyqmpuwil.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

interface InventoryItem {
  id: string;
  title: string;
  size: string | null;
  imageUrls: string[];
  manualPriceCents: number | null;
  notes: string | null;
  brand: string | null;
  category: string | null;
}

async function createShopifyProduct(item: InventoryItem) {
  const price = item.manualPriceCents ? (item.manualPriceCents / 100).toFixed(2) : '0.00';
  
  const mutation = `
    mutation createProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          id
          title
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    product: {
      title: item.title,
      descriptionHtml: `
        <p><strong>Brand:</strong> ${item.brand || 'N/A'}</p>
        <p><strong>Size:</strong> ${item.size || 'N/A'}</p>
        <p><strong>Category:</strong> ${item.category || 'N/A'}</p>
        ${item.notes ? `<p><strong>Notes:</strong> ${item.notes}</p>` : ''}
      `.trim(),
      productType: item.category || 'Clothing',
      vendor: item.brand || 'Closet BV',
      status: 'ACTIVE',
      productOptions: item.size ? [
        {
          name: 'Size',
          values: [{ name: item.size }]
        }
      ] : undefined
    },
    media: item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls.map(url => ({
      originalSource: url,
      mediaContentType: 'IMAGE'
    })) : undefined
  };

  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: mutation,
      variables
    })
  });

  const result = await response.json();
  return result;
}

async function getInventoryItems(): Promise<InventoryItem[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/Item?status=eq.IN_STOCK&select=id,title,size,imageUrls,manualPriceCents,notes,brand,category&limit=10`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.statusText}`);
  }

  return await response.json();
}

async function main() {
  console.log('🚀 Starting Shopify product sync...\n');

  if (!SHOPIFY_ADMIN_ACCESS_TOKEN) {
    console.error('❌ SHOPIFY_ADMIN_ACCESS_TOKEN is required!');
    console.error('Set it in your environment variables or .env file');
    process.exit(1);
  }

  try {
    // Get items from Supabase
    console.log('📦 Fetching inventory items from Supabase...');
    const items = await getInventoryItems();
    console.log(`✅ Found ${items.length} items\n`);

    // Create products in Shopify
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      console.log(`🔄 Creating product: ${item.title}`);
      
      try {
        const result = await createShopifyProduct(item);
        
        if (result.data?.productCreate?.userErrors?.length > 0) {
          console.error(`❌ Errors:`, result.data.productCreate.userErrors);
          errorCount++;
        } else if (result.data?.productCreate?.product) {
          console.log(`✅ Created: ${result.data.productCreate.product.id}\n`);
          successCount++;
        } else {
          console.error(`❌ Unexpected response:`, result);
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to create product:`, error);
        errorCount++;
      }

      // Rate limiting: wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n🎉 Sync complete!');
    console.log(`✅ Successfully created: ${successCount} products`);
    console.log(`❌ Failed: ${errorCount} products`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

