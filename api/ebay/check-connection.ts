import type { VercelRequest, VercelResponse} from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Check if credentials exist and are not expired
    const { data, error } = await supabase
      .from('ebay_credentials')
      .select('expires_at')
      .eq('user_uuid', userId)
      .single();

    if (error || !data) {
      return res.status(200).json({ connected: false });
    }

    const isExpired = new Date(data.expires_at) < new Date();

    res.status(200).json({ 
      connected: !isExpired,
      expiresAt: data.expires_at 
    });
  } catch (error) {
    console.error('Error checking connection:', error);
    res.status(500).json({ error: 'Failed to check connection' });
  }
}



