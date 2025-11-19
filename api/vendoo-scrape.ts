import { VercelRequest, VercelResponse } from '@vercel/node';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 300, // 5 minutes for Pro plan, 10 seconds for Hobby
};

interface VendooItem {
  title: string;
  vendooUrl: string;
  price?: string;
  imageUrl?: string;
  marketplaceLinks: { type: string; url: string }[];
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

  try {
    // 1. Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    console.log(`🔐 Authenticated user: ${user.id}`);

    // 2. Get Vendoo credentials from database
    const { data: credentials, error: credsError } = await supabase
      .from('user_vendoo_credentials')
      .select('vendoo_email, vendoo_password_encrypted')
      .eq('user_uuid', user.id)
      .single();

    if (credsError || !credentials) {
      return res.status(404).json({ 
        error: 'Vendoo credentials not found. Please save your credentials first.',
        needsSetup: true 
      });
    }

    console.log(`🔑 Found credentials for: ${credentials.vendoo_email}`);

    // 3. Launch headless Chrome
    console.log('🚀 Launching browser...');
    
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    try {
      // 4. Navigate to Vendoo login page
      console.log('📄 Navigating to Vendoo login...');
      await page.goto('https://web.vendoo.co/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // 5. Fill in login credentials
      console.log('🔐 Logging in...');
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', credentials.vendoo_email);
      
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.type('input[type="password"]', credentials.vendoo_password_encrypted);
      
      // Click login button
      await page.click('button[type="submit"]');
      
      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      console.log('✅ Login successful');

      // 6. Navigate to inventory page
      console.log('📦 Fetching inventory...');
      await page.goto('https://web.vendoo.co/app/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for items to load
      await page.waitForSelector('a[href*="/app/item/"]', { timeout: 15000 });

      // 7. Scrape item links and marketplace URLs
      console.log('🔍 Scraping items...');
      const scrapedItems: VendooItem[] = await page.evaluate(() => {
        const itemLinks = Array.from(document.querySelectorAll('a[href*="/app/item/"]'));
        
        return itemLinks.map((itemLink: any) => {
          const titleElement = itemLink.querySelector('h2');
          const title = titleElement?.textContent?.trim() || '';
          
          const vendooUrl = `https://web.vendoo.co${itemLink.getAttribute('href')}`;
          
          const paragraphs = itemLink.querySelectorAll('p');
          let price = '';
          paragraphs.forEach((p: any) => {
            const text = p.textContent?.trim() || '';
            if (text.startsWith('$')) {
              price = text;
            }
          });
          
          const imageElement = itemLink.querySelector('img');
          const imageUrl = imageElement?.src || '';
          
          const marketplaceLinks: { type: string; url: string }[] = [];
          const parentContainer = itemLink.parentElement;
          if (parentContainer) {
            const allLinks = parentContainer.querySelectorAll('a[href*="ebay.com"], a[href*="poshmark.com"], a[href*="mercari.com"], a[href*="grailed.com"], a[href*="depop.com"]');
            allLinks.forEach((link: any) => {
              const href = link.getAttribute('href') || '';
              let type = 'other';
              if (href.includes('ebay.com')) type = 'ebay';
              else if (href.includes('poshmark.com')) type = 'poshmark';
              else if (href.includes('mercari.com')) type = 'mercari';
              else if (href.includes('grailed.com')) type = 'grailed';
              else if (href.includes('depop.com')) type = 'depop';
              
              marketplaceLinks.push({ type, url: href });
            });
          }
          
          return {
            title,
            vendooUrl,
            price,
            imageUrl,
            marketplaceLinks,
          };
        }).filter(item => item.title && item.vendooUrl);
      });

      console.log(`✅ Scraped ${scrapedItems.length} items`);

      // 8. Match scraped items to database items and update vendooUrl
      console.log('🔗 Matching items to database...');
      
      const { data: dbItems, error: itemsError } = await supabase
        .from('Item')
        .select('id, title, vendooUrl')
        .eq('user_uuid', user.id);
      
      if (itemsError) {
        throw new Error(`Failed to fetch items: ${itemsError.message}`);
      }
      
      let updatedCount = 0;
      const updateErrors: string[] = [];
      
      for (const scrapedItem of scrapedItems) {
        const matchedDbItem = dbItems.find((dbItem: any) => {
          const dbTitle = (dbItem.title || '').toLowerCase().trim();
          const scrapedTitle = scrapedItem.title.toLowerCase().trim();
          return dbTitle === scrapedTitle || dbTitle.includes(scrapedTitle) || scrapedTitle.includes(dbTitle);
        });
        
        if (matchedDbItem) {
          const { error: updateError } = await supabase
            .from('Item')
            .update({ vendooUrl: scrapedItem.vendooUrl })
            .eq('id', matchedDbItem.id);
          
          if (updateError) {
            updateErrors.push(`${scrapedItem.title}: ${updateError.message}`);
          } else {
            updatedCount++;
          }
        }
      }
      
      console.log(`✅ Updated ${updatedCount} items with Vendoo URLs`);

      await browser.close();

      // 9. Return results
      return res.status(200).json({ 
        success: true,
        scrapedCount: scrapedItems.length,
        updatedCount,
        errors: updateErrors,
        items: scrapedItems,
        scrapedAt: new Date().toISOString(),
      });

    } catch (scrapeError) {
      await browser.close();
      throw scrapeError;
    }

  } catch (error: any) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.toString(),
    });
  }
}

