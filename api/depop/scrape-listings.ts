/**
 * API: POST /api/depop/scrape-listings
 * 
 * Scrapes Depop shop listings and imports/links them
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  launchBrowser, 
  matchItemByTitle, 
  importNewItem, 
  updateMarketplaceUrl,
  randomDelay,
  logError,
  supabaseAdmin,
  ScrapedItem 
} from '../_lib/marketplace-scraper';

export const config = {
  maxDuration: 300,
};

interface RequestBody {
  action: 'import' | 'fill-links';
  username?: string;
  password?: string;
  shopUrl?: string; // Alternative: provide shop URL directly
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    console.log(`🔐 Authenticated user: ${user.id}`);

    const body: RequestBody = req.body;
    const { action, username, password, shopUrl } = body;

    if (!action) {
      return res.status(400).json({ error: 'action is required (import or fill-links)' });
    }

    // Get credentials or shop URL
    let depopUsername = username;
    let depopPassword = password;
    let depopShopUrl = shopUrl;

    if (!depopShopUrl && (!depopUsername || !depopPassword)) {
      const { data: credentials, error: credsError } = await supabaseAdmin
        .from('user_marketplace_credentials')
        .select('email, password_encrypted, session_cookie')
        .eq('user_uuid', user.id)
        .eq('marketplace', 'depop')
        .single();

      if (credentials) {
        depopUsername = credentials.email;
        depopPassword = credentials.password_encrypted;
        // session_cookie could contain shop URL if saved that way
        if (credentials.session_cookie && credentials.session_cookie.startsWith('http')) {
          depopShopUrl = credentials.session_cookie;
        }
      }
    }

    if (!depopShopUrl && (!depopUsername || !depopPassword)) {
      return res.status(400).json({ 
        error: 'Depop credentials or shop URL required.',
        needsSetup: true 
      });
    }

    browser = await launchBrowser();
    const page = await browser.newPage();

    try {
      if (depopShopUrl) {
        // Direct shop URL provided - no login needed
        console.log(`📄 Navigating to Depop shop: ${depopShopUrl}`);
        await page.goto(depopShopUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      } else {
        // Login flow
        console.log('📄 Navigating to Depop login...');
        await page.goto('https://www.depop.com/login/', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 10000 });
        await page.type('input[type="email"], input[name="username"]', depopUsername!);
        
        await page.waitForSelector('input[type="password"]', { timeout: 10000 });
        await page.type('input[type="password"]', depopPassword!);
        
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('✅ Login successful');

        // Navigate to profile/shop
        await randomDelay(1000, 2000);
        await page.goto('https://www.depop.com/my-shop/', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      // Wait for products to load
      await page.waitForSelector('[data-testid="product"], .product-item, a[href*="/products/"]', { 
        timeout: 15000 
      });

      console.log('🔍 Scraping Depop shop...');
      const scrapedItems: ScrapedItem[] = await page.evaluate(() => {
        const items: any[] = [];
        const products = document.querySelectorAll('[data-testid="product"], .product-item, a[href*="/products/"]');

        products.forEach((product: any) => {
          try {
            const titleEl = product.querySelector('[data-testid="product-title"], .product-title, h3, h2');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = product.tagName === 'A' ? product : product.querySelector('a');
            const url = linkEl?.href || '';
            
            const priceEl = product.querySelector('[data-testid="product-price"], .product-price, .price');
            const priceText = priceEl?.textContent?.trim() || '';
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : 0;
            
            const imgEl = product.querySelector('img');
            const imageUrl = imgEl?.src || '';
            
            const soldBadge = product.querySelector('[data-testid="sold-badge"], .sold-badge');
            const status = soldBadge ? 'sold' : 'active';
            
            // Try to extract brand/size from description if visible
            const descEl = product.querySelector('[data-testid="product-description"], .product-description');
            const description = descEl?.textContent?.trim() || '';
            const brandMatch = description.match(/brand[:\s]+([^\n,]+)/i);
            const brand = brandMatch ? brandMatch[1].trim() : '';
            const sizeMatch = description.match(/size[:\s]+([^\n,]+)/i);
            const size = sizeMatch ? sizeMatch[1].trim() : '';
            
            if (title && url) {
              items.push({
                title,
                price,
                url: url.startsWith('http') ? url : `https://www.depop.com${url}`,
                imageUrl,
                status,
                brand,
                size,
                marketplace: 'depop'
              });
            }
          } catch (err) {
            console.error('Error parsing product:', err);
          }
        });
        
        return items;
      });

      console.log(`✅ Scraped ${scrapedItems.length} Depop listings`);

      const { data: dbItems, error: itemsError } = await supabaseAdmin
        .from('Item')
        .select('id, title, depopUrl')
        .eq('user_uuid', user.id);
      
      if (itemsError) {
        throw new Error(`Failed to fetch items: ${itemsError.message}`);
      }

      const results = {
        scrapedCount: scrapedItems.length,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [] as string[],
        items: [] as any[]
      };

      for (const scrapedItem of scrapedItems) {
        if (action === 'import') {
          const match = matchItemByTitle(scrapedItem.title, dbItems, 0.95);
          
          if (match) {
            results.skippedCount++;
            continue;
          }
          
          const importResult = await importNewItem(scrapedItem, user.id);
          if (importResult.success) {
            results.importedCount++;
            results.items.push({
              title: scrapedItem.title,
              action: 'imported',
              itemId: importResult.itemId
            });
          } else {
            results.errors.push(`Import failed: ${importResult.error}`);
          }
        } else if (action === 'fill-links') {
          const match = matchItemByTitle(scrapedItem.title, dbItems, 0.8);
          
          if (match) {
            const updateResult = await updateMarketplaceUrl(match.item.id, 'depop', scrapedItem.url);
            if (updateResult.success) {
              results.updatedCount++;
              results.items.push({
                title: scrapedItem.title,
                action: 'updated',
                itemId: match.item.id,
                similarity: match.similarity
              });
            } else {
              results.errors.push(`Update failed: ${updateResult.error}`);
            }
          } else {
            results.skippedCount++;
          }
        }
      }

      await browser.close();

      return res.status(200).json({
        success: true,
        ...results,
        scrapedAt: new Date().toISOString()
      });

    } catch (scrapeError: any) {
      if (browser) await browser.close();
      throw scrapeError;
    }

  } catch (error: any) {
    console.error('❌ Depop scraper error:', error);
    logError('api/depop/scrape-listings', error.message, { error: error.toString() });
    
    return res.status(500).json({
      error: error.message,
      details: error.toString()
    });
  }
}

