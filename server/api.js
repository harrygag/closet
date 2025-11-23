/**
 * Simple API Server for Chrome Extension
 * Handles marketplace credential sync from extension
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for server-side

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'chrome-extension://*'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increase payload limit for cookie data

// Request logging
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

/**
 * POST /api/marketplace/save-credentials
 * Save marketplace cookies from Chrome extension
 */
app.post('/api/marketplace/save-credentials', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[API] Auth error:', authError);
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    console.log(`[API] Authenticated user: ${user.email}`);

    // Get request payload
    const { marketplace, cookies, email, autoSynced } = req.body;

    // Validate payload
    if (!marketplace || !cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (!['ebay', 'poshmark', 'depop', 'vendoo'].includes(marketplace)) {
      return res.status(400).json({ error: 'Invalid marketplace' });
    }

    console.log(`[API] Saving ${marketplace} credentials for ${user.email} (${cookies.length} cookies)`);
    
    // Use upsert for simpler logic
    const { error } = await supabase
      .from('user_marketplace_credentials')
      .upsert({
        user_uuid: user.id,
        marketplace,
        cookies_encrypted: JSON.stringify(cookies),
        email: email || null,
        last_validated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Approx 30 days
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_uuid,marketplace' });

    if (error) {
      console.error('[API] Upsert error:', error);
      return res.status(500).json({ error: 'Failed to save credentials' });
    }

    console.log(`[API] ✅ Saved ${marketplace} credentials`);
    return res.json({ success: true, action: 'saved' });

  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ebay/import
 * Import eBay items provided by the client (extension)
 */
app.post('/api/ebay/import', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    // Expect 'items' array in the body instead of cookies
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'No items provided' });
    }

    console.log(`[API] Processing eBay import of ${items.length} items for user ${user.email}`);

    // 1. Normalize items if needed (ensure required fields)
    const validItems = items.filter(item => item.ebay_id && item.title);

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid items found in payload' });
    }

    // 2. Save to Supabase 'Item' table (legacy support)
    const nowIso = new Date().toISOString();
    
    const { error: insertError } = await supabase.from('Item').upsert(
      validItems.map(item => ({
        user_uuid: user.id,
        title: item.title,
        manualPriceCents: item.price ? Math.round(parseFloat(String(item.price).replace(/[^0-9.]/g, '')) * 100) : null,
        sku: item.sku,
        imageUrls: item.image ? [item.image] : [],
        ebay_item_id: item.ebay_id,
        status: 'LISTED',
        category: 'Unknown',
        imported_from: 'ebay',
        ebayUrl: `https://www.ebay.com/itm/${item.ebay_id}`,
        ebay_imported_at: nowIso,
        updatedAt: nowIso
      })),
      { onConflict: 'ebay_item_id' }
    );

    if (insertError) {
      console.error('[API] Item save error:', insertError);
      // Continue to drafts even if legacy save fails partially, though usually we'd want consistent state.
    } else {
      console.log(`[API] Saved/Updated ${validItems.length} items to 'Item' table`);
    }

    // 3. Save to Supabase 'marketplace_listing_drafts' table (new flow)
    const { error: draftError } = await supabase.from('marketplace_listing_drafts').upsert(
      validItems.map(item => ({
        user_uuid: user.id,
        marketplace: 'ebay',
        marketplace_listing_id: item.ebay_id,
        title: item.title,
        status: item.status.toUpperCase(),
        price_cents: item.price ? Math.round(parseFloat(String(item.price).replace(/[^0-9.]/g, '')) * 100) : null,
        sku: item.sku,
        url: `https://www.ebay.com/itm/${item.ebay_id}`,
        image_urls: item.image ? [item.image] : [],
        raw_payload: item.raw_listing_data || item,
        imported_at: nowIso,
        last_seen_at: nowIso,
        ready_for_crosspost: false,
        crosspost_targets: [],
        updated_at: nowIso
      })),
      { onConflict: 'marketplace_listing_id,marketplace,user_uuid' }
    );

    if (draftError) {
      console.error('[API] Marketplace listing draft save error:', draftError);
      return res.status(500).json({ error: 'Failed to save drafts' });
    }

    console.log(`[API] Saved/Updated ${validItems.length} items to 'marketplace_listing_drafts' table`);

    return res.json({ success: true, count: validItems.length });

  } catch (error) {
    console.error('[API] Import error:', error.message);
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

/**
 * GET /api/marketplace/listings
 * Fetch stored marketplace listing drafts for the authenticated user
 */
app.get('/api/marketplace/listings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { marketplace, ready } = req.query;

    let query = supabase
      .from('marketplace_listing_drafts')
      .select('*')
      .eq('user_uuid', user.id)
      .order('last_seen_at', { ascending: false });

    if (marketplace && typeof marketplace === 'string') {
      query = query.eq('marketplace', marketplace);
    }

    if (ready === 'true') {
      query = query.eq('ready_for_crosspost', true);
    } else if (ready === 'false') {
      query = query.eq('ready_for_crosspost', false);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[API] Listing drafts fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch listings' });
    }

    return res.json({ success: true, listings: data || [] });
  } catch (error) {
    console.error('[API] Listing drafts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

/**
 * POST /api/marketplace/listings/mark-ready
 * Mark a draft as ready for cross-posting and store desired targets
 */
app.post('/api/marketplace/listings/mark-ready', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { draftId, ready, targets } = req.body;
    if (!draftId) {
      return res.status(400).json({ error: 'Missing draftId' });
    }

    const payload = {
      ready_for_crosspost: Boolean(ready),
      crosspost_targets: Array.isArray(targets) ? targets : undefined,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('marketplace_listing_drafts')
      .update(payload)
      .eq('id', draftId)
      .eq('user_uuid', user.id)
      .select()
      .single();

    if (error) {
      console.error('[API] Draft mark-ready error:', error);
      return res.status(500).json({ error: 'Failed to update draft' });
    }

    return res.json({ success: true, draft: data });
  } catch (error) {
    console.error('[API] Draft mark-ready error:', error);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

/**
 * POST /api/marketplace/listings/link-item
 * Link a marketplace draft to a closet item record
 */
app.post('/api/marketplace/listings/link-item', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { draftId, closetItemId } = req.body;
    if (!draftId) {
      return res.status(400).json({ error: 'Missing draftId' });
    }

    const { data, error } = await supabase
      .from('marketplace_listing_drafts')
      .update({
        closet_item_id: closetItemId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId)
      .eq('user_uuid', user.id)
      .select()
      .single();

    if (error) {
      console.error('[API] Draft link-item error:', error);
      return res.status(500).json({ error: 'Failed to update draft' });
    }

    return res.json({ success: true, draft: data });
  } catch (error) {
    console.error('[API] Draft link-item error:', error);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});
