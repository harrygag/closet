import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange authorization code for access token
    const clientId = process.env.EBAY_CLIENT_ID!;
    const clientSecret = process.env.EBAY_CLIENT_SECRET!;
    const redirectUri = process.env.EBAY_REDIRECT_URI || 'James_Kennedy-JamesKen-eba-PR-xivxnp';

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('eBay token exchange failed:', error);
      return res.status(500).json({ error: 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Extract userId from state parameter (set during OAuth initiation)
    const userId = state as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in state parameter' });
    }

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
      return res.status(500).json({ error: 'Failed to store credentials' });
    }

    // Redirect back to app with success message
    res.redirect('/?ebay_connected=true');
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
}



