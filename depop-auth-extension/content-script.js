/**
 * Depop Content Script - Message Forwarder
 * Listens for messages from page context and forwards to background script
 */

console.log('[Depop Content Script] Loaded on:', window.location.href);

// Store captured listings (deduplicated by product ID)
let capturedListings = [];
let capturedIds = new Set();
let capturedUsername = null;

// Extract username from URL
function extractUsernameFromUrl() {
  const path = window.location.pathname;
  // Selling hub pages don't have username in URL — use stored username or fallback
  if (path.includes('sellinghub') || path.includes('sold-items')) {
    return capturedUsername || '265732668';
  }
  const match = path.match(/^\/([^\/]+)/);
  if (match && match[1]) {
    const username = match[1];
    if (['products', 'search', 'about', 'help', 'login', 'signup', 'sellinghub', 'category'].includes(username)) {
      return null;
    }
    return username;
  }
  return null;
}

// Listen for messages from the injected page script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data.type === 'DEPOP_PRODUCTS_CAPTURED') {
    const { url, products } = event.data;

    console.log('[Depop Content Script] Received products from page:', products.length);
    console.log('[Depop Content Script] First product:', products[0]);

    // Extract username from URL (try both v2 and v3)
    if (!capturedUsername || capturedUsername === 'products') {
      const urlMatch = url.match(/\/shop\/(\d+)\//);
      if (urlMatch) {
        capturedUsername = urlMatch[1];
        console.log('[Depop Content Script] Extracted username:', capturedUsername);
      }
      // Fallback: use page URL for selling hub
      if (!capturedUsername || capturedUsername === 'products') {
        capturedUsername = '265732668';
      }
    }

    // Append products (deduplicate by purchaseId+id combo so bundle multi-unit sales are NOT collapsed)
    let newCount = 0;
    for (const product of products) {
      // Combined key: a receipt's purchaseId + product id. Same product sold in two different
      // receipts gets two distinct entries. Active-listing products (no purchaseId) use the raw id.
      const purchaseKey = product._purchaseId || product.purchaseId || '';
      const productKey = product.id || product.slug || '';
      const pid = purchaseKey ? `${purchaseKey}:${productKey}` : String(productKey);
      if (pid && !capturedIds.has(pid)) {
        capturedIds.add(pid);
        capturedListings.push(product);
        newCount++;
      }
    }

    console.log('[Depop Content Script] New unique:', newCount, '/ Total unique:', capturedListings.length);

    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'DEPOP_LISTINGS_CAPTURED',
      username: capturedUsername,
      listings: products,
      totalCaptured: capturedListings.length
    }, () => { if (chrome.runtime.lastError) {} });

    // Debounce Firestore write — wait 20s after last batch (up from 10s) to tolerate slow lazy-load gaps.
    // Final sync on scrape-complete trigger writes with scrapeComplete: true so the app knows to stop polling.
    if (capturedListings.length > 0) {
      if (window.__depopSyncTimer) clearTimeout(window.__depopSyncTimer);
      window.__depopSyncTimer = setTimeout(() => doDepopSync(false), 20000);
    }
  }

  if (event.data.type === 'DEPOP_SCRAPE_COMPLETE') {
    // Extension (background.js) tells us scrolling finished — write final data with scrapeComplete flag
    console.log('[Depop Content Script] 🏁 SCRAPE_COMPLETE signal received');
    if (window.__depopSyncTimer) clearTimeout(window.__depopSyncTimer);
    // Small delay to allow any in-flight DEPOP_PRODUCTS_CAPTURED messages to land first
    setTimeout(() => doDepopSync(true), 1500);
  }

  // Bridge for page-initiated paginated receipts fetch.
  // Page-context (world: MAIN) scripts cannot call chrome.runtime.sendMessage,
  // so the in-page interceptor posts a request here; we forward to background,
  // then post the response back to the page (correlated by requestId).
  if (event.data.type === 'DEPOP_FETCH_RECEIPTS_PAGE_REQUEST') {
    const { requestId, url, cursor } = event.data;
    if (!requestId) return;
    chrome.runtime.sendMessage(
      { type: 'DEPOP_FETCH_RECEIPTS_PAGE', url, cursor },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: 'DEPOP_FETCH_RECEIPTS_PAGE_RESPONSE',
            requestId,
            ok: false,
            error: chrome.runtime.lastError.message || 'sendMessage failed',
          }, '*');
          return;
        }
        window.postMessage({
          type: 'DEPOP_FETCH_RECEIPTS_PAGE_RESPONSE',
          requestId,
          ...(response || { ok: false, error: 'empty response' }),
        }, '*');
      }
    );
  }
});

