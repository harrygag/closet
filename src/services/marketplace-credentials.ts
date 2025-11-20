/**
 * Marketplace Credentials Service
 * Handles saving and retrieving marketplace cookies from Chrome extension
 */

import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export interface MarketplaceCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
}

export interface SaveCredentialsPayload {
  marketplace: 'ebay' | 'poshmark' | 'depop' | 'vendoo';
  cookies: MarketplaceCookie[];
  email?: string;
  autoSynced?: boolean;
}

export interface MarketplaceCredential {
  id: string;
  user_id: string;
  marketplace: string;
  cookies_json: string;
  email: string | null;
  cookie_count: number;
  last_validated: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Save marketplace credentials to database
 */
export async function saveMarketplaceCredentials(
  payload: SaveCredentialsPayload,
  user: User
): Promise<{ success: boolean; error?: string; data?: MarketplaceCredential }> {
  try {
    const { marketplace, cookies, email, autoSynced = false } = payload;

    if (!cookies || cookies.length === 0) {
      return { success: false, error: 'No cookies provided' };
    }

    // Calculate expiration date (earliest cookie expiration)
    const expirations = cookies
      .map(c => c.expirationDate)
      .filter((exp): exp is number => exp !== undefined);
    
    const earliestExpiration = expirations.length > 0
      ? new Date(Math.min(...expirations) * 1000).toISOString()
      : null;

    // Prepare data
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

    // Check if credentials already exist for this marketplace
    const { data: existing, error: fetchError } = await supabase
      .from('user_marketplace_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('marketplace', marketplace)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is fine
      throw fetchError;
    }

    let result;

    if (existing) {
      // Update existing credentials
      const { data, error } = await supabase
        .from('user_marketplace_credentials')
        .update(credentialData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;

      console.log(`[MarketplaceCredentials] Updated ${marketplace} credentials (${cookies.length} cookies)`);
    } else {
      // Insert new credentials
      const { data, error } = await supabase
        .from('user_marketplace_credentials')
        .insert(credentialData)
        .select()
        .single();

      if (error) throw error;
      result = data;

      console.log(`[MarketplaceCredentials] Saved new ${marketplace} credentials (${cookies.length} cookies)`);
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error('[MarketplaceCredentials] Error saving credentials:', error);
    return { success: false, error: error.message || 'Failed to save credentials' };
  }
}

/**
 * Get marketplace credentials for the current user
 */
export async function getMarketplaceCredentials(
  marketplace?: string
): Promise<{ success: boolean; error?: string; data?: MarketplaceCredential[] }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    let query = supabase
      .from('user_marketplace_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (marketplace) {
      query = query.eq('marketplace', marketplace);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[MarketplaceCredentials] Error fetching credentials:', error);
    return { success: false, error: error.message || 'Failed to fetch credentials' };
  }
}

/**
 * Get cookies for a specific marketplace
 */
export async function getMarketplaceCookies(
  marketplace: string
): Promise<{ success: boolean; error?: string; cookies?: MarketplaceCookie[] }> {
  try {
    const result = await getMarketplaceCredentials(marketplace);

    if (!result.success || !result.data || result.data.length === 0) {
      return { success: false, error: 'No credentials found' };
    }

    const credential = result.data[0];

    // Check if expired
    if (credential.expires_at) {
      const expirationDate = new Date(credential.expires_at);
      if (expirationDate < new Date()) {
        return { success: false, error: 'Credentials expired' };
      }
    }

    const cookies = JSON.parse(credential.cookies_json) as MarketplaceCookie[];
    return { success: true, cookies };
  } catch (error: any) {
    console.error('[MarketplaceCredentials] Error getting cookies:', error);
    return { success: false, error: error.message || 'Failed to get cookies' };
  }
}

/**
 * Delete marketplace credentials
 */
export async function deleteMarketplaceCredentials(
  marketplace: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('user_marketplace_credentials')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('marketplace', marketplace);

    if (error) throw error;

    console.log(`[MarketplaceCredentials] Deleted ${marketplace} credentials`);
    return { success: true };
  } catch (error: any) {
    console.error('[MarketplaceCredentials] Error deleting credentials:', error);
    return { success: false, error: error.message || 'Failed to delete credentials' };
  }
}

/**
 * Check if marketplace credentials are valid (not expired)
 */
export async function validateMarketplaceCredentials(
  marketplace: string
): Promise<{ success: boolean; isValid: boolean; error?: string }> {
  try {
    const result = await getMarketplaceCredentials(marketplace);

    if (!result.success || !result.data || result.data.length === 0) {
      return { success: true, isValid: false };
    }

    const credential = result.data[0];

    if (credential.expires_at) {
      const expirationDate = new Date(credential.expires_at);
      const isValid = expirationDate > new Date();
      return { success: true, isValid };
    }

    // No expiration date, assume valid
    return { success: true, isValid: true };
  } catch (error: any) {
    console.error('[MarketplaceCredentials] Error validating credentials:', error);
    return { success: false, isValid: false, error: error.message };
  }
}

