import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET!;

// Verify Shopify webhook signature
function verifyShopifyWebhook(body: string, hmacHeader: string): boolean {
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  
  return hash === hmacHeader;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook signature
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
    const rawBody = JSON.stringify(req.body);
    
    if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const order = req.body;
    
    console.log('Shopify order created:', order.id, order.name);

    // Process each line item
    for (const lineItem of order.line_items) {
      const sku = lineItem.sku;
      const productId = lineItem.product_id?.toString();

      if (!sku && !productId) {
        console.warn('Line item missing SKU and product ID:', lineItem);
        continue;
      }

      // Find the item in Supabase by SKU, barcode, or Shopify product ID
      let query = supabase
        .from('Item')
        .select('*')
        .eq('status', 'IN_STOCK');

      if (productId) {
        query = query.eq('shopify_product_id', productId);
      } else if (sku) {
        query = query.or(`sku.eq.${sku},barcode.eq.${sku},id.eq.${sku}`);
      }

      const { data: items, error: fetchError } = await query.limit(1);

      if (fetchError) {
        console.error('Database error:', fetchError);
        continue;
      }

      if (!items || items.length === 0) {
        console.warn('Item not found in database:', { sku, productId });
        continue;
      }

      const item = items[0];

      // Update item status to SOLD
      const { error: updateError } = await supabase
        .from('Item')
        .update({
          status: 'SOLD',
          soldDate: order.created_at,
          soldPriceCents: Math.round(parseFloat(lineItem.price) * 100),
          soldPlatform: 'Shopify',
          notes: item.notes 
            ? `${item.notes}\n\nSold via Shopify Order: ${order.name}`
            : `Sold via Shopify Order: ${order.name}`
        })
        .eq('id', item.id);

      if (updateError) {
        console.error('Failed to update item:', updateError);
      } else {
        console.log('Item marked as sold:', item.id, item.title);
      }
    }

    // Acknowledge webhook
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Disable body parsing to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false
  }
};

