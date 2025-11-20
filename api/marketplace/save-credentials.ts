/**
 * API: POST /api/marketplace/save-credentials
 * 
 * Save encrypted marketplace credentials for authenticated user
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Encryption key from environment (should be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || 'default-key-change-in-production-32b';

interface RequestBody {
  marketplace: 'ebay' | 'poshmark' | 'depop' | 'vendoo';
  email?: string;
  cookies?: string | object[]; // JSON string or array of cookie objects from browser
  password?: string; // [DEPRECATED] Use cookies instead
  sessionCookie?: string; // [DEPRECATED] Use cookies instead
  expiresInDays?: number; // How many days until cookies expire (default: 7)
}

/**
 * Encrypt sensitive data using AES-256-CBC
 */
function encrypt(text: string): string {
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encrypted: string): string {
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    if (req.method === 'DELETE') {
      // Delete credentials
      const { marketplace } = req.body;
      
      if (!marketplace) {
        return res.status(400).json({ error: 'marketplace is required' });
      }

      const { error } = await supabaseAdmin
        .from('user_marketplace_credentials')
        .delete()
        .eq('user_uuid', user.id)
        .eq('marketplace', marketplace);

      if (error) {
        throw new Error(`Failed to delete credentials: ${error.message}`);
      }

      return res.status(200).json({
        success: true,
        message: `${marketplace} credentials deleted`
      });
    }

    // Save/update credentials
    const body: RequestBody = req.body;
    const { marketplace, email, cookies, password, sessionCookie, expiresInDays = 7 } = body;

    if (!marketplace) {
      return res.status(400).json({ error: 'marketplace is required' });
    }

    // Validate and process cookies
    let cookiesEncrypted: string | null = null;
    let cookieCount = 0;
    
    if (cookies) {
      try {
        const cookiesArray = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        
        if (!Array.isArray(cookiesArray) || cookiesArray.length === 0) {
          return res.status(400).json({ error: 'Cookies must be a non-empty array' });
        }
        
        // Validate cookie format
        const hasValidCookies = cookiesArray.every(c => 
          c && typeof c === 'object' && c.name && c.value
        );
        
        if (!hasValidCookies) {
          return res.status(400).json({ 
            error: 'Invalid cookie format. Each cookie must have "name" and "value" properties.' 
          });
        }
        
        cookieCount = cookiesArray.length;
        cookiesEncrypted = encrypt(JSON.stringify(cookiesArray));
        
      } catch (err: any) {
        return res.status(400).json({ 
          error: 'Failed to parse cookies: ' + err.message 
        });
      }
    }

    // Fallback to legacy auth (password/sessionCookie) if no cookies provided
    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedCookie = sessionCookie ? encrypt(sessionCookie) : null;

    if (!cookiesEncrypted && !encryptedPassword && !encryptedCookie) {
      return res.status(400).json({ 
        error: 'Either cookies, password, or sessionCookie is required' 
      });
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Upsert credentials
    const { data, error } = await supabaseAdmin
      .from('user_marketplace_credentials')
      .upsert({
        user_uuid: user.id,
        marketplace,
        email: email || null,
        cookies_encrypted: cookiesEncrypted,
        password_encrypted: encryptedPassword,
        session_cookie: encryptedCookie,
        last_validated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_uuid,marketplace'
      })
      .select();

    if (error) {
      throw new Error(`Failed to save credentials: ${error.message}`);
    }

    console.log(`✅ Saved ${marketplace} credentials for user ${user.id} (${cookieCount} cookies)`);

    return res.status(200).json({
      success: true,
      message: `${marketplace} credentials saved successfully`,
      data: {
        marketplace,
        email: email || null,
        cookieCount,
        hasCookies: !!cookiesEncrypted,
        hasPassword: !!password,
        hasSessionCookie: !!sessionCookie,
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Save credentials error:', error);
    
    return res.status(500).json({
      error: error.message,
      details: error.toString()
    });
  }
}

