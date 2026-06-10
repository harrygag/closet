console.log('🚀 [Background] Loading Depop Extension...');

// Load Sentry error tracking
try {
  importScripts('./sentry-init.js');
} catch (error) {
  console.warn('[Background] Sentry not loaded - continuing without error tracking:', error.message);
}

// Load Firebase sync module
importScripts('./firebase-sync.js');

console.log('✅ [Background] Firebase module loaded');

// Initialize Firebase on startup
self.firebaseSyncFunctions.initializeFirebase().catch(err => console.error('[Background] Firebase init failed:', err));

console.log('✅ [Background] Service worker READY - ' + new Date().toISOString());

// Keep service worker alive with periodic pings
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) {
    console.log('[Background] Keep-alive already running');
    return;
  }

  keepAliveInterval = setInterval(() => {
    console.log('[Background] ❤️ Keep-alive ping');
  }, 20000); // Ping every 20 seconds (before 30-second Chrome timeout)

  console.log('[Background] ✅ Keep-alive started');
}

// Start keep-alive immediately on service worker load
startKeepAlive();

// ====================
// AUTO-LISTING SYSTEM
// ====================

const FIREBASE_PROJECT_ID = 'closet-da8f2';
const FIRESTORE_API = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Check for pending listings every 30 seconds
async function checkPendingListings() {
  try {
    console.log('[Background] ⏰ Checking for pending listings...');

    // Get userId from storage
    const { userId } = await chrome.storage.local.get(['userId']);
    if (!userId) {
      console.log('[Background] ⚠️ No userId set - skipping listing check. Set your userId in the extension popup!');
      return;
    }

    console.log('[Background] 👤 Checking listings for userId:', userId);

    const response = await fetch(`${FIRESTORE_API}/listingRequests`);
    const data = await response.json();

    if (!data.documents) {
      console.log('[Background] 📭 No listings found in Firestore');
      return;
    }

    console.log('[Background] 📦 Found', data.documents.length, 'total listings in Firestore');

    // Filter for pending Depop listings for this user
    const pending = data.documents
      .map(doc => {
        const fields = doc.fields;
        const id = doc.name.split('/').pop();
        return {
          id,
          userId: fields.userId?.stringValue,
          status: fields.status?.stringValue,
          platform: fields.platform?.stringValue,
          listingData: {
            description: fields.listingData?.mapValue?.fields?.description?.stringValue || '',
            price: parseFloat(fields.listingData?.mapValue?.fields?.price?.doubleValue || fields.listingData?.mapValue?.fields?.price?.integerValue || 0),
            category: fields.listingData?.mapValue?.fields?.category?.stringValue || '',
            brand: fields.listingData?.mapValue?.fields?.brand?.stringValue || '',
            condition: fields.listingData?.mapValue?.fields?.condition?.stringValue || '',
            size: fields.listingData?.mapValue?.fields?.size?.stringValue || '',
            imageUrls: fields.listingData?.mapValue?.fields?.imageUrls?.arrayValue?.values?.map(v => v.stringValue) || [],
          }
        };
      })
      .filter(item => item.status === 'pending' && item.platform === 'depop' && item.userId === userId);

    console.log('[Background] 🔍 Filtered:', pending.length, 'pending Depop listings for user', userId);

    if (pending.length > 0) {
      console.log(`[Background] 🚀 Found ${pending.length} pending listing(s)! Opening tab...`);

      // Process first pending listing
      const listing = pending[0];
      await processListing(listing);
    }
  } catch (error) {
    console.error('[Background] Error checking pending listings:', error);
  }
}

// Process a single listing by opening Depop create page
async function processListing(listing) {
  try {
    console.log('[Background] Processing listing:', listing.id);

    // Create a new tab with the Depop create listing page
    const tab = await chrome.tabs.create({
      url: 'https://www.depop.com/products/create',
      active: true
    });

    // Store listing data to be used by content script
    await chrome.storage.local.set({
      [`pending_listing_${tab.id}`]: listing
    });

    console.log('[Background] Opened create listing tab:', tab.id);
  } catch (error) {
    console.error('[Background] Error processing listing:', error);
  }
}

// Auto-list scheduler intentionally disabled — listings are now triggered
// manually from the app/widget. The checkPendingListings/processListing
// definitions above are left intact (dormant) for any other references.
console.log('[Extension] auto-list scheduler disabled (manual only)');

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Service worker started');
  startKeepAlive();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  startKeepAlive();
});

