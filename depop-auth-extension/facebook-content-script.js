/**
 * Facebook Marketplace content script.
 *
 * Seller-hub scrape for /marketplace/you/selling. Pushes via SYNC_TO_FIRESTORE
 * → background.js → syncWebhook with platform='facebook'.
 *
 * Design notes (why it looks the way it does):
 *  - CARD-FIRST, NOT ANCHOR-FIRST. The selling hub frequently does NOT render
 *    `/marketplace/item/<id>` links (clicking a card opens an in-page editor),
 *    so anchoring the scrape on listing links captured nothing. Instead we
 *    anchor on the product PHOTO (every card has one, and its `alt` is usually
 *    the listing title) and climb to the nearest container that also shows a
 *    "$price". The listing id is used when a link IS present, else we key the
 *    card by the stable FB photo id from the image filename.
 *  - REAL SCROLL CONTAINER. FB virtualizes the list inside an inner scrollable
 *    div — scrolling `window` does nothing, so it used to stall "halfway" and
 *    never load the rest. We detect candidate scrollers and, crucially, VERIFY
 *    one actually grows `accumulated` over a few ticks; if not we fall back to
 *    scrolling window / document.scrollingElement / the largest-overflow div /
 *    scrollIntoView on the last captured card. Cards accumulate across the pass.
 *  - NEVER DROP A CARD. We always emit photo+price+id even when the title is
 *    missing (placeholder `FB <id>`). A missing title must never discard a card.
 *  - SELF-DIAGNOSING. When we capture 0 or stall, we print DIAG counts (imgs,
 *    product imgs, item links, dollar nodes, chosen scroller scrollHeight) so we
 *    can debug blind — paste those lines back if it still fails.
 *
 * Macro work (delete listing) is driven from background.js — see
 * `_withFacebookSellerHubTab` / `_facebookDeleteInPage`.
 */

