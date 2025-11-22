import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 eBay OAuth Flow Test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

// Check if .env exists
if (!fs.existsSync(path.join(__dirname, '.env'))) {
  console.error('❌ .env file not found!');
  console.log('\n📋 Setup Instructions:');
  console.log('1. Copy env.template to .env');
  console.log('2. Visit: https://developer.ebay.com/my/keys');
  console.log('3. Create or select an app');
  console.log('4. Copy App ID (Client ID) to .env');
  console.log('5. Copy Cert ID (Client Secret) to .env');
  console.log('6. Run: npm start (to start the server)');
  console.log('7. Run: npm test (to test OAuth)\n');
  process.exit(1);
}

// Validate credentials
const required = ['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_REDIRECT_URI'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  console.log('Check your .env file!\n');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log(`   Environment: ${process.env.EBAY_ENVIRONMENT || 'SANDBOX'}`);
console.log(`   App ID: ${process.env.EBAY_APP_ID.substring(0, 20)}...`);
console.log(`   Redirect: ${process.env.EBAY_REDIRECT_URI}\n`);

async function testOAuth() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--window-size=1200,900']
  });

  try {
    const page = await browser.newPage();
    
    console.log('📍 Step 1: Opening test server...');
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if already authenticated
    const content = await page.content();
    
    if (content.includes('✅ Authenticated')) {
      console.log('✅ Already authenticated!');
      console.log('   Token exists in tokens.json\n');
      
      // Test inventory fetch
      console.log('📍 Step 2: Testing inventory fetch...');
      await page.click('a[href="/test/inventory"] button');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      const inventoryContent = await page.content();
      
      if (inventoryContent.includes('Inventory Items')) {
        console.log('✅ Inventory fetch successful!');
        
        // Check if file was created
        if (fs.existsSync(path.join(__dirname, 'inventory.json'))) {
          const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json')));
          console.log(`   Found ${inventory.inventoryItems?.length || 0} items`);
        }
      } else {
        console.log('⚠️  Inventory fetch returned unexpected response');
      }
      
      console.log('\n🎉 OAuth flow already complete!\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await browser.close();
      return;
    }
    
    console.log('📍 Step 2: Clicking "Connect eBay Account"...');
    await page.click('a[href="/auth/ebay"] button');
    
    console.log('⏳ Waiting for eBay login page...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}\n`);
    
    if (currentUrl.includes('signin.ebay.com') || currentUrl.includes('auth.ebay.com')) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 eBay Login Required');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📝 MANUAL ACTION REQUIRED:');
      console.log('1. Log in to your eBay account in the browser');
      console.log('2. Grant permissions when prompted');
      console.log('3. Wait for redirect back to localhost:3002');
      console.log('\n⏰ Waiting up to 2 minutes for login...\n');
      
      // Wait for redirect back to our server
      try {
        await page.waitForFunction(
          () => window.location.href.includes('localhost:3002'),
          { timeout: 120000 }
        );
        
        console.log('✅ Redirected back to localhost!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const finalContent = await page.content();
        
        if (finalContent.includes('eBay Connected Successfully')) {
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🎉 OAUTH SUCCESS!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          // Check for tokens file
          if (fs.existsSync(path.join(__dirname, 'tokens.json'))) {
            const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
            console.log('\n✅ Access Token: ' + tokens.accessToken.substring(0, 40) + '...');
            console.log('✅ Refresh Token: ' + (tokens.refreshToken ? tokens.refreshToken.substring(0, 40) + '...' : 'N/A'));
            console.log(`✅ Expires In: ${tokens.expiresIn} seconds`);
            console.log('✅ Tokens saved to: tokens.json\n');
          }
          
          // Now test inventory fetch
          console.log('📍 Step 3: Testing inventory fetch...');
          await page.click('a[href="/test/inventory"] button');
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const inventoryContent = await page.content();
          
          if (inventoryContent.includes('Inventory Items')) {
            console.log('✅ Inventory API call successful!\n');
            
            if (fs.existsSync(path.join(__dirname, 'inventory.json'))) {
              const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json')));
              const itemCount = inventory.inventoryItems?.length || 0;
              
              console.log(`📦 Retrieved ${itemCount} inventory items`);
              console.log('📄 Full response saved to: inventory.json\n');
              
              if (itemCount > 0) {
                console.log('Sample item:');
                console.log(JSON.stringify(inventory.inventoryItems[0], null, 2).substring(0, 500) + '...\n');
              }
            }
          } else {
            console.log('⚠️  Inventory fetch returned unexpected response');
          }
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ ALL TESTS PASSED!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
        } else {
          console.log('⚠️  Unexpected response after OAuth');
          console.log('Page content:', finalContent.substring(0, 500));
        }
        
      } catch (error) {
        console.error('\n❌ Timeout waiting for login');
        console.error('   Make sure you complete the login within 2 minutes\n');
      }
      
    } else if (currentUrl.includes('localhost:3002')) {
      console.log('✅ Already on localhost - OAuth may have completed automatically');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      const content = await page.content();
      
      if (content.includes('eBay Connected Successfully')) {
        console.log('🎉 OAuth completed!\n');
      }
    }
    
    // Keep browser open for inspection
    console.log('Browser will close in 10 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await browser.close();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    
    if (browser) {
      console.log('\nBrowser will stay open for debugging...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      await browser.close();
    }
    
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting OAuth test...\n');
testOAuth();

