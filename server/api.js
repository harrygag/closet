/**
 * Simple API Server for Chrome Extension
 * Handles marketplace credential sync from extension
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

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
app.use(express.json());

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

    // Calculate expiration date
    const expirations = cookies
      .map(c => c.expirationDate)
      .filter(exp => exp !== undefined);
    
    const earliestExpiration = expirations.length > 0
      ? new Date(Math.min(...expirations) * 1000).toISOString()
      : null;

    // Prepare credential data
    const credentialData = {
      user_id: user.id,
      marketplace,
      cookies_json: JSON.stringify(cookies),
      email: email || null,
      cookie_count: cookies.length,
      last_validated: new Date().toISOString(),
      expires_at: earliestExpiration,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    // Check if credentials already exist
    const { data: existing } = await supabase
      .from('user_marketplace_credentials')
      .select('id')
      .eq('user_id', user.id)
      .eq('marketplace', marketplace)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('user_marketplace_credentials')
        .update(credentialData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[API] Update error:', error);
        return res.status(500).json({ error: 'Failed to update credentials' });
      }

      console.log(`[API] ✅ Updated ${marketplace} credentials`);
      return res.json({ success: true, action: 'updated', data });
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('user_marketplace_credentials')
        .insert(credentialData)
        .select()
        .single();

      if (error) {
        console.error('[API] Insert error:', error);
        return res.status(500).json({ error: 'Failed to save credentials' });
      }

      console.log(`[API] ✅ Saved new ${marketplace} credentials`);
      return res.json({ success: true, action: 'created', data });
    }
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/marketplace/credentials
 * Get all marketplace credentials for authenticated user
 */
app.get('/api/marketplace/credentials', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    // Get credentials
    const { data, error } = await supabase
      .from('user_marketplace_credentials')
      .select('id, marketplace, email, cookie_count, last_validated, expires_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) {
      console.error('[API] Fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch credentials' });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/marketplace/credentials/:marketplace
 * Delete credentials for a specific marketplace
 */
app.delete('/api/marketplace/credentials/:marketplace', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { marketplace } = req.params;

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    // Soft delete (set is_active to false)
    const { error } = await supabase
      .from('user_marketplace_credentials')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('marketplace', marketplace);

    if (error) {
      console.error('[API] Delete error:', error);
      return res.status(500).json({ error: 'Failed to delete credentials' });
    }

    console.log(`[API] ✅ Deleted ${marketplace} credentials for ${user.email}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📡 Extension endpoint: http://localhost:${PORT}/api/marketplace/save-credentials`);
});

