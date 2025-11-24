import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Fetch all active items for the user
    const { data: items, error: fetchError } = await supabase
      .from('Item')
      .select('*')
      .eq('user_uuid', userId)
      .eq('status', 'IN_STOCK')
      .is('shopify_product_id', null); // Only items not yet synced

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch items from database' });
    }

    if (!items || items.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No active items found to sync',
        syncedCount: 0 
      });
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        // Call the sync-product endpoint for each item
        const syncResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/shopify/sync-product`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: item.id,
            userId: userId
          })
        });

        if (syncResponse.ok) {
          const result = await syncResponse.json();
          results.push({
            itemId: item.id,
            title: item.title,
            shopifyUrl: result.shopifyUrl
          });
        } else {
          const errorData = await syncResponse.json();
          errors.push({
            itemId: item.id,
            title: item.title,
            error: errorData.error
          });
        }

        // Rate limit: wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        errors.push({
          itemId: item.id,
          title: item.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return res.status(200).json({
      success: true,
      syncedCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk sync error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

