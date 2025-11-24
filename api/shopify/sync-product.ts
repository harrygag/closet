import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

interface ShopifyProductInput {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: Array<{
    price: string;
    sku?: string;
    barcode?: string;
    inventory_quantity: number;
  }>;
  images?: Array<{ src: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { itemId, userId } = req.body;

    if (!itemId || !userId) {
      return res.status(400).json({ error: 'Missing itemId or userId' });
    }

    // Fetch item from Supabase
    const { data: item, error: fetchError } = await supabase
      .from('Item')
      .select('*')
      .eq('id', itemId)
      .eq('user_uuid', userId)
      .single();

    if (fetchError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Only sync items with 'Active' or 'IN_STOCK' status
    if (item.status !== 'IN_STOCK' && item.status !== 'Active') {
      return res.status(400).json({ error: 'Only active items can be synced to Shopify' });
    }

    // Transform item to Shopify product format
    const shopifyProduct: ShopifyProductInput = {
      title: item.title || 'Untitled Item',
      body_html: `
        <h3>Product Details</h3>
        <ul>
          <li><strong>Brand:</strong> ${item.brand || 'N/A'}</li>
          <li><strong>Size:</strong> ${item.size || 'N/A'}</li>
          <li><strong>Color:</strong> ${item.color || 'N/A'}</li>
          <li><strong>Condition:</strong> ${item.manualConditionGrade || 'Good'}</li>
          <li><strong>Material:</strong> ${item.material || 'N/A'}</li>
        </ul>
        ${item.conditionNotes ? `<p><strong>Condition Notes:</strong> ${item.conditionNotes}</p>` : ''}
        ${item.notes ? `<p><strong>Additional Notes:</strong> ${item.notes}</p>` : ''}
      `,
      vendor: item.brand || 'Closet BV',
      product_type: item.category || 'Clothing',
      tags: [
        ...(item.normalizedTags || []),
        item.subcategory,
        item.color,
        item.size
      ].filter(Boolean),
      variants: [{
        price: item.manualPriceCents ? (item.manualPriceCents / 100).toFixed(2) : '0.00',
        sku: item.sku || item.barcode || item.id,
        barcode: item.barcode,
        inventory_quantity: 1
      }],
      images: item.imageUrls && item.imageUrls.length > 0 
        ? item.imageUrls.map((url: string) => ({ src: url }))
        : []
    };

    // Create product in Shopify
    const shopifyResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({ product: shopifyProduct })
      }
    );

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API Error:', errorText);
      return res.status(shopifyResponse.status).json({ 
        error: 'Failed to create Shopify product',
        details: errorText
      });
    }

    const { product: createdProduct } = await shopifyResponse.json();

    // Update item in Supabase with Shopify product ID
    await supabase
      .from('Item')
      .update({
        shopify_product_id: createdProduct.id.toString(),
        shopify_synced_at: new Date().toISOString()
      })
      .eq('id', itemId);

    return res.status(200).json({
      success: true,
      shopifyProduct: createdProduct,
      shopifyUrl: `https://${SHOPIFY_STORE}/products/${createdProduct.handle}`
    });

  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

