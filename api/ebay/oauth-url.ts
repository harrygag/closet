import type { VercelRequest, VercelResponse } from '@vercel/node';
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

    // Generate a unique session ID for this OAuth flow
    const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // eBay OAuth URL with user's RuName
    const runame = process.env.EBAY_RUNAME || 'James_Kennedy-JamesKen-eba-PR-xivxnp';
    const oauthUrl = `https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&runame=${runame}&SessID=${sessionId}`;

    // Store session ID temporarily (could use a sessions table, but for now return it)
    res.status(200).json({ 
      url: oauthUrl,
      sessionId 
    });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
}



