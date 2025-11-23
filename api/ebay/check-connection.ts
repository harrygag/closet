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
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data, error } = await supabase
      .from('ebay_credentials')
      .select('access_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(200).json({
        connected: false,
        hasToken: false,
      });
    }

    const isExpired = new Date(data.expires_at) < new Date();

    return res.status(200).json({
      connected: !isExpired,
      hasToken: true,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error('Error checking eBay connection:', error);
    return res.status(500).json({
      connected: false,
      hasToken: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

