// Extension Service Worker - Cookie Manager
console.log('[Extension] Service worker started');

const MARKETPLACES = {
  ebay: { domain: '.ebay.com' },
  poshmark: { domain: '.poshmark.com' },
  depop: { domain: '.depop.com' }
};

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Extension] Message received:', message.type);
  
  switch (message.type) {
    case 'SAVE_COOKIES':
      handleSaveCookies(message.marketplace, sendResponse);
      return true; // Async response
      
    case 'INJECT_COOKIES':
      handleInjectCookies(message.marketplace, message.cookies, sendResponse);
      return true;
      
    case 'GET_COOKIES':
      handleGetCookies(message.marketplace, sendResponse);
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

/**
 * Save all cookies from a marketplace domain
 */
async function handleSaveCookies(marketplace, sendResponse) {
  const config = MARKETPLACES[marketplace];
  if (!config) {
    sendResponse({ success: false, error: 'Invalid marketplace' });
    return;
  }
  
  try {
    // Get all cookies for this domain
    chrome.cookies.getAll({ domain: config.domain }, (cookies) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      
      console.log(`[Extension] Saved ${cookies.length} cookies from ${marketplace}`);
      
      // Store in chrome.storage
      const storageKey = `cookies_${marketplace}`;
      chrome.storage.local.set({
        [storageKey]: cookies,
        [`${storageKey}_timestamp`]: Date.now()
      }, () => {
        sendResponse({ 
          success: true, 
          cookieCount: cookies.length,
          marketplace 
        });
      });
    });
  } catch (error) {
    console.error('[Extension] Save error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Inject cookies into Chrome for a marketplace domain
 */
async function handleInjectCookies(marketplace, cookies, sendResponse) {
  const config = MARKETPLACES[marketplace];
  if (!config) {
    sendResponse({ success: false, error: 'Invalid marketplace' });
    return;
  }
  
  if (!cookies || cookies.length === 0) {
    sendResponse({ success: false, error: 'No cookies provided' });
    return;
  }
  
  try {
    // Use Promise.allSettled to handle all cookies and respond once
    const promises = cookies.map(cookie => {
      return new Promise((resolve, reject) => {
        const cookieDetails = {
          url: `https://${config.domain.replace(/^\./, '')}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure !== undefined ? cookie.secure : true,
          httpOnly: cookie.httpOnly || false,
          expirationDate: cookie.expirationDate
        };
        
        chrome.cookies.set(cookieDetails, (result) => {
          if (chrome.runtime.lastError) {
            console.warn('[Extension] Failed to inject cookie:', cookie.name, chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
          } else if (result) {
            resolve(result);
          } else {
            console.warn('[Extension] Failed to inject cookie:', cookie.name);
            reject(new Error('Cookie set returned null'));
          }
        });
      });
    });
    
    Promise.allSettled(promises).then(results => {
      const injected = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`[Extension] Injected ${injected}/${cookies.length} cookies for ${marketplace}`);
      sendResponse({ 
        success: true, 
        injected, 
        failed,
        total: cookies.length
      });
    });
  } catch (error) {
    console.error('[Extension] Inject error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get saved cookies from storage
 */
async function handleGetCookies(marketplace, sendResponse) {
  const storageKey = `cookies_${marketplace}`;
  
  chrome.storage.local.get([storageKey, `${storageKey}_timestamp`], (result) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    
    const cookies = result[storageKey] || [];
    const timestamp = result[`${storageKey}_timestamp`] || null;
    
    sendResponse({ 
      success: true, 
      cookies,
      timestamp,
      count: cookies.length
    });
  });
}

// Log when service worker activates
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Extension] Installed/Updated');
});