function doDepopSync(isComplete) {
  if (capturedListings.length === 0) return;
  let username = capturedUsername || extractUsernameFromUrl() || '';
  // The seller-hub / sold-items URLs don't carry the username, so capturedUsername
  // can end up as a junk path segment ("products", "sellinghub", …) or empty.
  // That made sold scrapes land in `marketplaceData/depop_sold_products`, which
  // the app never reads → "no new sales". Force the canonical numeric account id
  // for those cases so the sold doc is always `depop_sold_265732668`.
  const JUNK_USERNAMES = ['products', 'search', 'sellinghub', 'sold-items', 'about', 'help', 'login', 'signup', 'category', 'unknown', ''];
  if (JUNK_USERNAMES.includes(String(username).toLowerCase())) username = '265732668';
  const isSellingHub = window.location.pathname.includes('sellinghub');
  const isSoldPage = window.location.pathname.includes('sold-items');
  const listingsToSync = (isSellingHub && !isSoldPage)
    ? capturedListings.filter(l => l._fromDOM)
    : capturedListings;

  // Preserve receipt fields (_soldPrice, _soldDate, _purchaseId, _buyerUsername) needed by reconciliation.
  // Also preserve bundle flags (_isBundle, _bundleSize, _itemsArrayMissing) for UI review.
  const lightListings = listingsToSync.map(l => {
    const firstPic = l.pictures?.[0]?.url || l.pictures?.['640'] || l.preview?.['640'] || l.preview || '';
    return {
      id: l.id, slug: l.slug, title: l.title || l.description?.substring(0, 100) || '',
      description: l.description?.substring(0, 200) || '',
      preview: typeof firstPic === 'string' ? firstPic : '',
      price: l.price, status: l.status, sold: l.sold,
      size: l.size || (l.sizes?.[0]) || '', category: l.category || '',
      _fromDOM: l._fromDOM, _soldFromAPI: l._soldFromAPI,
      _soldPrice: l._soldPrice, _soldDate: l._soldDate,
      _purchaseId: l._purchaseId, _buyerUsername: l._buyerUsername,
      _isBundle: l._isBundle, _bundleSize: l._bundleSize, _itemsArrayMissing: l._itemsArrayMissing,
    };
  });
  const docName = isSoldPage ? 'depop_sold_' + username : username;
  console.log('[Depop Content Script] 📝', isComplete ? 'FINAL' : 'partial', 'sync:', lightListings.length, isSoldPage ? 'sold' : 'active', 'listings to', docName);
  chrome.runtime.sendMessage({
    type: 'SYNC_TO_FIRESTORE',
    username: docName,
    listings: lightListings,
    scrapeComplete: !!isComplete,
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Depop Content Script] ❌ Background send failed:', chrome.runtime.lastError.message);
    } else {
      console.log('[Depop Content Script] ✅ Firestore sync done:', response);
    }
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_CAPTURED_LISTINGS') {
    const username = capturedUsername || extractUsernameFromUrl();
    sendResponse({
      success: true,
      listings: capturedListings,
      username: username,
      count: capturedListings.length
    });
  } else if (message.action === 'CLEAR_CAPTURED_LISTINGS') {
    capturedListings = [];
    capturedIds = new Set();
    capturedUsername = null;
    sendResponse({ success: true });
  }
  return true;
});

