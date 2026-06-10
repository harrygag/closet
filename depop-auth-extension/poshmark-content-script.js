/**
 * Poshmark Content Script - Captures listings via fetch interception
 */

console.log('[Poshmark Content Script] Loaded on:', window.location.href);

let capturedListings = [];
let capturedIds = new Set();
let capturedUsername = null;

function extractUsernameFromUrl() {
  const match = window.location.pathname.match(/\/closet\/([^\/\?]+)/);
  if (match) return match[1];
  // On order/sales page, use hardcoded username
  if (window.location.pathname.includes('/order/')) return 'retrothriftc0';
  return null;
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data.type === 'POSHMARK_PRODUCTS_CAPTURED') {
    const { products } = event.data;

    console.log('[Poshmark Content Script] Received products:', products.length);

    if (!capturedUsername) {
      capturedUsername = extractUsernameFromUrl();
      console.log('[Poshmark Content Script] Username:', capturedUsername);
    }

    let newCount = 0;
    for (const product of products) {
      // Prefer _dedupeId (order-id based, unique per SALE) — falls back to id (listing id) for
      // backwards compat with active-listings page. Never dedupe same-listing repeat sales.
      const pid = String(product._dedupeId || product.id || '');
      if (pid && !capturedIds.has(pid)) {
        capturedIds.add(pid);
        capturedListings.push(product);
        newCount++;
      }
    }

    console.log('[Poshmark Content Script] New unique:', newCount, '/ Total unique:', capturedListings.length);

    // Debounce — 20s after last batch (up from 10s) to tolerate slower lazy-load gaps
    if (capturedListings.length > 0) {
      if (window.__poshSyncTimer) clearTimeout(window.__poshSyncTimer);
      window.__poshSyncTimer = setTimeout(() => doPoshSync(false), 20000);
    }
  }

  if (event.data.type === 'POSHMARK_SCRAPE_COMPLETE') {
    console.log('[Poshmark Content Script] 🏁 SCRAPE_COMPLETE signal received');
    if (window.__poshSyncTimer) clearTimeout(window.__poshSyncTimer);
    setTimeout(() => doPoshSync(true), 1500);
  }
});

function doPoshSync(isComplete) {
  if (capturedListings.length === 0) return;
  const username = capturedUsername || extractUsernameFromUrl() || 'unknown';
  const isOrderPage = window.location.pathname.includes('/order/');
  const docName = isOrderPage ? 'poshmark_sold_' + username : 'poshmark_' + username;
  console.log('[Poshmark Content Script] 📝', isComplete ? 'FINAL' : 'partial', 'sync:', capturedListings.length, isOrderPage ? 'sold' : 'active', 'listings to', docName);
  chrome.runtime.sendMessage({
    type: 'SYNC_TO_FIRESTORE',
    username: docName,
    platform: 'poshmark',
    listings: capturedListings,
    scrapeComplete: !!isComplete,
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Poshmark Content Script] ❌ Sync failed:', chrome.runtime.lastError.message);
    } else {
      console.log('[Poshmark Content Script] ✅ Sync done:', response);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_CAPTURED_LISTINGS') {
    sendResponse({
      success: true,
      listings: capturedListings,
      username: capturedUsername,
      count: capturedListings.length,
      platform: 'poshmark'
    });
  }
  return true;
});

console.log('[Poshmark Content Script] Ready');
