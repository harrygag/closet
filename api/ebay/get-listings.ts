import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  listingUrl: string;
  quantity: number;
  format: string;
  categoryName?: string;
  itemSpecifics?: Array<{ name: string; value: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get user's eBay credentials
    const { data: creds, error: credsError } = await supabase
      .from('ebay_credentials')
      .select('access_token, expires_at, refresh_token')
      .eq('user_uuid', userId)
      .single();

    if (credsError || !creds) {
      return res.status(401).json({ error: 'eBay not connected' });
    }

    // Check if token is expired
    const isExpired = new Date(creds.expires_at) < new Date();
    let accessToken = creds.access_token;

    if (isExpired && creds.refresh_token) {
      // Refresh the token
      const refreshed = await refreshToken(creds.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        
        // Update stored credentials
        await supabase
          .from('ebay_credentials')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || creds.refresh_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_uuid', userId);
      } else {
        return res.status(401).json({ error: 'Token expired, please reconnect' });
      }
    }

    // Fetch active listings from eBay Sell API
    const listingsResponse = await fetch(
      'https://api.ebay.com/sell/inventory/v1/inventory_item?limit=100',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!listingsResponse.ok) {
      const error = await listingsResponse.text();
      console.error('eBay API error:', error);
      return res.status(500).json({ error: 'Failed to fetch listings from eBay' });
    }

    const listingsData = await listingsResponse.json();
    
    // Transform eBay response to our format
    const listings: EbayListing[] = (listingsData.inventoryItems || []).map((item: any) => ({
      itemId: item.sku || item.offerId,
      title: item.product?.title || 'Untitled',
      price: item.product?.aspects?.['Starting Price']?.[0] || 
             item.offers?.[0]?.pricingSummary?.price?.value || 0,
      currency: item.offers?.[0]?.pricingSummary?.price?.currency || 'USD',
      imageUrl: item.product?.imageUrls?.[0],
      listingUrl: item.listingUrl || '',
      quantity: item.availability?.shipToLocationAvailability?.quantity || 1,
      format: item.format || 'FIXED_PRICE',
      categoryName: item.product?.aspects?.Category?.[0],
      itemSpecifics: item.product?.aspects ? Object.entries(item.product.aspects).map(([name, value]: [string, any]) => ({
        name,
        value: Array.isArray(value) ? value[0] : value
      })) : []
    }));

    res.status(200).json({ listings });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
}

async function refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  try {
    const clientId = process.env.EBAY_CLIENT_ID!;
    const clientSecret = process.env.EBAY_CLIENT_SECRET!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}