// Inject fetch interceptor into Depop pages (bypasses CSP using world: MAIN)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.includes('depop.com')) {
    console.log('[Background] 🎯 Depop page detected, injecting fetch interceptor:', tab.url);

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: () => {
        if (window.__DEPOP_INTERCEPTOR_INSTALLED__) {
          console.log('[Depop Interceptor] Already installed, skipping');
          return;
        }

        console.log('[Depop Interceptor] Installing fetch interceptor...');

        const originalFetch = window.fetch;

        window.fetch = async function(...args) {
          const url = args[0];

          if (typeof url === 'string') {
            console.log('[Depop Interceptor] Fetch:', url.substring(0, 100));

            // Match active products, filtered products, sold products, AND selling hub
            const isProductsAPI = url.includes('/shop/') && url.includes('/products/');
            const isFilteredAPI = url.includes('/filteredProducts/') && !url.includes('/sold/');
            const isSoldAPI = url.includes('/filteredProducts/sold/');
            const isSellingHub = url.includes('depop.com') && (url.includes('/receipts') || url.includes('/orders'));
            if (isProductsAPI || isFilteredAPI || isSoldAPI || isSellingHub) {
              console.log('[Depop Interceptor] 🎯 MATCHED:', isSoldAPI ? 'SOLD API' : isSellingHub ? 'SELLING HUB' : isFilteredAPI ? 'FILTERED API' : 'products API', url);
              const shopMatch = url.match(/\/shop\/(\d+)\//);
              if (shopMatch && shopMatch[1]) {
                window.__depopShopId = shopMatch[1];
              }
              // Track receipts API activity timestamp — auto-scroll uses this to know
              // whether the page is still naturally paginating (vs. stalled).
              if (isSellingHub) {
                window.__depopLastReceiptsAt = Date.now();
              }
            }
          }

          const response = await originalFetch.apply(this, args);

          const isProductsAPI = typeof url === 'string' && url.includes('/shop/') && url.includes('/products/');
          const isFilteredAPI = typeof url === 'string' && url.includes('/filteredProducts/') && !url.includes('/sold/');
          const isSoldAPI = typeof url === 'string' && url.includes('/filteredProducts/sold/');
          const isSellingHub = typeof url === 'string' && url.includes('depop.com') && (url.includes('/receipts') || url.includes('/orders'));

          if (isProductsAPI || isFilteredAPI || isSoldAPI || isSellingHub) {
            console.log('[Depop Interceptor] ✅ Intercepted', isSoldAPI ? 'SOLD' : isSellingHub ? 'SELLING HUB' : isFilteredAPI ? 'FILTERED' : 'products', 'API:', url);

            const clonedResponse = response.clone();

            try {
              const data = await clonedResponse.json();
              console.log('[Depop Interceptor] Response keys:', Object.keys(data));

              let products = data.products || data.items || data.results || data.objects || [];

              // Selling hub returns orders/receipts — extract product info from each
              if (isSellingHub && !Array.isArray(products)) {
                products = [];
              }
              if (isSellingHub && data.receipts) {
                products = data.receipts;
              }
              if (isSellingHub && data.orders) {
                products = data.orders;
              }

              // Normalize selling hub receipts — each receipt has items[] with actual products
              // Bundle flag: when a receipt has >1 item, mark each expanded item with _isBundle
              // and _bundleSize so reconciliation can surface it to the user for manual review.
              if (isSellingHub && Array.isArray(products)) {
                const expanded = [];
                let bundleReceiptCount = 0;
                // Depop refund/cancel signal (mirrors Poshmark is_refunded): a
                // refunded/cancelled receipt is NOT a real consumption and is
                // already handled — exclude from stock + needs-cancel. Defensive
                // scan of plausible receipt status fields (no single invented
                // field). New/unresolved orders → no refund flag → our oversell
                // model decides via in-stock-at-sale-time.
                const receiptStatusStr = (r) => {
                  try {
                    const v = [r.status, r.state, r.orderStatus, r.order_status, r.paymentStatus,
                      r.payment_status, r.refundStatus, r.disputeStatus, r.fulfilmentStatus,
                      r.fulfillmentStatus].find(x => typeof x === 'string' && x);
                    return v ? String(v) : '';
                  } catch (e) { return ''; }
                };
                const receiptRefunded = (r) => {
                  try {
                    if (r.refunded === true || r.isRefunded === true || r.cancelled === true || r.canceled === true) return true;
                    return /refund|cancel|dispute|return/i.test(receiptStatusStr(r));
                  } catch (e) { return false; }
                };
                for (const receipt of products) {
                  // One-shot diagnostic — dumps the FIRST receipt's keys + nested
                  // status-ish fields so we can see the real shape and patch
                  // receiptStatusStr/receiptRefunded with the correct paths.
                  if (!window.__depopReceiptShapeLogged) {
                    window.__depopReceiptShapeLogged = true;
                    try {
                      console.log('[Depop Receipt][shape-debug] keys=', Object.keys(receipt || {}),
                        'status-ish fields=', {
                          status: receipt && receipt.status, state: receipt && receipt.state,
                          orderStatus: receipt && receipt.orderStatus, order_status: receipt && receipt.order_status,
                          paymentStatus: receipt && receipt.paymentStatus,
                          shipment: receipt && receipt.shipment, transaction: receipt && receipt.transaction,
                          dispute: receipt && receipt.dispute, refunds: receipt && receipt.refunds, returns: receipt && receipt.returns,
                        },
                        'sample=', JSON.stringify(receipt || {}).slice(0, 800));
                    } catch (e) {}
                  }
                  const _isRefunded = receiptRefunded(receipt);
                  const _orderStatus = receiptStatusStr(receipt);
                  // Each receipt can have multiple items (bundles)
                  const items = receipt.items || [];
                  const isBundle = items.length > 1;
                  if (isBundle) bundleReceiptCount++;
                  if (items.length > 0) {
                    // Iterate with index so bundle items without a productId still get unique ids
                    // (Depop's /api/v1/receipts list endpoint omits item.productId for bundle items,
                    // which would otherwise all fall back to receipt.purchaseId and collapse on dedupe.)
                    for (let idx = 0; idx < items.length; idx++) {
                      const item = items[idx];
                      expanded.push({
                        id: item.productId || item.id || `${receipt.purchaseId}-${idx}`,
                        title: item.title || item.description || '',
                        description: item.description || '',
                        pictures: item.pictures || item.pictureUrls || [],
                        preview: item.preview || item.pictureUrl || '',
                        size: item.size || '',
                        brand: item.brand || '',
                        sold: true,
                        _soldFromAPI: true,
                        status: 'sold',
                        _soldDate: receipt.soldTimestamp || receipt.dateCompleted || '',
                        _soldPrice: receipt.buyerPaidAmount || receipt.sellerPaidAmount || item.price || '',
                        _sellerPaidAmount: receipt.sellerPaidAmount || '',
                        _buyerUsername: receipt.buyer?.username || '',
                        _purchaseId: receipt.purchaseId,
                        _transactionId: receipt.transactionId,
                        is_refunded: _isRefunded,
                        order_status: _orderStatus || undefined,
                        _isBundle: isBundle,
                        _bundleSize: items.length,
                        _bundleIndex: idx,
                      });
                    }
                  } else {
                    // Fallback: receipt without items array — MAY STILL BE A BUNDLE if Depop
                    // didn't return items[] (common for bundle receipts on list view).
                    // We can't know for sure, so mark as _isPotentialBundle for user review.
                    // Signals that this needs manual inspection if the count seems low.
                    expanded.push({
                      id: receipt.purchaseId || receipt.id,
                      title: receipt.title || receipt.description || 'Sold Item',
                      sold: true,
                      _soldFromAPI: true,
                      status: 'sold',
                      _soldDate: receipt.soldTimestamp || '',
                      _soldPrice: receipt.buyerPaidAmount || '',
                      _buyerUsername: receipt.buyer?.username || '',
                      _purchaseId: receipt.purchaseId,
                      is_refunded: _isRefunded,
                      order_status: _orderStatus || undefined,
                      _isBundle: false,
                      _bundleSize: 1,
                      _itemsArrayMissing: true, // may actually be bundle — API didn't populate items[]
                    });
                  }
                }
                products = expanded;
                console.log('[Depop Interceptor] Expanded', products.length, 'sold items from', (products.length - (products.length - expanded.length)), 'receipts;', bundleReceiptCount, 'bundles');
              }

              if (Array.isArray(products) && products.length > 0) {
                // Mark sold items if from sold API or selling hub
                if (isSoldAPI || isSellingHub) {
                  products.forEach(p => { p._soldFromAPI = true; p.sold = true; p.status = 'sold'; });
                }
                console.log('[Depop Interceptor] 🎉 Found', products.length, (isSoldAPI || isSellingHub) ? 'SOLD' : 'active', 'products!');

                // Log first product structure for debugging
                if (products.length > 0) {
                  const firstProduct = products[0];
                  console.log('[Depop Interceptor] First product keys:', Object.keys(firstProduct));
                  console.log('[Depop Interceptor] Price structure:', JSON.stringify(firstProduct.price, null, 2));
                  console.log('[Depop Interceptor] Image fields:', {
                    preview: firstProduct.preview,
                    pictures: firstProduct.pictures?.length || 0,
                    images: firstProduct.images?.length || 0
                  });
                  if (firstProduct.pictures && firstProduct.pictures[0]) {
                    console.log('[Depop Interceptor] First picture:', JSON.stringify(firstProduct.pictures[0], null, 2));
                  }
                }

                // Send to content script via window message
                window.postMessage({
                  type: 'DEPOP_PRODUCTS_CAPTURED',
                  url: url,
                  products: products
                }, '*');
              }

              // AUTO-PAGINATION for selling hub receipts — RE-ENABLED via service worker bridge.
              // Direct page-context originalFetch to webapi.depop.com fails CORS once
              // credentials:'include' is set (response carries
              // Access-Control-Allow-Origin: * which is incompatible with credentialed
              // requests). Fix: forward each paginated fetch to background.js via a
              // window.postMessage → content-script → chrome.runtime.sendMessage bridge.
              // The service worker has host_permissions for *.depop.com /
              // webapi.depop.com, so it can fetch with credentials:'include' and the
              // depop.com cookies attach without per-page CORS interfering.
              if (isSellingHub && !window.__depopPaginationRunning) {
                // DEBUG: dump the full response meta so we can see exactly what the API tells us.
                console.log('[Depop Pagination] First-page meta:', JSON.stringify(data.meta || null), 'top-level next:', data.next_cursor || data.end_cursor);
                console.log('[Depop Pagination] First page returned', (data.receipts?.length || data.orders?.length || 0), 'receipts. Original URL:', url);
                // Depop's actual meta shape: { cursor: "...", end: false } — NOT end_cursor / has_more.
                // Check meta.cursor first (the real one), then fall back to legacy names just in case.
                const nextCursor = data.meta?.cursor || data.meta?.end_cursor || data.meta?.next_cursor || data.next_cursor || data.end_cursor;
                // CHANGED: don't gate on has_more. Many endpoints lie — keep going while we have a cursor,
                // and let the empty-response check inside the loop be the actual stop condition.
                if (nextCursor) {
                  window.__depopPaginationRunning = true;
                  window.__depopPaginationDone = false; // cleared when pagination finishes — auto-scroll SCRAPE_COMPLETE waits on this
                  console.log('[Depop Pagination] start cursor=', String(nextCursor).substring(0, 40));
                  // Helper: request one paginated page from background via the
                  // window.postMessage → content-script → chrome.runtime bridge.
                  // Returns the background response: { ok, receipts, nextCursor, end, ... }.
                  const fetchPageViaBackground = (origUrl, cursorVal) => new Promise((resolve) => {
                    const requestId = 'depop-pg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
                    let settled = false;
                    const onMsg = (ev) => {
                      if (ev.source !== window) return;
                      const d = ev.data;
                      if (!d || d.type !== 'DEPOP_FETCH_RECEIPTS_PAGE_RESPONSE' || d.requestId !== requestId) return;
                      if (settled) return;
                      settled = true;
                      window.removeEventListener('message', onMsg);
                      resolve(d);
                    };
                    window.addEventListener('message', onMsg);
                    // Safety timeout so a missing response can't hang the loop forever.
                    setTimeout(() => {
                      if (settled) return;
                      settled = true;
                      window.removeEventListener('message', onMsg);
                      resolve({ ok: false, error: 'bridge timeout' });
                    }, 30000);
                    window.postMessage({
                      type: 'DEPOP_FETCH_RECEIPTS_PAGE_REQUEST',
                      requestId,
                      url: origUrl,
                      cursor: cursorVal,
                    }, '*');
                  });
                  (async () => {
                    let pagesDone = 0;
                    try {
                      let cursor = nextCursor;
                      let pageNum = 2; // page 1 was the intercepted call
                      const maxPages = 100; // 100 × 12 = 1200 receipts headroom
                      while (cursor && pageNum <= maxPages) {
                        // Respectful delay: 600-1500ms jitter between pages
                        await new Promise(r => setTimeout(r, 600 + Math.random() * 900));
                        const resp = await fetchPageViaBackground(url, cursor);
                        if (!resp || !resp.ok) {
                          console.warn('[Depop Pagination] Page', pageNum, 'failed via background:', resp && resp.error, '— stopping');
                          break;
                        }
                        const pageReceipts = Array.isArray(resp.receipts) ? resp.receipts : [];
                        if (pageReceipts.length === 0) {
                          console.log('[Depop Pagination] Page', pageNum, 'returned 0 receipts — ending pagination');
                          break;
                        }
                        // Mark receipts-API activity so the auto-scroll quiet timer
                        // sees us as a live source (matches what natural intercepts do).
                        window.__depopLastReceiptsAt = Date.now();
                        // Expand receipts into products using the SAME logic + helpers
                        // as the main interceptor block above. Cancelled/refunded
                        // receipts are INGESTED (per the new "cancelled = consumption"
                        // rule) — we just flag them via is_refunded / order_status.
                        const pageExpanded = [];
                        let pageBundleCount = 0;
                        for (const receipt of pageReceipts) {
                          // One-shot diagnostic — see comment in the organic-intercept
                          // block above. Same guard flag, so whichever path hits a
                          // receipt first wins and we get exactly one line.
                          if (!window.__depopReceiptShapeLogged) {
                            window.__depopReceiptShapeLogged = true;
                            try {
                              console.log('[Depop Receipt][shape-debug] keys=', Object.keys(receipt || {}),
                                'status-ish fields=', {
                                  status: receipt && receipt.status, state: receipt && receipt.state,
                                  orderStatus: receipt && receipt.orderStatus, order_status: receipt && receipt.order_status,
                                  paymentStatus: receipt && receipt.paymentStatus,
                                  shipment: receipt && receipt.shipment, transaction: receipt && receipt.transaction,
                                  dispute: receipt && receipt.dispute, refunds: receipt && receipt.refunds, returns: receipt && receipt.returns,
                                },
                                'sample=', JSON.stringify(receipt || {}).slice(0, 800));
                            } catch (e) {}
                          }
                          const _isRefunded = receiptRefunded(receipt);
                          const _orderStatus = receiptStatusStr(receipt);
                          const pItems = receipt.items || [];
                          const pIsBundle = pItems.length > 1;
                          if (pIsBundle) pageBundleCount++;
                          if (pItems.length > 0) {
                            for (let pidx = 0; pidx < pItems.length; pidx++) {
                              const pitem = pItems[pidx];
                              pageExpanded.push({
                                id: pitem.productId || pitem.id || `${receipt.purchaseId}-${pidx}`,
                                title: pitem.title || pitem.description || '',
                                description: pitem.description || '',
                                pictures: pitem.pictures || pitem.pictureUrls || [],
                                preview: pitem.preview || pitem.pictureUrl || '',
                                size: pitem.size || '',
                                brand: pitem.brand || '',
                                sold: true,
                                _soldFromAPI: true,
                                status: 'sold',
                                _soldDate: receipt.soldTimestamp || receipt.dateCompleted || '',
                                _soldPrice: receipt.buyerPaidAmount || receipt.sellerPaidAmount || pitem.price || '',
                                _sellerPaidAmount: receipt.sellerPaidAmount || '',
                                _buyerUsername: receipt.buyer?.username || '',
                                _purchaseId: receipt.purchaseId,
                                _transactionId: receipt.transactionId,
                                is_refunded: _isRefunded,
                                order_status: _orderStatus || undefined,
                                _isBundle: pIsBundle,
                                _bundleSize: pItems.length,
                                _bundleIndex: pidx,
                              });
                            }
                          } else {
                            pageExpanded.push({
                              id: receipt.purchaseId || receipt.id,
                              title: receipt.title || receipt.description || 'Sold Item',
                              sold: true,
                              _soldFromAPI: true,
                              status: 'sold',
                              _soldDate: receipt.soldTimestamp || '',
                              _soldPrice: receipt.buyerPaidAmount || '',
                              _buyerUsername: receipt.buyer?.username || '',
                              _purchaseId: receipt.purchaseId,
                              is_refunded: _isRefunded,
                              order_status: _orderStatus || undefined,
                              _isBundle: false,
                              _bundleSize: 1,
                              _itemsArrayMissing: true,
                            });
                          }
                        }
                        console.log('[Depop Pagination] page', pageNum, ':', pageReceipts.length, 'receipts →', pageExpanded.length, 'products (', pageBundleCount, 'bundles)');
                        if (pageExpanded.length > 0) {
                          window.postMessage({
                            type: 'DEPOP_PRODUCTS_CAPTURED',
                            url: url,
                            products: pageExpanded,
                          }, '*');
                        }
                        // Next cursor — background already extracted it from meta.cursor /
                        // legacy fallbacks AND honored meta.end === true (returns null then).
                        const nextC = resp.end ? null : (resp.nextCursor || null);
                        if (nextC && nextC === cursor) {
                          console.log('[Depop Pagination] Cursor unchanged — breaking to avoid loop');
                          break;
                        }
                        cursor = nextC;
                        pageNum++;
                        pagesDone++;
                      }
                      console.log('[Depop Pagination] complete — total', pagesDone, 'pages');
                    } catch (err) {
                      console.error('[Depop Pagination] loop error:', err);
                    } finally {
                      // Mark pagination as done — the auto-scroll SCRAPE_COMPLETE emitter
                      // waits on this before firing, so the app gets the FULL dataset.
                      window.__depopPaginationDone = true;
                      window.__depopPaginationRunning = false;
                    }
                  })();
                }
              }
            } catch (error) {
              console.error('[Depop Interceptor] Parse error:', error);
            }
          }

          return response;
        };

        window.__DEPOP_INTERCEPTOR_INSTALLED__ = true;
        console.log('[Depop Interceptor] ✅ Installed successfully');

        // Auto-scroll to load all paginated listings (shop page OR selling hub)
        // ONLY auto-scroll when triggered by the app via ?autoScroll=true parameter
        const isShopPage = window.location.pathname.match(/^\/[a-zA-Z0-9_]+\/?$/) && !window.location.pathname.includes('/products/');
        const isSellingHubPage = window.location.pathname.includes('sellinghub') || window.location.pathname.includes('sold-items');
        const shouldAutoScroll = window.location.search.includes('autoScroll=true') || window.location.hash.includes('autoScroll') || document.referrer.includes('closet-da8f2');
        // Always auto-scroll on selling hub active page (only reachable from our app)
        const isActiveSellingHub = window.location.pathname.includes('sellinghub/selling/active');
        if ((isShopPage && shouldAutoScroll) || isSellingHubPage && (shouldAutoScroll || isActiveSellingHub)) {
          console.log('[Depop Interceptor] Page type:', isShopPage ? 'SHOP' : 'SELLING HUB');

          if (isSellingHubPage) {
            // Selling hub (active OR sold): scroll + force visibility/focus events to make
            // the page re-fetch its receipts API. Depop's seller-hub does extra paginations
            // when the tab regains visibility — by firing those events programmatically we
            // get the late pages to load while we're still actively scraping.
            const isSoldPage = window.location.pathname.includes('sold-items');
            console.log('[Depop Interceptor] 📜 Selling hub', isSoldPage ? '(SOLD)' : '(ACTIVE)', '— clicking Load More + provoking visibility...');
            window.__depopLastReceiptsAt = Date.now();
            let clickCount = 0;
            let scrollAttempts = 0;
            const MAX_SCROLL_ATTEMPTS = 6;           // hard ceiling — was 18; cut after user reported "taking ages" on a fully-paginated sold view
            // Stale-height detection: if there's no Load More AND the page hasn't grown
            // (no new listings rendered) across N consecutive checks, we've hit the bottom
            // and should stop scrolling immediately. The user explicitly asked for this:
            // "make the extention stop when there is no load more, rn it keeps scrolling".
            const STALE_HEIGHT_LIMIT = 3;            // 3 consecutive no-growth attempts → done
            let lastScrollHeight = 0;
            let staleHeightCount = 0;
            // Provoke the page's "re-fetch on visibility" behavior every few iterations.
            function pokeVisibility() {
              try {
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('pageshow'));
              } catch (e) { /* ignore */ }
            }

            function clickLoadMore() {
              // Always scroll inner containers too (selling hub uses an inner scroll area)
              window.scrollTo(0, document.body.scrollHeight);
              const innerContainers = document.querySelectorAll('[class*="sellinghub"], main, [role="main"]');
              innerContainers.forEach(el => { if (el.scrollTop !== undefined) el.scrollTop = el.scrollHeight; });

              // Fire visibility + focus events every iteration. Depop's seller-hub re-fetches
              // its receipts feed on these events, which is what loads the last 1-2 pages.
              pokeVisibility();

              const buttons = document.querySelectorAll('button');
              let loadMoreBtn = null;
              buttons.forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'load more') loadMoreBtn = btn;
              });

              if (loadMoreBtn) {
                loadMoreBtn.click();
                clickCount++;
                scrollAttempts = 0;
                staleHeightCount = 0;
                lastScrollHeight = document.body.scrollHeight;
                console.log('[Depop Interceptor] Clicked Load More', clickCount);
                setTimeout(clickLoadMore, 2000 + Math.random() * 1000);
              } else {
                scrollAttempts++;
                // Stale-height check: page didn't grow on this attempt → it's done loading
                const curHeight = document.body.scrollHeight;
                if (curHeight === lastScrollHeight) {
                  staleHeightCount++;
                } else {
                  staleHeightCount = 0;
                  lastScrollHeight = curHeight;
                }
                console.log('[Depop Interceptor] No Load More — scroll', scrollAttempts, '/', MAX_SCROLL_ATTEMPTS, '(stale:', staleHeightCount, '/', STALE_HEIGHT_LIMIT, ')');
                const earlyExit = staleHeightCount >= STALE_HEIGHT_LIMIT;
                if (!earlyExit && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
                  setTimeout(clickLoadMore, 3000);
                } else {
                  if (earlyExit) {
                    console.log('[Depop Interceptor] ✅ Bottom reached (no Load More, page stopped growing for', STALE_HEIGHT_LIMIT, 'attempts)');
                  }
                  // If forced pagination via service worker is still in flight,
                  // we MUST wait for it before firing SCRAPE_COMPLETE — otherwise
                  // the sold doc gets overwritten with the partial DOM count.
                  if (window.__depopPaginationRunning && !window.__depopPaginationDone) {
                    console.log('[Depop Interceptor] Bottom reached but pagination still in flight — waiting');
                  }
                  console.log('[Depop Interceptor] ✅ Done (' + clickCount + ' clicks, ' + scrollAttempts + ' scrolls). Waiting for receipts API to quiet...');
                  // Wait for receipts API to be quiet before firing SCRAPE_COMPLETE.
                  // Depop's seller-hub keeps fetching pagination AFTER auto-scroll stops
                  // (likely on focus/visibility events). If we fire SCRAPE_COMPLETE too early,
                  // the app sees a partial count (e.g. 37 of 52). Wait until the API has
                  // been silent for QUIET_MS so the late pages land first.
                  // Also keep poking visibility events during the wait to provoke any
                  // remaining late paginations.
                  const QUIET_MS = 15000;          // 15s of receipts-API silence required (was 30s — visibility-pokes were re-firing the same pages and resetting this)
                  const SAFETY_MAX_MS = 60000;     // give up waiting after 60s total (was 120s)
                  const waitStart = Date.now();
                  const emitCompleteWhenReady = () => {
                    const paginationActive = window.__depopPaginationRunning && !window.__depopPaginationDone;
                    if (paginationActive) {
                      console.log('[Depop Interceptor] ⏸ Waiting for forced pagination to finish...');
                      setTimeout(emitCompleteWhenReady, 1500);
                      return;
                    }
                    const msSinceLastApi = Date.now() - (window.__depopLastReceiptsAt || 0);
                    const totalWaited = Date.now() - waitStart;
                    if (msSinceLastApi < QUIET_MS && totalWaited < SAFETY_MAX_MS) {
                      console.log(`[Depop Interceptor] ⏸ Receipts API quiet for ${Math.round(msSinceLastApi/1000)}s (need ${QUIET_MS/1000}s) — poking visibility`);
                      // Keep provoking the page's "re-fetch on visibility" behavior.
                      pokeVisibility();
                      // Re-scrape DOM occasionally during the wait so we capture any late-loaded items.
                      scrapeDepopDOM();
                      setTimeout(emitCompleteWhenReady, 2500);
                      return;
                    }
                    if (totalWaited >= SAFETY_MAX_MS) {
                      console.log(`[Depop Interceptor] ⚠️ Hit ${SAFETY_MAX_MS/1000}s safety ceiling — firing SCRAPE_COMPLETE anyway`);
                    } else {
                      console.log(`[Depop Interceptor] 🏁 Firing SCRAPE_COMPLETE (API quiet for ${Math.round(msSinceLastApi/1000)}s)`);
                    }
                    scrapeDepopDOM();
                    window.postMessage({ type: 'DEPOP_SCRAPE_COMPLETE' }, '*');
                  };
                  setTimeout(emitCompleteWhenReady, 2000);
                }
              }
            }
            setTimeout(clickLoadMore, 3000);

          } else {
            // Shop page: scroll-based pagination — patient mode (more scrolls, higher stale tolerance)
            console.log('[Depop Interceptor] 📜 Auto-scrolling shop page...');
            window.scrollTo(0, 0);
            let scrollCount = 0;
            const maxScrolls = 40;
            let lastScrollHeight = 0;
            let staleScrollCount = 0;
            function doScroll() {
              window.scrollBy(0, document.body.scrollHeight);
              scrollCount++;
              console.log('[Depop Interceptor] Scroll', scrollCount, '/', maxScrolls);
              const currentHeight = document.body.scrollHeight;
              if (currentHeight === lastScrollHeight) staleScrollCount++;
              else staleScrollCount = 0;
              lastScrollHeight = currentHeight;
              if (scrollCount >= maxScrolls || staleScrollCount >= 8) {
                console.log('[Depop Interceptor] ✅ Scroll complete. Waiting 2s then final scrape...');
                // GATE on pagination completion — same reason as selling hub path
                const emitCompleteWhenReady = () => {
                  const paginationActive = window.__depopPaginationRunning && !window.__depopPaginationDone;
                  if (paginationActive) {
                    console.log('[Depop Interceptor] ⏸ Waiting for pagination before SCRAPE_COMPLETE...');
                    setTimeout(emitCompleteWhenReady, 1500);
                    return;
                  }
                  window.postMessage({ type: 'DEPOP_SCRAPE_COMPLETE' }, '*');
                };
                setTimeout(() => {
                  scrapeDepopDOM();
                  setTimeout(() => {
                    scrapeDepopDOM();
                    setTimeout(emitCompleteWhenReady, 2000);
                  }, 3000);
                }, 2000);
              } else {
                setTimeout(doScroll, 1000 + Math.random() * 1500);
              }
            }
            setTimeout(doScroll, 1000 + Math.random() * 500);
          }
        }

        // Depop DOM scraper — works on both shop page and selling hub
        function scrapeDepopDOM() {
          const isSellingHub = window.location.pathname.includes('sellinghub');
          console.log('[Depop DOM] Scraping', isSellingHub ? 'selling hub' : 'shop page', '...');

          const products = [];
          const seen = new Set();

          if (isSellingHub) {
            // Selling hub: each item is <li class="styles_container__..."> with checkbox, image, details
            const rows = document.querySelectorAll('li[class*="container"]');
            rows.forEach(row => {
              // Find product link
              const link = row.querySelector('a[href*="/products/"]');
              if (!link) return;
              const href = link.getAttribute('href') || '';
              const slugMatch = href.match(/\/products\/([^\/\?#]+)/);
              if (!slugMatch) return;
              const slug = slugMatch[1];
              if (slug.length < 10 || seen.has(slug)) return;
              seen.add(slug);

              // Image
              const img = row.querySelector('img[src*="media-photos.depop.com"]');
              const imgSrc = img?.src || '';

              // Category + Size
              const category = row.querySelector('[class*="category"]')?.textContent?.trim() || '';
              const sizeEl = row.querySelector('[class*="sizeWrapper"] h3');
              const size = sizeEl?.textContent?.trim() || '';

              // Price — find all price-like text in the row
              let price = 0;
              const allPriceTexts = row.querySelectorAll('p');
              const prices = [];
              allPriceTexts.forEach(p => {
                const text = p.textContent?.trim() || '';
                const match = text.match(/US?\$?([\d,.]+)/);
                if (match) prices.push(parseFloat(match[1].replace(',', '')));
              });
              // Use the LAST price (sale price) if multiple, otherwise the only one
              if (prices.length > 0) {
                price = prices[prices.length - 1];
              }

              // Description
              const desc = row.querySelector('[class*="description"]')?.textContent?.trim() || '';

              // Title from description or slug
              const title = desc.substring(0, 100) || slug.replace(/^[^-]+-/, '').replace(/-[a-f0-9]{4}$/, '').replace(/-/g, ' ');

              products.push({
                slug, id: slug, title, description: desc, preview: imgSrc,
                price, size, category, status: 'ONSALE', sold: false, _fromDOM: true,
              });
            });
          } else {
            // Shop page: find product links
            const links = document.querySelectorAll('a[href*="/products/"]');
            links.forEach(link => {
              const href = link.getAttribute('href') || '';
              const slugMatch = href.match(/\/products\/([^\/\?#]+)/);
              if (!slugMatch) return;
              const slug = slugMatch[1];
              if (slug === 'create' || slug.length < 10 || !slug.includes('-') || seen.has(slug)) return;
              seen.add(slug);
              const card = link.closest('li') || link.parentElement?.parentElement;
              const img = card?.querySelector('img[src*="media-photos.depop.com"]');
              const allText = card?.textContent || '';
              const priceMatch = allText.match(/\$([\d,.]+)/);
              products.push({
                slug, id: slug,
                title: slug.replace(/^[^-]+-/, '').replace(/-[a-f0-9]{4}$/, '').replace(/-/g, ' '),
                preview: img?.src || '', price: priceMatch ? parseFloat(priceMatch[1]) : 0,
                status: 'ONSALE', sold: false, _fromDOM: true,
              });
            });
          }

          console.log('[Depop DOM] 🎉 Scraped', products.length, 'listings');
          if (products.length > 0) {
            console.log('[Depop DOM] First:', JSON.stringify(products[0]).substring(0, 300));
            window.postMessage({ type: 'DEPOP_PRODUCTS_CAPTURED', url: 'dom-scrape', products }, '*');
          }
        }

        // Store shop ID from intercepted URLs for sold fetch
        window.__depopShopId = '';

        // Fetch all ACTIVE products directly via API with pagination
        async function fetchAllActive(shopId) {
          console.log('[Depop Interceptor] 🔄 Fetching all active products for shop:', shopId);
          let cursor = '';
          let totalActive = 0;
          const maxPages = 15;

          for (let page = 0; page < maxPages; page++) {
            try {
              // Try with limit=200 first page, then paginate
              const limit = page === 0 ? 200 : 24;
              const activeUrl = 'https://webapi.depop.com/api/v3/shop/' + shopId + '/products/?limit=' + limit + (cursor ? '&after=' + cursor : '') + '&force_fee_calculation=false';
              console.log('[Depop Interceptor] Fetching page', page + 1, ':', activeUrl.substring(0, 120));
              const resp = await originalFetch(activeUrl, { credentials: 'include' });
              if (!resp.ok) {
                console.log('[Depop Interceptor] Active API returned', resp.status);
                break;
              }
              const data = await resp.json();
              console.log('[Depop Interceptor] Response meta:', JSON.stringify(data.meta || {}));
              const activeProducts = data.products || [];
              if (!Array.isArray(activeProducts) || activeProducts.length === 0) {
                console.log('[Depop Interceptor] No more active items (keys:', Object.keys(data), ')');
                break;
              }
              totalActive += activeProducts.length;
              console.log('[Depop Interceptor] 🎉 Fetched', activeProducts.length, 'active items (total:', totalActive, ')');

              window.postMessage({
                type: 'DEPOP_PRODUCTS_CAPTURED',
                url: activeUrl,
                products: activeProducts
              }, '*');

              // Get next page cursor from meta
              const meta = data.meta || {};
              cursor = meta.cursor || meta.end_cursor || meta.last_offset_id || '';
              console.log('[Depop Interceptor] Next cursor:', cursor ? cursor.substring(0, 30) + '...' : 'NONE');
              if (!cursor) break;

              await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
            } catch (err) {
              console.error('[Depop Interceptor] Active fetch error:', err);
              break;
            }
          }
          console.log('[Depop Interceptor] ✅ Active fetch complete:', totalActive, 'items');
        }

        // Fetch all sold items with pagination
        async function fetchAllSold(shopId) {
          console.log('[Depop Interceptor] 🔄 Fetching sold items for shop:', shopId);
          let offset = '';
          let totalSold = 0;
          const maxPages = 10;

          for (let page = 0; page < maxPages; page++) {
            try {
              const soldUrl = 'https://webapi.depop.com/api/v2/shop/' + shopId + '/filteredProducts/sold/?lang=en&offset_id=' + offset + '&limit=24&force_fee_calculation=false';
              const resp = await originalFetch(soldUrl, { credentials: 'include' });
              if (!resp.ok) {
                console.log('[Depop Interceptor] Sold API returned', resp.status);
                break;
              }
              const data = await resp.json();
              const soldProducts = data.products || data.objects || data.items || [];
              if (!Array.isArray(soldProducts) || soldProducts.length === 0) {
                console.log('[Depop Interceptor] No more sold items (keys:', Object.keys(data), ')');
                break;
              }
              soldProducts.forEach(p => { p._soldFromAPI = true; p.sold = true; p.status = 'sold'; });
              totalSold += soldProducts.length;
              console.log('[Depop Interceptor] 🎉 Fetched', soldProducts.length, 'sold items (total:', totalSold, ')');

              window.postMessage({
                type: 'DEPOP_PRODUCTS_CAPTURED',
                url: soldUrl,
                products: soldProducts
              }, '*');

              // Get next page offset
              const meta = data.meta || data.pagination || {};
              offset = meta.cursor || meta.next_offset_id || meta.last_offset_id || '';
              if (!offset) break;

              // Wait between pages to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
            } catch (err) {
              console.error('[Depop Interceptor] Sold fetch error:', err);
              break;
            }
          }
          console.log('[Depop Interceptor] ✅ Sold fetch complete:', totalSold, 'items');
        }
      }
    }).catch(err => console.error('[Background] Script injection failed:', err));
  }
});

