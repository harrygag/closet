/**
 * API: POST /api/poshmark/scrape-listings
 * 
 * Scrapes Poshmark closet listings and imports/links them
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
    const { action, username, password } = body;

    if (!action) {
      return res.status(400).json({ error: 'action is required (import or fill-links)' });
    }

    // Get credentials
    let poshmarkUsername = username;
    let poshmarkPassword = password;

    if (!poshmarkUsername || !poshmarkPassword) {
      const { data: credentials, error: credsError } = await supabaseAdmin
        .from('user_marketplace_credentials')
        .select('email, password_encrypted')
        .eq('user_uuid', user.id)
        .eq('marketplace', 'poshmark')
        .single();

      if (credentials) {
        poshmarkUsername = credentials.email;
        poshmarkPassword = credentials.password_encrypted;
      }
    }

    if (!poshmarkUsername || !poshmarkPassword) {
      return res.status(400).json({ 
        error: 'Poshmark credentials required.',
        needsSetup: true 
      });
    }

    browser = await launchBrowser();
    const page = await browser.newPage();

    try {
      console.log('📄 Navigating to Poshmark login...');
      await page.goto('https://poshmark.com/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Login
      await page.waitForSelector('input[name="login_form[username_email]"], input[type="email"]', { timeout: 10000 });
      await page.type('input[name="login_form[username_email]"], input[type="email"]', poshmarkUsername!);
      
      await page.waitForSelector('input[name="login_form[password]"], input[type="password"]', { timeout: 10000 });
      await page.type('input[name="login_form[password]"], input[type="password"]', poshmarkPassword!);
      
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      console.log('✅ Login successful');

      // Navigate to closet
      await randomDelay(1000, 2000);
      await page.goto('https://poshmark.com/closet', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for listings
      await page.waitForSelector('.tile, [data-test="tile"], .card', { timeout: 15000 });

      console.log('🔍 Scraping Poshmark closet...');
      const scrapedItems: ScrapedItem[] = await page.evaluate(() => {
        const items: any[] = [];
        const tiles = document.querySelectorAll('.tile, [data-test="tile"], .card');

        tiles.forEach((tile: any) => {
          try {
            const titleEl = tile.querySelector('.tile__title, [data-test="tile-title"], .card__title');
            const title = titleEl?.textContent?.trim() || '';
            
            const linkEl = tile.querySelector('a');
            const url = linkEl?.href || '';
            
            const priceEl = tile.querySelector('.tile__price, [data-test="tile-price"], .card__price');
            const priceText = priceEl?.textContent?.trim() || '';
            const priceMatch = priceText.match(/[\d,]+/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : 0;
            
            const imgEl = tile.querySelector('img');
            const imageUrl = imgEl?.src || '';
            
            const brandEl = tile.querySelector('.tile__details__pipe__brand, [data-test="tile-brand"]');
            const brand = brandEl?.textContent?.trim() || '';
            
            const sizeEl = tile.querySelector('.tile__details__pipe__size, [data-test="tile-size"]');
            const size = sizeEl?.textContent?.trim() || '';
            
            const soldBadge = tile.querySelector('.sold-badge, [data-test="sold-badge"]');
            const status = soldBadge ? 'sold' : 'active';
            
            if (title && url) {
              items.push({
                title,
                price,
                url: url.startsWith('http') ? url : `https://poshmark.com${url}`,
                imageUrl,
                status,
                brand,
                size,
                marketplace: 'poshmark'
              });
            }
          } catch (err) {
            console.error('Error parsing tile:', err);
          }
        });
        
        return items;
      });

      console.log(`✅ Scraped ${scrapedItems.length} Poshmark listings`);

      const { data: dbItems, error: itemsError } = await supabaseAdmin
        .from('Item')
        .select('id, title, poshmarkUrl')
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
            const updateResult = await updateMarketplaceUrl(match.item.id, 'poshmark', scrapedItem.url);
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
    console.error('❌ Poshmark scraper error:', error);
    logError('api/poshmark/scrape-listings', error.message, { error: error.toString() });
    
    return res.status(500).json({
      error: error.message,
      details: error.toString()
    });
  }
}

