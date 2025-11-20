/**
 * Shared utilities for marketplace scraping with Puppeteer
 * Provides reusable functions for browser automation and data processing
 */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface ScrapedItem {
  title: string;
  price?: number;
  url: string;
  imageUrl?: string;
  status?: 'active' | 'sold' | 'inactive';
  condition?: string;
  size?: string;
  brand?: string;
  marketplace: 'ebay' | 'poshmark' | 'depop';
}

/**
 * Launch Puppeteer browser with Chromium optimized for serverless
 */
export async function launchBrowser() {
  console.log('🚀 Launching browser...');
  
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  return browser;
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a score between 0 and 1 (1 = identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0;
  
  // Levenshtein distance implementation
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  const distance = matrix[len2][len1];
  
  return 1 - distance / maxLen;
}

/**
 * Match scraped item to existing database items by title similarity
 * Returns the best match if similarity >= threshold (default 0.8)
 */
export function matchItemByTitle(
  scrapedTitle: string,
  dbItems: any[],
  threshold: number = 0.8
): { item: any; similarity: number } | null {
  let bestMatch: any = null;
  let bestScore = 0;
  
  for (const dbItem of dbItems) {
    const dbTitle = (dbItem.title || '').toLowerCase().trim();
    const scrapedTitleLower = scrapedTitle.toLowerCase().trim();
    
    // Exact match
    if (dbTitle === scrapedTitleLower) {
      return { item: dbItem, similarity: 1.0 };
    }
    
    // Contains match (80% weight)
    if (dbTitle.includes(scrapedTitleLower) || scrapedTitleLower.includes(dbTitle)) {
      const containsScore = 0.85;
      if (containsScore > bestScore) {
        bestScore = containsScore;
        bestMatch = dbItem;
      }
    }
    
    // Similarity score
    const similarity = calculateSimilarity(scrapedTitle, dbTitle);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = dbItem;
    }
  }
  
  if (bestScore >= threshold && bestMatch) {
    return { item: bestMatch, similarity: bestScore };
  }
  
  return null;
}

/**
 * Import a new item from scraped data
 */
export async function importNewItem(
  scrapedData: ScrapedItem,
  userId: string
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  try {
    const itemData = {
      user_uuid: userId,
      title: scrapedData.title,
      size: scrapedData.size || null,
      status: scrapedData.status === 'sold' ? 'SOLD' : 'IN_STOCK',
      normalizedTags: [],
      imageUrls: scrapedData.imageUrl ? [scrapedData.imageUrl] : [],
      manualPriceCents: scrapedData.price ? Math.round(scrapedData.price * 100) : null,
      purchasePriceCents: null,
      soldPriceCents: scrapedData.status === 'sold' && scrapedData.price 
        ? Math.round(scrapedData.price * 100) 
        : null,
      soldDate: scrapedData.status === 'sold' ? new Date().toISOString() : null,
      purchaseDate: new Date().toISOString(),
      notes: `Imported from ${scrapedData.marketplace}`,
      conditionNotes: scrapedData.condition || null,
      brand: scrapedData.brand || 'Unknown',
      category: 'Clothing',
      // Set the appropriate marketplace URL
      ebayUrl: scrapedData.marketplace === 'ebay' ? scrapedData.url : null,
      poshmarkUrl: scrapedData.marketplace === 'poshmark' ? scrapedData.url : null,
      depopUrl: scrapedData.marketplace === 'depop' ? scrapedData.url : null,
    };

    const { data, error } = await supabaseAdmin
      .from('Item')
      .insert(itemData)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to import item:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Imported item: ${scrapedData.title} (${data.id})`);
    return { success: true, itemId: data.id };
  } catch (error: any) {
    console.error('Import error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update marketplace URL for an existing item
 */
export async function updateMarketplaceUrl(
  itemId: string,
  marketplace: 'ebay' | 'poshmark' | 'depop' | 'vendoo',
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const urlField = `${marketplace}Url`;
    
    const { error } = await supabaseAdmin
      .from('Item')
      .update({ [urlField]: url })
      .eq('id', itemId);

    if (error) {
      console.error(`Failed to update ${marketplace}Url:`, error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Updated ${marketplace}Url for item ${itemId}`);
    return { success: true };
  } catch (error: any) {
    console.error('Update error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add random delay to appear more human-like
 */
export function randomDelay(min: number = 500, max: number = 2000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Log error to Notion queue (reusing pattern from other API endpoints)
 */
export function logError(source: string, message: string, details?: Record<string, unknown>) {
  try {
    const fs = require('fs');
    const path = require('path');
    const queueDir = path.join(process.cwd(), 'ops', 'logging');
    const queueFile = path.join(queueDir, 'notion-queue.jsonl');
    
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }
    
    const safe = {
      type: 'error',
      source,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    
    fs.appendFileSync(queueFile, JSON.stringify(safe) + '\n', { encoding: 'utf8' });
  } catch (_) {
    // Ignore logging errors
  }
}