// Inject Poshmark fetch interceptor
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.includes('poshmark.com')) {
    console.log('[Background] 🛍️ Poshmark page detected, injecting interceptor:', tab.url);

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: () => {
        if (window.__POSHMARK_INTERCEPTOR_INSTALLED__) {
          console.log('[Poshmark Interceptor] Already installed, skipping');
          return;
        }

        console.log('[Poshmark Interceptor] Installing fetch interceptor...');

        const originalFetch = window.fetch;

        window.fetch = async function(...args) {
          let url = '';
          if (typeof args[0] === 'string') url = args[0];
          else if (args[0] instanceof Request) url = args[0].url;
          else if (args[0]?.url) url = args[0].url;
          else url = String(args[0] || '');

          // Log ALL Poshmark API calls for debugging
          if (url.includes('poshmark.com') || url.includes('vm-rest')) {
            console.log('[Poshmark Interceptor] Fetch:', url.substring(0, 150));
          }

          const response = await originalFetch.apply(this, args);

          // Catch Poshmark's internal API — match vm-rest with posts, closet, or filtered
          const isVmRest = url.includes('vm-rest');
          const isCloset = url.includes('closet') || url.includes('posts') || url.includes('filtered');
          const isOrder = url.includes('/order') || url.includes('/sales');

          if (isVmRest && (isCloset || isOrder)) {
            console.log('[Poshmark Interceptor] 🎯 Intercepted:', url.substring(0, 150));

            const clonedResponse = response.clone();
            try {
              const data = await clonedResponse.json();
              console.log('[Poshmark Interceptor] Response keys:', Object.keys(data));

              // Find the listings array — Poshmark nests differently
              let products = data.data || data.posts || data.closet || data.items || data.results || [];
              if (!Array.isArray(products) && data.data && Array.isArray(data.data)) {
                products = data.data;
              }

              // Filter to objects that look like listings (have title or id)
              products = products.filter(p => p && (p.title || p.id));

              if (products.length > 0) {
                // Normalize fields
                const normalized = products.map(p => ({
                  id: p.id || p.post_id || '',
                  title: p.title || '',
                  brand: p.brand || p.brand_name || '',
                  size: p.size || '',
                  department: p.department || p.category || '',
                  price: p.price_amount?.val || p.price || 0,
                  originalPrice: p.original_price_amount?.val || p.original_price || 0,
                  cover_shot: p.cover_shot?.url_medium || p.cover_shot?.url_small || p.picture_url || '',
                  status: (p.inventory?.status || p.status || 'available').toLowerCase(),
                  sold: (p.inventory?.status === 'sold_out' || p.status === 'sold' || p.status === 'not_for_sale'),
                  color: p.color || '',
                  listing_url: p.id ? 'https://poshmark.com/listing/' + p.id : '',
                }));

                console.log('[Poshmark Interceptor] 🎉 Found', normalized.length, 'listings!');
                if (normalized.length > 0) {
                  console.log('[Poshmark Interceptor] First:', JSON.stringify(normalized[0]).substring(0, 200));
                }

                window.postMessage({
                  type: 'POSHMARK_PRODUCTS_CAPTURED',
                  url: url,
                  products: normalized
                }, '*');
              }
            } catch (err) {
              // Not JSON or parse error — ignore
            }
          }

          return response;
        };

        // Also intercept XMLHttpRequest (Poshmark uses XHR, not fetch, for closet data)
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this._poshUrl = url;
          return origOpen.apply(this, [method, url, ...rest]);
        };

        XMLHttpRequest.prototype.send = function(...args) {
          this.addEventListener('load', function() {
            const url = this._poshUrl || '';
            if (typeof url === 'string' && (url.includes('vm-rest') || url.includes('/api/')) && (url.includes('posts') || url.includes('closet') || url.includes('filtered') || url.includes('order'))) {
              console.log('[Poshmark XHR] 🎯 Intercepted:', url.substring(0, 150));
              try {
                const data = JSON.parse(this.responseText);
                console.log('[Poshmark XHR] Response keys:', Object.keys(data));

                let products = data.data || data.posts || data.closet || data.items || data.results || [];
                if (!Array.isArray(products)) products = [];
                products = products.filter(p => p && (p.title || p.id));

                if (products.length > 0) {
                  const normalized = products.map(p => ({
                    id: p.id || p.post_id || '',
                    title: p.title || '',
                    brand: p.brand || p.brand_name || '',
                    size: p.size || '',
                    department: p.department || p.category || '',
                    price: p.price_amount?.val || p.price || 0,
                    originalPrice: p.original_price_amount?.val || p.original_price || 0,
                    cover_shot: p.cover_shot?.url_medium || p.cover_shot?.url_small || p.picture_url || (Array.isArray(p.pictures) && p.pictures[0]?.url) || '',
                    status: (p.inventory?.status || p.status || 'available').toLowerCase(),
                    sold: (p.inventory?.status === 'sold_out' || p.status === 'sold' || p.status === 'not_for_sale'),
                    color: p.color || '',
                    listing_url: p.id ? 'https://poshmark.com/listing/' + p.id : '',
                  }));

                  console.log('[Poshmark XHR] 🎉 Found', normalized.length, 'listings!');
                  window.postMessage({ type: 'POSHMARK_PRODUCTS_CAPTURED', url: url, products: normalized }, '*');
                }
              } catch (e) { /* not JSON */ }
            } else if (typeof url === 'string' && url.includes('vm-rest')) {
              console.log('[Poshmark XHR] Fetch:', url.substring(0, 120));
            }
          });
          return origSend.apply(this, args);
        };

        console.log('[Poshmark Interceptor] ✅ XHR interceptor installed');

        window.__POSHMARK_INTERCEPTOR_INSTALLED__ = true;
        console.log('[Poshmark Interceptor] ✅ Installed');

        // Poshmark server-renders closet data — scrape from DOM after scrolling
        function scrapePoshmarkDOM() {
          const isOrderPage = window.location.pathname.includes('/order/');
          console.log('[Poshmark DOM] Scraping', isOrderPage ? 'orders' : 'listings', 'from page...');

          // ORDER PAGE: scrape sold order cards
          // Strategy: find the TITLE elements (1:1 with orders), then walk up to find each order's
          // row container. This avoids the 3467→211 inflation from over-broad '[class*="order-item"]'
          // matching, AND works regardless of Poshmark's exact root class name.
          if (isOrderPage) {
            const titleSelector = '.order-item__content__title, [class*="order-item__content__title"]';
            const titleEls = Array.from(document.querySelectorAll(titleSelector));
            console.log('[Poshmark DOM] Found', titleEls.length, 'title elements (= order count)');
            // For each title, walk UP while the parent still contains exactly ONE title descendant.
            // As soon as the parent contains 2+ titles, we've reached the order-list level and the
            // current `el` is the unique row container for this specific order. This guarantees
            // 1:1 mapping from title to row (no overshooting into a shared ancestor).
            const rootOrderItems = titleEls.map(titleEl => {
              let el = titleEl;
              let safety = 12;
              while (el.parentElement && safety-- > 0) {
                const parent = el.parentElement;
                const titlesInParent = parent.querySelectorAll(titleSelector).length;
                if (titlesInParent > 1) return el; // parent has other orders → current el is the row
                el = parent;
              }
              return el;
            }).filter(Boolean);
            // Extra safety: if all titles collapsed to the same root, fall back to using each title element as its own anchor
            const uniqueRoots = new Set(rootOrderItems);
            if (uniqueRoots.size <= 1 && titleEls.length > 1) {
              console.warn('[Poshmark DOM] Walk-up collapsed to', uniqueRoots.size, 'roots — falling back to per-title anchors');
              rootOrderItems.length = 0;
              titleEls.forEach(t => rootOrderItems.push(t.closest('li, article, [class*="card"]') || t.parentElement || t));
            }
            console.log('[Poshmark DOM] Unique row containers:', uniqueRoots.size);
            const products = [];
            const seen = new Set();

            rootOrderItems.forEach((item, domIdx) => {
              // ---- TITLE ----
              const titleEl = item.querySelector('.order-item__content__title, [class*="order-item__content__title"], [class*="title"]');
              const title = titleEl?.textContent?.trim() || '';
              if (!title) return;

              // ---- LISTING ID (for matching to inventory) ----
              // Search ALL anchors + data attrs in the row (not just the first one)
              let listingId = '';
              let listingHref = '';
              const allLinks = Array.from(item.querySelectorAll('a[href*="/listing/"]'));
              for (const lnk of allLinks) {
                const h = lnk.getAttribute('href') || '';
                // Match both listing-url patterns: /listing/title-{id} or /listing/{id}
                const m = h.match(/\/listing\/[^/?]+-([a-f0-9]{20,})/i)
                  || h.match(/\/listing\/([a-f0-9]{20,})/i);
                if (m) { listingId = m[1]; listingHref = h; break; }
              }
              // Also check data attrs (Poshmark's analytics layer)
              if (!listingId) {
                const dataAttrs = ['data-et-prop-listing_id', 'data-et-prop-post_id', 'data-listing-id', 'data-post-id'];
                for (const attr of dataAttrs) {
                  const v = item.getAttribute(attr) || item.querySelector(`[${attr}]`)?.getAttribute(attr);
                  if (v) { listingId = v; break; }
                }
              }

              // ---- ORDER ID (unique per sale) ----
              let orderId = '';
              let orderHref = '';
              const orderLinks = Array.from(item.querySelectorAll('a[href*="/order/"], a[href*="/mysales/"]'));
              for (const lnk of orderLinks) {
                const h = lnk.getAttribute('href') || '';
                const m = h.match(/\/order\/[a-z-]+\/([a-f0-9]{10,})/i)
                  || h.match(/orderId=([a-f0-9]{10,})/i)
                  || h.match(/\/([a-f0-9]{24})(?:[/?]|$)/i);
                if (m) { orderId = m[1]; orderHref = h; break; }
              }
              if (!orderId) {
                const orderDataAttrs = ['data-order-id', 'data-et-prop-order_id', 'data-order_id', 'data-sale-id'];
                for (const attr of orderDataAttrs) {
                  const v = item.getAttribute(attr) || item.querySelector(`[${attr}]`)?.getAttribute(attr);
                  if (v) { orderId = v; break; }
                }
              }

              // ---- ORDER CARD RESOLUTION ----
              // Poshmark renders the date AND the status at the order CARD
              // level, not on the title-row `item`. Resolve the card up-front
              // (same walk-up the status block uses) so both DATE and STATUS
              // can query it. titleEl.closest('[class*="order-item"]') is WRONG
              // (the title's own class contains "order-item"). Instead: prefer
              // the walk-up row `item`; if it has no status node, climb from
              // the title to the nearest ancestor that DOES (never the title).
              const STATUS_SEL = '.order-item__content__order-status, [class*="order-item__content__order-status"], [class*="order-status"]';
              const hasStatusNode = (el) => !!(el && el.querySelector && el.querySelector(STATUS_SEL));
              let card = item;
              if (!hasStatusNode(card) && titleEl) {
                let p = titleEl.parentElement, hops = 10;
                while (p && hops-- > 0) { if (hasStatusNode(p)) { card = p; break; } p = p.parentElement; }
              }

              // ---- DATE ----
              // The Poshmark sold-LIST card has NO real sale-date node. The
              // order_id's ObjectId timestamp is NOT a reliable sale date: for
              // relisted items the extracted 24-hex id is an old post/listing id,
              // which produced phantom years-old "sales" (e.g. a 2019 date on a
              // recent sale). Do NOT fabricate a date — leave it empty and let the
              // app order by scrape_index (page position = recency).
              const dateText = '';
              const soldDateIso = '';

              // ---- PRICE(S) ----
              const priceEls = item.querySelectorAll('[class*="price"], [class*="Price"], [class*="amount"]');
              const priceTexts = Array.from(priceEls).map(e => e.textContent?.trim() || '');
              const priceNumbers = priceTexts
                .map(t => { const m = t.match(/\$([\d,.]+)/); return m ? parseFloat(m[1].replace(/,/g, '')) : null; })
                .filter(n => n !== null);
              const price = priceNumbers[0] || 0;
              const salePrice = priceNumbers[0] || 0;
              const originalPrice = priceNumbers.length > 1 ? Math.max(...priceNumbers) : undefined;

              // ---- IMAGE ----
              const img = item.querySelector('img.order-item__content__image')
                || item.querySelector('.order-item__content__image-container img')
                || item.querySelector('img');
              const coverShot = img?.getAttribute('src') || img?.getAttribute('data-src') || '';

              // ---- ORDER STATUS (shipped/delivered/cancelled/refunded) ----
              // CRITICAL for stock: refunded/cancelled orders should NOT decrement stock
              // Poshmark renders a per-card status: "Sold", "In Transit",
              // "Order Complete", "Delivered", "Order Cancelled", "Case
              // Approved/Closed/Denied", "Needs shipping". The `card` was
              // already resolved up-front (before the DATE block) via the same
              // walk-up logic; reuse it here. Fall back to scanning the card
              // text for a known status phrase (robust to class changes).
              let statusEl = card.querySelector(STATUS_SEL);
              let orderStatus = statusEl ? (statusEl.textContent || '').trim() : '';
              if (!orderStatus) {
                const cardTxt = (card.textContent || '');
                const m = cardTxt.match(/Order Cancelled|Order Complete|Case Approved|Case Closed|Case Denied|In Transit|Needs shipping|Delivered|Refunded|Returned|Cancelled|Shipped|Sold/i);
                orderStatus = m ? m[0] : '';
              }
              if (domIdx === 0) {
                try {
                  console.log('[Poshmark DOM][status-debug] card.class=', card && card.className,
                    '| statusEl=', statusEl ? statusEl.className + ' :: ' + (statusEl.textContent || '').trim() : 'NONE',
                    '| orderStatus=', JSON.stringify(orderStatus),
                    '| cardText=', JSON.stringify(((card && card.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 180)));
                } catch (e) {}
              }
              const statusLower = orderStatus.toLowerCase();
              // Refunded/closed-out (NOT a real sale): cancelled, refunded,
              // returned, or a buyer case (approved/closed/denied = resolved
              // dispute → refund). "in transit"/"complete"/"delivered"/
              // "shipped"/"sold"/"needs shipping" are real/active sales.
              const isRefunded = statusLower.includes('cancel')
                || statusLower.includes('refund')
                || statusLower.includes('return')
                || statusLower.includes('case');

              // ---- SIZE + BRAND (from item details area) ----
              const sizeEl = item.querySelector('[class*="size"], [class*="Size"]');
              const sizeText = sizeEl?.textContent?.trim().replace(/size[:\s]*/i, '') || '';
              const brandEl = item.querySelector('[class*="brand"], [class*="Brand"]');
              const brandText = brandEl?.textContent?.trim() || '';

              // ---- DEDUPE KEY (priority order) ----
              // Must be unique per SALE AND stable across re-scrapes.
              // Key insight: position-in-parent is stable AND unique per row, because Poshmark's
              // sold list only APPENDS (older items load below) — existing items keep their index.
              // So using domIdx (index in titleEls array) guarantees each row stays distinct across
              // scrapes without collapsing legit same-title-same-image repeat sales.
              const parentChildren = item.parentElement ? Array.from(item.parentElement.children) : [];
              const positionInParent = parentChildren.indexOf(item);
              const coverShotTail = (coverShot || '').slice(-60);
              let dedupeId = '';
              if (orderId) dedupeId = `order:${orderId}`;
              else if (listingId && dateText) dedupeId = `listing:${listingId}:${dateText}`;
              else if (listingId) dedupeId = `listing:${listingId}:${domIdx}`;
              // Fallback when no IDs: use domIdx as PRIMARY uniqueness anchor (each row is distinct)
              // combined with title+img for content verification (detects DOM reshuffles)
              else dedupeId = `row:${domIdx}|${title.substring(0, 30)}|${coverShotTail.slice(-20)}`;

              if (seen.has(dedupeId)) return;
              seen.add(dedupeId);

              products.push({
                // id → for matching against poshmarkListingId in inventory
                id: listingId || dedupeId,
                listing_id: listingId,
                order_id: orderId || undefined,
                // Every row on the SOLD page is a sale. The app's sold-detection
                // used to lean on sold_date_iso; since we no longer fabricate a
                // date, flag the sale explicitly so detection still works.
                sold: true,
                scrape_index: domIdx,
                title,
                price,
                sale_price: salePrice,
                original_price: originalPrice,
                sold_date: dateText || undefined,
                sold_date_iso: soldDateIso || undefined,
                order_status: orderStatus || undefined,
                is_refunded: isRefunded, // stock should NOT decrement for refunded/cancelled orders
                size: sizeText || undefined,
                brand: brandText || undefined,
                cover_shot: coverShot,
                status: 'sold', sold: true,
                listing_url: listingHref ? (listingHref.startsWith('http') ? listingHref : 'https://poshmark.com' + listingHref) : '',
                _dedupeId: dedupeId, // for content-script-level dedupe
              });
            });

            console.log('[Poshmark DOM] 🎉 Scraped', products.length, 'sold orders (dedupe keys unique per sale)');
            if (products.length > 0) {
              console.log('[Poshmark DOM] First:', JSON.stringify(products[0]).substring(0, 250));
              window.postMessage({ type: 'POSHMARK_PRODUCTS_CAPTURED', url: window.location.href, products }, '*');
            }
            return;
          }

          // Poshmark card structure:
          // div[data-et-name="listing"] > div.card.card--small.tile > ...
          //   a.tile__covershot — has href like /listing/{title}-{id}
          //   img alt="Title" — has the image and title
          //   a.tile__title.tc--b — has the title text
          //   span.p--t--1.fw--bold — has the price "$30"
          //   span.tile__details__pipe__size — has "Size: XL"
          //   span.tile__details__pipe__brand[data-et-name="listing_brand"] — has "Lacoste"
          //   data-et-prop-listing_id attribute — has the listing ID

          const cards = document.querySelectorAll('[data-et-name="listing"][data-et-prop-listing_id]');
          console.log('[Poshmark DOM] Found', cards.length, 'listing cards');

          const products = [];
          const seen = new Set();

          cards.forEach(card => {
            const id = card.getAttribute('data-et-prop-listing_id') || '';
            if (!id || seen.has(id)) return;
            seen.add(id);

            // Find the tile container (card itself or child)
            const tile = card.querySelector('.tile') || card.closest('.tile') || card;

            // Title from .tile__title or img alt
            const titleEl = tile.querySelector('.tile__title');
            const img = tile.querySelector('img');
            const title = titleEl?.textContent?.trim() || img?.alt?.trim() || '';

            // Price from span.fw--bold or .p--t--1
            const priceEl = tile.querySelector('.fw--bold, .p--t--1.fw--bold');
            const priceText = priceEl?.textContent?.trim() || '';
            const priceMatch = priceText.match(/\$([\d,]+)/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : 0;

            // Size from .tile__details__pipe__size
            const sizeEl = tile.querySelector('.tile__details__pipe__size');
            const sizeText = sizeEl?.textContent?.trim() || '';
            const sizeMatch = sizeText.match(/Size:\s*(.+)/i);
            const size = sizeMatch ? sizeMatch[1].trim() : sizeText;

            // Brand from [data-et-name="listing_brand"] or .tile__details__pipe__brand
            const brandEl = tile.querySelector('[data-et-name="listing_brand"], .tile__details__pipe__brand');
            const brand = brandEl?.textContent?.trim() || '';

            // Image
            const image = img?.src || img?.getAttribute('data-src') || '';

            // Listing URL from the covershot link
            const linkEl = tile.querySelector('a.tile__covershot') || tile.querySelector('a[href*="/listing/"]');
            const href = linkEl?.getAttribute('href') || '';

            products.push({
              id,
              title,
              brand,
              size,
              price,
              cover_shot: image,
              status: 'available',
              sold: false,
              listing_url: href ? 'https://poshmark.com' + href : '',
            });
          });

          console.log('[Poshmark DOM] 🎉 Scraped', products.length, 'unique listings');
          if (products.length > 0) {
            console.log('[Poshmark DOM] First:', JSON.stringify(products[0]).substring(0, 300));
            window.postMessage({ type: 'POSHMARK_PRODUCTS_CAPTURED', url: window.location.href, products }, '*');
          }
        }

        // Auto-scroll on closet and order pages — aggressive mode: count items not height, more strategies
        if ((window.location.pathname.includes('/closet/') || window.location.pathname.includes('/order/')) && (window.location.search.includes('autoScroll=true') || window.location.hash.includes('autoScroll'))) {
          console.log('[Poshmark Interceptor] 📜 Auto-scrolling...');
          let scrollCount = 0;
          const maxScrolls = 40;
          let lastItemCount = 0;
          let staleScrollCount = 0;
          const STALE_THRESHOLD = 15; // stale-based exit handles the "we're done" case before maxScrolls

          function countVisibleItems() {
            // Count tiles/listings rendered — more reliable signal than page height
            return document.querySelectorAll('[data-test*="tile"], [class*="tile-container"], [data-test*="listing"], .card, .item-tile').length;
          }

          function fireScrollEvent() {
            // Dispatch synthetic wheel + scroll events to nudge lazy-load listeners
            try {
              window.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, bubbles: true }));
              window.dispatchEvent(new Event('scroll', { bubbles: true }));
            } catch {}
          }

          function doPoshScroll() {
            // Multiple scroll strategies — Poshmark has nested scroll containers
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
            window.scrollBy(0, 3000);
            const containers = document.querySelectorAll('main, [role="main"], .content, #content, .closet-listings, [class*="Container"], [class*="container"]');
            containers.forEach(el => {
              if (el && el.scrollTop !== undefined && el.scrollHeight > el.clientHeight) {
                el.scrollTop = el.scrollHeight;
              }
            });
            fireScrollEvent();
            scrollCount++;

            const currentItemCount = countVisibleItems();
            console.log('[Poshmark Interceptor] Scroll', scrollCount, '/', maxScrolls, '| DOM items:', currentItemCount);

            // Stale detection based on ITEM COUNT — more reliable than height
            if (currentItemCount === lastItemCount) staleScrollCount++;
            else { staleScrollCount = 0; lastItemCount = currentItemCount; }

            // Scrape every 3 scrolls (was 5) to accumulate faster
            if (scrollCount % 3 === 0) {
              console.log('[Poshmark Interceptor] 📸 Mid-scroll scrape at', scrollCount);
              scrapePoshmarkDOM();
            }

            if (scrollCount >= maxScrolls || staleScrollCount >= STALE_THRESHOLD) {
              console.log('[Poshmark Interceptor] ✅ Scroll complete at', scrollCount, '(stale:', staleScrollCount, ', items:', currentItemCount, ')');
              // Triple-scrape wave spaced 3s apart to catch late-loading content
              setTimeout(() => {
                scrapePoshmarkDOM();
                setTimeout(() => {
                  scrapePoshmarkDOM();
                  setTimeout(() => {
                    scrapePoshmarkDOM();
                    setTimeout(() => window.postMessage({ type: 'POSHMARK_SCRAPE_COMPLETE' }, '*'), 2000);
                  }, 3000);
                }, 3000);
              }, 5000);
            } else {
              // Slightly slower cadence — give lazy-load time to fire (2-4s random)
              setTimeout(doPoshScroll, 2000 + Math.random() * 2000);
            }
          }
          setTimeout(doPoshScroll, 2500);
        }
      }
    }).catch(err => console.error('[Background] Poshmark injection failed:', err));
  }
});

