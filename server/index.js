import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// OAuth URL Generation
app.post('/api/ebay/oauth-url', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Generate OAuth URL
    const clientId = process.env.EBAY_CLIENT_ID || 'JamesKen-eba-PRD-4c56c7b0c-90f1e045';
    const runame = process.env.EBAY_RUNAME || 'James_Kennedy-JamesKen-eba-PR-jwqknyy';
    
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: runame,
      scope: scopes.join(' '),
      state: userId,
    });

    const url = `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;

    res.json({ url, sessionId: userId });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// OAuth Callback
app.get('/api/ebay/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code is required');
    }

    const userId = state;
    const clientId = process.env.EBAY_CLIENT_ID || 'JamesKen-eba-PRD-4c56c7b0c-90f1e045';
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const runame = process.env.EBAY_RUNAME || 'James_Kennedy-JamesKen-eba-PR-jwqknyy';

    if (!clientSecret) {
      console.error('EBAY_CLIENT_SECRET not configured');
      return res.redirect('http://localhost:5173/?ebay_error=missing_secret');
    }

    // Exchange code for token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: runame,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('eBay token exchange failed:', error);
      return res.redirect('http://localhost:5173/?ebay_error=token_exchange_failed');
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Store credentials in database
    const { error: dbError } = await supabase
      .from('ebay_credentials')
      .upsert({
        user_uuid: userId,
        access_token,
        refresh_token: refresh_token || null,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_uuid'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return res.redirect('http://localhost:5173/?ebay_error=db_error');
    }

    // Redirect back to app with success
    res.redirect('http://localhost:5173/?ebay_connected=true');
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.redirect('http://localhost:5173/?ebay_error=unknown');
  }
});

// Check Connection
app.post('/api/ebay/check-connection', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { data, error } = await supabase
      .from('ebay_credentials')
      .select('expires_at')
      .eq('user_uuid', userId)
      .single();

    if (error || !data) {
      return res.json({ connected: false });
    }

    const isExpired = new Date(data.expires_at) < new Date();

    res.json({ 
      connected: !isExpired,
      expiresAt: data.expires_at 
    });
  } catch (error) {
    console.error('Error checking connection:', error);
    res.status(500).json({ error: 'Failed to check connection' });
  }
});

// Disconnect
app.post('/api/ebay/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabase
      .from('ebay_credentials')
      .delete()
      .eq('user_uuid', userId);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get Listings
app.post('/api/ebay/get-listings', async (req, res) => {
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

    // Check if token is expired (refresh logic would go here)
    const isExpired = new Date(creds.expires_at) < new Date();
    if (isExpired && !creds.refresh_token) {
      return res.status(401).json({ error: 'Token expired, please reconnect' });
    }

    // Fetch active listings from eBay
    const listingsResponse = await fetch(
      'https://api.ebay.com/sell/inventory/v1/inventory_item?limit=100',
      {
        headers: {
          'Authorization': `Bearer ${creds.access_token}`,
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
    
    // Transform to our format
    const listings = (listingsData.inventoryItems || []).map((item) => ({
      itemId: item.sku || item.offerId,
      title: item.product?.title || 'Untitled',
      price: item.offers?.[0]?.pricingSummary?.price?.value || 0,
      currency: item.offers?.[0]?.pricingSummary?.price?.currency || 'USD',
      imageUrl: item.product?.imageUrls?.[0],
      listingUrl: item.listingUrl || '',
      quantity: item.availability?.shipToLocationAvailability?.quantity || 1,
      format: item.format || 'FIXED_PRICE',
      categoryName: item.product?.aspects?.Category?.[0],
      itemSpecifics: item.product?.aspects ? Object.entries(item.product.aspects).map(([name, value]) => ({
        name,
        value: Array.isArray(value) ? value[0] : value
      })) : []
    }));

    res.json({ listings });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Import Items
app.post('/api/ebay/import-items', async (req, res) => {
  try {
    const { userId, listings } = req.body;

    if (!userId || !listings || listings.length === 0) {
      return res.status(400).json({ error: 'userId and listings are required' });
    }

    const results = {
      imported: [],
      skipped: [],
      errors: [],
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

        // Transform and insert
        const item = {
          user_uuid: userId,
          title: listing.title,
          size: listing.itemSpecifics?.find(s => s.name.toLowerCase().includes('size'))?.value || null,
          imageUrls: listing.imageUrl ? [listing.imageUrl] : [],
          manualPriceCents: Math.round(listing.price * 100),
          status: 'IN_STOCK',
          ebay_item_id: listing.itemId,
          imported_from: 'ebay',
          ebay_imported_at: new Date().toISOString(),
          notes: `Imported from eBay: ${listing.listingUrl}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

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
          error: error.message 
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error importing items:', error);
    res.status(500).json({ error: 'Failed to import items' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 eBay OAuth Backend running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/ebay/oauth-url`);
  console.log(`   GET  http://localhost:${PORT}/api/ebay/callback`);
  console.log(`   POST http://localhost:${PORT}/api/ebay/check-connection`);
  console.log(`   POST http://localhost:${PORT}/api/ebay/disconnect`);
  console.log(`   POST http://localhost:${PORT}/api/ebay/get-listings`);
  console.log(`   POST http://localhost:${PORT}/api/ebay/import-items`);
  console.log(`\n🔗 Make sure your frontend points to http://localhost:${PORT}`);
});



