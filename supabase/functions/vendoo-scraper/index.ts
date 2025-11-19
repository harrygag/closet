import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Puppeteer for Deno
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VendooItem {
  title: string;
  url: string;
  price?: string;
  imageUrl?: string;
  status?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication');
    }

    console.log(`🔐 Authenticated user: ${user.id}`);

    // 2. Get Vendoo credentials from database
    const { data: credentials, error: credsError } = await supabase
      .from('user_vendoo_credentials')
      .select('vendoo_email, vendoo_password_encrypted')
      .eq('user_uuid', user.id)
      .single();

    if (credsError || !credentials) {
      return new Response(
        JSON.stringify({ 
          error: 'Vendoo credentials not found. Please save your credentials first.',
          needsSetup: true 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🔑 Found credentials for: ${credentials.vendoo_email}`);

    // 3. Launch headless browser
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1920, height: 1080 });

    try {
      // 4. Navigate to Vendoo login page
      console.log('📄 Navigating to Vendoo login...');
      await page.goto('https://web.vendoo.co/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // 5. Fill in login credentials
      console.log('🔐 Logging in...');
      
      // Wait for email input (adjust selector based on actual Vendoo HTML)
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
      await page.type('input[type="email"], input[name="email"]', credentials.vendoo_email);
      
      // Password field
      await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
      
      // Decrypt password (TODO: implement proper decryption)
      const vendooPassword = credentials.vendoo_password_encrypted;
      await page.type('input[type="password"], input[name="password"]', vendooPassword);
      
      // Click login button
      await page.click('button[type="submit"]');
      
      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      console.log('✅ Login successful');

      // 6. Navigate to inventory page (already there after login, but ensure correct URL)
      console.log('📦 Fetching inventory...');
      await page.goto('https://web.vendoo.co/app/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for items to load - look for links starting with "View "
      await page.waitForSelector('a[href*="/app/item/"]', {
        timeout: 15000,
      });

      // 7. Scrape item links and marketplace URLs
      console.log('🔍 Scraping items...');
      const scrapedItems = await page.evaluate(() => {
        // Each item card is a link with href="/app/item/{ID}"
        const itemLinks = Array.from(document.querySelectorAll('a[href*="/app/item/"]'));
        
        return itemLinks.map((itemLink) => {
          // Title is in an h2 within the link
          const titleElement = itemLink.querySelector('h2');
          const title = titleElement?.textContent?.trim() || '';
          
          // Vendoo URL
          const vendooUrl = `https://web.vendoo.co${itemLink.getAttribute('href')}`;
          
          // Price is in a paragraph with $ sign
          const paragraphs = itemLink.querySelectorAll('p');
          let price = '';
          paragraphs.forEach((p) => {
            const text = p.textContent?.trim() || '';
            if (text.startsWith('$')) {
              price = text;
            }
          });
          
          // Image
          const imageElement = itemLink.querySelector('img');
          const imageUrl = imageElement?.src || '';
          
          // Marketplace links (ebay, poshmark, etc.) are in sibling elements
          // Look for links with text like "View listed item on ebay"
          const marketplaceLinks: { type: string; url: string }[] = [];
          const parentContainer = itemLink.parentElement;
          if (parentContainer) {
            const allLinks = parentContainer.querySelectorAll('a[href*="ebay.com"], a[href*="poshmark.com"], a[href*="mercari.com"], a[href*="grailed.com"], a[href*="depop.com"]');
            allLinks.forEach((link) => {
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
        }).filter(item => item.title && item.vendooUrl); // Only return items with title and URL
      });

      console.log(`✅ Scraped ${scrapedItems.length} items`);

      // 8. Match scraped items to database items and update vendooUrl
      console.log('🔗 Matching items to database...');
      
      // Get all items for this user
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
        // Match by title (case-insensitive, fuzzy match)
        const matchedDbItem = dbItems.find((dbItem) => {
          const dbTitle = (dbItem.title || '').toLowerCase().trim();
          const scrapedTitle = scrapedItem.title.toLowerCase().trim();
          // Exact match or contains match
          return dbTitle === scrapedTitle || dbTitle.includes(scrapedTitle) || scrapedTitle.includes(dbTitle);
        });
        
        if (matchedDbItem) {
          // Update the vendooUrl for this item
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
      return new Response(
        JSON.stringify({ 
          success: true,
          scrapedCount: scrapedItems.length,
          updatedCount,
          errors: updateErrors,
          items: scrapedItems, // Full scrape data for debugging
          scrapedAt: new Date().toISOString(),
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );

    } catch (scrapeError) {
      await browser.close();
      throw scrapeError;
    }

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

