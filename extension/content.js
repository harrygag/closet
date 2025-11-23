// Content Script - Runs on marketplace pages
console.log('[Extension CS] Loaded on', window.location.hostname);

// Detect which marketplace we're on
const hostname = window.location.hostname;
let marketplace = null;

if (hostname.includes('ebay.com')) marketplace = 'ebay';
else if (hostname.includes('poshmark.com')) marketplace = 'poshmark';
else if (hostname.includes('depop.com')) marketplace = 'depop';

if (marketplace) {
  console.log(`[Extension CS] Detected marketplace: ${marketplace}`);
  
  // Auto-save cookies when page loads (optional)
  // Uncomment to enable auto-save:
  /*
  chrome.runtime.sendMessage({
    type: 'SAVE_COOKIES',
    marketplace
  }, (response) => {
    if (response && response.success) {
      console.log(`[Extension CS] Auto-saved ${response.cookieCount} cookies`);
    }
  });
  */
}
