/**
 * Virtual Closet - Marketplace Connector
 * Background Service Worker
 * 
 * Monitors marketplace visits and auto-syncs cookies
 */

const MARKETPLACES = {
  'ebay.com': { name: 'eBay', key: 'ebay' },
  'poshmark.com': { name: 'Poshmark', key: 'poshmark' },
  'depop.com': { name: 'Depop', key: 'depop' },
  'vendoo.com': { name: 'Vendoo', key: 'vendoo' }
};

const API_BASE_URL = 'http://localhost:3001'; // API server runs on port 3001

// Listen for tab updates (when user navigates to a marketplace)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await checkAndSyncMarketplace(tab.url, tabId);
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_TOKEN') {
    chrome.storage.local.set({ authToken: message.token }, () => {
      console.log('[VirtualCloset] Token saved from web app');
      sendResponse({ success: true });
    });
    return true; // Keep channel open
  }

  if (message.type === 'SYNC_MARKETPLACE') {
    handleManualSync(message.marketplace)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_STATUS') {
    getConnectionStatus()
      .then(status => sendResponse(status))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

/**
 * Check if current URL is a marketplace and sync cookies
 */
async function checkAndSyncMarketplace(url, tabId) {
  try {
    const marketplace = getMarketplaceFromUrl(url);
    if (!marketplace) return;

    console.log(`[VirtualCloset] Detected ${marketplace.name} visit`);

    // Check if user is logged in by looking for auth cookies
    const isLoggedIn = await checkIfLoggedIn(marketplace.key, url);
    
    if (isLoggedIn) {
      console.log(`[VirtualCloset] User is logged in to ${marketplace.name}`);
      
      // Get last sync time to avoid spamming
      const lastSync = await getLastSyncTime(marketplace.key);
      const now = Date.now();
      
      // Only sync if it's been more than 5 minutes since last sync
      if (!lastSync || (now - lastSync) > 5 * 60 * 1000) {
        await syncMarketplaceCookies(marketplace.key, url);
      }
    }
  } catch (error) {
    console.error('[VirtualCloset] Error in checkAndSyncMarketplace:', error);
  }
}

/**
 * Get marketplace info from URL
 */
function getMarketplaceFromUrl(url) {
  for (const [domain, info] of Object.entries(MARKETPLACES)) {
    if (url.includes(domain)) {
      return info;
    }
  }
  return null;
}

/**
 * Check if user is logged in by verifying auth cookies exist
 */
async function checkIfLoggedIn(marketplace, url) {
  const domain = getDomainForMarketplace(marketplace);
  
  try {
    const cookies = await chrome.cookies.getAll({ domain });
    
    // Look for common authentication cookie patterns
    const authCookieNames = {
      ebay: ['s', 'nonsession', 'dp1'],
      poshmark: ['_poshmark_session', 'ui'],
      depop: ['session_id', 'access_token'],
      vendoo: ['connect.sid', 'token']
    };
    
    const requiredCookies = authCookieNames[marketplace] || [];
    const hasAuthCookie = cookies.some(cookie => 
      requiredCookies.some(name => cookie.name.toLowerCase().includes(name.toLowerCase()))
    );
    
    return hasAuthCookie && cookies.length > 0;
  } catch (error) {
    console.error('[VirtualCloset] Error checking login status:', error);
    return false;
  }
}

/**
 * Get domain for marketplace
 */
function getDomainForMarketplace(marketplace) {
  const domains = {
    ebay: '.ebay.com',
    poshmark: '.poshmark.com',
    depop: '.depop.com',
    vendoo: '.vendoo.com'
  };
  return domains[marketplace] || '';
}

/**
 * Sync marketplace cookies to Virtual Closet API
 */
async function syncMarketplaceCookies(marketplace, currentUrl) {
  try {
    console.log(`[VirtualCloset] Syncing ${marketplace} cookies...`);
    
    const domain = getDomainForMarketplace(marketplace);
    const cookies = await chrome.cookies.getAll({ domain });
    
    if (cookies.length === 0) {
      console.log(`[VirtualCloset] No cookies found for ${marketplace}`);
      return { success: false, error: 'No cookies found' };
    }

    // Get user's auth token
    const settings = await chrome.storage.local.get(['authToken', 'apiUrl']);
    const authToken = settings.authToken;
    const apiUrl = settings.apiUrl || API_BASE_URL;
    
    if (!authToken) {
      console.log('[VirtualCloset] No auth token found. User needs to connect extension to app.');
      await chrome.storage.local.set({
        lastError: 'Please connect the extension to your Virtual Closet account',
        lastErrorTime: Date.now()
      });
      return { success: false, error: 'Not authenticated' };
    }

    // Extract user email if available
    const email = await extractUserEmail(marketplace, currentUrl);

    // Send cookies to API
    const response = await fetch(`${apiUrl}/api/marketplace/save-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        marketplace,
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate
        })),
        email,
        autoSynced: true
      })
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const result = await response.json();
    
    // Update last sync time
    await setLastSyncTime(marketplace);
    
    // Show success notification
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Virtual Closet',
      message: `✅ ${MARKETPLACES[Object.keys(MARKETPLACES).find(k => MARKETPLACES[k].key === marketplace)].name} cookies synced!`,
      silent: true
    });

    console.log(`[VirtualCloset] Successfully synced ${marketplace} cookies`);
    return { success: true, cookieCount: cookies.length };
    
  } catch (error) {
    console.error('[VirtualCloset] Error syncing cookies:', error);
    await chrome.storage.local.set({
      lastError: error.message,
      lastErrorTime: Date.now()
    });
    return { success: false, error: error.message };
  }
}

/**
 * Extract user email from page content (sent via content script)
 */
async function extractUserEmail(marketplace, url) {
  // Try to get email from storage if previously extracted
  const storage = await chrome.storage.local.get([`${marketplace}_email`]);
  return storage[`${marketplace}_email`] || null;
}

/**
 * Get last sync time for marketplace
 */
async function getLastSyncTime(marketplace) {
  const storage = await chrome.storage.local.get([`${marketplace}_lastSync`]);
  return storage[`${marketplace}_lastSync`] || null;
}

/**
 * Set last sync time for marketplace
 */
async function setLastSyncTime(marketplace) {
  await chrome.storage.local.set({
    [`${marketplace}_lastSync`]: Date.now()
  });
}

/**
 * Manual sync triggered from popup
 */
async function handleManualSync(marketplace) {
  // Get current marketplace tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    return { success: false, error: 'No active tab' };
  }
  
  const currentUrl = tabs[0].url;
  return await syncMarketplaceCookies(marketplace, currentUrl);
}

/**
 * Get connection status for all marketplaces
 */
async function getConnectionStatus() {
  const storage = await chrome.storage.local.get([
    'ebay_lastSync',
    'poshmark_lastSync',
    'depop_lastSync',
    'vendoo_lastSync',
    'authToken',
    'lastError',
    'lastErrorTime'
  ]);

  return {
    isAuthenticated: !!storage.authToken,
    marketplaces: {
      ebay: { lastSync: storage.ebay_lastSync },
      poshmark: { lastSync: storage.poshmark_lastSync },
      depop: { lastSync: storage.depop_lastSync },
      vendoo: { lastSync: storage.vendoo_lastSync }
    },
    lastError: storage.lastError,
    lastErrorTime: storage.lastErrorTime
  };
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VirtualCloset] Extension installed');
});