console.log('[Depop Content Script] Message forwarder ready');

// ====================
// AUTO-FILL LISTING FORM
// ====================

async function autoFillListingForm() {
  // Check if we're on the create listing page
  if (!window.location.pathname.includes('/products/create')) {
    return;
  }

  console.log('[Content Script] On create listing page - checking for pending listing...');

  // Get tab ID from background
  const tabId = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'GET_TAB_ID' }, (response) => {
      resolve(response?.tabId);
    });
  });

  if (!tabId) {
    console.log('[Content Script] Could not get tab ID');
    return;
  }

  // Check if there's a pending listing for this tab
  const storageKey = `pending_listing_${tabId}`;
  const result = await chrome.storage.local.get([storageKey]);
  const listing = result[storageKey];

  if (!listing) {
    console.log('[Content Script] No pending listing for this tab');
    return;
  }

  console.log('[Content Script] Found pending listing:', listing.id);
  console.log('[Content Script] Listing data:', listing.listingData);

  // Wait for form to load
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // 1. Fill description
    const descriptionField = document.querySelector('textarea');
    if (descriptionField) {
      descriptionField.value = listing.listingData.description;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[Content Script] ✅ Filled description');
    }

    // 2. Fill price
    const priceInput = document.querySelector('input[type="number"]');
    if (priceInput) {
      priceInput.value = listing.listingData.price.toFixed(2);
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[Content Script] ✅ Filled price: $' + listing.listingData.price);
    }

    // 3. Show notification banner
    showNotificationBanner(listing);

    console.log('[Content Script] ✅ Form auto-filled! Review and submit when ready.');
  } catch (error) {
    console.error('[Content Script] Error auto-filling form:', error);
  }
}

// Show notification banner
function showNotificationBanner(listing) {
  const banner = document.createElement('div');
  banner.id = 'depop-autofill-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    text-align: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;

  banner.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto;">
      <strong style="font-size: 16px;">🤖 Auto-Filled Listing</strong>
      <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">
        Description and price have been filled. Review and submit when ready.
      </p>
      <button id="mark-complete-btn" style="
        margin-top: 10px;
        padding: 8px 20px;
        background: white;
        color: #667eea;
        border: none;
        border-radius: 5px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      ">Mark as Complete</button>
    </div>
  `;

  document.body.insertBefore(banner, document.body.firstChild);

  // Add click handler for complete button
  document.getElementById('mark-complete-btn').addEventListener('click', async () => {
    await markListingComplete(listing.id);
    banner.remove();
  });
}

// Mark listing as completed in Firestore
async function markListingComplete(listingId) {
  const FIREBASE_PROJECT_ID = 'closet-da8f2';
  const FIRESTORE_API = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

  try {
    const updateData = {
      fields: {
        status: { stringValue: 'completed' },
        depopUrl: { stringValue: window.location.href }
      }
    };

    const url = `${FIRESTORE_API}/listingRequests/${listingId}?updateMask.fieldPaths=status&updateMask.fieldPaths=depopUrl`;

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    console.log('[Content Script] ✅ Marked listing as completed');

    // Show success message
    const successBanner = document.createElement('div');
    successBanner.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    successBanner.textContent = '✅ Listing marked as complete!';
    document.body.appendChild(successBanner);

    setTimeout(() => successBanner.remove(), 3000);
  } catch (error) {
    console.error('[Content Script] Error marking complete:', error);
  }
}

// Run auto-fill when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoFillListingForm);
} else {
  autoFillListingForm();
}

// Also listen for background messages to trigger auto-fill
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'AUTO_FILL_LISTING') {
    autoFillListingForm();
    sendResponse({ success: true });
  }
  return true;
});