// Store captured listings from network requests
let capturedListings = [];
let capturedUsername = null;

// Auto-sync state
let autoSyncTabId = null;
let autoSyncTimeout = null;

console.log('[Background] 🔧 Installing webRequest listeners...');

// Listen for ALL webapi.depop.com requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('[Background] 📡 webRequest captured:', details.url);

    const url = details.url;

    // Check if this is a products API call (v2 or v3)
    if (url.includes('/shop/') && url.includes('/products/')) {
      console.log('[Background] 🎯 PRODUCTS API DETECTED:', url);

      // Extract username from URL: /api/v2/shop/{username}/products/ or /api/v3/shop/{username}/products/
      const usernameMatch = url.match(/\/shop\/([^\/\?]+)/);
      if (usernameMatch) {
        capturedUsername = usernameMatch[1];
        console.log('[Background] 👤 Username:', capturedUsername);
      }

      // Fetch the data in the onCompleted listener
    } else {
      console.log('[Background] Other Depop API:', url.substring(0, 100));
    }
  },
  { urls: ["*://webapi.depop.com/*"] }
);

// Capture the response when the request completes
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const url = details.url;

    // Only process products API (v2 or v3)
    if (url.includes('/shop/') && url.includes('/products/')) {
      console.log('[Background] ✅ Products API completed, fetching data...');

      try {
        // Re-fetch the same URL to get the response data
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });

        console.log('[Background] Fetch response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[Background] Response keys:', Object.keys(data));

          if (data.products && Array.isArray(data.products)) {
            console.log('[Background] 🎉 SUCCESS! Captured', data.products.length, 'products');
            console.log('[Background] First product sample:', JSON.stringify(data.products[0]).substring(0, 200));

            capturedListings = capturedListings.concat(data.products);
            console.log('[Background] ✅ TOTAL CAPTURED:', capturedListings.length, 'listings');
          } else {
            console.warn('[Background] ⚠️  Response has no products array');
          }
        } else {
          console.error('[Background] ❌ Fetch failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[Background] ❌ Fetch error:', error.message);
      }
    }
  },
  { urls: ["*://webapi.depop.com/*"] }
);

console.log('[Background] ✅ webRequest listeners installed for: *://webapi.depop.com/*');

// Listen for cookie changes on Depop domain
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const cookie = changeInfo.cookie;

  // Only process Depop cookies
  if (!cookie.domain.includes('depop.com')) return;

  console.log('Depop cookie changed:', cookie.name, changeInfo.removed ? 'REMOVED' : 'SET');

  if (!changeInfo.removed) {
    await storeCookie(cookie);

    // Auto-sync to Firebase if enabled
    const settings = await chrome.storage.local.get('firebaseSync');
    if (settings.firebaseSync?.enabled) {
      await syncToFirebase();
    }
  }
});

// On extension install or startup, trigger automatic sync
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated, capturing existing Depop cookies...');
  const cookies = await chrome.cookies.getAll({ domain: '.depop.com' });

  for (const cookie of cookies) {
    await storeCookie(cookie);
  }

  console.log(`Captured ${cookies.length} cookies`);

  // Trigger automatic sync after install/update
  if (details.reason === 'install' || details.reason === 'update') {
    setTimeout(() => {
      console.log('[Background] Triggering initial auto-sync...');
      triggerAutoSync('harrisonkennedy');
    }, 5000); // Wait 5 seconds after install
  }
});

// Trigger automatic sync on browser startup (once per session)
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Browser started, triggering auto-sync...');
  setTimeout(() => {
    triggerAutoSync('harrisonkennedy');
  }, 10000); // Wait 10 seconds after browser starts
});

// Set up periodic auto-sync (every hour)
chrome.alarms.create('depop-auto-sync', {
  periodInMinutes: 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'depop-auto-sync') {
    console.log('[Background] Periodic auto-sync triggered');
    triggerAutoSync('harrisonkennedy');
  }
});

// Store cookie in chrome.storage.local
async function storeCookie(cookie) {
  const key = `depop_cookie_${cookie.name}`;

  await chrome.storage.local.set({
    [key]: {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expirationDate: cookie.expirationDate,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      captured_at: new Date().toISOString()
    }
  });

  console.log('Stored cookie:', cookie.name);
}

// Message handler for popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 📨 Message received:', message.type || message.action, 'from', sender.tab ? 'tab' : 'extension');

  if (message.action === 'getCookies') {
    getCookies().then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.action === 'clearCookies') {
    clearStoredCookies().then(sendResponse);
    return true;
  }

  if (message.action === 'testAuth') {
    testAuthentication().then(sendResponse);
    return true;
  }

  if (message.action === 'exportCookies') {
    getCookies().then(sendResponse);
    return true;
  }

  if (message.action === 'syncToFirebase') {
    syncToFirebase().then(sendResponse);
    return true;
  }

  if (message.action === 'getSyncStatus') {
    self.firebaseSyncFunctions.getSyncStatus().then(sendResponse);
    return true;
  }

  if (message.action === 'toggleFirebaseSync') {
    toggleFirebaseSync(message.enabled).then(sendResponse);
    return true;
  }

  if (message.action === 'syncFromFirebase') {
    syncFromFirebase().then(sendResponse);
    return true;
  }

  // Handle listings captured from content script
  if (message.type === 'DEPOP_LISTINGS_CAPTURED') {
    console.log('[Background] 🎉 Received listings from content script:', message.listings.length);

    // Store in capturedListings array
    capturedListings = capturedListings.concat(message.listings);
    capturedUsername = message.username || capturedUsername;

    console.log('[Background] ✅ Total captured via content script:', capturedListings.length);

    // AUTO-SYNC immediately when listings are captured
    if (capturedListings.length > 0 && capturedUsername) {
      console.log('[Background] 🔄 Auto-syncing', capturedListings.length, 'listings to Firebase...');
      (async () => {
        const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });
        await syncListingsToFirebase(capturedUsername, capturedListings, rawCookies);

        // Close the auto-sync tab after successful sync
        if (autoSyncTabId) {
          console.log('[Background] Closing auto-sync tab:', autoSyncTabId);
          chrome.tabs.remove(autoSyncTabId).catch(() => {});
          autoSyncTabId = null;
        }
      })();
    }

    sendResponse({ success: true, totalCaptured: capturedListings.length });
    return true;
  }

  // Direct Firestore sync from content script (bypasses CSP issues)
  if (message.type === 'SYNC_TO_FIRESTORE') {
    const { username, listings, platform, scrapeComplete } = message;
    const plat = platform || 'depop';
    console.log('[Background] 📝 SYNC_TO_FIRESTORE:', listings.length, plat, 'for', username, scrapeComplete ? '(SCRAPE COMPLETE)' : '(partial)');

    // Dual write for reliability:
    //   1) Cloud Function syncWebhook (existing path — writes main marketplaceData doc)
    //   2) Direct Firestore PATCH to merge scrapeComplete flag on that same doc
    //      — this is what the app's SyncStockModal polls for
    const cloudFnPromise = fetch('https://us-central1-closet-da8f2.cloudfunctions.net/syncWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: plat,
        user_info: { username: username },
        listings: listings,
        cookies: {}
      })
    }).then(r => {
      if (r.ok) return r.json();
      throw new Error('HTTP ' + r.status);
    });

    // Direct write to merge the scrapeComplete flag + fresh syncedAt.
    // Uses updateMask so we don't overwrite listings written by the Cloud Function.
    const directPatchPromise = (async () => {
      try {
        const FIRESTORE_API = 'https://firestore.googleapis.com/v1/projects/closet-da8f2/databases/(default)/documents';
        // The content script passes an ALREADY-prefixed username
        // (e.g. "poshmark_sold_retrothriftc0"). syncWebhook sanitizes it and
        // writes the canonical doc `marketplaceData/{plat}_sold_{user}`. This
        // direct PATCH must target that SAME canonical doc id — otherwise it
        // PATCHes a raw doc named after the already-prefixed username, which
        // (re)creates the stale double-prefixed
        // "poshmark_sold_poshmark_sold_retrothriftc0" doc. Apply the SAME
        // sanitize syncWebhook uses, then rebuild the canonical id.
        const cleanUser = String(username || '')
          .replace(/^(depop|poshmark|ebay)_sold_/i, '')
          .replace(/^(depop|poshmark|ebay)_/i, '');
        const isSoldDocId = /^(depop|poshmark|ebay)_sold_/i.test(String(username || ''));
        const canonicalDocId = isSoldDocId ? `${plat}_sold_${cleanUser}` : cleanUser;
        // PATCH with updateMask applies only the specified fields (merge behavior)
        const url = `${FIRESTORE_API}/marketplaceData/${encodeURIComponent(canonicalDocId)}?updateMask.fieldPaths=scrapeComplete&updateMask.fieldPaths=syncedAt&updateMask.fieldPaths=lastSync`;
        const body = {
          fields: {
            scrapeComplete: { booleanValue: !!scrapeComplete },
            syncedAt: { timestampValue: new Date().toISOString() },
            lastSync: { timestampValue: new Date().toISOString() }
          }
        };
        const r = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error('direct PATCH HTTP ' + r.status);
      } catch (e) {
        console.warn('[Background] ⚠️ Direct scrapeComplete patch failed (non-fatal):', e.message);
      }
    })();

    Promise.all([cloudFnPromise, directPatchPromise])
      .then(([cfResult]) => {
        console.log('[Background] ✅ Sync + scrapeComplete flag written:', cfResult);
        sendResponse({ success: true, scrapeComplete: !!scrapeComplete, ...cfResult });
      })
      .catch(err => {
        console.error('[Background] ❌ Sync failed:', err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Trigger automatic background sync
  if (message.action === 'triggerAutoSync') {
    triggerAutoSync(message.username).then(sendResponse);
    return true;
  }

  if (message.action === 'fetchListings') {
    fetchListingsAuto(message.username).then(sendResponse);
    return true;
  }

  if (message.action === 'fetchListingsPuppeteer') {
    fetchListingsPuppeteer(message.username).then(sendResponse);
    return true;
  }

  if (message.action === 'fetchListingsAPI') {
    fetchListingsViaAPI(message.username).then(sendResponse);
    return true;
  }

  if (message.action === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id });
    return true;
  }

  // DEPOP_FETCH_RECEIPTS_PAGE — fetch one paginated receipts page from the
  // service worker context. The page-level interceptor cannot do this directly:
  // Depop's webapi.depop.com returns Access-Control-Allow-Origin: * which the
  // browser rejects as soon as credentials:'include' is set on a same-origin
  // page fetch. The service worker has host_permissions for *.depop.com and
  // webapi.depop.com, so the browser bypasses the per-page CORS check and
  // attaches the depop.com cookies anyway. Returns { ok, receipts, nextCursor,
  // end, status } so the page can keep walking the cursor.
  if (message.type === 'DEPOP_FETCH_RECEIPTS_PAGE') {
    (async () => {
      try {
        const { url, cursor } = message;
        if (!url) {
          sendResponse({ ok: false, error: 'missing url' });
          return;
        }
        const urlObj = new URL(url);
        if (cursor) urlObj.searchParams.set('cursor', cursor);
        const nextUrl = urlObj.toString();
        console.log('[Background] 🔄 DEPOP_FETCH_RECEIPTS_PAGE cursor=', cursor ? String(cursor).substring(0, 30) : '(none)');
        // Use the global service-worker fetch (NOT a patched one) with
        // credentials: 'include' so depop.com auth cookies attach.
        const resp = await fetch(nextUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          },
        });
        if (!resp.ok) {
          console.warn('[Background] DEPOP_FETCH_RECEIPTS_PAGE HTTP', resp.status);
          sendResponse({ ok: false, status: resp.status, error: 'HTTP ' + resp.status });
          return;
        }
        const data = await resp.json();
        const receipts = data.receipts || data.orders || [];
        // Depop's real cursor field is data.meta.cursor (with data.meta.end as
        // the terminator). Fall back to legacy/alt field names defensively.
        const metaEnd = data.meta?.end === true;
        const nextCursor = metaEnd ? null : (data.meta?.cursor || data.meta?.end_cursor || data.meta?.next_cursor || data.next_cursor || data.end_cursor || null);
        sendResponse({
          ok: true,
          status: resp.status,
          receipts: Array.isArray(receipts) ? receipts : [],
          nextCursor: nextCursor || null,
          end: !!metaEnd,
          metaRaw: data.meta || null,
        });
      } catch (err) {
        console.error('[Background] DEPOP_FETCH_RECEIPTS_PAGE error:', err);
        sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    })();
    return true; // keep channel open for async sendResponse
  }

});

// Get all stored cookies
async function getCookies() {
  const storage = await chrome.storage.local.get(null);
  const cookies = {};

  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith('depop_cookie_')) {
      cookies[value.name] = value;
    }
  }

  return cookies;
}

