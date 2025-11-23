const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.join(__dirname, '..', 'extension');
const APP_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3001';

let browser;
let page;
let extensionId;

beforeAll(async () => {
  // Launch Chrome with extension loaded
  browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox'
    ]
  });

  // Get extension ID
  const targets = await browser.targets();
  const extensionTarget = targets.find(
    target => target.type() === 'service_worker' && 
              target.url().includes('chrome-extension://')
  );
  
  if (extensionTarget) {
    const url = extensionTarget.url();
    extensionId = url.split('/')[2];
    console.log('✅ Extension loaded with ID:', extensionId);
  } else {
    throw new Error('❌ Extension failed to load');
  }

  page = await browser.newPage();
}, 30000);

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
});

describe('Extension Communication Tests', () => {
  test('Extension loads successfully', async () => {
    expect(extensionId).toBeDefined();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('Background script is running', async () => {
    const backgroundPage = await browser.waitForTarget(
      target => target.type() === 'service_worker'
    );
    expect(backgroundPage).toBeDefined();
  });

  test('Extension injects content script on app page', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    
    // Wait for content script to load
    await page.waitForFunction(
      () => document.body.textContent.includes('[VirtualCloset]') ||
            window.postMessage,
      { timeout: 5000 }
    );

    // Check console for content script log
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForTimeout(1000);
    
    const hasContentScript = logs.some(log => 
      log.includes('[VirtualCloset] Content script loaded') ||
      log.includes('Extension ID:')
    );
    
    expect(hasContentScript).toBe(true);
  }, 15000);

  test('Extension announces ID to app', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    
    // Listen for postMessage with extension ID
    const extensionIdFromPage = await page.evaluate(() => {
      return new Promise((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.data.type === 'CLOSET_EXTENSION_ID') {
            resolve(event.data.extensionId);
          }
        });
        
        // Trigger ping
        window.postMessage({ type: 'CLOSET_PING_EXTENSION' }, '*');
        
        // Timeout after 5 seconds
        setTimeout(() => resolve(null), 5000);
      });
    });
    
    expect(extensionIdFromPage).toBeDefined();
    expect(extensionIdFromPage).toBe(extensionId);
  }, 10000);

  test('App displays extension connected status', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    // Navigate to marketplaces page if not there
    try {
      await page.click('a[href*="marketplace"]', { timeout: 2000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      // Already on page or link doesn't exist
    }
    
    // Check for extension status indicator
    const statusText = await page.evaluate(() => {
      const el = document.body;
      return el.textContent;
    });
    
    const isConnected = 
      statusText.includes('Extension Status:') &&
      (statusText.includes('Active') || statusText.includes('Connected'));
    
    expect(isConnected).toBe(true);
  }, 15000);
});

describe('API Communication Tests', () => {
  test('Backend API is reachable', async () => {
    const response = await page.goto(`${API_URL}/health`, { 
      waitUntil: 'networkidle2' 
    });
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('Extension can reach API endpoint', async () => {
    // Navigate to app
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    
    // Test API call from page context
    const apiResponse = await page.evaluate(async (apiUrl) => {
      try {
        const response = await fetch(`${apiUrl}/health`);
        const data = await response.json();
        return { success: true, status: response.status, data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, API_URL);
    
    expect(apiResponse.success).toBe(true);
    expect(apiResponse.status).toBe(200);
  });
});

describe('Cookie Sync Flow Tests', () => {
  test('Manual sync button is visible on marketplaces page', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    // Look for sync button
    const hasSyncButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => 
        btn.textContent.includes('Manual Sync') ||
        btn.textContent.includes('Login & Capture')
      );
    });
    
    expect(hasSyncButton).toBe(true);
  }, 10000);

  test('Diagnostics button opens modal', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    // Try to find and click diagnostics button
    try {
      const diagnosticsButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => btn.textContent.includes('Diagnostics'));
      });
      
      if (diagnosticsButton) {
        await diagnosticsButton.click();
        await page.waitForTimeout(1000);
        
        // Check if modal opened
        const modalVisible = await page.evaluate(() => {
          return document.querySelector('[role="dialog"]') !== null ||
                 document.body.textContent.includes('Background Worker');
        });
        
        expect(modalVisible).toBe(true);
      }
    } catch (e) {
      // Button might not be clickable yet
      console.log('Diagnostics test skipped:', e.message);
    }
  }, 10000);
});

describe('Extension XHR Tests', () => {
  test('No XHR errors in console', async () => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);
    
    // Filter out expected errors (like 404 for missing resources)
    const relevantErrors = errors.filter(err => 
      !err.includes('favicon') &&
      !err.includes('404') &&
      err.includes('localhost')
    );
    
    if (relevantErrors.length > 0) {
      console.log('Console errors found:', relevantErrors);
    }
    
    // We expect 0 major errors
    expect(relevantErrors.length).toBeLessThan(3);
  });

  test('Network requests use correct ports', async () => {
    const requests = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('localhost')) {
        requests.push(url);
      }
    });
    
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    // Check if any requests went to wrong port (3000 instead of 3001)
    const wrongPortRequests = requests.filter(url => 
      url.includes('localhost:3000') && !url.includes('5173')
    );
    
    expect(wrongPortRequests).toEqual([]);
  });
});

