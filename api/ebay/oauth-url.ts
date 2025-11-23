import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
    const EBAY_RUNAME = process.env.EBAY_RUNAME;

    if (!EBAY_CLIENT_ID || !EBAY_RUNAME) {
      return res.status(500).json({ error: 'eBay credentials not configured' });
    }

    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.analytics',
      'https://api.ebay.com/oauth/api_scope/sell.finances',
    ].join(' ');

    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${EBAY_CLIENT_ID}&redirect_uri=${EBAY_RUNAME}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;

    return res.status(200).json({ url: authUrl });
  } catch (error) {
    console.error('Error generating eBay OAuth URL:', error);
    return res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
}