// Clear stored cookies
async function clearStoredCookies() {
  const storage = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(storage).filter(key => key.startsWith('depop_cookie_'));

  await chrome.storage.local.remove(keysToRemove);
  return { cleared: keysToRemove.length };
}

// Test if cookies work for authentication
async function testAuthentication() {
  try {
    // Get fresh cookies from Chrome
    const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });
    const cookieMap = {};
    for (const cookie of rawCookies) {
      cookieMap[cookie.name] = cookie.value;
    }

    const accessToken = cookieMap.access_token;
    if (!accessToken) {
      return {
        success: true,
        authenticated: false,
        error: 'No access_token found. Please log in to Depop first.'
      };
    }

    // Use Depop's v1 API to get current user
    const response = await fetch('https://webapi.depop.com/api/v1/user/', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.depop.com/',
        'Origin': 'https://www.depop.com'
      }
    });

    if (!response.ok) {
      return {
        success: true,
        authenticated: false,
        error: `API error: ${response.status} ${response.statusText}`
      };
    }

    const user = await response.json();

    return {
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        items_sold: user.items_sold,
        reviews_rating: user.reviews_rating,
        verified: user.verified
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// === FIREBASE SYNC FUNCTIONS ===

// Sync cookies to Firebase
async function syncToFirebase() {
  try {
    const cookies = await getCookies();

    if (Object.keys(cookies).length === 0) {
      return { success: false, error: 'No cookies to sync' };
    }

    // Get userId from chrome.storage (set by web app) or use 'default'
    let userId = 'default';
    try {
      const storageData = await chrome.storage.local.get(['userId']);
      if (storageData.userId) {
        userId = storageData.userId;
        console.log('[Background] Using userId from storage:', userId);
      } else {
        console.log('[Background] No userId in storage, using default');
      }
    } catch (err) {
      console.log('[Background] Could not get userId from storage:', err.message);
    }

    const result = await self.firebaseSyncFunctions.syncCookiesToFirestore(cookies, userId);
    console.log('[Background] Synced to Firebase:', result);

    // Also try to fetch and sync user info via content script
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.depop.com/*' });
      if (tabs.length > 0) {
        const userResult = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'getCurrentUser'
        });

        if (userResult.success && userResult.data) {
          await self.firebaseSyncFunctions.syncUserInfoToFirestore(userResult.data, userId);
          console.log('[Background] Synced user info for @' + userResult.data.username);
        }
      } else {
        console.log('[Background] No Depop tab open, skipping user info sync');
      }
    } catch (error) {
      console.log('[Background] Could not sync user info:', error.message);
    }

    return result;
  } catch (error) {
    console.error('[Background] Firebase sync failed:', error);
    return { success: false, error: error.message };
  }
}

// Sync cookies from Firebase to local storage
async function syncFromFirebase() {
  try {
    const result = await self.firebaseSyncFunctions.getCookiesFromFirestore();

    if (result.success && result.cookies) {
      // Store each cookie in local storage
      for (const [name, cookieData] of Object.entries(result.cookies)) {
        const key = `depop_cookie_${name}`;
        await chrome.storage.local.set({ [key]: cookieData });
      }

      console.log('[Background] Synced from Firebase:', Object.keys(result.cookies).length, 'cookies');
      return {
        success: true,
        count: Object.keys(result.cookies).length,
        lastSync: result.lastSync
      };
    }

    return result;
  } catch (error) {
    console.error('[Background] Firebase sync from failed:', error);
    return { success: false, error: error.message };
  }
}

// Toggle Firebase sync on/off
async function toggleFirebaseSync(enabled) {
  try {
    await chrome.storage.local.set({
      firebaseSync: {
        enabled: enabled,
        lastToggled: new Date().toISOString()
      }
    });

    console.log('[Background] Firebase sync', enabled ? 'enabled' : 'disabled');

    // If enabling, sync now
    if (enabled) {
      await syncToFirebase();
    }

    return { success: true, enabled };
  } catch (error) {
    console.error('[Background] Failed to toggle Firebase sync:', error);
    return { success: false, error: error.message };
  }
}

// Fetch shop data using chrome.scripting API (bypasses CSP, has httpOnly cookie access)
async function _fs() {
  try {
    // First get the current user to know their username
    const tabs = await chrome.tabs.query({ url: '*://*.depop.com/*' });

    if (tabs.length === 0) {
      return {
        success: false,
        error: 'Please open depop.com in a tab first'
      };
    }

    console.log('[Background] Executing script in page context...');

    // Get current user info from page context (extract from DOM/window)
    let userResults;
    try {
      userResults = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: 'MAIN',
        func: async () => {
          try {
            console.log('[Page Context] Extracting user info from page...');

            // Method 1: Try __NEXT_DATA__ first (fastest)
            let userData = null;
            const nextData = document.getElementById('__NEXT_DATA__');
            if (nextData) {
              try {
                const textContent = nextData.textContent || nextData.innerText || '';
                if (!textContent || textContent.trim().length === 0) {
                  console.warn('[Page Context] __NEXT_DATA__ is empty');
                } else {
                  const data = JSON.parse(textContent);
                  const user = data?.props?.pageProps?.initialReduxState?.user?.user ||
                              data?.props?.pageProps?.user ||
                              data?.props?.initialReduxState?.user?.user;
                  if (user && user.username) {
                    userData = user;
                    console.log('[Page Context] Found user in __NEXT_DATA__:', user.username);
                  }
                }
              } catch (e) {
                console.warn('[Page Context] Failed to parse __NEXT_DATA__:', e.message);
              }
            }

            // Method 2: Try window.__INITIAL_STATE__ or similar
            if (!userData && typeof window.__INITIAL_STATE__ !== 'undefined') {
              const user = window.__INITIAL_STATE__?.user?.user;
              if (user && user.username) {
                userData = user;
                console.log('[Page Context] Found user in __INITIAL_STATE__');
              }
            }

            // Method 3: Extract from meta tags or page content
            if (!userData) {
              const metaUser = document.querySelector('meta[property="profile:username"]');
              if (metaUser) {
                userData = { username: metaUser.content };
                console.log('[Page Context] Found username in meta tag');
              }
            }

            // Method 4: Extract from current URL (for profile pages)
            if (!userData) {
              const urlMatch = window.location.pathname.match(/^\/([^\/]+)/);
              if (urlMatch && urlMatch[1] && !['products', 'search', 'login'].includes(urlMatch[1])) {
                userData = { username: urlMatch[1] };
                console.log('[Page Context] Extracted username from URL:', urlMatch[1]);
              }
            }

            // Method 5: Try to find in any script tag with user data
            if (!userData) {
              const scripts = document.querySelectorAll('script[type="application/json"]');
              for (const script of scripts) {
                try {
                  const textContent = script.textContent || script.innerText || '';
                  if (textContent && textContent.trim().length > 0) {
                    const data = JSON.parse(textContent);
                    const user = data?.user || data?.props?.user || data?.pageProps?.user;
                    if (user && user.username) {
                      userData = user;
                      console.log('[Page Context] Found user in script tag');
                      break;
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON - this is expected for some scripts
                  continue;
                }
              }
            }

            if (userData && userData.username) {
              console.log('[Page Context] User data extracted for @' + userData.username);
              return { success: true, data: userData };
            } else {
              throw new Error('Could not find user data on page. Please make sure you are logged in and on a Depop page.');
            }
          } catch (error) {
            console.error('[Page Context] Extraction error:', error.message);
            return { success: false, error: error.message };
          }
        }
      });
    } catch (scriptError) {
      console.error('[Background] Script execution failed:', scriptError);
      return {
        success: false,
        error: 'Script execution failed: ' + scriptError.message
      };
    }

    console.log('[Background] User script execution complete:', userResults);
    const userResult = userResults && userResults[0] ? userResults[0].result : null;

    if (!userResult || !userResult.success || !userResult.data) {
      const errorMsg = userResult?.error || 'Could not get user info. Please log in.';
      console.error('[Background] User fetch failed:', errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }

    const username = userResult.data.username;
    console.log('[Background] Extracting listings from page data for @' + username + '...');

    // Extract products from __NEXT_DATA__ (no API calls - data already on page!)
    let listingsResults;
    try {
      listingsResults = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: 'MAIN',
        func: async () => {
          try {
            console.log('[Page Context] Extracting products from __NEXT_DATA__...');

            // Get __NEXT_DATA__ element
            const nextDataEl = document.getElementById('__NEXT_DATA__');
            if (!nextDataEl) {
              throw new Error('__NEXT_DATA__ not found - make sure you are on your profile page');
            }

            const textContent = nextDataEl.textContent || nextDataEl.innerText || '';
            if (!textContent || textContent.trim().length === 0) {
              throw new Error('__NEXT_DATA__ is empty');
            }

            const pageData = JSON.parse(textContent);
            console.log('[Page Context] Parsed __NEXT_DATA__');

            // Try multiple locations where products might be
            let products = null;

            // Location 1: props.pageProps.products (most common)
            products = pageData?.props?.pageProps?.products;
            if (products && Array.isArray(products) && products.length > 0) {
              console.log('[Page Context] ✅ Found', products.length, 'products at: props.pageProps.products');
              return { success: true, data: { products } };
            }

            // Location 2: props.pageProps.shop.products
            products = pageData?.props?.pageProps?.shop?.products;
            if (products && Array.isArray(products) && products.length > 0) {
              console.log('[Page Context] ✅ Found', products.length, 'products at: props.pageProps.shop.products');
              return { success: true, data: { products } };
            }

            // Location 3: props.pageProps.initialReduxState.products.products
            products = pageData?.props?.pageProps?.initialReduxState?.products?.products;
            if (products && Array.isArray(products) && products.length > 0) {
              console.log('[Page Context] ✅ Found', products.length, 'products at: initialReduxState.products.products');
              return { success: true, data: { products } };
            }

            // Location 4: Build from entities.products (object to array)
            const entities = pageData?.props?.pageProps?.initialReduxState?.entities;
            if (entities?.products && typeof entities.products === 'object') {
              products = Object.values(entities.products);
              if (products.length > 0) {
                console.log('[Page Context] ✅ Found', products.length, 'products in entities.products');
                return { success: true, data: { products } };
              }
            }

            // No products found
            const pagePropsKeys = Object.keys(pageData?.props?.pageProps || {});
            console.error('[Page Context] ❌ No products found. pageProps keys:', pagePropsKeys.join(', '));
            throw new Error('No products found in page data. Are you on your profile page with listings visible?');

          } catch (error) {
            console.error('[Page Context] Extraction failed:', error.message);
            return { success: false, error: error.message };
          }
        }
      });
    } catch (scriptError) {
      console.error('[Background] Product extraction failed:', scriptError);
      return {
        success: false,
        error: 'Failed to extract products: ' + scriptError.message
      };
    }

    const listingsResult = listingsResults[0].result;
    if (listingsResult.success && listingsResult.data) {
      const products = listingsResult.data.products || listingsResult.data.objects || [];
      console.log('[Background] Fetched', products.length, 'items');

      return {
        success: true,
        listings: products,
        count: products.length,
        username: username,
        user_info: userResult.data
      };
    } else {
      return {
        success: false,
        error: listingsResult.error || 'Failed to fetch data'
      };
    }
  } catch (error) {
    console.error('[Background] Fetch failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Fetch listings via Depop API (direct - no server needed)
async function fetchListingsViaAPI(username) {
  console.log('📡 [Background] fetchListingsViaAPI called for @' + username);
  try {
    // Get fresh cookies from Chrome
    const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });
    const cookieMap = {};
    for (const cookie of rawCookies) {
      cookieMap[cookie.name] = cookie.value;
    }

    const accessToken = cookieMap.access_token;
    if (!accessToken) {
      throw new Error('No access_token found. Please log in to Depop first.');
    }

    console.log('[Background] Using cookies to fetch from Depop API...');
    console.log('[Background] Access token:', accessToken.substring(0, 10) + '...');

    // Use Depop's v2 API with pagination (like the working bot)
    let allListings = [];
    let cursor = '';
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 100) { // Max 100 pages to prevent infinite loop
      pageCount++;
      const url = `https://webapi.depop.com/api/v2/shop/${username}/products/?lang=en&cursor=${cursor}&limit=24&statusFilter=selling&showProductInsights=true`;

      console.log(`[Background] Fetching page ${pageCount} (cursor: ${cursor || 'first page'})`);
      console.log(`[Background] URL: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Referer': `https://www.depop.com/${username}`,
          'Origin': 'https://www.depop.com'
        }
      });

      console.log(`[Background] Response status: ${response.status}`);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Background] Error response:`, errorBody);
        throw new Error(`Depop API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const pageListings = data.products || data.objects || [];

      console.log(`[Background] Page ${pageCount} returned ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        hasMore = false;
      } else {
        allListings = allListings.concat(pageListings);

        // Check if there are more pages
        cursor = data.meta?.end_cursor || data.cursor || '';
        hasMore = !!cursor && pageListings.length >= 24;
      }
    }

    console.log(`[Background] Total: ${allListings.length} listings across ${pageCount} pages`);

    // Store in local storage
    await chrome.storage.local.set({ depop_listings: allListings });

    // Always auto-sync to Firebase
    console.log('[Background] Auto-syncing to Firebase...');
    await syncListingsToFirebase(username, allListings, rawCookies);

    return {
      success: true,
      listings: allListings,
      count: allListings.length,
      username,
      method: 'api'
    };

  } catch (error) {
    console.error('[Background] API fetch failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Auto-fetch: Get captured listings from webRequest interceptor
async function fetchListingsAuto(username) {
  console.log('🎯 [Background] fetchListingsAuto called', username ? 'for @' + username : '(auto-detect)');

  // Method 1: Return captured listings from webRequest (if any exist)
  if (capturedListings.length > 0) {
    console.log('✅ [Background] Returning', capturedListings.length, 'captured listings');

    const finalUsername = capturedUsername || username;

    // Auto-sync to Firebase
    console.log('[Background] Auto-syncing to Firebase...');
    const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });
    await syncListingsToFirebase(finalUsername, capturedListings, rawCookies);

    const result = {
      success: true,
      listings: capturedListings,
      username: finalUsername,
      count: capturedListings.length,
      method: 'webRequest'
    };

    // Clear captured listings after returning them
    capturedListings = [];
    capturedUsername = null;

    return result;
  }

  // Method 2: Try to get username from current Depop tab if not provided
  if (!username) {
    console.log('[Background] No username provided, extracting from current tab...');
    const tabs = await chrome.tabs.query({ url: '*://*.depop.com/*', active: true, currentWindow: true });

    if (tabs.length === 0) {
      // Try any Depop tab
      const anyTabs = await chrome.tabs.query({ url: '*://*.depop.com/*' });
      if (anyTabs.length > 0) {
        const url = anyTabs[0].url;
        const match = url.match(/depop\.com\/([^\/\?]+)/);
        if (match && match[1]) {
          username = match[1].replace('@', '');
          console.log('[Background] Extracted username from tab URL:', username);
        }
      }
    } else {
      const url = tabs[0].url;
      const match = url.match(/depop\.com\/([^\/\?]+)/);
      if (match && match[1]) {
        username = match[1].replace('@', '');
        console.log('[Background] Extracted username from active tab:', username);
      }
    }
  }

  // Method 3: Call Depop API directly
  if (username) {
    console.log('[Background] Calling Depop API for @' + username + '...');
    const apiResult = await fetchListingsViaAPI(username);

    if (apiResult.success && apiResult.listings.length > 0) {
      console.log('✅ [Background] API method successful with', apiResult.listings.length, 'listings');
      return apiResult;
    }
  }

  return {
    success: false,
    error: 'Could not fetch listings. Please visit your Depop profile page (e.g., https://www.depop.com/harrisonkennedy) and try again.'
  };
}

/**
 * Trigger automatic sync by opening Depop page in background tab
 * This allows the fetch interceptor to capture listings automatically
 */
async function triggerAutoSync(username = 'harrisonkennedy') {
  try {
    console.log('[Background] 🚀 Triggering auto-sync for @' + username);

    // Clear any existing captured data
    capturedListings = [];
    capturedUsername = null;

    // Open Depop profile in a new background tab
    const tab = await chrome.tabs.create({
      url: `https://www.depop.com/${username}`,
      active: false // Open in background
    });

    autoSyncTabId = tab.id;
    console.log('[Background] Opened background tab:', tab.id);

    // Set timeout to close tab if sync doesn't complete within 30 seconds
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      if (autoSyncTabId) {
        console.log('[Background] Auto-sync timeout, closing tab');
        chrome.tabs.remove(autoSyncTabId).catch(() => {});
        autoSyncTabId = null;
      }
    }, 30000);

    return {
      success: true,
      message: 'Auto-sync triggered in background tab',
      tabId: tab.id
    };
  } catch (error) {
    console.error('[Background] Auto-sync error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function syncListingsToFirebase(username, listings, rawCookies) {
  try {
    console.log('[Background] 📤 Starting Firebase sync...');
    console.log('[Background] Username:', username);
    console.log('[Background] Listings count:', listings.length);
    console.log('[Background] Cookies count:', rawCookies.length);

    const authSettings = await chrome.storage.local.get('authCode');
    const syncCode = authSettings.authCode || null;
    console.log('[Background] Auth code:', syncCode ? 'Present' : 'None');

    const syncData = {
      cookies: rawCookies.reduce((acc, cookie) => {
        acc[cookie.name] = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expirationDate: cookie.expirationDate,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
          captured_at: new Date().toISOString()
        };
        return acc;
      }, {}),
      user_info: { username },
      listings
    };

    if (syncCode) {
      syncData.sync_code = syncCode;
    }

    console.log('[Background] Sending to syncWebhook...');
    console.log('[Background] Payload size:', JSON.stringify(syncData).length, 'bytes');

    const syncResponse = await fetch('https://us-central1-closet-da8f2.cloudfunctions.net/syncWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncData)
    });

    console.log('[Background] Sync response status:', syncResponse.status);

    if (syncResponse.ok) {
      const syncResult = await syncResponse.json();
      console.log('[Background] ✅ Cloud Function sync SUCCESS:', syncResult);
    } else {
      const errorText = await syncResponse.text();
      console.error('[Background] ⚠️ Cloud Function sync failed:', syncResponse.status, errorText);
    }
  } catch (syncError) {
    console.error('[Background] ⚠️ Cloud Function sync error:', syncError.message);
  }

  // ALSO write directly to Firestore via REST API — this is the PRIMARY path
  // The web app reads from marketplaceData/{userId} with platform === 'depop'
  try {
    const { userId } = await chrome.storage.local.get(['userId']);
    const writeId = userId || username;
    console.log('[Background] 📝 Direct Firestore write to marketplaceData/' + writeId);

    const listingsArray = listings.map(listing => ({
      mapValue: {
        fields: {
          id: { stringValue: String(listing.id || listing.slug || '') },
          slug: { stringValue: String(listing.slug || '') },
          title: { stringValue: String(listing.description || listing.title || '') },
          status: { stringValue: listing.sold ? 'sold' : (listing.status || 'active') },
          brand: { stringValue: typeof listing.brand === 'object' ? (listing.brand?.name || '') : String(listing.brand || '') },
          size: { stringValue: String(listing.size || '') },
          condition: { stringValue: String(listing.condition || '') },
          color: { stringValue: String(listing.colour || listing.color || '') },
          imageUrl: { stringValue: (listing.preview?.url || listing.pictures?.[0]?.url || listing.images?.[0] || '') },
          priceAmount: { stringValue: String(listing.pricing?.discountedPrice?.amount || listing.pricing?.originalPrice?.amount || listing.price?.priceAmount || listing.price?.price_amount || listing.price || '0') },
          priceCurrency: { stringValue: String(listing.pricing?.discountedPrice?.currencyName || listing.pricing?.originalPrice?.currencyName || listing.price?.currencyName || 'USD') },
          listingUrl: { stringValue: listing.slug ? 'https://www.depop.com/products/' + listing.slug + '/' : '' },
          categoryId: { stringValue: String(listing.categoryId || '') }
        }
      }
    }));

    const document = {
      fields: {
        platform: { stringValue: 'depop' },
        username: { stringValue: username || '' },
        userInfo: { mapValue: { fields: { username: { stringValue: username || '' } } } },
        listings: { arrayValue: { values: listingsArray } },
        listingsCount: { integerValue: String(listings.length) },
        syncedAt: { timestampValue: new Date().toISOString() },
        lastSync: { timestampValue: new Date().toISOString() }
      }
    };

    const FIRESTORE_API = 'https://firestore.googleapis.com/v1/projects/closet-da8f2/databases/(default)/documents';
    const writeResponse = await fetch(`${FIRESTORE_API}/marketplaceData/${writeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document)
    });

    if (writeResponse.ok) {
      console.log('[Background] ✅ Direct Firestore write SUCCESS — ' + listings.length + ' listings saved');
    } else {
      console.error('[Background] ❌ Direct Firestore write failed:', writeResponse.status);
    }

    // Also write to marketplaceData/{username} as fallback
    if (username && username !== writeId) {
      await fetch(`${FIRESTORE_API}/marketplaceData/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
      });
      console.log('[Background] ✅ Also wrote to marketplaceData/' + username);
    }
  } catch (directError) {
    console.error('[Background] ❌ Direct Firestore write error:', directError.message);
  }
}

