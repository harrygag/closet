/**
 * API: POST /api/ebay/scrape-listings
 * 
 * Scrapes eBay listings from seller hub and imports/links them
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
  maxDuration: 300, // 5 minutes for Pro plan
};

interface RequestBody {
  action: 'import' | 'fill-links';
  username?: string;
  password?: string;
  sessionCookie?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
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
    // 1. Verify authentication
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
    const { action, username, password, sessionCookie } = body;

    if (!action) {
      return res.status(400).json({ error: 'action is required (import or fill-links)' });
    }

    // 2. Get credentials from DB or request body
    let ebayUsername = username;
    let ebayPassword = password;
    let ebayCookie = sessionCookie;

    if (!ebayUsername || !ebayPassword) {
      const { data: credentials, error: credsError } = await supabaseAdmin
        .from('user_marketplace_credentials')
        .select('email, password_encrypted, session_cookie')
        .eq('user_uuid', user.id)
        .eq('marketplace', 'ebay')
        .single();

      if (credentials) {
        ebayUsername = credentials.email;
        ebayPassword = credentials.password_encrypted;
        ebayCookie = credentials.session_cookie;
      }
    }

    if (!ebayUsername || (!ebayPassword && !ebayCookie)) {
      return res.status(400).json({ 
        error: 'eBay credentials required. Please provide username/password or save credentials.',
        needsSetup: true 
      });
    }

    // 3. Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();

    try {
      // 4. Login to eBay
      console.log('📄 Navigating to eBay login...');
      
      if (ebayCookie) {
        // Use session cookie if available (faster)
        await page.setCookie({
          name: 'ebay_session',
          value: ebayCookie,
          domain: '.ebay.com'
        });
        await page.goto('https://www.ebay.com/sh/lst/active', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      } else {
        // Login with username/password
        await page.goto('https://signin.ebay.com/', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await page.waitForSelector('#userid', { timeout: 10000 });
        await page.type('#userid', ebayUsername!);
        await page.click('#signin-continue-btn');
        
        await randomDelay(1000, 2000);
        
        await page.waitForSelector('#pass', { timeout: 10000 });
        await page.type('#pass', ebayPassword!);
        await page.click('#sgnBt');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        console.log('✅ Login successful');

        // Navigate to active listings
        await page.goto('https://www.ebay.com/sh/lst/active', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      // 5. Wait for listings to load
      await randomDelay(2000, 3000);
      
      // Try multiple selectors for better compatibility
      const selectors = [
        '.sh-ListingCard',
        '[data-testid="listing-card"]',
        '[data-test-id="listing-row"]',
        '.s-item',
        '.listing-item'
      ];
      
      let listingsFound = false;
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          listingsFound = true;
          console.log(`✅ Found listings with selector: ${selector}`);
          break;
        } catch (e) {
          console.log(`❌ Selector failed: ${selector}`);
        }
      }
      
      if (!listingsFound) {
        throw new Error('Could not find any listings on the page. Make sure you have active listings.');
      }
      
      // Scroll to load lazy-loaded items
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await randomDelay(1000, 2000);

      // 6. Scrape listings
      console.log('🔍 Scraping eBay listings...');
      const scrapedItems: ScrapedItem[] = await page.evaluate(() => {
        const items: any[] = [];
        
        // Try multiple selectors for different eBay layouts (order matters - most specific first)
        const listingSelectors = [
          '.sh-ListingCard',
          '[data-testid="listing-card"]',
          '[data-test-id="listing-row"]',
          '.s-item:not(.s-item--watch-at-corner)', // Exclude sponsored items
          '.listing-item'
        ];
        
        let listingElements: NodeListOf<Element> | null = null;
        
        for (const selector of listingSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            listingElements = elements;
            console.log(`Using selector: ${selector}, found ${elements.length} items`);
            break;
          }
        }
        
        if (!listingElements) {
          console.error('No listing elements found with any selector');
          return [];
        }

        listingElements.forEach((element: any, index: number) => {
          try {
            // Extract title - try multiple selectors
            const titleSelectors = [
              '.sh-ListingCard__title',
              '[data-testid="listing-title"]',
              '[data-test-id="listing-title"]',
              '.s-item__title',
              '.listing-title',
              'h3',
              'h2'
            ];
            
            let titleEl = null;
            let title = '';
            
            for (const sel of titleSelectors) {
              titleEl = element.querySelector(sel);
              if (titleEl) {
                title = titleEl.textContent?.trim() || '';
                if (title) break;
              }
            }
            
            // Extract URL
            const linkEl = titleEl?.closest('a') || titleEl || element.querySelector('a');
            const url = linkEl?.href || linkEl?.getAttribute('href') || '';
            const fullUrl = url.startsWith('http') ? url : `https://www.ebay.com${url}`;
            
            // Extract price - try multiple selectors
            const priceSelectors = [
              '.sh-ListingCard__price',
              '[data-testid="listing-price"]',
              '[data-test-id="listing-price"]',
              '.s-item__price',
              '.listing-price'
            ];
            
            let priceText = '';
            for (const sel of priceSelectors) {
              const priceEl = element.querySelector(sel);
              if (priceEl) {
                priceText = priceEl.textContent?.trim() || '';
                if (priceText) break;
              }
            }
            
            // Parse price (handle formats like "$25.00", "$1,234.56", "US $25.00")
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            
            // Extract image
            const imgEl = element.querySelector('img');
            const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
            
            // Extract status (active by default from active listings page)
            const status = 'active';
            
            // Validate required fields
            if (title && fullUrl && title.length > 3) {
              items.push({
                title,
                price,
                url: fullUrl,
                imageUrl,
                status,
                marketplace: 'ebay'
              });
              console.log(`Scraped item ${index + 1}: ${title.substring(0, 50)}...`);
            } else {
              console.warn(`Skipped item ${index + 1}: missing required data`);
            }
          } catch (err) {
            console.error('Error parsing listing:', err);
          }
        });
        
        console.log(`Total items scraped: ${items.length}`);
        return items;
      });

      console.log(`✅ Scraped ${scrapedItems.length} eBay listings`);

      // 7. Get existing items from database
      const { data: dbItems, error: itemsError } = await supabaseAdmin
        .from('Item')
        .select('id, title, ebayUrl')
        .eq('user_uuid', user.id);
      
      if (itemsError) {
        throw new Error(`Failed to fetch items: ${itemsError.message}`);
      }

      // 8. Process items based on action
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
          // Check if already exists
          const match = matchItemByTitle(scrapedItem.title, dbItems, 0.95);
          
          if (match) {
            results.skippedCount++;
            console.log(`⏭️  Skipped (already exists): ${scrapedItem.title}`);
            continue;
          }
          
          // Import new item
          const importResult = await importNewItem(scrapedItem, user.id);
          if (importResult.success) {
            results.importedCount++;
            results.items.push({
              title: scrapedItem.title,
              action: 'imported',
              itemId: importResult.itemId
            });
          } else {
            results.errors.push(`Import failed for "${scrapedItem.title}": ${importResult.error}`);
          }
        } else if (action === 'fill-links') {
          // Find matching item and update URL
          const match = matchItemByTitle(scrapedItem.title, dbItems, 0.8);
          
          if (match) {
            const updateResult = await updateMarketplaceUrl(match.item.id, 'ebay', scrapedItem.url);
            if (updateResult.success) {
              results.updatedCount++;
              results.items.push({
                title: scrapedItem.title,
                action: 'updated',
                itemId: match.item.id,
                similarity: match.similarity
              });
            } else {
              results.errors.push(`Update failed for "${scrapedItem.title}": ${updateResult.error}`);
            }
          } else {
            results.skippedCount++;
            console.log(`⏭️  No match found: ${scrapedItem.title}`);
          }
        }
      }

      await browser.close();

      console.log(`📊 Results: ${results.importedCount} imported, ${results.updatedCount} updated, ${results.skippedCount} skipped`);

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
    console.error('❌ eBay scraper error:', error);
    logError('api/ebay/scrape-listings', error.message, { error: error.toString() });
    
    return res.status(500).json({
      error: error.message,
      details: error.toString()
    });
  }
}