(() => {
  console.log('[Facebook Content Script] Loaded on:', location.href);

  const SELLER_HUB_RE = /\/marketplace\/you\/selling/;

  function isSellerHub() {
    return SELLER_HUB_RE.test(location.pathname || '');
  }

  function isSoldTab() {
    try {
      const url = new URL(location.href);
      const vals = url.searchParams.getAll('status[0]').concat(url.searchParams.getAll('status'));
      return vals.some((v) => String(v).toUpperCase() === 'SOLD');
    } catch (e) { return false; }
  }

  // ---- id helpers --------------------------------------------------------
  function targetIdFromHref(href) {
    if (!href) return null;
    try { return new URL(href, location.origin).searchParams.get('target_id') || null; }
    catch (e) { return null; }
  }
  function itemIdFromHref(href) {
    if (!href) return null;
    const m = String(href).match(/\/marketplace\/item\/(\d+)/);
    return m ? m[1] : null;
  }
  function findListingId(scope) {
    if (!scope || !scope.querySelector) return null;
    const promote = scope.querySelector('a[href*="ad_center/create/listingad"][href*="target_id="]');
    const fromPromote = promote ? targetIdFromHref(promote.getAttribute('href')) : null;
    if (fromPromote) return fromPromote;
    const itemLink = scope.querySelector('a[href*="/marketplace/item/"]');
    return itemLink ? itemIdFromHref(itemLink.getAttribute('href')) : null;
  }

  // Stable per-listing key from the product photo filename. FB CDN filenames
  // start with a numeric photo id (e.g. "481234567_122...n.jpg") that is stable
  // within a session even though the query token rotates. Lets us dedupe and
  // import cards that have NO listing-id link at all.
  function imgUrlOf(img) {
    if (!img) return '';
    // Lazy imgs may carry the real CDN url in data-* or srcset before `src`
    // resolves. Prefer a real fbcdn url wherever it lives.
    const cands = [
      img.getAttribute('src'),
      img.getAttribute('data-src'),
      img.getAttribute('data-imgperflogname') ? img.getAttribute('src') : null,
      img.currentSrc,
    ].filter(Boolean);
    for (const c of cands) {
      if (/fbcdn|scontent/i.test(c)) return c;
    }
    const srcset = img.getAttribute('srcset') || '';
    if (srcset) {
      const first = srcset.split(',')[0].trim().split(/\s+/)[0];
      if (first) return first;
    }
    return cands[0] || '';
  }

  function imgKey(img) {
    const src = imgUrlOf(img);
    if (!src) return '';
    try {
      const u = new URL(src, location.origin);
      const file = (u.pathname.split('/').pop() || '');
      const m = file.match(/(\d{8,})/); // the leading photo id
      if (m) return 'img_' + m[1];
      return 'img_' + file.replace(/^[sp]\d+x\d+_?/, '').replace(/\.(jpg|jpeg|png|webp).*$/i, '');
    } catch (e) { return 'img_' + src.slice(-40); }
  }

  // Loosened product-image heuristic. FB uses lazy <img> that report 0 size
  // before load, so a strict size gate dropped real cards. Strategy:
  //  - must be an fbcdn/scontent image (excludes inline data: sprites, emoji);
  //  - explicitly reject known avatar/icon/emoji/static asset paths;
  //  - if it has real rendered size (>=60px) accept;
  //  - else (lazy / not yet measured) accept it ONLY if it sits inside a
  //    plausible card (an anchor, role=article/button/listitem, or an ancestor
  //    that shows a price) — this lets pre-load lazy imgs through while still
  //    excluding tiny chrome icons that live outside cards.
  function looksLikeAvatarOrIcon(src) {
    if (/emoji|\/rsrc\.php|static\.xx|\/images\/|spacer|sprite|reaction/i.test(src)) return true;
    // Square thumbnails that are clearly profile/avatar sizes (s32, s40, p24 …).
    if (/\/[sp]\d{2,3}x\d{2,3}\//.test(src) && /\/[sp](16|24|32|40|48|60)x/.test(src)) return true;
    return false;
  }
  function inPlausibleCard(img) {
    if (img.closest && img.closest('a[role="link"], a[href], [role="article"], [role="listitem"], [role="button"]')) return true;
    // Climb a few levels looking for a dollar amount.
    let el = img.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      if (/\$\s?[0-9]/.test(el.innerText || '')) return true;
      el = el.parentElement;
    }
    return false;
  }
  function isProductImg(img) {
    if (!img) return false;
    const src = imgUrlOf(img);
    if (!src) return false;
    if (!/fbcdn|scontent/i.test(src)) return false;
    if (looksLikeAvatarOrIcon(src)) return false;
    const w = img.clientWidth || img.naturalWidth || 0;
    const h = img.clientHeight || img.naturalHeight || 0;
    if (w >= 60 && h >= 60) return true;
    // Sized but clearly tiny (avatar that DID load) — reject.
    if (w > 0 && h > 0 && (w < 40 || h < 40)) return false;
    // Lazy / unmeasured: accept only inside a plausible card.
    return inPlausibleCard(img);
  }

  // ---- card builder ------------------------------------------------------
  function buildRow(card, img) {
    const text = (card.innerText || '');
    const listingId = findListingId(card);
    const key = listingId || imgKey(img);
    if (!key) return null;

    // Title: img alt (usually the listing title on FB) → id-anchor label →
    // card aria-label → longest non-price text line. Never drop the card.
    const titleFromImg = (img.getAttribute('alt') || '').trim();
    const idAnchor = card.querySelector
      ? card.querySelector('a[href*="/marketplace/item/"], a[href*="target_id="]')
      : null;
    const titleFromAnchor = idAnchor
      ? ((idAnchor.getAttribute('aria-label') || idAnchor.textContent || '').trim())
      : '';
    let title = (titleFromImg || titleFromAnchor || (card.getAttribute && (card.getAttribute('aria-label') || '')) || '').trim();
    if (!title || /^\$?[0-9]/.test(title) || /\.(jpg|jpeg|png|webp)$/i.test(title)) {
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => {
        if (/^\$?[0-9]/.test(s)) return false;
        if (/^(active|sold|pending|listed on|in stock|out of stock|share|boost|insights|view item|mark as|see insights|renew|edit)/i.test(s)) return false;
        if (s.length < 4) return false;
        return true;
      });
      lines.sort((a, b) => b.length - a.length);
      if (lines[0]) title = lines[0];
    }
    if (!title) {
      if (typeof window.__fbTitleDiag === 'undefined') window.__fbTitleDiag = 0;
      if (window.__fbTitleDiag < 3) {
        window.__fbTitleDiag++;
        console.log('[Facebook Content Script] DIAG no-title card', key,
          '| imgAlt=', JSON.stringify(titleFromImg),
          '| innerText=', JSON.stringify(text.slice(0, 220)));
      }
      title = listingId ? `FB ${listingId}` : (key ? `FB ${key}` : 'Untitled FB listing');
    }

    const priceMatch = text.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
    const statusMatch = text.match(/\b(Active|Sold|Pending)\b/i);
    const status = statusMatch ? statusMatch[1].toLowerCase() : undefined;
    const listedMatch = text.match(/Listed on\s+([0-9]{1,2}\/[0-9]{1,2}(?:\/[0-9]{2,4})?)/i);

    return {
      id: listingId || key,
      listing_id: listingId || undefined,
      imgKey: imgKey(img) || undefined,
      title,
      imageUrl: imgUrlOf(img) || undefined,
      price: priceMatch ? Number(priceMatch[1]) : undefined,
      status,
      sold: status === 'sold',
      listingUrl: listingId ? `https://www.facebook.com/marketplace/item/${listingId}/` : undefined,
      listed_on: listedMatch ? listedMatch[1] : undefined,
    };
  }

  // Track the last card element captured so we can scrollIntoView it as a
  // last-resort way to pull the next virtualized batch.
  let lastCardEl = null;

  // Card-first scrape: walk product photos, climb to the card that shows a
  // price, build one row per card.
  function scrapeCards() {
    const out = [];
    const seenCards = new Set();
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (!isProductImg(img)) continue;
      // Climb to the nearest ancestor that contains a "$price".
      let scope = img, card = null;
      for (let i = 0; i < 12 && scope.parentElement; i++) {
        if (/\$\s?[0-9]/.test(scope.innerText || '')) { card = scope; break; }
        scope = scope.parentElement;
      }
      if (!card) card = (img.closest && img.closest('a, [role="article"], [role="listitem"], [role="button"]')) || img.parentElement;
      if (!card || seenCards.has(card)) continue;
      seenCards.add(card);
      const row = buildRow(card, img);
      if (row) { out.push(row); lastCardEl = card; }
    }

    if (out.length === 0) emitZeroDiag();
    return out;
  }

  function emitZeroDiag() {
    try {
      const cnt = (sel) => document.querySelectorAll(sel).length;
      const allImgs = Array.from(document.querySelectorAll('img'));
      const prodImgs = allImgs.filter(isProductImg).length;
      const fbcdnImgs = allImgs.filter((i) => /fbcdn|scontent/i.test(imgUrlOf(i))).length;
      console.log('[Facebook Content Script] DIAG — 0 cards. counts:', {
        totalImgs: allImgs.length,
        fbcdnImgs,
        productImgs: prodImgs,
        itemLinks: cnt('a[href*="/marketplace/item/"]'),
        promoteLinks: cnt('a[href*="target_id="]'),
        dollarNodes: Array.from(document.querySelectorAll('span,div')).filter((e) => /^\$\s?[0-9]/.test((e.textContent || '').trim())).length,
        scrollerH: activeScroller ? activeScroller.scrollHeight : '(none)',
      });
    } catch (e) {}
  }

  // ---- accumulation ------------------------------------------------------
  // FB virtualizes the list, so accumulate every card across the whole scroll.
  // Key by imgKey (present on every card) so listing-link-less cards still
  // dedupe correctly; fold in the real listing_id whenever a render exposes it.
  const accumulated = new Map(); // key -> row

  function mergeWindow() {
    const rows = scrapeCards();
    for (const r of rows) {
      const key = r.imgKey || r.listing_id || r.id;
      if (!key) continue;
      const prev = accumulated.get(key);
      if (!prev) { accumulated.set(key, r); continue; }
      const realId = prev.listing_id || r.listing_id;
      const keepTitle = (prev.title && !/^FB /.test(prev.title) && prev.title !== 'Untitled FB listing')
        ? prev.title : (r.title || prev.title);
      accumulated.set(key, {
        ...prev,
        listing_id: realId,
        id: realId || prev.id || r.id,
        title: keepTitle,
        price: prev.price ?? r.price,
        imageUrl: prev.imageUrl || r.imageUrl,
        sold: prev.sold || r.sold,
        status: prev.status || r.status,
        listingUrl: prev.listingUrl || r.listingUrl,
        listed_on: prev.listed_on || r.listed_on,
      });
    }
    return rows.length;
  }

  function push(scrapeComplete) {
    const isSold = isSoldTab();
    const listings = Array.from(accumulated.values());
    console.log('[Facebook Content Script] pushing', listings.length, 'accumulated cards (sold=' + isSold + ')', scrapeComplete ? '(COMPLETE)' : '');
    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_TO_FIRESTORE',
        username: isSold ? 'facebook_sold_me' : 'facebook_me',
        platform: 'facebook',
        listings,
        scrapeComplete,
      }, () => { /* ignore response */ });
    } catch (e) { console.warn('[Facebook Content Script] sendMessage failed:', e); }
  }

  function scheduleScrape() {
    if (scrapeTimer) clearTimeout(scrapeTimer);
    scrapeTimer = setTimeout(() => { mergeWindow(); push(false); }, 1200);
  }

  // ---- scroll container --------------------------------------------------
  // Build a ranked list of candidate scrollers. FB's selling list scrolls
  // inside an inner div, not the window, but WHICH div varies — and computed
  // overflowY is not always reported as auto/scroll. So we keep several
  // candidates and let the runtime VERIFY which one actually advances the load.
  function scrollableScore(el) {
    return (el.scrollHeight || 0) - (el.clientHeight || 0);
  }
  function candidateScrollers() {
    const list = [];
    const doc = document.scrollingElement || document.documentElement;
    if (doc) list.push(doc);
    const els = document.querySelectorAll('div, main, section, [role="main"], [role="feed"]');
    const scored = [];
    for (const el of els) {
      const score = scrollableScore(el);
      if (score < 400) continue;
      const oy = getComputedStyle(el).overflowY;
      // Accept auto/scroll/overlay; ALSO keep big-overflow elements regardless
      // of computed overflow (FB sometimes scrolls via JS / transform).
      const overflowOk = (oy === 'auto' || oy === 'scroll' || oy === 'overlay');
      scored.push({ el, score, overflowOk });
    }
    // Overflow-friendly elements first, then by raw overflow size, biggest first.
    scored.sort((a, b) => (Number(b.overflowOk) - Number(a.overflowOk)) || (b.score - a.score));
    for (const s of scored) if (!list.includes(s.el)) list.push(s.el);
    return list;
  }

  // The scroller we're currently committed to (verified or best-guess).
  let activeScroller = null;

  function largestOverflowEl() {
    let best = null, bestScore = -1;
    const els = document.querySelectorAll('div, main, section');
    for (const el of els) {
      const score = scrollableScore(el);
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return best;
  }

  function isDocScroller(el) {
    return el === document.scrollingElement || el === document.documentElement || el === document.body;
  }

  function scrollEl(el, step) {
    try {
      if (!el || isDocScroller(el)) {
        window.scrollBy(0, step);
      } else {
        el.scrollTop = el.scrollTop + step;
      }
    } catch (e) {}
  }

  // One scroll "tick": push the active scroller, and ALWAYS also nudge window,
  // document.scrollingElement, and the largest-overflow element so a wrong
  // pick can't fully stall us. As a last resort, pull the last captured card
  // into view to coax the next virtualized batch.
  function scrollAllStrategies() {
    const ah = activeScroller ? Math.round((activeScroller.clientHeight || window.innerHeight) * 0.85)
                              : Math.round(window.innerHeight * 0.85);
    scrollEl(activeScroller, ah);
    try { window.scrollBy(0, Math.round(window.innerHeight * 0.85)); } catch (e) {}
    const ds = document.scrollingElement;
    if (ds && ds !== activeScroller) scrollEl(ds, ah);
    const lo = largestOverflowEl();
    if (lo && lo !== activeScroller && !isDocScroller(lo)) scrollEl(lo, ah);
    if (lastCardEl && lastCardEl.scrollIntoView) {
      try { lastCardEl.scrollIntoView({ block: 'end' }); } catch (e) {}
    }
  }

  function atBottomOf(el) {
    try {
      if (!el || isDocScroller(el)) {
        return (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 120);
      }
      return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 120);
    } catch (e) { return true; }
  }

  let scrapeTimer = null;
  let scrollTimer = null;

  function startAutoScroll() {
    if (scrollTimer) clearInterval(scrollTimer);
    accumulated.clear();
    lastCardEl = null;
    window.__fbTitleDiag = 0;

    // Pick a starting scroller (best guess); the loop will re-verify it.
    const cands = candidateScrollers();
    activeScroller = cands[0] || document.scrollingElement || document.documentElement;
    let candIdx = 0;
    let verified = false;

    console.log('[Facebook Content Script] scroller candidates:', cands.length,
      '| starting with', isDocScroller(activeScroller) ? 'window/document' : (activeScroller.className || activeScroller.tagName),
      '| scrollHeight=', activeScroller ? activeScroller.scrollHeight : '(none)');

    let stableTicks = 0;       // consecutive ticks with no NEW cards while at bottom
    let lastCount = -1;        // accumulated size at start of the current stretch
    let growthCheckCount = -1; // count snapshot for unverified-scroller growth check
    let ticksSinceSwitch = 0;
    let ticks = 0;

    scrollTimer = setInterval(() => {
      ticks++;
      ticksSinceSwitch++;

      scrollAllStrategies();
      mergeWindow();
      push(false);

      // --- Scroller verification: if the current scroller isn't producing new
      // cards after a few ticks, rotate to the next candidate. Once a scroller
      // grows the accumulation, lock it in as verified. ---
      if (!verified) {
        if (growthCheckCount === -1) growthCheckCount = accumulated.size;
        if (accumulated.size > growthCheckCount) {
          verified = true;
          console.log('[Facebook Content Script] scroller verified — grows accumulation. size=', accumulated.size);
        } else if (ticksSinceSwitch >= 3) {
          candIdx++;
          if (cands[candIdx]) {
            activeScroller = cands[candIdx];
            ticksSinceSwitch = 0;
            growthCheckCount = accumulated.size;
            console.log('[Facebook Content Script] switching scroller →',
              isDocScroller(activeScroller) ? 'window/document' : (activeScroller.className || activeScroller.tagName),
              '| scrollHeight=', activeScroller.scrollHeight);
          } else {
            // Exhausted candidates: fall back to largest-overflow element and
            // rely on the all-strategies nudge (incl. scrollIntoView).
            activeScroller = largestOverflowEl() || document.scrollingElement;
            verified = true; // stop rotating; keep scrolling everything.
            console.log('[Facebook Content Script] no growing scroller found — falling back to all-strategies scroll. ',
              isDocScroller(activeScroller) ? 'window/document' : (activeScroller && (activeScroller.className || activeScroller.tagName)));
          }
        }
      }

      // --- Completion: only consider done once we're at the bottom AND the
      // accumulation has stopped growing for several consecutive ticks. The
      // generous 120px bottom margin + multi-strategy scroll avoid the old
      // "stop halfway" because window said it was at the bottom. ---
      const grewThisStretch = accumulated.size !== lastCount;
      if (atBottomOf(activeScroller) && !grewThisStretch) {
        stableTicks++;
        if (stableTicks >= 6) {
          clearInterval(scrollTimer);
          scrollTimer = null;
          mergeWindow();
          if (accumulated.size === 0) emitZeroDiag();
          console.log('[Facebook Content Script] auto-scroll done, final push (' + accumulated.size + ' cards)');
          push(true);
        }
      } else {
        stableTicks = 0;
        lastCount = accumulated.size;
      }

      // Hard safety cap: never spin forever (anti-ban + avoids runaway loops).
      if (ticks > 240) {
        clearInterval(scrollTimer);
        scrollTimer = null;
        mergeWindow();
        console.log('[Facebook Content Script] auto-scroll hit tick cap, final push (' + accumulated.size + ' cards)');
        push(true);
      }
    }, 1400);
  }

  function maybeStartScrape() {
    if (!isSellerHub()) return;
    console.log('[Facebook Content Script] seller hub detected — starting scrape (sold=' + isSoldTab() + ')');
    if ((location.hash || '').toLowerCase().includes('autoscroll')) {
      setTimeout(startAutoScroll, 1500);
    } else {
      setTimeout(scheduleScrape, 2000);
    }
  }

  let lastUrl = location.href;
  const urlWatcher = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
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