// Fetch listings using Puppeteer service (bypass Depop's anti-scraping)
async function fetchListingsPuppeteer(username) {
  console.log('🤖 [Background] fetchListingsPuppeteer called for @' + username);
  try {
    // Get fresh cookies from Chrome
    console.log('[Background] Fetching cookies...');
    const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });

    // Convert to Puppeteer format
    const cookies = rawCookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate || -1,
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: cookie.sameSite || 'Lax'
    }));

    console.log(`[Background] Sending ${cookies.length} cookies to Puppeteer service...`);

    // Call local Puppeteer server
    const response = await fetch('http://localhost:3030/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        cookies,
        headless: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Puppeteer service error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Background] Puppeteer service returned ${result.count} listings`);

    // Store in local storage
    await chrome.storage.local.set({ depop_listings: result.listings });

    // Auto-sync to Firebase if enabled
    const settings = await chrome.storage.local.get('firebaseSync');
    if (settings.firebaseSync?.enabled) {
      try {
        // Get user info if available
        const userInfo = { username };

        // Get sync code if available
        const authSettings = await chrome.storage.local.get('authCode');
        const syncCode = authSettings.authCode || null;

        const syncData = {
          cookies: rawCookies.reduce((acc, cookie) => {
            acc[cookie.name] = {
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              expirationDate: cookie.expirationDate,
              httpOnly: cookie.httpOnly,
              secure: cookie.secure,
              sameSite: cookie.sameSite,
              captured_at: new Date().toISOString()
            };
            return acc;
          }, {}),
          user_info: userInfo,
          listings: result.listings
        };

        if (syncCode) {
          syncData.sync_code = syncCode;
        }

        const syncResponse = await fetch('https://us-central1-closet-da8f2.cloudfunctions.net/syncWebhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(syncData)
        });

        if (syncResponse.ok) {
          const syncResult = await syncResponse.json();
          console.log('[Background] Auto-synced:', syncResult);
        } else {
          console.error('[Background] Sync failed:', syncResponse.status);
        }
      } catch (syncError) {
        console.error('[Background] Sync error:', syncError);
        // Don't fail the whole operation if sync fails
      }
    }

    return {
      success: true,
      listings: result.listings,
      count: result.count,
      username: result.username,
      method: 'puppeteer'
    };

  } catch (error) {
    console.error('[Background] Puppeteer fetch failed:', error);
    return {
      success: false,
      error: error.message,
      hint: 'Make sure the Puppeteer server is running: node depop-puppeteer-server.mjs'
    };
  }
}

// Fetch data and auto-sync
async function _fdl() {
  console.log('🎯 [Background] fetchListings called!');
  try {
    // Fetch data using the internal function
    console.log('[Background] Calling _fs() to fetch from API...');
    const result = await _fs();

    if (!result.success) {
      return result;
    }

    // Store in local storage
    await chrome.storage.local.set({ depop_listings: result.listings });

    // Get FRESH cookies directly from Chrome (not cached)
    console.log('[Extension] Fetching fresh cookies from Chrome...');
    const rawCookies = await chrome.cookies.getAll({ domain: '.depop.com' });
    const cookies = {};
    for (const cookie of rawCookies) {
      cookies[cookie.name] = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expirationDate: cookie.expirationDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        captured_at: new Date().toISOString()
      };
    }
    console.log('[Extension] Captured', Object.keys(cookies).length, 'fresh cookies');

    // Auto-sync via API
    try {
      // Get sync code if available
      const settings = await chrome.storage.local.get('authCode');
      const syncCode = settings.authCode || null;

      const syncData = {
        cookies: cookies,
        user_info: result.user_info,
        listings: result.listings
      };

      if (syncCode) {
        syncData.sync_code = syncCode;
      }

      const response = await fetch('https://us-central1-closet-da8f2.cloudfunctions.net/syncWebhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncData)
      });

      if (response.ok) {
        const syncResult = await response.json();
        console.log('[Extension] Auto-synced:', syncResult);
      } else {
        console.error('[Extension] Sync failed:', response.status);
      }
    } catch (syncError) {
      console.error('[Extension] Sync error:', syncError);
      // Don't fail the whole operation if sync fails
    }

    return result;
  } catch (error) {
    console.error('[Extension] Fetch failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ===========================================================================
// App → extension Depop listing actions (check / delete via the logged-in
// browser session). The web app at closet-da8f2.web.app sends these via
// chrome.runtime.sendMessage(extensionId, …) — manifest externally_connectable
// already whitelists it. Server-side can't do this (403 + no stored cookies),
// so we drive a real logged-in tab and run a MAIN-world macro.
// ===========================================================================

function _waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // settle delay for the Next.js app to client-render the manage UI
        setTimeout(resolve, 2500);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Runs a macro in a throwaway logged-in tab and always cleans the tab up.
async function _withDepopTab(slug, runner) {
  const url = `https://www.depop.com/products/${encodeURIComponent(slug)}/manage/`;
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await _waitTabComplete(tab.id, 30000);
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: runner,
    });
    return result || { error: 'No result from page script' };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  } finally {
    // Let any async page side-effects (toasts, network) settle before tearing
    // the tab down — otherwise the macro can "succeed" but the page never
    // persisted the action server-side.
    if (tab && tab.id) {
      try { await new Promise((r) => setTimeout(r, 1500)); } catch (_) {}
      try {
        await chrome.tabs.remove(tab.id);
        console.log('[DepopTab] closed tab', tab.id);
      } catch (e) {
        console.warn('[DepopTab] failed to close tab', tab.id, e);
      }
    }
  }
}

// Injected into the /manage/ page. Determines whether the listing still exists
// for this logged-in user (manage UI present) vs gone (404 / redirected away).
function _depopCheckInPage() {
  return (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const path = location.pathname || '';
      const bodyTxt = (document.body && document.body.innerText || '').toLowerCase();
      // gone signals: bounced off /manage/, or an explicit not-found page
      if (!path.includes('/manage')) return { exists: false };
      if (bodyTxt.includes('page not found') || bodyTxt.includes("can't find") ||
          bodyTxt.includes('no longer available') || bodyTxt.includes('been removed')) {
        return { exists: false };
      }
      // exists signal: a Delete-listing control rendered
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const del = btns.find((b) => /delete listing/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
      if (del) return { exists: true };
      await sleep(400);
    }
    // timed out without a delete button but still on /manage/ — treat as exists
    // (don't risk a false "gone" that would clear a binding)
    return { exists: location.pathname.includes('/manage') };
  })();
}

// Injected into the /manage/ page. Clicks "Delete listing" then confirms in the
// modal. Hardened after a report that the click didn't land for the first few
// and the confirm wasn't selected: longer waits, scroll-into-view, a full
// pointer/mouse event sequence (React/Depop ignores a bare .click() on some
// controls), document-wide modal search (the confirm is rendered in a body
// portal, not inside a wrapper), and verbose [DepopDel] logs.
function _depopDeleteInPage() {
  return (async () => {
    const L = (...a) => { try { console.log('[DepopDel]', ...a); } catch (e) {} };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function waitFor(fn, ms, label) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        await sleep(350);
      }
      L('waitFor TIMEOUT:', label);
      return null;
    }
    function realClick(el) {
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
      try { el.dispatchEvent(new PointerEvent('pointerover', opts)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (e) {}
      try { el.click(); } catch (e) {}
    }
    const xpath = (xp) => {
      try { return document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }
      catch (e) { return null; }
    };

    if (!location.pathname.includes('/manage')) {
      L('not on /manage — pathname=', location.pathname);
      return { success: false, error: 'Not on manage page (listing may be gone)' };
    }

    // Collect interactive elements across light DOM AND any shadow roots
    // (harmless if there are none — Depop is light DOM, but this is robust).
    const deepInteractive = () => {
      const out = [];
      const walk = (root) => {
        let nodes;
        try { nodes = root.querySelectorAll('button, [role="button"], a'); } catch (e) { nodes = []; }
        nodes.forEach((n) => out.push(n));
        let allEls;
        try { allEls = root.querySelectorAll('*'); } catch (e) { allEls = []; }
        allEls.forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
      };
      walk(document);
      return out;
    };
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null;
    };
    const label = (el) => ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').trim();
    const dumpButtons = (tag) => {
      try {
        const labs = deepInteractive().filter(visible).map((b) => label(b).slice(0, 30)).filter(Boolean);
        L(tag, 'visible buttons:', JSON.stringify(labs.slice(0, 25)));
      } catch (e) {}
    };

    // 1. Find + click the "Delete listing" trigger.
    const findDelete = () => {
      const all = deepInteractive();
      return all.find((b) => /delete listing/i.test(label(b)))
        || all.find((b) => /^delete( listing)?$/i.test(label(b)))
        || xpath('//*[@id="main"]//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "delete")]')
        || null;
    };
    const delBtn = await waitFor(findDelete, 25000, 'delete button');
    if (!delBtn) { dumpButtons('no-delete-btn'); return { success: false, error: 'Delete listing button not found' }; }
    L('clicking delete:', label(delBtn).slice(0, 40));
    realClick(delBtn);

    // 2. Wait for the confirm modal, then click its confirm button. The modal
    //    is a separate render — find a NEW visible button whose label is a
    //    delete/confirm verb and that is NOT the trigger we just clicked.
    const findConfirm = () => {
      const cands = deepInteractive().filter((b) => b !== delBtn && visible(b));
      // strongest: exact destructive verbs
      let el = cands.find((b) => /^(delete|delete listing|yes,?\s*delete|delete it|confirm|remove|yes)$/i.test(label(b)));
      if (el) return el;
      // a button living inside a dialog/modal-ish container
      el = cands.find((b) => {
        const inModal = b.closest && b.closest('[class*="odalOverlay"], [class*="_modal"], [class*="Modal"], [role="dialog"], [role="alertdialog"], aside');
        return inModal && /\b(delete|remove|confirm|yes)\b/i.test(label(b));
      });
      if (el) return el;
      // any visible button that contains a destructive verb
      return cands.find((b) => /\b(delete|remove|confirm)\b/i.test(label(b))) || null;
    };
    // give the modal a beat, retry the trigger once if nothing shows
    await sleep(900);
    if (!findConfirm()) { L('no confirm yet — re-clicking delete'); realClick(delBtn); await sleep(900); }
    const confirm = await waitFor(findConfirm, 15000, 'confirm button');
    if (!confirm) {
      dumpButtons('no-confirm');
      return { success: false, error: 'Delete clicked but confirm modal button not found (see [DepopDel] log for visible buttons)' };
    }
    L('clicking confirm:', label(confirm).slice(0, 40));
    realClick(confirm);
    await sleep(400);
    // some flows show a 2nd/final confirm — click again if a fresh one appears
    const second = (() => { const c = findConfirm(); return c && c !== confirm ? c : null; })();
    if (second) { L('second confirm:', label(second).slice(0, 30)); realClick(second); }

    // 3. Success = left /manage OR the delete trigger is gone OR a toast.
    const ok = await waitFor(() => {
      if (!location.pathname.includes('/manage')) return true;
      if (!findDelete()) return true;
      const t = (document.body && document.body.innerText || '').toLowerCase();
      return t.includes('listing deleted') || t.includes('has been deleted') || t.includes('listing removed');
    }, 15000, 'post-delete confirmation');
    L('result success=', !!ok);
    if (!ok) dumpButtons('post-delete');
    return { success: !!ok, error: ok ? undefined : 'Clicked delete+confirm but could not verify removal' };
  })();
}

// ===========================================================================
// Poshmark equivalent of the Depop check/delete macros. Same rationale: the
// server side can't drive Poshmark's owner-only edit/delete UI, so we run it
// in a throwaway logged-in tab. Recorded flow: open /edit-listing/{id} →
// click "Delete Listing" → confirm "Yes" in the modal → lands on /feed.
// ===========================================================================

async function _withPoshmarkTab(listingId, runner, opts) {
  opts = opts || {};
  const url = `https://poshmark.com/edit-listing/${encodeURIComponent(listingId)}`;
  let tab;
  let result = null;
  try {
    tab = await chrome.tabs.create({ url, active: !!opts.active });
    await _waitTabComplete(tab.id, 30000);
    // Race executeScript against a hard timeout so a navigated/torn-down frame
    // (which can make the promise hang instead of reject) never leaves the tab
    // stuck loading forever — the finally still closes it.
    const exec = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: runner }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('executeScript timed out — frame likely navigated')), 75000)),
    ]);
    const r = exec && exec[0] && exec[0].result;
    result = r || { error: 'No result from page script' };
    // Mirror the macro's step log into the service-worker console (visible
    // via chrome://extensions → "Inspect views: service worker"). This lets
    // the user see the full step trace without needing to grab the page
    // tab's console before it closes.
    if (result && Array.isArray(result.steps) && result.steps.length > 0) {
      console.log('[PoshmarkTab]', (runner && runner.name) || '<runner>',
        '(', result.steps.length, 'steps) — success=', result.success === true);
      for (const line of result.steps) { try { console.log('    ' + line); } catch (_) {} }
    }
    return result;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    // A frame/tab teardown means the page navigated away — for the delist
    // macros that navigate on success (qty-zero → /listing), this IS the
    // success signal, not a failure. (Chrome surfaces this as "Frame with ID 0
    // was removed" when executeScript's frame navigates before the func returns.)
    if (/frame (with id \d+ )?was removed|frame was removed|no tab with id|no frame with id|target closed|frame.*detached|tab was closed/i.test(msg)) {
      console.log('[PoshmarkTab] frame/tab torn down (navigation) — treating as success:', msg);
      result = { success: true, viaNavigation: true };
    } else {
      result = { error: msg };
    }
    return result;
  } finally {
    if (tab && tab.id) {
      // Close on success. The check macro returns { exists: bool } with no
      // `success` field — that's a COMPLETED check, not a failure, so close it
      // too (otherwise every check leaves a stray tab open). Also close on the
      // EXPECTED failure path (delete returning blockedByMultistock — the
      // widget ladder runs qty-zero in a fresh tab right after). Any OTHER
      // failure leaves the tab open + active for inspection.
      const r = result || {};
      const isCheckResult = typeof r.exists === 'boolean';
      const ok = r.success === true || isCheckResult;
      const expectedFail = r.success === false && r.blockedByMultistock === true;
      // Debug: keepOpen leaves the tab open + foreground regardless of outcome so
      // the user can watch the macro run and read the on-page banner.
      if (opts.keepOpen) {
        try {
          await chrome.tabs.update(tab.id, { active: true });
          console.warn('[PoshmarkTab] keepOpen — tab left open for inspection, tabId=', tab.id,
            ' success=', r.success === true);
        } catch (_) {}
      } else if (ok || expectedFail) {
        try { await new Promise((r) => setTimeout(r, 1500)); } catch (_) {}
        try {
          await chrome.tabs.remove(tab.id);
          console.log('[PoshmarkTab] closed tab', tab.id, ok ? '(success)' : '(expected multistock-block)');
        } catch (e) {
          console.warn('[PoshmarkTab] failed to close tab', tab.id, e);
        }
      } else {
        try {
          await chrome.tabs.update(tab.id, { active: true });
          console.warn('[PoshmarkTab] LEFT TAB OPEN for inspection — tabId=', tab.id,
            ' result=', (() => { try { return JSON.stringify(result).slice(0, 400); } catch (_) { return String(result); } })());
        } catch (e) {
          console.warn('[PoshmarkTab] failed to activate failed-tab', tab.id, e);
        }
      }
    }
  }
}

// Injected into /edit-listing/{id}. Listing still exists for this logged-in
// user iff the edit form (with its "Delete Listing" control) renders. Gone /
// not-owned → Poshmark bounces off /edit-listing or shows a not-found page.
function _poshmarkCheckInPage() {
  return (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // A real, editable listing renders a rich edit form (qty box + many inputs).
    // A deleted / already-delisted / not-found listing renders none.
    // Poshmark serves a 404 page (distinctive error image) AT /edit-listing/{id}
    // for deleted listings, and that page has its own inputs — so check the error
    // image FIRST; it overrides the input-count heuristic.
    const is404 = () =>
      !!document.querySelector('img[alt="not-found"], img[src*="error-404"], img[src*="img-error-404"]');
    const hasEditForm = () =>
      !!document.querySelector('#content input.listing-editor__inventory-table__size-input, #content input[data-vv-name^="quantityAvailable"], #content input[placeholder="Quantity" i]')
      || document.querySelectorAll('#content input, #content textarea').length >= 5;
    const goneText = () => {
      const t = (document.body && document.body.innerText || '').toLowerCase();
      return /page not found|can.?t find|no longer available|not available|been removed|doesn.?t exist|unavailable|whoops|oops|404/.test(t);
    };
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const path = location.pathname || '';
      if (!path.includes('/edit-listing')) return { exists: false };
      if (is404()) return { exists: false };           // deleted / not-found → gone
      if (hasEditForm()) return { exists: true };       // editable listing (incl. multistock)
      if (goneText()) return { exists: false };
      await sleep(400);
    }
    // Timed out: 404 image or no real edit form = gone.
    if (is404()) return { exists: false };
    return { exists: hasEditForm() };
  })();
}

