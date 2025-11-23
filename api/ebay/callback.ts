import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter');
    }

    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const userId = stateData.userId;

    // Exchange code for tokens
    const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
    const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
    const EBAY_RUNAME = process.env.EBAY_RUNAME;

    if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_RUNAME) {
      return res.status(500).send('eBay credentials not configured');
    }

    const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
    
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: EBAY_RUNAME,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Store tokens in Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { error: upsertError } = await supabase
      .from('ebay_credentials')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
      throw new Error('Failed to store credentials');
    }

    // Return success page that closes the popup
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>eBay Connected</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #22c55e; font-size: 24px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="success">✓ eBay Account Connected Successfully!</div>
        <p>You can close this window now.</p>
        <script>
          // Notify opener window
          if (window.opener) {
            window.opener.postMessage({ type: 'EBAY_AUTH_SUCCESS' }, window.location.origin);
          }
          
          // Try BroadcastChannel
          try {
            const bc = new BroadcastChannel('ebay_auth');
            bc.postMessage({ type: 'EBAY_AUTH_SUCCESS' });
            bc.close();
          } catch (e) {
            console.warn('BroadcastChannel not available');
          }
          
          // Auto-close after 2 seconds
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('eBay OAuth callback error:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>eBay Connection Failed</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #ef4444; font-size: 24px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="error">✗ eBay Connection Failed</div>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>Please close this window and try again.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'EBAY_AUTH_FAILED', 
              error: '${error instanceof Error ? error.message : 'Unknown error'}' 
            }, window.location.origin);
          }
          
          try {
            const bc = new BroadcastChannel('ebay_auth');
            bc.postMessage({ type: 'EBAY_AUTH_FAILED', error: '${error instanceof Error ? error.message : 'Unknown error'}' });
            bc.close();
          } catch (e) {
            console.warn('BroadcastChannel not available');
          }
        </script>
      </body>
      </html>
    `);
  }
}

