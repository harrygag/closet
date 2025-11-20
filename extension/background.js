/**
 * Virtual Closet - Marketplace Connector
 * Background Service Worker
 * 
 * Passive Mode:
 * 1. Listens for marketplace visits
 * 2. Saves cookies to local storage
 * 3. Responds to external messages from the web app
 */

const MARKETPLACES = {
  'ebay.com': { name: 'eBay', key: 'ebay', domain: '.ebay.com' },
  'poshmark.com': { name: 'Poshmark', key: 'poshmark', domain: '.poshmark.com' },
  'depop.com': { name: 'Depop', key: 'depop', domain: '.depop.com' }
};

// Listen for tab updates to detect marketplace visits
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkAndCaptureCookies(tab.url);
  }
});

// Listen for messages from the Web App (Virtual Closet)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_MARKETPLACE_COOKIES') {
    const marketplaceKey = request.marketplace;
    
    if (!marketplaceKey) {
      sendResponse({ success: false, error: 'No marketplace specified' });
      return;
    }

    // Retrieve stored cookies for the requested marketplace
    chrome.storage.local.get([`${marketplaceKey}_cookies`, `${marketplaceKey}_lastCaptured`], (result) => {
      const cookies = result[`${marketplaceKey}_cookies`];
      const lastCaptured = result[`${marketplaceKey}_lastCaptured`];

      if (cookies && cookies.length > 0) {
        sendResponse({ 
          success: true, 
          cookies: cookies,
          lastCaptured: lastCaptured
        });
      } else {
        sendResponse({ success: false, error: 'No cookies found. Please visit the marketplace first.' });
      }
    });
    
    return true; // Keep channel open for async response
  }
});

/**
 * Check if the URL matches a marketplace and capture cookies
 */
async function checkAndCaptureCookies(url) {
  const marketplace = getMarketplaceFromUrl(url);
  if (!marketplace) return;

  console.log(`[VirtualCloset] Detected visit to ${marketplace.name}`);

  try {
    // Get all cookies for the domain
    const cookies = await chrome.cookies.getAll({ domain: marketplace.domain });
    
    if (cookies.length > 0) {
      // Filter for important auth cookies (basic check)
      // We store all of them to be safe, as different flows need different cookies
      const storeKey = `${marketplace.key}_cookies`;
      const timeKey = `${marketplace.key}_lastCaptured`;
      
      await chrome.storage.local.set({
        [storeKey]: cookies,
        [timeKey]: Date.now()
      });
      
      console.log(`[VirtualCloset] Captured ${cookies.length} cookies for ${marketplace.name}`);
    }
  } catch (error) {
    console.error(`[VirtualCloset] Error capturing cookies for ${marketplace.name}:`, error);
  }
}

/**
 * Identify marketplace from URL
 */
function getMarketplaceFromUrl(url) {
  for (const [domain, info] of Object.entries(MARKETPLACES)) {
    if (url.includes(domain)) {
      return info;
    }
  }
  return null;
}

// Log installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VirtualCloset] Extension installed - Passive Mode');
});