// Injected into /edit-listing/{id}. Clicks "Delete Listing" then confirms
// "Yes" in the modal. Mirrors the Depop macro's hardening (real pointer
// sequence, scroll-into-view, document-wide modal search, verbose logs).
function _poshmarkDeleteInPage() {
  return (async () => {
    const steps = [];
    const fmt = (a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (_) { return String(a); } };
    const L = (...a) => {
      try { console.log('[PoshmarkDelete]', ...a); } catch (e) {}
      try { steps.push(a.map(fmt).join(' ')); } catch (_) {}
    };
    const W = (msg) => {
      try { console.warn('[PoshmarkDelete] FAILED: ' + msg); } catch (e) {}
      try { steps.push('FAILED: ' + msg); } catch (_) {}
    };
    // Centralized return helper so every exit path logs the full return value.
    const RET = (obj) => {
      try { L('returning', JSON.stringify(obj)); } catch (e) { L('returning', obj); }
      if (obj && obj.success === false && obj.error) { W(obj.error); }
      try { obj.steps = steps.slice(); } catch (_) {}
      return obj;
    };
    let step = 'init';
    // Dedupe rejection logs — findDelete() may run ~70+ times via the
    // poll loop; without this we'd spam the console with identical
    // "rejecting candidate" lines for the same pre-rendered modal nodes.
    const loggedRejections = new Set();
    const logRejection = (el) => {
      try {
        const key = (el.outerHTML || '').slice(0, 80);
        if (loggedRejections.has(key)) return;
        loggedRejections.add(key);
        L('rejecting candidate (modal/confirm/heading):', (el.outerHTML || '').slice(0, 150));
      } catch (e) {}
    };
    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      async function waitFor(fn, ms, label) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          let v; try { v = fn(); } catch (e) { v = null; }
          if (v) return v;
          await sleep(350);
        }
        L('waitFor TIMEOUT:', label, 'after', ms, 'ms');
        return null;
      }
      function realClick(el) {
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const o = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
        try { el.dispatchEvent(new PointerEvent('pointerover', o)); } catch (e) {}
        try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) {}
        try { el.dispatchEvent(new MouseEvent('mousedown', o)); } catch (e) {}
        try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) {}
        try { el.dispatchEvent(new MouseEvent('mouseup', o)); } catch (e) {}
        try { el.dispatchEvent(new MouseEvent('click', o)); } catch (e) {}
        try { el.click(); } catch (e) {}
      }
      const all = () => Array.from(document.querySelectorAll('a, button, [role="button"], h4, h5'));
      // Strict candidate set for the initial Delete trigger: action elements ONLY
      // (no headings — h4/h5 are pre-rendered inside the confirm modal and were
      // matching "Confirm Delete Listing"), and never inside a modal/dialog.
      const strictCandidates = () => Array.from(
        document.querySelectorAll('a, button, [role="button"]')
      );
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null;
      };
      const label = (el) => (((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '')).trim();
      // Reject anything that lives inside a Poshmark modal/dialog wrapper — the
      // confirm-delete modal is pre-rendered in the DOM even when hidden.
      const inModal = (el) => {
        try {
          return !!(el.closest && el.closest('[data-test*="modal"], [class*="modal"], [class*="Modal"], [role="dialog"], [role="alertdialog"]'));
        } catch (e) { return false; }
      };

      // --- Macro entry --------------------------------------------------------
      step = 'derive-listingId';
      const pathMatch = (location.pathname || '').match(/\/edit-listing\/([^/?#]+)/);
      const listingId = pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : '';
      L('macro entry, location.pathname=', location.pathname, 'derived listingId=', listingId);

      if (!location.pathname.includes('/edit-listing')) {
        L('not on /edit-listing — pathname=', location.pathname);
        return RET({ success: false, error: 'Not on edit-listing page (listing may be gone)' });
      }

      // --- Hydration wait -----------------------------------------------------
      // The edit form is rendered client-side; wait for the React tree to mount
      // *something* form-like before we go hunting for the Delete control.
      step = 'hydration-wait';
      L('edit-page hydration wait starting...');
      const hydrationStart = Date.now();
      const HYDRATION_TIMEOUT_MS = 15000;
      while (!document.querySelector('form input, [class*="edit"] input, table input')) {
        if (Date.now() - hydrationStart > HYDRATION_TIMEOUT_MS) {
          const elapsed = Date.now() - hydrationStart;
          L('edit-page hydration wait TIMEOUT after', elapsed, 'ms — proceeding anyway');
          break;
        }
        await sleep(250);
      }
      const hydrationMs = Date.now() - hydrationStart;
      L('edit-page hydration wait ended after', hydrationMs, 'ms');
      await sleep(800); // extra settle for React state

      // --- Find the Delete Listing trigger -----------------------------------
      // It's an <a class="tc--lg"> wrapping an <h4>Delete Listing</h4> — match
      // by text, click the anchor. STRICT: action elements only (no h4/h5),
      // never inside a modal, and the fuzzy match must not contain "confirm"
      // (which would match the modal heading "Confirm Delete Listing").
      step = 'find-delete-control';
      const findDelete = () => {
        const c = strictCandidates().filter((e) => {
          // Reject anything inside a confirmation modal — those are the
          // post-click confirm-modal contents, not the initial trigger.
          if (inModal(e)) {
            logRejection(e);
            return false;
          }
          return true;
        });
        // Primary: exact "Delete Listing" text match.
        let hit = c.find((e) => /^delete listing$/i.test(label(e)));
        if (!hit) {
          // Fuzzy fallback: must contain "delete listing" but NOT "confirm".
          hit = c.find((e) => {
            const t = label(e);
            if (!/delete listing/i.test(t)) return false;
            if (/confirm/i.test(t)) {
              logRejection(e);
              return false;
            }
            return true;
          });
        }
        if (!hit) return null;
        return (hit.closest && hit.closest('a, button, [role="button"]')) || hit;
      };

      // Multistock-sold detector. Poshmark blocks delete on listings that already
      // have a sale recorded against one of their multistock units; we fall back
      // to setting quantity to 0. Two signals: (a) a labeled "Delete Listing" /
      // "Delete this listing" element is DISABLED, (b) page text explicitly
      // says the listing can't be deleted / has been sold / has active sales.
      // Declared above the pre-search scan so the new strict==0 fail-fast block
      // can reference it (const has TDZ; this would ReferenceError otherwise).
      const multistockSignals = () => {
        const out = { disabledLabel: false, bodyText: false };
        try {
          const cands = all();
          const labeled = cands.find((e) => /delete (this )?listing/i.test(label(e)));
          if (labeled) {
            const dis = labeled.disabled === true
              || (labeled.getAttribute && labeled.getAttribute('aria-disabled') === 'true');
            if (dis) out.disabledLabel = true;
          }
          const body = (document.body && document.body.textContent) || '';
          if (/cannot be deleted|has been sold|item with active sales|can.?t delete|delete is unavailable/i.test(body)) {
            out.bodyText = true;
          }
        } catch (e) {}
        return out;
      };

      // Scan/log pre-search so we can see what was on the page.
      try {
        const cands = all();
        const deleteish = cands.filter((e) => /delete/i.test((e.textContent || '')));
        L('Searching for delete button: candidate elements (a/button/role=button/h4/h5) =', cands.length,
          '| candidates whose textContent contains "delete" =', deleteish.length);
        deleteish.slice(0, 10).forEach((e, i) => {
          L('  delete-ish candidate', i, 'tag=', (e.tagName || '').toLowerCase(),
            'text=', (e.textContent || '').trim().slice(0, 80));
        });
        // Strict-filter count (what findDelete actually considers) — should be
        // 0 for multistock-sold items whose only "delete" text is the
        // pre-rendered modal heading "Confirm Delete Listing".
        const strict = strictCandidates().filter((e) => {
          if (inModal(e)) return false;
          const t = label(e);
          if (/^delete listing$/i.test(t)) return true;
          if (/delete listing/i.test(t) && !/confirm/i.test(t)) return true;
          return false;
        });
        L('  filtered button candidates (strict, excluding modals/confirm/headings) =', strict.length);
        // Strict count of 0 right after hydration = no delete button on this page
        // (multistock-sold listings have it hidden). Don't poll for 25s — the page
        // is fully rendered, the button isn't going to materialize. Default to
        // blockedByMultistock immediately so the widget can fire the qty-zero fallback.
        if (strict.length === 0) {
          L('Strict candidate count is 0 — failing fast to blockedByMultistock (no need to poll)');
          const sig = multistockSignals();
          L('Multistock-detect sub-checks: disabledLabel=', sig.disabledLabel, 'bodyText=', sig.bodyText);
          if (sig.disabledLabel || sig.bodyText) {
            L('multistock-block: confirmed via', sig.disabledLabel && sig.bodyText ? 'both' : sig.disabledLabel ? 'disabled-label' : 'body-text');
            return RET({ success: false, blockedByMultistock: true,
              error: 'Poshmark blocks delete on multistock with sold units' });
          }
          L('multistock-block: assumed (button missing, no explicit signal)');
          return RET({ success: false, blockedByMultistock: true,
            error: 'Delete Listing control not found (assumed multistock-blocked)' });
        }
      } catch (errScan) {
        L('pre-search scan threw:', errScan && errScan.message ? errScan.message : errScan);
      }

      step = 'wait-for-delete-control';
      // Only reached when strict-count was >0 at the pre-scan but the click
      // handlers haven't bound yet; 3s is plenty of grace (was 25s).
      const delEl = await waitFor(
        () => { const d = findDelete(); return d && visible(d) ? d : null; },
        3000,
        'delete listing'
      );

      // --- Delete control not found: conservative-default multistock block ----
      if (!delEl) {
        step = 'delete-control-missing';
        L('Delete Listing control not found — checking for multistock-block signals');
        const sig = multistockSignals();
        L('Multistock-detect sub-checks: disabledLabel=', sig.disabledLabel, 'bodyText=', sig.bodyText);
        let which;
        if (sig.disabledLabel && sig.bodyText) which = 'both';
        else if (sig.disabledLabel) which = 'disabled-label';
        else if (sig.bodyText) which = 'body-text';
        else which = 'neither';
        L('Multistock-detect: matched =', which);

        if (sig.disabledLabel || sig.bodyText) {
          L('multistock-block: confirmed via', which);
          return RET({
            success: false,
            blockedByMultistock: true,
            error: 'Poshmark blocks delete on multistock with sold units',
          });
        }
        // Conservative default: if the item is in the delist queue and Poshmark
        // doesn't show the delete button at all, assume multistock-blocked.
        // Worst case: qty-zero fallback also fails (same end state as before).
        L('multistock-block: assumed (button missing, no explicit signal)');
        return RET({
          success: false,
          blockedByMultistock: true,
          error: 'Delete Listing control not found (assumed multistock-blocked)',
        });
      }

      // --- Delete control found: log shape, then disabled-check --------------
      step = 'inspect-delete-control';
      try {
        const oh = (delEl.outerHTML || '').slice(0, 200);
        const disAttr = delEl.getAttribute && delEl.getAttribute('aria-disabled');
        L('Delete control FOUND. outerHTML[:200]=', oh, '| el.disabled=', delEl.disabled,
          '| aria-disabled=', disAttr);
      } catch (errInspect) {
        L('inspect delete control threw:', errInspect && errInspect.message ? errInspect.message : errInspect);
      }
      {
        const dis = delEl.disabled === true
          || (delEl.getAttribute && delEl.getAttribute('aria-disabled') === 'true');
        if (dis) {
          L('delete control found but DISABLED → treating as multistock-block');
          return RET({
            success: false,
            blockedByMultistock: true,
            error: 'Poshmark blocks delete on multistock with sold units',
          });
        }
      }

      // --- Click delete + wait for confirm modal ----------------------------
      step = 'click-delete';
      L('clicking delete listing:', label(delEl).slice(0, 40));
      realClick(delEl);

      step = 'find-confirm-modal';
      const findConfirm = () => {
        const primary = document.querySelector('[data-test="modal-footer"] button.btn--primary');
        if (primary && visible(primary)) return primary;
        const cands = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) => b !== delEl && visible(b));
        let el = cands.find((b) => /^(yes|yes,?\s*delete|delete|confirm|delete listing)$/i.test(label(b)));
        if (el) return el;
        el = cands.find((b) => {
          const m = b.closest && b.closest('[data-test="modal-footer"], [class*="modal"], [class*="Modal"], [role="dialog"], [role="alertdialog"]');
          return m && /\b(yes|delete|confirm)\b/i.test(label(b));
        });
        return el || null;
      };
      const confirmWaitStart = Date.now();
      await sleep(800);
      if (!findConfirm()) {
        L('no confirm modal after', (Date.now() - confirmWaitStart), 'ms — re-clicking delete');
        realClick(delEl);
        await sleep(900);
      }
      const confirm = await waitFor(findConfirm, 15000, 'confirm Yes');
      if (!confirm) {
        const waited = Date.now() - confirmWaitStart;
        L('no confirm modal after', waited, 'ms total');
        return RET({ success: false, error: 'Delete clicked but confirm modal button not found' });
      }
      L('confirm modal appeared after', (Date.now() - confirmWaitStart), 'ms');

      step = 'click-confirm';
      try {
        const oh = (confirm.outerHTML || '').slice(0, 200);
        L('clicking confirm. outerHTML[:200]=', oh, '| label=', label(confirm).slice(0, 40));
      } catch (errOh) {
        L('confirm outerHTML log threw:', errOh && errOh.message ? errOh.message : errOh);
      }
      realClick(confirm);

      // --- Verify deletion --------------------------------------------------
      step = 'verify-deletion';
      const ok = await waitFor(() => {
        const navAway = !location.pathname.includes('/edit-listing');
        const btnGone = !findDelete();
        const t = (document.body && document.body.innerText || '').toLowerCase();
        const textHit = t.includes('listing deleted') || t.includes('has been deleted') || t.includes('listing removed');
        if (navAway || btnGone || textHit) {
          L('verify hit: navAway=', navAway, 'btnGone=', btnGone, 'textHit=', textHit);
          return true;
        }
        return false;
      }, 15000, 'post-delete confirmation');

      if (!ok) {
        L('verify FAILED: navAway=', !location.pathname.includes('/edit-listing'),
          'btnGone=', !findDelete(),
          'pathname=', location.pathname);
        return RET({ success: false, error: 'Clicked delete+confirm but could not verify removal' });
      }
      L('verify SUCCESS');
      return RET({ success: true });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      try { console.error('[PoshmarkDelete] ERROR at step ' + step + ': ' + msg, err); } catch (e) {}
      L('ERROR at step', step, ':', msg);
      return RET({ success: false, error: 'Macro threw at step ' + step + ': ' + msg });
    }
  })();
}

