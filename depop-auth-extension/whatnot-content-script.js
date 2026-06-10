/**
 * Whatnot content script — mirrors facebook-content-script.js.
 *
 * SAFETY / ANTI-BAN: this is PASSIVE. It only reads the DOM of pages the user
 * themselves opens in their own logged-in session, and only auto-scrapes when
 * the URL carries the `#autoScroll` hash (set by the app when IT opens the
 * Whatnot seller page). It never hits Whatnot APIs, never spawns tabs, and uses
 * the same gentle 1.5s scroll cadence as the other platforms — so it behaves
 * like a human browsing, not a scraper.
 *
 * Whatnot's seller DOM isn't documented here, so the scrape uses resilient
 * heuristics rather than brittle class selectors: it finds anchor links that
 * point at a listing/product, and pulls title/price/image/sold from the nearby
 * card. Tune `scrapeCards` once you can inspect the real markup.
 *
 * Posts via SYNC_TO_FIRESTORE → background.js (platform='whatnot',
 * username='whatnot_me' or 'whatnot_sold_me').
 */

(() => {
  console.log('[Whatnot Content Script] Loaded on:', location.href);

  // Treat any seller/listings/sold page as scrapeable. Broad but only ACTS when
  // #autoScroll is present (see maybeStartScrape), so normal browsing is ignored.
  const SELLER_RE = /\/(selling|seller|listings|sold|inventory|dashboard)/i;

  function isSellerContext() {
    return SELLER_RE.test(location.pathname || '');
  }

  function isSoldContext() {
    return /sold/i.test(location.pathname || '') || /sold/i.test(location.search || '');
  }

  // Pull a stable listing id out of a Whatnot URL. Whatnot listing/product URLs
  // look like /listing/<id|slug> or /product/<id>; fall back to the last path seg.
  function listingIdFromHref(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      const m = u.pathname.match(/\/(?:listing|product|item|p)\/([^/?#]+)/i);
      if (m) return m[1];
      return null;
    } catch (e) { return null; }
  }

  // Walk anchors that look like listing links and build a row from the nearest
  // card container (the anchor's small ancestor that also has an <img>).
  function scrapeCards() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/listing/"], a[href*="/product/"], a[href*="/item/"]'));
    const seen = new Map(); // listingId -> row
    for (const a of anchors) {
      const href = a.getAttribute('href');
      const listingId = listingIdFromHref(href);
      if (!listingId || seen.has(listingId)) continue;

      // Climb to a card-ish container that also contains an image.
      let scope = a;
      for (let i = 0; i < 6 && scope.parentElement; i++) {
        if (scope.querySelector && scope.querySelector('img')) break;
        scope = scope.parentElement;
      }
      const img = scope.querySelector ? scope.querySelector('img') : null;

      const text = (scope.innerText || a.innerText || '').trim();
      // Title: prefer the anchor's aria-label / img alt / first non-price line.
      let title = a.getAttribute('aria-label') || (img && img.getAttribute('alt')) || '';
      if (!title) {
        const firstLine = text.split('\n').map((s) => s.trim()).filter(Boolean).find((s) => !/^\$?\d/.test(s));
        title = firstLine || '';
      }
      title = title.trim();
      if (!title) continue;

      const priceMatch = text.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
      const price = priceMatch ? Number(priceMatch[1]) : undefined;
      const soldMatch = /\b(sold|sold out)\b/i.test(text);
      const imageUrl = img ? (img.getAttribute('src') || undefined) : undefined;

      seen.set(listingId, {
        id: listingId,
        listing_id: listingId,
        title,
        imageUrl,
        price,
        status: soldMatch ? 'sold' : 'active',
        sold: soldMatch,
        listingUrl: (() => { try { return new URL(href, location.origin).href; } catch (e) { return `https://www.whatnot.com/listing/${listingId}`; } })(),
      });
    }
    return Array.from(seen.values());
  }

  let lastSyncedCount = -1;
  let scrapeTimer = null;
  let scrollTimer = null;

  function pushListings(listings, scrapeComplete) {
    const isSold = isSoldContext();
    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_TO_FIRESTORE',
        username: isSold ? 'whatnot_sold_me' : 'whatnot_me',
        platform: 'whatnot',
        listings,
        scrapeComplete,
      }, () => { /* ignore response */ });
    } catch (e) { console.warn('[Whatnot Content Script] sendMessage failed:', e); }
  }

  function scheduleScrape() {
    if (scrapeTimer) clearTimeout(scrapeTimer);
    scrapeTimer = setTimeout(() => {
      const listings = scrapeCards();
      if (listings.length === lastSyncedCount) return; // no change since last push
      lastSyncedCount = listings.length;
      console.log('[Whatnot Content Script] scraped', listings.length, 'cards (sold=' + isSoldContext() + ')');
      pushListings(listings, false);
    }, 1500);
  }

  function startAutoScroll() {
    if (scrollTimer) clearInterval(scrollTimer);
    let stableTicks = 0;
    let lastHeight = -1;
    scrollTimer = setInterval(() => {
      const h = document.documentElement.scrollHeight;
      window.scrollTo(0, h);
      scheduleScrape();
      if (h === lastHeight) {
        stableTicks++;
        if (stableTicks >= 4) {
          clearInterval(scrollTimer);
          scrollTimer = null;
          const listings = scrapeCards();
          console.log('[Whatnot Content Script] auto-scroll done, final push (' + listings.length + ' cards)');
          pushListings(listings, true);
        }
      } else {
        lastHeight = h;
        stableTicks = 0;
      }
    }, 1500);
  }

  function maybeStartScrape() {
    if (!isSellerContext()) return;
    // Only auto-scrape when the app opened the page (#autoScroll). A plain
    // manual visit does a single light scrape so hand navigation still works,
    // but no aggressive scrolling.
    const auto = (location.hash || '').toLowerCase().includes('autoscroll');
    console.log('[Whatnot Content Script] seller context detected — auto=' + auto);
    if (auto) {
      setTimeout(startAutoScroll, 1500);
    } else {
      setTimeout(scheduleScrape, 2000);
    }
  }

  // Watch SPA URL changes — Whatnot is a SPA and swaps routes without reload.
  let lastUrl = location.href;
  const urlWatcher = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastSyncedCount = -1;
      if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
      maybeStartScrape();
    }
  }, 500);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    maybeStartScrape();
  } else {
    document.addEventListener('DOMContentLoaded', maybeStartScrape, { once: true });
  }

  window.addEventListener('beforeunload', () => {
    if (urlWatcher) clearInterval(urlWatcher);
    if (scrollTimer) clearInterval(scrollTimer);
    if (scrapeTimer) clearTimeout(scrapeTimer);
  });
})();