// Injected into /edit-listing/{id}. Sets the quantity input to 0 and clicks
// Update, then handles the "List This Item" confirmation modal that Poshmark
// shows when stock drops to 0. Used as the fallback when delete is blocked by
// multistock-with-sold-units. Based on the user-provided Chrome DevTools
// Recorder flow. Note: _withPoshmarkTab navigates the tab to /edit-listing/{id}
// before injecting the runner, so we derive listingId from location.pathname.
function _poshmarkSetQuantityZeroInPage() {
  return (async () => {
    const steps = [];
    const fmt = (a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (_) { return String(a); } };
    const L = (...args) => {
      try { console.log('[PoshQtyZero]', ...args); } catch (_) {}
      try { steps.push(args.map(fmt).join(' ')); } catch (_) {}
      try { renderOverlay(); } catch (_) {}
    };
    const W = (msg) => {
      try { console.warn('[PoshQtyZero] FAILED: ' + msg); } catch (_) {}
      try { steps.push('FAILED: ' + msg); } catch (_) {}
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const text = (el) => ((el && (el.textContent || '')) || '').trim();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null;
    };
    // Live on-page banner so the user can watch the macro run and read exactly
    // where it stops — no DevTools, no service-worker console. Updated on every
    // step via L(). Blue while running, green on success, red on failure.
    const renderOverlay = (status, bg) => {
      try {
        let div = document.getElementById('__pqz_overlay');
        if (!div) {
          div = document.createElement('div');
          div.id = '__pqz_overlay';
          (document.documentElement || document.body).appendChild(div);
        }
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:' +
          (bg || '#1e3a8a') + ';color:#fff;font:12px/1.45 monospace;padding:10px 14px;max-height:70vh;overflow:auto;white-space:pre-wrap;box-shadow:0 2px 14px rgba(0,0,0,.6);border-bottom:3px solid rgba(255,255,255,.45);';
        const head = '[PoshQtyZero] ' + (status || 'running…') + '\n— step trace (newest last) —\n';
        div.textContent = head + steps.map((l, i) => (i + 1) + '. ' + l).join('\n');
      } catch (_) {}
    };
    const RET = (obj) => {
      try { L('returning', JSON.stringify(obj)); } catch (_) { L('returning', obj); }
      if (obj && obj.success === false && obj.error) W(obj.error);
      try { obj.steps = steps.slice(); } catch (_) {}
      try {
        if (obj && obj.success === true) renderOverlay('SUCCESS ✓', '#065f46');
        else renderOverlay('FAILED — ' + (obj && obj.error ? obj.error : 'unknown'), '#7f1d1d');
      } catch (_) {}
      return obj;
    };
    const waitForEl = async (fn, ms, label) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        let el = null;
        try { el = fn(); } catch (_) { el = null; }
        if (el) return el;
        await sleep(250);
      }
      L('waitForEl TIMEOUT:', label, 'after', ms, 'ms');
      return null;
    };
    const smallInt = (s) => /^\d{1,3}$/.test((s || '').trim());
    // Qty input, in priority order. NO heading requirement. The recording shows
    // the qty box lives in a <table> in section 4 and its accessible name
    // (aria-label) equals its current value (e.g. "2").
    const findQtyInput = () => {
      // 0. STABLE selectors confirmed from the live DOM (best — survives layout changes).
      let el = document.querySelector('#content input.listing-editor__inventory-table__size-input')
            || document.querySelector('#content input[data-vv-name^="quantityAvailable"]')
            || document.querySelector('#content input[placeholder="Quantity" i]');
      if (el) return el;
      // 1. recorded CSS (scoped to #content first, then unscoped).
      el = document.querySelector('#content section:nth-of-type(4) div.col-l20 > div:nth-of-type(1) > div > div:nth-of-type(1) input')
            || document.querySelector('section:nth-of-type(4) div.col-l20 > div:nth-of-type(1) > div > div:nth-of-type(1) input');
      if (el) return el;
      // 2. any input inside a #content <table> whose aria-label OR value is a small int.
      el = Array.from(document.querySelectorAll('#content table input')).find((i) =>
        smallInt(i.getAttribute('aria-label')) || smallInt(i.value));
      if (el) return el;
      // 3. 4th #content section: table input, else any numeric input.
      const sec4 = document.querySelectorAll('#content section')[3];
      if (sec4) {
        el = sec4.querySelector('table input')
          || Array.from(sec4.querySelectorAll('input')).find((i) =>
              smallInt(i.getAttribute('aria-label')) || smallInt(i.value));
        if (el) return el;
      }
      // 4. ANY #content input whose aria-label is a small int (qty box's a11y name).
      el = Array.from(document.querySelectorAll('#content input')).find((i) =>
        smallInt(i.getAttribute('aria-label')));
      if (el) return el;
      // 5. recorded xpath.
      try {
        const xp = document.evaluate(
          '//*[@id="content"]/div/div[1]/div/section[4]/div[2]/div[2]/div[1]/div/div[1]/table/tbody/tr/td[2]/div/input',
          document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        if (xp && xp.singleNodeValue) return xp.singleNodeValue;
      } catch (_) {}
      return null;
    };
    // The listing is already gone (deleted / not-found) — delisting goal achieved.
    // Poshmark serves a 404 page (with a distinctive error image) AT the
    // /edit-listing/{id} URL, and that page has its own inputs — so detect it by
    // the error image / text, NOT by input count (which false-positives).
    const looksGone = () => {
      const path = location.pathname || '';
      if (!path.includes('/edit-listing')) return true;
      if (document.querySelector('img[alt="not-found"], img[src*="error-404"], img[src*="img-error-404"]')) return true;
      const t = (document.body && document.body.innerText || '').toLowerCase();
      return /page not found|can.?t find|no longer available|been removed|doesn.?t exist|sorry, this listing|whoops|oops|404/.test(t);
    };
    let step = 'init';

    try {
      const pathMatch = (location.pathname || '').match(/\/edit-listing\/([^/?#]+)/);
      const listingId = pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : '';
      L('macro entry, pathname=', location.pathname, 'listingId=', listingId);
      if (!location.pathname.includes('/edit-listing')) {
        L('not on /edit-listing (listing likely gone/deleted) → complete');
        return RET({ success: true, alreadyGone: true });
      }

      // Wait for EITHER the edit form (qty box) to appear, OR conclude the
      // listing is gone. A real edit page renders a rich form (~24 inputs); a
      // deleted / not-found / already-delisted listing renders no edit form at
      // all. Poll and bail as soon as we know — no fixed 15s hydration wait.
      step = 'await-edit-form';
      let qtyInput = null;
      const formWaitStart = Date.now();
      while (Date.now() - formWaitStart < 12000) {
        qtyInput = findQtyInput();
        if (qtyInput) break;
        if (looksGone()) {
          L('listing gone (redirect / not-found text) → removed');
          return RET({ success: true, alreadyGone: true, removed: true });
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        await sleep(400);
      }

      if (!qtyInput) {
        // No qty box after the wait. A real edit form has many inputs; a deleted
        // / not-found listing has ~none → treat as already delisted (removed).
        const formInputs = document.querySelectorAll('#content input, #content textarea').length;
        const bodyTxt = (document.body && document.body.innerText || '').toLowerCase();
        const goneText = /page not found|can.?t find|no longer available|been removed|doesn.?t exist|sorry|isn.?t available|not available|unavailable|removed this/.test(bodyTxt);
        if (!location.pathname.includes('/edit-listing') || formInputs < 5 || goneText) {
          L('no edit form (inputs=' + formInputs + ', goneText=' + goneText + ', path=' + location.pathname + ') → already delisted / gone → removed');
          return RET({ success: true, alreadyGone: true, removed: true });
        }
        // Edit form present but qty box missing — genuine selector miss; dump it.
        L('edit form present (inputs=' + formInputs + ') but qty box NOT FOUND. Dumping #content inputs:');
        Array.from(document.querySelectorAll('#content input')).forEach((el, i) =>
          L('  input[' + i + ']=', (el.outerHTML || '').slice(0, 170), 'val=', el.value));
        return RET({ success: false, error: 'Quantity input not found (edit form present)' });
      }
      qtyInput.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(250);
      L('found qty input; outerHTML=', (qtyInput.outerHTML || '').slice(0, 200), 'rawValue=', qtyInput.value);

      // CRITICAL: the form shell mounts with a default ("0") BEFORE Vue fetches
      // the listing and fills in the real quantity. Reading too early makes a
      // live qty-1 item look like it's already 0. Wait for the value to SETTLE
      // (stable across reads, min ~2.5s) before deciding anything.
      step = 'await-value-populate';
      let stableVal = (qtyInput.value || '').trim();
      let stableCount = 0;
      const popStart = Date.now();
      while (Date.now() - popStart < 12000) {
        await sleep(400);
        const fresh = findQtyInput();
        if (fresh && fresh !== qtyInput) qtyInput = fresh;
        const curVal = (qtyInput.value || '').trim();
        if (curVal === stableVal) {
          stableCount++;
        } else {
          L('qty value changed "' + stableVal + '" → "' + curVal + '" (listing data still loading)');
          stableVal = curVal; stableCount = 0;
        }
        if (stableCount >= 3 && Date.now() - popStart >= 2500) break;
      }
      const initialQty = stableVal;
      L('qty value SETTLED at "' + initialQty + '" after', Date.now() - popStart, 'ms');

      // Idempotency: if the settled value is already 0, nothing to do.
      if (initialQty === '0') {
        L('quantity already 0 (settled) — returning success without edit');
        return RET({ success: true, alreadyZero: true });
      }

      // Focus + click the input (recording clicks it first).
      step = 'focus-qty-input';
      qtyInput.focus();
      qtyInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      qtyInput.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      qtyInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(150);

      // THE KEY FIX: poke the native value setter so the page framework's private
      // model updates (a plain input.value="0" only changes the screen — Update
      // would then submit the OLD value). Fire input + blur, which the model listens to.
      step = 'set-value-0';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(qtyInput, '0');
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
      qtyInput.dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(300);
      L('post-write value=', qtyInput.value);
      if ((qtyInput.value || '').trim() !== '0') {
        L('value did not stick — retry with focus+select');
        qtyInput.focus();
        try { qtyInput.select && qtyInput.select(); } catch (_) {}
        setter.call(qtyInput, '0');
        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        qtyInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(300);
        L('retry value=', qtyInput.value);
      }
      if ((qtyInput.value || '').trim() !== '0') {
        return RET({ success: false, error: 'Quantity input rejected the value "0" (framework model did not update)' });
      }
      L('✓✓ QTY SET TO 0 (was "' + initialQty + '") — committing, then listing with 0 stock');

      // Click elsewhere in the section to commit the field (recording does this).
      step = 'commit-blur';
      const sec = qtyInput.closest('section');
      const blurTarget = qtyInput.closest('div.col-l20 > div') || sec;
      if (blurTarget) blurTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(300);

      // Click Update — match by text (Update/Save), reject cancel/discard/delete.
      step = 'click-update';
      const findUpdateBtn = () => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible);
        let b = btns.find((x) => /^(update|update listing|save|save changes)$/i.test(text(x)) && !/cancel|discard|delete/i.test(text(x)));
        if (b) return b;
        b = document.querySelector('#content > div > div:nth-of-type(1) > div > div.form__actions > button');
        if (b && visible(b) && !/cancel|discard|delete/i.test(text(b))) return b;
        return null;
      };
      const updateBtn = await waitForEl(findUpdateBtn, 8000, 'Update button');
      if (!updateBtn) {
        L('Update button NOT FOUND. Visible buttons:');
        Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible).slice(0, 30)
          .forEach((b, i) => L('  btn[' + i + ']=', text(b).slice(0, 40), 'cls=', (b.className || '').slice(0, 50)));
        return RET({ success: false, error: 'Update button not found' });
      }
      L('found Update button; text=', text(updateBtn).slice(0, 40));
      updateBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(200);
      updateBtn.click();
      L('Update clicked');

      // Confirmation popup — click "List This Item". Listing with qty 0 makes the
      // item sold-out / not purchasable — this IS the correct delist action.
      step = 'click-list-this-item';
      const findListBtn = () => {
        const cands = Array.from(document.querySelectorAll(
          '[data-test="modal-body"] button, [data-test="modal-footer"] button, ' +
          '[class*="modal"] button, [role="dialog"] button, [role="alertdialog"] button'
        )).filter(visible);
        let b = cands.find((x) => /^list this item$/i.test(text(x)));
        if (!b) b = cands.find((x) => /list this item|^list it$/i.test(text(x)));
        return b || null;
      };
      const listBtn = await waitForEl(findListBtn, 10000, 'List This Item button');
      if (listBtn) {
        // Clicking "List This Item" commits the relist (qty 0) and immediately
        // navigates to /listing/{id}. That navigation destroys this frame — and
        // if we AWAIT anything after the click, executeScript can HANG (frame
        // gone, promise never resolves) and the tab gets stuck loading forever.
        // So return success SYNCHRONOUSLY right after the click — no await. The
        // click has already fired Poshmark's relist POST, and the wrapper's
        // settle delay before closing the tab lets it complete. (The wrapper
        // also treats a frame-teardown as success, as a backstop.)
        step = 'click-list-this-item-confirm';
        L('clicking "List This Item" → relist with qty 0; returning success now (nav follows)');
        listBtn.click();
        return RET({ success: true });
      }

      // No "List This Item" modal — Update may have saved directly (single-stock).
      step = 'verify-no-modal';
      const modalBtns = Array.from(document.querySelectorAll(
        '[data-test="modal-body"] button, [class*="modal"] button, [role="dialog"] button'
      )).filter(visible);
      L('no "List This Item" modal. Modal buttons seen:');
      modalBtns.slice(0, 20).forEach((b, i) => L('  modalBtn[' + i + ']=', text(b).slice(0, 50)));
      const verifyStart = Date.now();
      while (Date.now() - verifyStart < 8000) {
        const path = location.pathname || '';
        if (path.includes('/listing/') || !path.includes('/edit-listing')) { L('verify: navigated off edit → success'); return RET({ success: true }); }
        const bodyTxt = (document.body && document.body.innerText || '').toLowerCase();
        if (/listing updated|listing saved|successfully (updated|saved)|not for sale|sold out/i.test(bodyTxt)) { L('verify: toast/state text → success'); return RET({ success: true }); }
        const cur = findQtyInput();
        if (cur && (cur.value || '').trim() === '0') { L('verify: qty persists 0 → success'); return RET({ success: true }); }
        await sleep(400);
      }
      // We confirmed qty=0 and clicked Update — treat as delisted.
      L('no modal/nav but qty was set to 0 + Update clicked → success');
      return RET({ success: true });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      try { console.error('[PoshQtyZero] ERROR at step ' + step + ': ' + msg, e); } catch (_) {}
      W('threw at step ' + step + ': ' + msg);
      return RET({ success: false, error: 'Threw at step ' + step + ': ' + msg });
    }
  })();
}

// ===========================================================================
// Facebook Marketplace auto-delist macro. Driven from the seller hub list at
//   /marketplace/you/selling?referral_surface=seller_hub&status[0]=IN_STOCK
// because the per-item URL doesn't expose Edit/Delete — those only live in
// the seller-hub card kebab menu. Recorded flow (user, 2026-06-04):
//   1. Open seller hub                       (← _withFacebookSellerHubTab)
//   2. Click the "More options for {title}" button on the card whose
//      Promote-now link carries `target_id={listingId}`
//   3. Click the "Delete listing" menu item
//   4. Click the first confirm in the modal
//   5. Click "I'd rather not" (survey skip)
//   6. Click "Next" (final)
// ===========================================================================

const FB_SELLER_HUB_URL =
  'https://www.facebook.com/marketplace/you/selling?referral_surface=seller_hub&status%5B0%5D=IN_STOCK';

async function _withFacebookSellerHubTab(listingId, runner) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: FB_SELLER_HUB_URL, active: false });
    await _waitTabComplete(tab.id, 30000);
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: runner,
      args: [String(listingId)],
    });
    return result || { error: 'No result from page script' };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  } finally {
    if (tab && tab.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Injected into /marketplace/you/selling. Walks every Promote-now link to find
// the card whose `target_id` matches our listingId, then walks the recorded
// click sequence: ... menu → Delete listing → confirm → I'd rather not → Next.
function _facebookDeleteInPage(targetListingId) {
  return (async () => {
    const L = (...a) => { try { console.log('[FBDel]', ...a); } catch (e) {} };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function waitFor(fn, ms, label) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        await sleep(350);
      }
      L('waitFor TIMEOUT:', label);
      return null;
    }
    function realClick(el) {
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const o = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
      try { el.dispatchEvent(new PointerEvent('pointerover', o)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', o)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', o)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('click', o)); } catch (e) {}
      try { el.click(); } catch (e) {}
    }
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null;
    };
    const label = (el) => (((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '')).trim();

    // Auto-scroll until the target card renders (FB virtualizes the list).
    async function scrollUntilTargetVisible() {
      let stable = 0; let lastH = -1;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const link = document.querySelector(`a[href*="ad_center/create/listingad"][href*="target_id=${targetListingId}"]`);
        if (link && visible(link)) return link;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await sleep(600);
        const h = document.documentElement.scrollHeight;
        if (h === lastH) { stable++; if (stable >= 3) break; }
        else { stable = 0; lastH = h; }
      }
      return document.querySelector(`a[href*="ad_center/create/listingad"][href*="target_id=${targetListingId}"]`) || null;
    }

    L('searching for listing id', targetListingId);
    const promoteLink = await scrollUntilTargetVisible();
    if (!promoteLink) {
      return { success: false, error: 'Listing card not found on seller hub (target_id=' + targetListingId + ')' };
    }
    L('found promote link, locating card scope + ... menu');

    // Walk up to the card root and find the "More options for ..." kebab button
    // inside the same subtree.
    let scope = promoteLink;
    for (let i = 0; i < 12 && scope.parentElement; i++) {
      scope = scope.parentElement;
      const moreBtn = scope.querySelector('[aria-label^="More options for "]');
      if (moreBtn && visible(moreBtn)) {
        L('clicking ... menu:', (moreBtn.getAttribute('aria-label') || '').slice(0, 50));
        realClick(moreBtn);
        break;
      }
    }

    // Step 3 — click "Delete listing" in the popup.
    const deleteItem = await waitFor(() => {
      const all = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="button"], span'));
      return all.find((e) => visible(e) && /^delete listing$/i.test(label(e)))
        || all.find((e) => visible(e) && /delete listing/i.test(label(e))) || null;
    }, 8000, 'Delete listing menu item');
    if (!deleteItem) return { success: false, error: 'Delete listing menu item not found' };
    L('clicking Delete listing');
    realClick(deleteItem);

    // Step 4 — confirm in the dialog. Look for a primary-style confirm button
    // inside the dialog (Delete / Yes, delete / Confirm).
    const confirm1 = await waitFor(() => {
      const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
      const inDialog = buttons.filter((b) => visible(b) && b.closest('[role="dialog"]'));
      let el = inDialog.find((b) => /^(delete|yes,?\s*delete|delete listing|confirm)$/i.test(label(b)));
      if (el) return el;
      el = inDialog.find((b) => /\b(delete|confirm)\b/i.test(label(b)));
      return el || null;
    }, 10000, 'first confirm in delete dialog');
    if (!confirm1) return { success: false, error: 'Confirm button not found in delete dialog' };
    L('clicking confirm');
    realClick(confirm1);

    // Step 5 — "I'd rather not" survey skip. The survey appears with several
    // reason chips; choose the skip text.
    const skip = await waitFor(() => {
      const all = Array.from(document.querySelectorAll('[role="button"], button, span'));
      return all.find((e) => visible(e) && /i['’]d rather not/i.test(label(e))) || null;
    }, 10000, "I'd rather not");
    if (!skip) {
      // Some FB flows skip the survey entirely — treat the absence as success.
      L("no survey shown — treating as success");
      return { success: true };
    }
    L("clicking I'd rather not");
    realClick(skip);

    // Step 6 — final "Next" button.
    const next = await waitFor(() => {
      const all = Array.from(document.querySelectorAll('[role="button"], button, span'));
      return all.find((e) => visible(e) && /^next$/i.test(label(e))) || null;
    }, 10000, 'Next button');
    if (!next) {
      // Survey clicked but no Next — already deleted in some flows.
      L("no Next button — treating as success");
      return { success: true };
    }
    L('clicking Next');
    realClick(next);

    // Settle, then sanity-check that the card is gone.
    await sleep(2500);
    const stillThere = document.querySelector(`a[href*="ad_center/create/listingad"][href*="target_id=${targetListingId}"]`);
    return { success: !stillThere, error: stillThere ? 'Delete completed but card still visible — listing may not have been removed' : undefined };
  })();
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Background] 🌐 External message:', message && message.action, 'from', sender && sender.origin);
  if (!message || !message.action) { sendResponse({ error: 'No action' }); return false; }

  if (message.action === 'checkDepopListing') {
    if (!message.slug) { sendResponse({ error: 'slug required' }); return false; }
    _withDepopTab(message.slug, _depopCheckInPage).then(sendResponse);
    return true; // async
  }

  if (message.action === 'deleteDepopListing') {
    if (!message.slug) { sendResponse({ error: 'slug required' }); return false; }
    _withDepopTab(message.slug, _depopDeleteInPage).then(sendResponse);
    return true; // async
  }

  if (message.action === 'checkPoshmarkListing') {
    if (!message.listingId) { sendResponse({ error: 'listingId required' }); return false; }
    _withPoshmarkTab(message.listingId, _poshmarkCheckInPage).then(sendResponse);
    return true; // async
  }

  if (message.action === 'deletePoshmarkListing') {
    if (!message.listingId) { sendResponse({ error: 'listingId required' }); return false; }
    // Delete only — returns fast (incl. blockedByMultistock). The app's widget
    // ladder makes the separate setPoshmarkQuantityZero call when blocked, so we
    // do NOT chain qty-zero here (chaining made one call exceed the app's 60s
    // delete timeout, which surfaced as a false "check failed" even though the
    // work completed).
    _withPoshmarkTab(message.listingId, _poshmarkDeleteInPage).then(sendResponse);
    return true; // async
  }

  if (message.action === 'setPoshmarkQuantityZero') {
    if (!message.listingId) { sendResponse({ error: 'listingId required' }); return false; }
    // Open foreground + keepOpen so the user can watch the live on-page banner and
    // read exactly where it stops (the qty-zero flow has been the hard one to debug).
    _withPoshmarkTab(message.listingId, _poshmarkSetQuantityZeroInPage, { active: true }).then(sendResponse);
    return true; // async
  }

  if (message.action === 'deleteFacebookListing') {
    if (!message.listingId) { sendResponse({ error: 'listingId required' }); return false; }
    _withFacebookSellerHubTab(message.listingId, _facebookDeleteInPage).then(sendResponse);
    return true; // async
  }

  sendResponse({ error: 'Unknown action: ' + message.action });
  return false;
});
