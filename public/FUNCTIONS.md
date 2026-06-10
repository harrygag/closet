# FUNCTIONS.md — RetroThriftCo Virtual Closet

Alphabetized reference for every Cloud Function, service-layer function,
store action, and major UI handler. Paired with `ARCHITECTURE.md`. Format
per entry:

- **File:** absolute-ish path with line range
- **Signature**
- **What it does** — single paragraph
- **Reads** — Firestore + store state
- **Writes** — Firestore + store mutations
- **Cloud Function calls** — which CFs it invokes
- **Side effects** — `window.open`, toasts, console
- **Used by** — callers
- **Edge cases / limitations**

If a function is trivial (one-line wrapper) it gets a compressed entry.

---

## A. Cloud Functions

All in `functions/src/`. Region: default `us-central1`. **1st gen** unless
noted. Two invocation conventions are in play and they call from the client
differently:

- **`functions.https.onCall(...)`** → client uses `httpsCallable(functions, '<name>')`
  + `await fn(data)`. Auth is automatic via the SDK.
- **`functions.https.onRequest(...)`** → public HTTPS endpoint (CORS-handled).
  Client must `fetch()` it directly, attach the Firebase Auth ID token as a
  `Bearer` header, and unwrap `res.data` from the response body. Used for the
  `gologin*` functions because long-running puppeteer jobs need finer control
  over timeouts than `onCall` exposes.

### `clearPlatformBindings`
- **File:** `functions/src/match.ts:567`
- **Signature:** `onCall({ platform: 'poshmark' | 'depop' })`
- **What it does:** Clears `PlatformListing.itemId` for every binding on the given platform AND nulls the `Item.{platform}ListingId` / `{platform}Url` back-pointers. Used to wipe stale bindings before re-running the matcher.
- **Reads:** `PlatformListing where userId=auth.uid, platform=<arg>`; `Item where id in itemIdsToClear`
- **Writes:** `PlatformListing/{...} { itemId: null }`; `Item/{...} { poshmarkListingId|depopListingId: null, poshmarkUrl|depopUrl: null }`
- **Side effects:** logs
- **Used by:** `ClosetView.handleRedoMatches` (and the per-page Match button "Redo" path)

### `depopDelistItem`
- **File:** `functions/src/index.ts:6135`; helper `functions/src/depop-service.ts:102 depopDeleteListing`
- **Signature:** `onCall({ productId: string })` → `depopDeleteListing(token, productId)` return shape
- **What it does:** Deletes a Depop listing via Depop's product DELETE endpoint using the user's stored Depop bearer token from `depop_cookies/{userId}`.
- **Reads:** `depop_cookies/{userId}` via `getDepopCredentials(uid)`
- **Writes:** none in Firestore (Depop-side delete only)
- **Side effects:** outbound HTTPS call to unofficial Depop API
- **Used by:** `DepopUnmatchedModal` per-row + bulk delist, `ClosetView.handleBulkDelistDepop`
- **Edge cases:** Depop's API is unofficial and the token can silently expire — failures are thrown as `HttpsError` and surfaced in toast.

### `depopGetAllListings`
- **File:** `functions/src/index.ts:6117`
- **Signature:** `onCall({ username: string })` → `{ success: true, listings: any[], count: number }`
- **What it does:** Calls `depopGetListings(token, username)` (unofficial Depop API) to pull every active listing for a Depop username.
- **Reads:** `depop_cookies/{userId}`
- **Runs with:** `timeoutSeconds: 120, memory: 512MB`
- **Used by:** `MarketplaceImporter`, `ClosetView.handleSyncFromDepop`

### `depopListItem`
- **File:** `functions/src/index.ts:6126`; helper `depopCreateListing` in `depop-service.ts:88`
- **Signature:** `onCall({ description, priceCents, categoryId, pictures, shipping })` → `{ success, productId, listingUrl }`
- **Used by:** `ListToDepopModal`

### `depopMarkItemSold`
- **File:** `functions/src/index.ts:6143`
- **Signature:** `onCall({ productId })` → `{ success: boolean }`
- **Used by:** Cross-platform sale orchestrator path (when an item sells elsewhere, mark sold on Depop) — **planned**, not yet wired (444-139).

### `depopUpdateItemPrice`
- **File:** `functions/src/index.ts:6151`
- **Signature:** `onCall({ productId, priceCents })` → `{ success: boolean }`
- **Used by:** `ClosetView.handleBulkPriceUpdate`

### `ebayBackfillSoldHistory`
- **File:** `functions/src/index.ts:6235`
- **Signature:** `onCall()` → `{ success, ordersFetched, itemsUpdated, salesAppended, itemsSkipped }`
- **Runs with:** `timeoutSeconds: 300, memory: 1GB`
- **What it does:** Backfills `Item.unitSales[]` from eBay's order history (last 90 days). Paginates `/sell/fulfillment/v1/order?limit=200` until `hasMore=false`, builds a `Map<legacyItemId, OrderLineInfo[]>` of `{ orderId, creationDate, priceCents, buyer }`, then for each `Item` with a matching `ebayListingId` it appends one `unitSales` entry per order line and one `itemActivity` row. Skips orders not in `PAID`/`FULFILLED` payment status. Caps `unitSales` at `MAX_UNIT_SALES=200` and `itemActivity` at `MAX_ITEM_ACTIVITY=50`.
- **Reads:** eBay Fulfillment API; `Item where ebayListingId in <map keys>`
- **Writes:** `Item/{...} { unitSales: [...], itemActivity: [...] }`
- **Used by:** one-shot admin script (not wired to UI)

### `ebayBackupPhotos`
- **File:** `functions/src/index.ts:2054`
- **Signature:** `onCall({ itemId: string, photoUrls: string[] })` → `{ success, photosDownloaded, photosFailed, photos[], errors[] }`
- **What it does:** Downloads each eBay photo URL and uploads to Firebase Storage, returning the storage URLs alongside any errors.

### `ebayCallback` (HTTP)
- **File:** `functions/src/index.ts:302`
- **Signature:** `onRequest(req, res)` — eBay OAuth code → token exchange
- **Reads:** `ebay_pending_oauth/{state}`
- **Writes:** `ebay_credentials/{userId}` with access + refresh tokens; deletes `ebay_pending_oauth/{state}`
- **Used by:** eBay OAuth redirect callback

### `ebayCreateListing`
- **File:** `functions/src/index.ts:3097`
- **What it does:** Creates an eBay listing via Trading API `AddItem`.

### `ebayDisconnect`
- **File:** `functions/src/index.ts:695`
- **What it does:** Deletes `ebay_credentials/{userId}`.

### `ebayEndItem`
- **File:** `functions/src/index.ts:3299`
- **Signature:** `onCall({ itemId: string, endingReason?: string })` → `{ success, itemId, endTime }`
- **What it does:** Ends an active eBay listing via Trading API `EndItem` with default reason `'NotAvailable'`.
- **Reads:** `ebay_credentials/{userId}` via `callTradingAPI`
- **Used by:** `ClosetView.handleBulkStatusChange` (when `endEbayListings=true`), cross-platform delist on non-eBay sale

### `ebayFetchInventory` / `ebaySyncListings` / `ebayGetOrders` / `ebayGetStats` / `ebayStatus`
- **Files:** `functions/src/index.ts:495 / 537 / 656 / 716 / 440`
- **What they do:** Standard inventory + orders + stats fetches against eBay Trading API for `/ebay` integration page and `useEbayStore`.

### `ebayGetAllListings`
- **File:** `functions/src/index.ts:1579`
- **Signature:** `onCall({ fetchAll?: boolean, page?: number, pageSize?: number })` → `{ success, listings: Array<{ itemId, title, currentPrice, currency, quantity, quantityAvailable, quantitySold, listingType, viewItemURL, pictureURLs[], sku, condition }>, page, pageSize, totalPages, total }`
- **What it does:** Fetches every active eBay listing for the user (paginated `GetSellerList` calls with `EntriesPerPage=200`). Returns flat list with qty fields. This is the **source of truth** for `Check Quantity`.
- **Reads:** `ebay_credentials/{userId}`
- **Runs with:** `timeoutSeconds: 300, memory: 1GB`
- **Used by:** `ClosetView.handleCheckEbayQuantities` (300s client timeout); `ebayService.getAllListings`

### `ebayGetAllOffers` / `ebayGetAllPolicies` / `ebayGetBulkWatchers` / `ebayGetBuyerOffers` / `ebayGetCategorySuggestions` / `ebayGetCompletedItems` / `ebayGetFulfillmentPolicies` / `ebayGetInventoryLocations` / `ebayGetItemDetails` / `ebayGetItemWatchers` / `ebayGetListingCount` / `ebayGetListingsPreview` / `ebayGetMarketTrends` / `ebayGetOffer` / `ebayGetOffers` / `ebayGetPaymentPolicies` / `ebayGetReturnPolicies`
- **Files:** various in `functions/src/index.ts`
- Self-explanatory eBay API wrappers used by promotion / offer / inventory features.

### `ebayImportAll`
- **File:** `functions/src/index.ts:2155`
- **Signature:** `onCall({ deleteExisting?: boolean })` → `{ success, totalFromEbay, imported, skipped }`
- **Runs with:** `timeoutSeconds: 540, memory: 2GB`
- **What it does:** Paginates `GetSellerList` with `DetailLevel=ReturnAll`, `EntriesPerPage=200`, `EndTimeFrom`=now / `EndTimeTo`=now+120d. Parses each `<Item>` XML into `{ itemId, title, currentPrice, currency, quantity, listingType, viewItemURL, pictureURLs[], sku, condition, conditionID, primaryCategoryID, primaryCategoryName, itemSpecifics }`. Optionally deletes all existing `Item` docs for the user first. Skips imports whose `ebayListingId` already exists. Generates barcodes as `INV-{YYYYMMDD}-{userPrefix}-{NNNNN}`. Commits in batches of 500. Stops at `pageNumber > 100`.
- **Item payload shape written:** `{ user_uuid, title, size, status: 'IN_STOCK', normalizedTags, imageUrls, manualPriceCents, purchasePriceCents: null, soldPriceCents: null, notes: 'Brand: X. Condition: Y', conditionNotes: '', brand, category, barcode, ebayListingId, ebayUrl, sku, ebayData: { condition, conditionID, primaryCategoryID, primaryCategoryName, itemSpecifics, pictureURLs, currency, quantity, listingType }, createdAt, updatedAt }`
- **Reads:** eBay Trading API; `Item where user_uuid=userId` (for dedup)
- **Writes:** `Item/{auto}` × N (batched)
- **Used by:** `ebayService.importAllFromEbay` (10-min client timeout), `EbayImportModal`

### `ebayImportPage`
- **File:** `functions/src/index.ts:2408`
- **Signature:** `onCall({ page: number, pageSize: number })` → `{ success, page, totalPages, totalEntries, hasMoreItems, imported, skipped, pageItems }`
- **What it does:** Paginated version of `ebayImportAll`. Imports one page at a time so the UI can show progress.
- **Used by:** `ebayService.importPage`, `EbayImportModal`

### `ebayInventoryCreateItem` / `ebayInventoryCreateOffer` / `ebayInventoryPublishOffer` / `ebayInventoryWithdrawOffer` / `ebayInventoryGetListingFees` / `ebayInventoryCreateAndPublish`
- **Files:** `functions/src/index.ts:3506 / 3595 / 3686 / 3738 / 3788 / 3845`
- **What they do:** New-API (Sell Inventory v1) listing creation + offer lifecycle.

### `ebayOAuthUrl` (HTTP)
- **File:** `functions/src/index.ts:223`
- **What it does:** Generates eBay OAuth consent URL, stashes `state` → `userId` in `ebay_pending_oauth/{state}`, redirects browser to eBay.

### `ebayRelistItem` / `ebayReviseItemPrice`
- **Files:** `functions/src/index.ts:3444 / 3349`
- Standard Trading API wrappers.

### `ebayReviseItemQuantity`
- **File:** `functions/src/index.ts:3401`
- **Signature:** `onCall({ itemId, quantity })` → `{ success, itemId, quantity }`
- **What it does:** Calls Trading API `ReviseItem` with new `<Quantity>`. Primary lever for the cross-platform decrement orchestrator (444-139).

### `ebaySendBulkOffers` / `ebaySendBulkOffersToWatchers` / `ebaySendBulkOffersWithPrices` / `ebaySendBuyerOffer` / `ebaySendBuyerOfferWithPrice` / `ebaySendOfferToWatchers`
- **Files:** `functions/src/index.ts:4735 / 4930 / 4797 / 4360 / 4426 / 4860`
- Promotion / offer cluster.

### `ebayUpdateAllQuantities`
- **File:** `functions/src/index.ts:1388`
- **What it does:** Batch-revises quantities for many listings at once (admin-side reconciliation tool).

### `ebayUpdateOffer` / `ebayDeleteOffer`
- **Files:** `functions/src/index.ts:4081 / 4113`

### `findItemBySKU`
- **File:** `functions/src/index.ts:5703`
- **Signature:** `onCall({ sku: string })` → matched item
- **Used by:** scan flow + barcode lookups

### `fixItemData` / `deleteAllItems` / `deleteAllItemsHTTP` / `deleteBrokenItems` / `deleteBrokenItemsHTTP` / `deleteItemsWithoutEbay`
- **Files:** `functions/src/index.ts:816 / 971 / 1118 / 1017 / 1068 / 3032`
- Admin cleanup utilities.

### `gmailFetchInventoryCSVs` / `gmailOAuthUrl` / `gmailCallback`
- **Files:** `functions/src/index.ts:6165 / 6183 / 6197`
- **What they do:** Pull eBay + Poshmark inventory CSVs via Gmail API. The OAuth flow writes `gmail_credentials/{userId}` with `{ accessToken, refreshToken, expiresAt }`.

### `gologinAction` / `gologinListProfiles` / `gologinCreateProfile` / `gologinStartProfile` / `gologinStopProfile`
- **Files:** `functions/src/index.ts:5927 / 6030 / 6040 / 6051 / 6063`
- **What they do:** Wrap GoLogin browser-profile lifecycle (used by Poshmark automation).

### `gologinDelistItem` (HTTP — onRequest)
- **File:** `functions/src/index.ts:6075`; helper `delistFromPlatform` in `gologin-service.ts`
- **Runs with:** `timeoutSeconds: 300, memory: 512MB`
- **Request body shape:** `{ platform: 'poshmark'|'depop', itemUrl: string, profileId: string }` (accepts both `{ data: {...} }` wrapper from `httpsCallable` and raw body).
- **Auth:** Requires `Authorization: Bearer <ID_TOKEN>` header — verified by `verifyAuth(req)`. The client cannot use `httpsCallable` for these — it must `fetch()` directly with the user's `getIdToken()` attached.
- **What it does:** Spins up a GoLogin browser profile via the GoLogin Cloud API, drives the platform's delist UI via Puppeteer, returns `{ data: { success: boolean } }`.
- **Used by:** `PoshmarkUnmatchedModal` per-row delist; cross-platform orchestrator for Poshmark
- **Edge cases:** GoLogin profiles are user-provisioned — `profileId` MUST be a valid GoLogin profile id. Cold-start can take 30-60s before Puppeteer is ready.

### `gologinMarkSold` (HTTP — onRequest)
- **File:** `functions/src/index.ts:6087`; helper `markSoldOnPlatform`
- **Runs with:** `timeoutSeconds: 300, memory: 512MB`
- **Request body shape:** `{ platform, itemUrl, profileId }` (same call convention as `gologinDelistItem`).
- **Used by:** cross-platform orchestrator when same item sold elsewhere (planned wiring)

### `gologinSyncListings` (HTTP — onRequest)
- **File:** `functions/src/index.ts:6099`; helper `getListingsFromPlatform`
- **Runs with:** `timeoutSeconds: 300, memory: 1GB`
- **Request body shape:** `{ platform, profileId }`
- **Returns:** `{ data: { success: true, listings: any[], count: number } }`
- **What it does:** Browser-driven scrape of active listings on a platform. Alt path to the Chrome extension scrape (used when extension isn't installed).

### `importCSVData`
- **File:** `functions/src/index.ts:1164`
- **Signature:** `onCall({ items: any[] })` → `{ success, imported }`
- **What it does:** Bulk import of Vendoo / generic CSV rows → `Item` docs. Per row writes `{ user_uuid, title, size: row.color, status: row.status === 'Sold' ? 'SOLD' : 'IN_STOCK', normalizedTags: [row.category || 'Clothing'], imageUrls: row.image ? [row.image] : [], manualPriceCents: round(row.price * 100), purchasePriceCents: round(row.cost * 100), notes: 'Brand: X. Condition: Y', conditionNotes: row.description, brand, category, barcode: row.sku || 'VC-{ts}-{rand}', listingPlatforms: row.platforms, createdAt, updatedAt }`. Commits every 500 rows.
- **Note:** This is the **Vendoo CSV format** — the assumed CSV columns are `title`, `color`, `status`, `category`, `image`, `price`, `cost`, `description`, `brand`, `condition`, `sku`, `platforms`. **[NEEDS VERIFY]** with an actual Vendoo export when the user touches this path again — column names may have drifted.

### `managePromotedListings`
- **File:** `functions/src/index.ts:5056`
- **What it does:** Enable/disable/update ad rate on promoted listings.

### `matchListingsWithAI`
- **File:** `functions/src/match.ts:151`
- **Signature:** `onCall({ onlyItemIds?, onlyListingIds?, onlyPlatform?, runId?, excludeMap? })` → `{ success, runId, proposedMatches, candidatesByListing, stats }`
- **What it does:** Server-side **deterministic** multi-signal matcher (no AI despite the legacy name). Reads all `Item` + `PlatformListing` for the user, normalizes both sides, applies hard rejects (size mismatch, color synonyms, category, brand bidirectional) and scores positive signals: S1 description prefix (50), S2 title prefix (40), S3 identifier proper-noun (25), S4 Jaccard overlap (0-20), S5 all-structured agreement (15), S6 jersey number (10), S7 substring (30 when S1 doesn't fire). Hockey numeric sizing handled via `JERSEY_SIZE_MAP`. Returns top decision per listing + top 3 candidates per listing.
- **Reads:** `Item where user_uuid=auth.uid`, `PlatformListing where userId=auth.uid, status='active'`
- **Writes:** `aiMatchRuns/{runId}` meta + `aiMatchRuns/{runId}/events/{idx}` event stream (when runId present)
- **Used by:** `PlatformMatchModal` (per-page Match flow on `/depop` + `/poshmark`)

### `onActivityLogCreate` (Firestore trigger)
- **File:** `functions/src/activityLogTrigger.ts:21`
- **Trigger:** `ActivityLog/{activityId}` onCreate
- **What it does:** On a `SCAN` or `CHECK_IN` activity, updates the target `Item` cache: `lastScannedDate`, `scanCount` (incremented), `verificationStatus` (`verified`/`needs-verification`/`overdue` per `calculateVerificationStatus`), or `lastCheckInDate`.
- **Writes:** `Item/{itemId}`

### `onPlatformListingCreate` (Firestore trigger)
- **File:** `functions/src/platformListingFirstSeen.ts:15`
- **Trigger:** `PlatformListing/{listingKey}` onCreate
- **What it does:** Sets `firstSeenAt` exactly once when the doc is first created. This guarantees baseline preservation: client `upsertListings` never writes `firstSeenAt`, so even after thousands of re-runs the original calibration timestamp is immutable.
- **Writes:** `PlatformListing/{listingKey} { firstSeenAt }`

### `recalculateVerificationStatus`
- **File:** `functions/src/activityLogTrigger.ts:107`
- **What it does:** Bulk backfill of `Item.verificationStatus` based on `lastScannedDate`. Manual one-shot.

### `getInventoryScanStats`
- **File:** `functions/src/activityLogTrigger.ts:155`
- **What it does:** Returns aggregated scan stats for the ScanStatsWidget.

### `saveMarketplaceSync`
- **File:** `functions/src/marketplaceSync.ts:14`
- **Signature:** `onCall({ platform, username, listings })` → `{ success, count }`
- **What it does:** Persists OpenClaw-extracted listings into `marketplaceData/{userId}` with `{ platform, username, listings, lastSync }`.
- **Writes:** `marketplaceData/{userId}` (merge)
- **Used by:** OpenClaw bot client

### `syncWebhook` (HTTP)
- **File:** `functions/src/index.ts:5436`
- **What it does:** Public webhook called by the Chrome extension. Accepts `{ cookies, user_info, listings, sync_code, platform }`. Deduplicates listings (active: by `l.id`, sold: by `purchaseId:id` composite to preserve repeat sales), then stores at `marketplaceData/{username}` (or `users/{userId}/marketplaceData/sync` if `sync_code` resolved). Smart-merge keeps the larger dataset.
- **Reads:** `authSyncCodes/{sync_code}` (optional)
- **Writes:** `marketplaceData/{username}` or `users/{userId}/marketplaceData/sync`

### `getMarketplaceData` (HTTP)
- **File:** `functions/src/index.ts:5571`
- **What it does:** Public read endpoint for `marketplaceData/{username}`.

### `getShopifyOrders` / `syncItemToShopify` / `shopifyWebhook`
- **Files:** `functions/src/index.ts:2909 / 2939 / 2786`
- Shopify integration.

### `getUserData` / `generateAuthCode`
- **Files:** `functions/src/index.ts:5614 / 5664`

### `aiAssistant`
- **File:** `functions/src/ai-assistant.ts:917`
- **What it does:** Conversational assistant CF (Anthropic SDK). NOTE: NOT in the matcher path — matcher is fully deterministic.

---

## B. Inventory Services (`src/services/inventory/`)

### `listingMatcher.ts`

#### `findEbayMatchForListing(title, size, ebayItems, minConfidence=0.15)` → `EbayMatchResult | null`
- **File:** `src/services/inventory/listingMatcher.ts:660`
- **Signature:** `function findEbayMatchForListing(title: string, size: string, ebayItems: Item[], minConfidence = 0.15): EbayMatchResult | null`
- **What it does:** Score every eBay item against a single Depop/Poshmark listing using three strategies in order: **Strategy A** (player + size exact — confidence 0.92 if unique, 0.88 if color-narrowed), **Strategy B** (sport + jersey number exact — confidence 0.85 if unique, 0.83 if size-narrowed), **Strategy C** (full `computeConfidence` scoring against the whole pool). Slug-derived titles with dashes get the trailing hash suffix stripped and dashes replaced with spaces. Filler phrases like `"The product is a size XL..."` are stripped by `cleanDescriptiveTitle`. Returns null if the input has fewer than 2 keywords after cleaning, or if the best score is under the (possibly adjusted) min threshold. For long original titles (>80 chars, i.e. descriptions pasted as titles), the threshold is auto-relaxed to `min(minConfidence, 0.15)`.
- **Used by:** `ClosetView.handleCalibrateBaseline` and `handleReconciliationFromSyncData` fuzzy-match passes

#### `findTopEbayMatchesForListing(title, size, ebayItems, count=3, exclude=Set, minConfidence=0.15)` → `EbayMatchResult[]`
- **File:** `src/services/inventory/listingMatcher.ts:603`
- **Signature:** `function findTopEbayMatchesForListing(title: string, size: string, ebayItems: Item[], count = 3, exclude: Set<string> = new Set(), minConfidence = 0.15): EbayMatchResult[]`
- **What it does:** Returns top-N matches via `computeConfidence` (does NOT use Strategy A/B shortcuts — every candidate is scored uniformly so the user can pick a different one). The `exclude` set is the per-row "already shown these — give me the next 3" mechanism: each click of Reload grows the set with the previously-shown candidates so subsequent calls return fresh top-3.
- **Used by:** `DepopImportModal`, `PoshmarkImportModal` per-row candidate generation

#### `computeConfidence(ebayNorm, otherNorm, ebayItem, otherItem)` → `{ confidence, breakdown }`
- **File:** `src/services/inventory/listingMatcher.ts:335` (internal — not exported)
- **Scoring weights (actual code):**
  - `bestTitleSim * 0.6` where `bestTitleSim = max(keywordCoverage, wordOverlapSimilarity)`
  - `+ 0.20` if `playerMatch` (both sides extracted same `extractPlayer` result)
  - `+ 0.12` if `sizeMatch` (letter-equivalent — see below)
  - `+ 0.08` if `colorMatch` (both extract same color via `extractColor`/`KNOWN_COLORS`)
  - Capped at `1.0`
- **Hard fast-path:** if `hasExactPlatformLink(ebayItem, otherItem)` returns true (i.e., both items reference the same `ebayListingId`), returns `{ confidence: 1.0, breakdown: { all true, titleSimilarity: 1.0 } }` immediately.
- **Size-match logic:** uses `extractSizeLetter(size)` on both sides. That helper returns the letter for pure letter sizes (`"L"` → `"L"`), the trailing letter for combined sizes (`"50-L"` → `"L"`), normalizes `2XL→XXL` / `3XL→XXXL`, and looks up pure numerics in `JERSEY_SIZE_MAP` (`52 → "L"`). Two sides match only when both extract a letter and the letters are equal — so eBay "L" and Depop "52" match. **There is no strict-equality fallback** — if either side can't extract a letter, `sizeMatch=false`.
- **Returns:** `{ confidence: number, breakdown: { playerMatch, sizeMatch, colorMatch, titleSimilarity } }`

#### `extractSizeLetter(size)` → `string | null`
- **File:** `src/services/inventory/listingMatcher.ts:312` (internal)
- **JERSEY_SIZE_MAP:** lives in `src/services/ebay/import.ts`. Hockey/jersey numeric → letter equivalence (e.g. `46→S, 50→M, 52→L, 54→XL, 56→XXL`). Lets the matcher accept "Size 52" against an eBay "Large" jersey.

#### `extractKeywords(title)` → `string[]`
- **File:** `:23` (internal)
- **What:** Lowercases, strips non-alphanumerics, splits on whitespace, filters length ≥ 2 AND not in `STOP_WORDS`. Stop-words include `the, a, an, and, or, for, in, on, of, to, with, new, nwt, nwot, size, mens, men, womens, women, youth, free, shipping, fast, brand, authentic, official, licensed, item, listing, description, condition, details`.

#### `keywordCoverage(titleA, titleB)` → `number 0..1`
- **File:** `:232` (internal)
- **What:** Asymmetric Jaccard — uses the **shorter keyword list** as denominator and counts how many shorter keywords appear in the longer set. Better for short Depop titles vs long eBay descriptions than symmetric overlap.

#### `extractJerseyNumber(title)` → `number | null`
- **File:** `:204` (internal)
- **What:** Looks for `#N`, `number N`, or `N jersey/player`. Range-checked 0..99.

#### `stripDescriptionHtml(html)` → `string`
- **File:** `:35`
- **What:** Strips HTML tags + decodes common entities (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Removes `<style>` and `<script>` blocks entirely.

#### `descriptionToPlainText(rawHtml)` → `string`
- **File:** `:65`
- **What:** Two-pass entity decode (handles `&amp;apos;` → `&apos;` → `'`) plus curly-quote normalization. Output is lowercased and whitespace-collapsed. Used so a Depop scraper that embeds an eBay description in the title field can be matched via `startsWith`.

#### `isDescriptionPrefixMatch(rowTitle, plainDesc)` → `boolean`
- **File:** `:110`
- **What:** Bidirectional prefix check after normalization. Requires `rowTitle.length >= 20` after normalize to avoid generic prefixes like `"the product is"` matching everything.

#### `tokenizeDescription(rawHtml, maxTokens=200)` → `string[]`
- **File:** `:125`
- **What:** Tokenizes an eBay full description (stop-word filtered) and caps at 200 tokens so TF doesn't dominate scoring on items with massive descriptions.

#### `cleanDescriptiveTitle(raw)` → `string`
- **File:** `:144`
- **What:** Strips AI/scraper-generated filler from titles before fuzzy matching. Targets prefixes (`"The product is a"`, `"Brand new with tags"`), mid-text padding (`"featuring the player"`, `"officially licensed"`, `"in the colors of"`, `"perfect for fans of"`), and trailing boilerplate. Deterministic regex — no ML. Collapses to a clean meaningful-token string.

#### `matchInventory(items, options?)` → `MatchingResult`
- **File:** `:433`
- **What:** Cross-platform multi-side matcher. Separates items by `classifyPlatform`, normalizes all, matches Posh → eBay (sorted by items already linked first), then Depop → eBay (independently), then merges so a single eBay item can carry both a Posh and Depop match. Items go to `matched[]` if both sides scored `>= autoThreshold` (default 0.7), to `reviewQueue[]` if either side is review-level (default 0.4). Unmatched lists returned for the missing-link UI.

### `listingNormalizer.ts`

#### `normalizeListing(item, platform)` → `NormalizedListing`
- **File:** `src/services/inventory/listingNormalizer.ts:39`
- **What it does:** Parses an `Item` (or scraped listing) into `{ player, size, color, jerseyType, sport, team, rawTitle, sourceItemId, sourcePlatform }`. For eBay, augments `rawTitle` with the first 240 chars of cleaned `ebayFullDescription` so keyword scoring captures description tokens (player, color, etc. that often live below the title).

#### `extractPlayer(title)` → `string | null`
- **File:** `:79` — delegates to `resolvePlayerName` (alias dictionary in `playerAliases.ts`).

#### `extractColor(title, itemSpecifics?)` → `string | null`
- **File:** `:86` — checks `itemSpecifics.Color` first, falls back to `KNOWN_COLORS` regex scan.

#### `detectJerseyType(title)` → `'fanatics' | 'authentic' | 'unknown'`
- **File:** `:116`

#### `detectSport(title, itemSpecifics?)` → `'nhl' | 'nfl' | 'mlb' | 'soccer' | null`
- **File:** `:129`

### `saleSnapshot.ts`

#### `writeSnapshotBatch(userId, inputs, status='baseline')` → `WriteSnapshotBatchResult`
- **File:** `src/services/inventory/saleSnapshot.ts:143`
- **Signature:** `async function writeSnapshotBatch(userId: string, inputs: SnapshotInput[], status: SaleSnapshotStatus = 'baseline'): Promise<WriteSnapshotBatchResult>`
- **What it does:** The cross-status, cross-source dedup core of the sales log. For every platform present in `inputs`, fetches the existing `Set<saleKey>` AND the existing `Set<contentFingerprint>` (where fingerprint = `normalizeTitleForMatch(title)|salePrice.toFixed(2)`, see below). Then for each input: skip if saleKey already exists for that platform (any status), else skip if content fingerprint already exists, else write a new `SaleSnapshot` doc with the given status. Batched at 400 ops. Strips `undefined` fields before write (Firestore rejects them). Returns `{ inserted, skipped, perPlatform, insertedIds, insertedByPlatform }`.
- **The baseline preservation guarantee:** because `getSnapshot(userId, platform)` returns rows of ALL statuses (no status filter), any `'pending'` write whose key OR fingerprint matches a `'baseline'` row is silently skipped. The user's baseline is untouchable from any subsequent flow.
- **Reads:** `SaleSnapshot where userId=X, platform=P` (one read per touched platform)
- **Writes:** `SaleSnapshot/{auto}` with `{ userId, platform, saleKey, listingId, title, status, firstSeenAt, lastSeenAt, soldAt?, salePrice?, imageUrl? }`
- **Returns:** `{ inserted: number, skipped: number, perPlatform: Record<platform, number>, insertedIds: string[], insertedByPlatform: Record<platform, string[]> }`
- **Used by:** `ClosetView.handleCalibrateBaseline` (baseline), `ClosetView.handleReconciliationFromSyncData` (pending), `syncRecentSoldItems` (pending), `LastSoldWidget` Refresh chain

#### `normalizeTitleForMatch(raw)` → `string`
- **File:** `:95` (internal)
- **What:** Aggressive title normalization for cross-source matching. Lowercases, swaps curly quotes/apostrophes for straight ASCII (`'`, `‛`, `′`, `‘`, `’` → `'`; `"`, `„`, `‟`, `″`, `“`, `”` → `"`), strips every non-alphanumeric-non-whitespace char to a space, collapses whitespace, trims. Two titles that look the same to a human collapse to the same string.

#### `buildContentDedupKey(row)` → `string`
- **File:** `:119` (internal)
- **Signature:** `function buildContentDedupKey(row: { title?: string; soldAt?: string; salePrice?: number }): string`
- **What:** Returns `${normalizeTitleForMatch(title)}|${salePrice.toFixed(2)}` if both title and price are present, else empty string (no dedup). The function still accepts `soldAt` for backwards compat in case the previous shape needs to be re-introduced, but **deliberately drops date from the fingerprint** because the original baseline rows (CSV-imported) often lack `soldAt` or carry it in a different format than the extension scrape. Including date in the key made the fuzzy match miss nearly every cross-source duplicate. Resale items are unique per listing, so title + price is plenty diagnostic. This is the load-bearing fix for the Poshmark Refresh duplicate issue.

#### `deleteNonBaselineRows(userId, platform)` → `Promise<number>` (deleted count)
- **File:** `:249`
- **Signature:** `async function deleteNonBaselineRows(userId: string, platform: SaleSnapshotPlatform): Promise<number>`
- **What it does:** Fetches every `SaleSnapshot` row for `(userId, platform)` via `getSnapshot`, filters to `r.status !== 'baseline'`, deletes in 400-doc `writeBatch` chunks. Baseline rows are NEVER touched. After this runs, `getSnapshot(userId, platform)` returns only the locked baseline.
- **Used by:** `LastSoldWidget` Revert button (amber ↺ icon)
- **Edge cases:** Irreversible — there's no undo. The widget surfaces a confirm dialog showing exactly how many of each status will be deleted vs preserved.

#### `getSnapshot(userId, platform?, status?)` → `SaleSnapshotEntry[]`
- **File:** `:31`

#### `getSnapshotKeySet(userId, platform)` → `Set<string>`
- **File:** `:44` — **cross-status** fetch (no status filter). This is what enforces baseline immutability.

#### `getCalibrationStatus(userId)` → `CalibrationStatus`
- **File:** `:52`

#### `confirmPlatformCount(userId, platform, confirmedCount)`
- **File:** `:294` — merges `{ platform: { isConfirmed: true, confirmedCount, confirmedAt } }` into `CalibrationStatus/{userId}`, sets `fullyCalibrated` if all 3 confirmed. Strips `undefined` recursively before write.

#### `recordBaselineSnapshot(userId, platform, baselineCount)`
- **File:** `:331` — merges `{ [platform]: { baselineSnapshotAt, baselineCount } }` into `CalibrationStatus/{userId}`.

#### `markCounted(entryId)` / `markUncounted(entryId)`
- **File:** `:274 / :282` — flips `SaleSnapshot/{id}.status` between `reconciled` and `pending`. Sets/clears `reconciledAt` ISO timestamp accordingly.

#### `resetCalibration(userId)`
- **File:** `:348` — wipes `CalibrationStatus/{userId}` to a fresh empty doc with `resetAt: serverTimestamp()`. Does NOT delete `SaleSnapshot` rows.

### `platformListing.ts`

#### `upsertListings(userId, inputs)` → `UpsertResult`
- **File:** `src/services/inventory/platformListing.ts:69`
- **Signature:** `async function upsertListings(userId: string, inputs: UpsertListingInput[]): Promise<{ inserted, updated, total }>` where `UpsertListingInput = { platform, listingId, title, price?, qty?, qtySold?, itemId?, flagged?: 'low_price'|'backlog', description?, brand?, sizeRaw?, color?, category? }`.
- **What it does:** Batched merge-write of `PlatformListing/{userId:platform:listingId}` rows. Sets `status='active'`, bumps `lastSeenAt`, writes price/qty/itemId/flagged + scraper fields (description/brand/sizeRaw/color/category) when present. **NEVER writes `firstSeenAt`** — that's owned by the `onPlatformListingCreate` CF trigger so the original calibration baseline timestamp survives every re-run. Batched at 400 ops.
- **Writes:** `PlatformListing/{userId:platform:listingId}` (merge=true)
- **Used by:** `handleCalibrateBaseline`, `handleReconciliationFromSyncData`

#### `markRemovedListings(userId, platform, cutoffIso)` → `PlatformListing[]`
- **File:** `:119`
- **What:** Queries active rows for `(userId, platform)`, filters by `lastSeenAt < cutoffIso`, sets `status='removed'` + `removedAt`. Returns the transitioned rows so caller can emit `LISTING_REMOVED` activity events. Batched at 400.
- **Used by:** `ClosetView.handleReconciliationFromSyncData` (called with cutoff = run start time)

#### `markListingsAsBacklog(userId, inputs)` → `Promise<number>` (written count)
- **File:** `:199`
- **Signature:** `async function markListingsAsBacklog(userId: string, inputs: Array<{ platform, listingId, title, price?, description? }>): Promise<number>`
- **What it does:** Upserts each `PlatformListing` row with `flagged='backlog'`, `backloggedAt`, `itemId: null` (explicitly clearing any prior binding), `status='active'`, `lastSeenAt=now`. Used when user clicks "None of these" in the per-row import flow → the listing is recorded as having no eBay match so sync-stock can later treat it as overstock-candidate during reconciliation. Does NOT touch `Item` collection — these are tracking markers only. Batched at 400.
- **Math:** Pure write-through, no computation. The set of listings the user explicitly said have NO match becomes the seed for the overstock-removal queue.
- **Used by:** `DepopImportModal`, `PoshmarkImportModal` (after user clicks Import — every row with `selection === 'none'` is sent here)

#### `bulkSetListingItemIds(userId, updates)` / `setListingItemId(userId, platform, listingId, itemId)`
- **File:** `:243 / :180` — set the `itemId` binding on existing `PlatformListing` rows. Bulk version commits in 400-doc batches.
- **Used by:** `PlatformMatchModal.applyMatches`

#### `getListings(userId, platform?, status?)` / `getActiveListings(userId, platform?)`
- **File:** `:156 / :169` — basic queries.

#### `platformListingKey(userId, platform, listingId)` → `string`
- **Source:** `src/types/inventorySnapshot.ts` (re-exported here). Returns `${userId}:${platform}:${listingId}` — deterministic doc id for upsert.

### `syncSoldItems.ts`

#### `syncRecentSoldItems(userId, platform)` → `WriteSnapshotBatchResult`
- **File:** `src/services/inventory/syncSoldItems.ts:163`
- **Signature:** `async function syncRecentSoldItems(userId: string, platform: SaleSnapshotPlatform): Promise<WriteSnapshotBatchResult>`
- **What it does:** Resolves the right `marketplaceData/*` doc (sold-specific docs first, then legacy active docs, then subcollection, then full-scan fallback), filters sold listings, builds `SnapshotInput[]` with `imageUrl` from `getDepopListingImage` (Depop) or `row.cover_shot.url / row.coverShot.url / row.imageUrl / pictures[0] / images[0]` (Poshmark), and calls `writeSnapshotBatch(... 'pending')`. Baseline rows are auto-preserved by the cross-status, cross-source-fingerprint dedup in `writeSnapshotBatch`. Returns `{ inserted: 0, ...empty }` if platform is `'ebay'` (eBay sales come through the API sync, not the extension).
- **Reads:** `marketplaceData/{depop_sold_*|poshmark_sold_*|<username>}`, `depop_user_info/{userId}` (for username), `users/{userId}/marketplaceData/sync` (fallback), full `marketplaceData` collection scan (last resort)
- **Writes:** via `writeSnapshotBatch` → `SaleSnapshot` (pending only)
- **Console:** `[syncRecentSoldItems] {platform}: {N} total listings at marketplaceData/{docId}` then `[syncRecentSoldItems] {platform}: {N} sold candidates → writeSnapshotBatch as 'pending' (dedup: saleKey OR content-fingerprint title|YYYY-MM-DD|price)` then `[syncRecentSoldItems] {platform}: inserted={X} skipped={Y}` plus per-platform breakdown lines.
- **Used by:** `LastSoldWidget` Refresh button

#### `resolveDepopSyncData(userId)` / `resolvePoshmarkSyncData(userId)` (internal)
- **File:** `:35 / :101`
- **What:** Multi-strategy doc resolution that mirrors `DepopIntegrationPage` / `PoshmarkIntegrationPage`. The resolution chain for Depop:
  1. `marketplaceData/depop_sold_{userId}` (preferred — extension writes here from sold-items page)
  2. `marketplaceData/depop_sold_{depop_user_info.username}` if present
  3. `marketplaceData/depop_sold_{depop_user_info.userId}` if present
  4. `marketplaceData/depop_sold_dallassports`, `marketplaceData/depop_sold_265732668` (known fallbacks)
  5. Same identifiers without the `depop_sold_` prefix (legacy active docs that may contain sold items via older mixed-write path)
  6. `users/{userId}/marketplaceData/sync` subcollection
  7. Last resort: collection scan for any doc whose ID starts with `depop_sold_` and has non-empty `listings[]`
  8. Final fallback: any doc with `platform='depop'` and non-empty listings
- Poshmark follows the same pattern with `poshmark_sold_` prefix and fallbacks `retrothriftc0`, `retrothriftco`.

#### `SnapshotInput` shape (per platform)
- **Depop:** `{ platform: 'depop', saleKey: 'depop:{purchaseId}:{id}' or 'depop:{id|purchaseId}:{index}', listingId: id || purchaseId, title: item.title || item.description, soldAt: item._soldDate || item.soldDate, salePrice: item._soldPrice || item.soldPrice, imageUrl: getDepopListingImage(item) }`
- **Poshmark:** `{ platform: 'poshmark', saleKey: 'poshmark:order:{orderId}' or 'poshmark:listing:{listingId}:{soldDateIso}' or 'poshmark:row:{index}', listingId: listingId || orderId, title: row.title || row.description, soldAt: row.sold_date_iso || row.soldDate, salePrice: row.sale_price || row.salePrice, imageUrl: row.cover_shot?.url || ... }`

### `reconciliation.ts`

#### `reconcileStock(items, liveEbayQtyMap?, saleWindowDays?)` → `ReconciliationResult`
- **File:** `src/services/inventory/reconciliation.ts:100`
- **What it does:** For each eBay-anchored `Item`, computes `stockOnHand = ebayAvailable − nonEbaySold` (where `nonEbaySold = poshmark + depop + in_person` from `item.unitSales[]` filtered by optional `saleWindowDays`). Buckets each item into `DELIST_NOW` / `OVERSOLD` / `QTY_MISMATCH` / `SHOULD_LIST` / `ALL_GOOD`. **Detection only — does not act.**
- **Reads:** items (parameter); `liveEbayQtyMap` if passed
- **Writes:** none
- **Used by:** `StockReconciliationModal`, `SyncStockModal`, `MismatchAlertBanner`

#### internal `countSalesByPlatform(item, saleWindowDays?)` / `getListedPlatforms(item)`
- helpers at `:61 / :88`

### `mismatchDetector.ts`

#### `wordOverlapSimilarity(a, b)` → `number 0..1`
- **File:** `src/services/inventory/mismatchDetector.ts:38` — exported normalize+overlap helper used by `findMatch` (Jaccard-style word overlap, no npm packages).

#### `detectMismatches(localItems, ebayCSV, poshmarkCSV, depopListings)` → `MismatchResult[]`
- **File:** `:94` — cross-references local items against CSV/listing snapshots. Emits `SOLD_STILL_LISTED` / `OVERSOLD` / `QUANTITY_MISMATCH` / `NOT_LISTED` / `MISSING_FROM_PLATFORM` results.

#### `generateAlerts(mismatches)` → `Alert[]`
- **File:** `:314` — converts detect output into actionable alerts (warning+critical only).

### `inventorySnapshot.ts`

#### `writeSnapshot(input)` → `string` (doc id)
- **File:** `src/services/inventory/inventorySnapshot.ts:25`
- **Writes:** `InventorySnapshot/{auto}` with `{ userId, reason, takenAt, totals, saleSnapshotIds, notes? }`
- **Used by:** `ClosetView.handleCalibrateBaseline` (reason: `'calibration'`), `handleReconciliationFromSyncData` (reason: `'sync'`)

#### `getLatestSnapshot(userId)` / `getCalibrationSnapshot(userId)` / `listSnapshots(userId, max=50)`
- **File:** `:37 / :50 / :64` — query helpers ordered by `takenAt`.

### Other inventory helpers
- `availabilityEngine.ts` — computes availability mapping for matched listings.
- `linkedGroup.ts` — multi-Item grouping (rare).
- `playerAliases.ts` — `resolvePlayerName(title)` alias dictionary lookup.
- `soldSyncEngine.ts` — server-side variant of the sold sync pipeline.

---

## C. Platform Services

### `src/services/depop/import.ts`

#### `importDepopItems(listings, userId, ebayMatchMap?)` → `DepopImportResult`
- **File:** `src/services/depop/import.ts:75`
- **Signature:** `async function importDepopItems(listings: DepopListing[], userId: string, ebayMatchMap?: Map<string, string>): Promise<{ matchedCount, skippedCount, errors[] }>`
- **What it does:** Links Depop listings to existing eBay `Item` rows. For each listing with a match in `ebayMatchMap` (per-row Depop-listing.id → eBay-item-doc-id), updates the eBay `Item` with `{ depopListingId, depopUrl, depopQuantity: 1, depopImportedAt: new Date().toISOString() }`. **Does NOT create new items** — this is a link-only path. `depopImportedAt` is the persistent marker for "imported via this modal" — distinguishes user binds from sync/calibrate auto-detected ones. Used by the modal to render persistent green Imported badges across sessions.
- **Reads:** `Item where user_uuid=userId, depopListingId=listing.id` (dedup check)
- **Writes:** `Item/{ebayItemDocId}` (update)
- **Used by:** `DepopImportModal`

#### `DepopListing` interface — `:3` (shape of scraped Depop listing: `id`, `slug`, `title`, `description`, `pricing.*`, `pictures[]`, `preview`, etc.)

### `src/services/depop/extractors.ts`

#### `extractDepopPrice(listing)` → `number`
- **File:** `src/services/depop/extractors.ts:14` — multi-strategy price extraction (handles API v3 + legacy shapes).

#### `getDepopListingImage(listing)` → `string | null`
- **File:** `:146` — first usable image from `pictures[]` / `preview` / `image` / `images[]`.

#### `extractDepopImages(listing)` / `formatDepopPrice(listing)`
- **File:** `:120 / :165`

### `src/services/depop/salesCsvParser.ts`
- `parseDepopSalesCSV(csvData)` / `summarizeDepopSales(records)` / `depopSalesToPlatformInventory(...)` / `matchSalesToInventory(...)` — Depop CSV import path (alt to extension scrape).

### `src/services/poshmark/import.ts`

#### `importPoshmarkItems(listings, userId, ebayMatchMap?)` → `PoshmarkImportResult`
- **File:** `src/services/poshmark/import.ts:36`
- **What it does:** Mirror of `importDepopItems` for Poshmark. Updates each matched eBay `Item` with `{ poshmarkListingId, poshmarkUrl, poshmarkQuantity: 1, poshmarkImportedAt: new Date().toISOString() }`. `poshmarkImportedAt` is the persistent "imported via PoshmarkImportModal" marker.
- **Writes:** `Item/{ebayItemDocId}` (update)
- **Used by:** `PoshmarkImportModal`

#### `PoshmarkListing` interface — `:3`

### `src/services/poshmark/csvParser.ts`
- Poshmark CSV import path.

### `src/services/ebayService.ts`

Singleton class `EbayService` (exported as `ebayService` at `:1150`). Every public method is a thin wrapper that calls `httpsCallable(functions, '<name>', { timeout? })` then `await fn(args)` and unwraps `result.data`. Each is wrapped in try/catch that logs and re-throws. **No state held in the class** — pure transport layer.

Auth pattern: `const user = auth.currentUser; if (!user) throw new Error('User must be authenticated to ...');` for methods that need it (currently only `connectAccount`).

#### `connectAccount(): Promise<void>` — `:99`
- **What:** Calls `ebayOAuthUrl` CF → opens a 600×700 popup at the returned URL → listens for `'EBAY_AUTH_SUCCESS'` / `'EBAY_AUTH_FAILED'` postMessages AND on a `BroadcastChannel('ebay_auth')` (dual signal so the popup can succeed regardless of postMessage origin restrictions) → resolves on success, rejects on failure, or rejects after 5-minute timeout.
- **Side effects:** popup window; postMessage / BroadcastChannel listeners (cleaned up on resolve/reject).

#### `checkConnection(): Promise<EbayConnectionStatus>` — `:179`
- **CF:** `ebayStatus`. Returns `{ connected, hasToken, ebayUsername?, lastSync, tokenExpiry, isExpired? }`.

#### `fetchInventory(options?): Promise<{ success, total, listings }>` — `:195`
- **CF:** `ebayFetchInventory`. Accepts `{ limit?, offset? }` for pagination.

#### `syncListings(): Promise<SyncResult>` — `:213`
- **CF:** `ebaySyncListings`. Returns `{ success, total, imported, updated, skipped }`.

#### `getOrders(options?): Promise<{ success, total, orders }>` — `:229`
- **CF:** `ebayGetOrders`. `{ limit?, offset? }`.

#### `disconnect(): Promise<void>` — `:247`
- **CF:** `ebayDisconnect`. Deletes `ebay_credentials/{userId}`.

#### `getStats(): Promise<EbayStats>` — `:261`
- **CF:** `ebayGetStats`. Returns `{ totalListings, activeListings, totalOrders, revenue, lastSync?, error? }`.

#### `getAllListings(page=1, pageSize=100)` — `:279`
- **CF:** `ebayGetAllListings` (`timeout: 300000` / 5 minutes). Returns the full `TradingAPIListing[]` shape with `itemId, title, currentPrice, currency, quantity, listingType, viewItemURL, pictureURL, pictureURLs[], sku, condition`. **Primary heavy-data source for `/ebay` integration views.**

#### `getListingCount()` — `:311`
- **CF:** `ebayGetListingCount`. Sub-50ms total-count call via `EntriesPerPage=1`.

#### `getListingsPreview(page=1, pageSize=25)` — `:329`
- **CF:** `ebayGetListingsPreview`. Lightweight `ListingPreview` shape: `{ itemId, title, price, currency, quantity, imageUrl, condition }`. Used for fast pre-render.

#### `deleteAllItems()` — `:360`, `deleteItemsWithoutEbay()` — `:438`, `deleteBrokenItems()` — `:463`
- **CFs:** `deleteAllItems`, `deleteItemsWithoutEbay`, `deleteBrokenItems` (with 10-min client timeout).

#### `importAllFromEbay(deleteExisting=false)` — `:377`
- **CF:** `ebayImportAll` (`timeout: 600000` / 10 minutes). Returns `{ success, totalFromEbay, imported, skipped }`.

#### `importPage(page=1, pageSize=200)` — `:405`
- **CF:** `ebayImportPage`. Returns `{ success, page, totalPages, totalEntries, hasMoreItems, imported, skipped, pageItems }`.

#### `backupPhotos(itemId, photoUrls): { success, photosDownloaded, photosFailed, photos[], errors[] }` — `:483`
- **CF:** `ebayBackupPhotos` (`timeout: 300000`).

#### `createListing(listingData)` — `:514`
- **CF:** `ebayCreateListing` (`timeout: 300000`). Accepts the full eBay listing payload (title, description, price in cents, quantity, condition, conditionID, categoryID, itemSpecifics, photosUrls, shippingInfo, returnPolicy, paymentMethods, buyerRequirements).
- **Returns:** `{ success, itemId, listingUrl, listingFee }`.

#### `getItemDetails(itemId)` — `:555`
- **CF:** `ebayGetItemDetails` (`timeout: 60000`).

#### `reviseItemQuantity(itemId, quantity): { success, itemId, quantity }` — `:574`
- **CF:** `ebayReviseItemQuantity` (`timeout: 60000`). **Primary lever for the cross-platform decrement orchestrator (Linear 444-139).** No retry, no idempotency token — the underlying `ReviseItem` Trading call is itself idempotent on quantity.

#### `reviseItemPrice(itemId, newPriceCents)` — `:580`
- **CF:** `ebayReviseItemPrice` (`timeout: 60000`). Returns `{ success, itemId, newPrice }`.

#### `endItem(itemId, endingReason='NotAvailable'): { success, itemId, endTime }` — `:597`
- **CF:** `ebayEndItem` (`timeout: 60000`). Calls Trading `EndItem` with the user-supplied reason (default `'NotAvailable'` — the most common closure reason for "I sold it elsewhere").

#### `relistItem(itemId, newPriceCents?)` — `:619`
- **CF:** `ebayRelistItem` (`timeout: 60000`). Automatically copies all details from the ended listing.

#### Sell Inventory API methods (modern REST):
- `inventoryCreateItem(params)` — `:646` — `ebayInventoryCreateItem` (60s)
- `inventoryCreateOffer(params)` — `:672` — `ebayInventoryCreateOffer` (60s)
- `inventoryPublishOffer(offerId)` — `:698` — `ebayInventoryPublishOffer` (60s)
- `inventoryGetListingFees(offerIds)` — `:718` — `ebayInventoryGetListingFees` (60s)
- `inventoryCreateAndPublish(params)` — `:738` — `ebayInventoryCreateAndPublish` (120s) — **one-shot create item + offer + publish**
- `inventoryWithdrawOffer(offerId)` — `:783` — `ebayInventoryWithdrawOffer` (60s)

#### Offer management:
- `getOffersBySku(sku, marketplaceId?)` — `:807` — `ebayGetOffers`
- `getAllOffers(limit=50, offset=0)` — `:825` — `ebayGetAllOffers`
- `getOffer(offerId)` — `:842` — `ebayGetOffer`
- `updateOffer(offerId, updates)` — `:860` — `ebayUpdateOffer`
- `deleteOffer(offerId)` — `:877` — `ebayDeleteOffer`

#### Business policies:
- `getFulfillmentPolicies(marketplaceId='EBAY_US')` — `:898` — `ebayGetFulfillmentPolicies`
- `getReturnPolicies(marketplaceId='EBAY_US')` — `:915` — `ebayGetReturnPolicies`
- `getPaymentPolicies(marketplaceId='EBAY_US')` — `:932` — `ebayGetPaymentPolicies`
- `getInventoryLocations()` — `:948` — `ebayGetInventoryLocations`
- `getAllPolicies(marketplaceId='EBAY_US')` — `:965` — `ebayGetAllPolicies` (single CF that fetches all 3 policy types)

#### Category suggestions:
- `getCategorySuggestions(query, categoryTreeId='0')` — `:987` — `ebayGetCategorySuggestions`

#### Buyer offers / promotional offers:
- `getItemWatchers(itemId)` — `:1008` — `ebayGetItemWatchers`
- `sendBuyerOffer(itemId, discountPercent, duration=48, message?)` — `:1028` — `ebaySendBuyerOffer`
- `getMarketTrends(itemId)` — `:1045` — `ebayGetMarketTrends`
- `getBulkWatchers(itemIds[])` — `:1062` — `ebayGetBulkWatchers` (9-min timeout)
- `sendBulkOffers(items[], discountPercent)` — `:1080` — `ebaySendBulkOffers` (9-min)
- `sendBulkOffersWithPrices(items[])` — `:1097` — `ebaySendBulkOffersWithPrices` (9-min)
- `sendOffersToWatchers(items[])` — `:1115` — `ebaySendBulkOffersToWatchers` (9-min)
- `getBuyerOffers(itemIds?)` — `:1133` — `ebayGetBuyerOffers` (9-min)

**Retry behavior:** None — every method just `await fn(args)` and rethrows on failure. Toasts and progress UI are the caller's responsibility (e.g. `ClosetView` wraps each call in a `try/catch` and emits `toast.success/error`).

**Error surface:** All errors propagate to caller. `httpsCallable` already wraps server `HttpsError` codes (`unauthenticated`, `invalid-argument`, `internal`) so the caller can `instanceof` check or read `err.code`.

### `src/services/openclawService.ts`

- `OPENCLAW_URL = 'http://localhost:18789'` (`:13`)
- `isOpenClawRunning()` → `boolean` (`:35`)
- `syncMarketplace(userId, platform, options?)` (`:51`) — POSTs to OpenClaw, which scrapes and then calls `saveMarketplaceSync` CF.
- `chatWithClawd(prompt, ...)` (`:133`)

---

## D. Activity Log (`src/services/activityLog.ts`)

All `log*` helpers `addDoc` to `ActivityLog` with `{ userId, activityType, timestamp: Timestamp.now(), ... }`. Failures are caught and logged but never thrown.

- `logQRPrint(userId, itemIds, labelSize)` — `:174`
- `logPriceMarkdown(userId, itemId, itemName, oldPrice, newPrice, discountPercent)` — `:205`
- `logMarkSold(userId, itemId, itemName, finalPrice, ebayUrl?)` — `:239`
- `logSaleCreated(userId, saleId, itemId, itemName, salePrice, marketplace, profit)` — `:271`
- `logItemCreated(userId, itemId, itemName, source: 'manual'|'ebay_import'|'clone')` — `:306`
- `logItemUpdated(userId, itemId, itemName, changes: string[])` — `:335`
- `logEbayImport(userId, itemCount, successCount, failCount)` — `:364`
- `logCheckIn(userId, itemId, itemName, itemBarcode?, ebayUrl?, ebayListingId?)` — `:393`
- `logPriceIncrease(userId, itemId, itemName, oldPrice, newPrice, increasePercent)` — `:427`
- `logPriceDecrease(userId, itemId, itemName, oldPrice, newPrice, decreasePercent)` — `:461`
- `logScan(userId, itemId, itemName, scanMethod: 'QR'|'BARCODE'|'URL', ...)` — `:495`

**Inventory-tracking variants** (Calibrate / Sync Stock chain):

- `logCalibrationRun(userId, { snapshotId, totals, salesInserted, salesSkipped, listingsUpserted, unmatchedByPlatform, durationMs })` — `:541`
- `logSyncRun(userId, { snapshotId, totals, newSalesDetected, listingsAdded, listingsRemoved, durationMs })` — `:566`
- `logSaleDetected(userId, { platform, listingId, saleKey, itemId?, salePrice?, soldAt?, saleSnapshotId })` — `:590`
- `logListingAdded(userId, { platform, listingId, title, itemId? })` — `:614`
- `logListingRemoved(userId, { platform, listingId, title, lastSeenAt, itemId? })` — `:635`

`InventoryRunTotals` shape at `:535`.

---

## E. Stores (Zustand)

### `useItemStore` — `src/store/useItemStore.ts:195`

State: `items[]`, `filteredItems[]`, `isLoading`, `isInitializing`, `error`, `filterOptions`, `sortOption`, `selectedItem`.

Actions:
- `initializeStore(userId)` — `:206` — guards with `isInitializing` lock, calls `loadItems`. Used by every page on mount.
- `loadItems()` — fetches `Item where user_uuid=...`, transforms via `transformDbItem`, sets store. Re-applies filters.
- `addItem(itemData)` — `:274` — generates id + barcode, `database.from('Item').insert(...)`, optimistic store update.
- `updateItem(item)` — `:322` — `update(...)` + store patch.
- `deleteItem(id)` — `:361` — `delete()` + store patch.
- `setFilterOptions(opts)` / `setSortOption(opt)` / `setSelectedItem(item)` / `applyFilters()` / `resetFilters()`
- `getStats()` → `ItemStats`
- `backfillBarcodesForExistingItems()` / `countItemsNeedingBarcodes()` — wrap `backfillBarcodes.ts`.
- `backfillEbayUrlsForExistingItems()` / `countItemsNeedingEbayUrls()` — wrap `backfillEbayUrls.ts`.

`transformDbItem(dbItem)` (internal) — `:72` — maps DB row → `Item` (status enum, hangerId extracted from notes, size resolution chain). **Reads `dbItem.ebayDelisted`, `dbItem.ebayQuantityAtBaseline`, `dbItem.physicalQuantityAtBaseline`, `dbItem.baselineCalibratedAt`, `dbItem.depopImportedAt`, `dbItem.poshmarkImportedAt`** so all the new fields land on the typed `Item` shape.

### `useAuthStore` — `src/store/useAuthStore.ts:44`

State: `user`, `loading`, `error`.

Actions:
- `signUp(email, password, displayName?)` — `:51`
- `signIn(email, password)` — `:72`
- `signInWithGoogle()` — `:93`
- `signOut()` — `:119`
- `initialize()` — `:140` — subscribes to Firebase `onAuthStateChanged`, populates `user`.

### `useSaleStore` — `src/store/useSaleStore.ts:84`

State: `sales[]`, `filteredSales[]`, filters, sort, selection.

Actions:
- `loadSales(userId)` — `:84`
- `createSale(userId, data)` — `:107`
- `updateSale(id, updates)` — `:153`
- `deleteSale(id)` — `:187`
- `bulkDelete(ids)` — `:205`
- `setFilters(filters)` / `setSortOption(option)` / `toggleSelection(id)` / `selectAll()` / `clearSelection()` / `applyFilters()` / `getStats()` / `exportToCSV()`

### `useEbayStore`, `useInventoryScanStore`
- Subordinate stores for eBay status + scan-page state.

---

## F. ClosetView Handlers (`src/components/ClosetView.tsx`)

The grid component (~4000 lines). Every user action below is a handler on this file.

### `handleCalibrateBaseline(syncData)` — `:1450`
- **What it does:** The big one. Five steps, each in its own try/catch so partial failures are reported but don't kill the others:
  1. **Sales baseline.** Build `SnapshotInput[]` from three sources:
     - `syncData.ebayActive[]` — for each listing, emit `sold` (= `listing.quantitySold`) rows with `saleKey = 'ebay:{listingId}:sold:{i}'`. One row per sold unit so dedup is per-unit not per-listing.
     - `syncData.depopSold[]` — keyed by `'depop:{purchaseId}:{id}'` when both exist, else fall back to `'depop:{id|purchaseId}:{N}'`. `_purchaseId` is the dedup-critical receipt id.
     - `syncData.poshmarkSold[]` — keyed by `'poshmark:order:{orderId}'` (preferred, unique per sale) OR `'poshmark:listing:{listingId}:{sold_date_iso}'` OR `'poshmark:row:{N}'`.
     Call `writeSnapshotBatch(userId, inputs, 'baseline')`.
  2. **PlatformListing upsert.** Build `UpsertListingInput[]` for `ebayActive` + `poshmarkActive` + `depopActive`. Auto-bind by listingId via lookup maps from `items`. Fuzzy-match remaining Posh/Depop rows via `findEbayMatchForListing` (skip flagged). Flag listings under $40 as `'low_price'`. Pass scraper fields (description/brand/sizeRaw/color/category) through to the upsert payload. Call `upsertListings(userId, listingInputs)`.
  3. **Per-Item baseline seed (Linear 444-142 Phase 1).** For each eBay-anchored Item, batch-update `{ ebayQuantityAtBaseline, physicalQuantityAtBaseline, baselineCalibratedAt: baselineIso }`. eBay qty is sourced from the `syncData.ebayActive` lookup map by `listingId`, falling back to the Item's existing `ebayQuantity`. Physical qty falls back to eBay qty.
  4. **CalibrationStatus + per-platform counts.** `Promise.all([confirmPlatformCount × 3, recordBaselineSnapshot × 3])`.
  5. **InventorySnapshot + ActivityLog.** `writeSnapshot({ reason: 'calibration', totals, saleSnapshotIds: result.insertedIds })` + `logCalibrationRun(userId, { snapshotId, totals, salesInserted, salesSkipped, listingsUpserted, unmatchedByPlatform, durationMs })`.
- **Reads:** `items` (from store), `syncData` (param)
- **Writes:** `SaleSnapshot`, `PlatformListing`, `Item` (baseline seed), `CalibrationStatus`, `InventorySnapshot`, `ActivityLog`
- **Side effects:** Per-step `console.log`s prefixed `[Calibrate]`; final summary toast (success or partial-with-errors).
- **Edge cases:** Step 1 (sale snapshot) is the only step whose failure aborts everything — it's outside the per-step try/catch. The other 4 steps each report their own error in `errors[]` and the function emits a `toast.warning` summary at the end.

### `handleReconciliationFromSyncData(syncData)` — `:1779`
- **What it does:** The sync-mode counterpart to Calibrate. Roughly 480 lines. Phases in order:
  1. **eBay qty diff + unit-sales append.** For each `Item.ebayListingId`, get the live qty from `syncData.ebayQtyMap`. Compute `newEbaySales = ebaySold − localSold` (local = count of `item.unitSales[]` where `platform='ebay'`). If positive, write `newEbaySales` synthetic `unitSales` entries with `{ soldAt: now, platform: 'ebay', priceCents: manualPriceCents }`, append an `itemActivity` SOLD entry, decrement `physicalQuantity`, recompute `stockStatus`, and call `recordSale(...)` for each new sale. **Caps `unitSales` at 200 and `itemActivity` at 50 (slice from the tail).**
  2. **Depop listing auto-link.** For each active Depop listing (filtered `!sold && status !== 'sold'`), call `findEbayMatchForListing(title, size, ebayItems)` with `minConfidence: 0.15`. If match's eBay item has no `depopListingId` yet, set `{ depopListingId: listing.id || slug, depopUrl, depopQuantity: 1 }`.
  3. **Poshmark listing auto-link.** Same as Depop, with `findEbayMatchForListing` and `{ poshmarkListingId, poshmarkUrl, poshmarkQuantity: 1 }`.
  4. **Depop sold flow + bundle expansion.** Filters `syncData.depopSold` to actually-sold listings. Per row: tracks `_isBundle` (extension flags multi-item receipts) into `depopBundles[]`, tracks `_itemsArrayMissing` (receipts where items[] was empty) into `depopPotentialBundles[]`, looks up `linkedItem` by `Item.depopListingId === soldId`. If not linked → `depopUnmatched[]`. If already recorded (dedup by `unitSales[].note === 'depop:{_purchaseId|soldId}'`) → skip. Else: decrement `physicalQuantity`, append `unitSales` entry with `note = 'depop:{_purchaseId}' + (' [BUNDLE 3x]' if _isBundle)`, call `recordSale`. Logs review-console-group + toast warning for any non-empty bundle/unmatched buckets.
  5. **Poshmark sold flow.** Filters out `is_refunded` rows. Per row: dedup key `unitSales[].note === 'posh:{order_id || listing_id}'`. Same decrement + unitSales-append + recordSale pattern. Surfaces unmatched via toast warning + console group.
  6. **Reload + reconcile + SaleSnapshot 'pending' write.** Reload `items` via `loadItems()`. Call `reconcileStock(freshItems, qtyMap, syncData.saleWindowDays)` (the user-configurable sale-window preference; 0 = all history). Open `StockReconciliationModal` with the result.
  7. **Phase B tracking (Sync run).** In its own try/catch. Builds the same `UpsertListingInput[]` shape as Calibrate, runs fuzzy match for Posh/Depop, calls `upsertListings`. Then `markRemovedListings(userId, platform, syncRunStart)` for each of the 3 platforms — every active row with `lastSeenAt < syncRunStart` gets `status='removed'`. Builds `SnapshotInput[]` with the same saleKey conventions as Calibrate but writes them with `status='pending'` so the spreadsheet view can flag them as user-actionable. Writes a sync `InventorySnapshot { reason: 'sync', ... }`. Emits `logSyncRun`, `logSaleDetected` per new sale, `logListingRemoved` per stale listing.
- **Firestore collections touched:** `Item` (qty updates, sold decrements, platform-link backfills), `PlatformListing` (upserts + markRemoved), `SaleSnapshot` (pending), `InventorySnapshot` (sync reason), `ActivityLog` (SYNC_RUN + per-event), plus `Sale` via `recordSale`.
- **Side effects:** ~12 different toasts at various phases (info during processing, warning for bundles/unmatched, success/error at the end); two `console.group` blocks for bundle review and unmatched review; per-batch `[SyncStock]` logs.
- **Edge cases:** Phase B is non-fatal — if it fails, the reconcile-mode UI still toasts success because phases 1-6 already completed. Refunded/cancelled Poshmark orders are silently filtered (don't decrement stock).

### `handleCheckEbayQuantities()` — `:2265`
- **What it does:** Calls `ebayGetAllListings` CF (300s timeout) with `{ fetchAll: true }`. Builds `qtyMap = listingId → quantityAvailable` and `soldMap = listingId → quantitySold`. For each eBay-anchored Item:
  - **Not in API response** (`qtyMap.get(listingId) === undefined`): write `{ ebayQuantity: 0, ebayDelisted: true, stockStatus: 'OUT_OF_STOCK', status: 'SOLD' }`. This is the load-bearing OOS-badge flow — preserves the listingId for baseline-diff math while flipping the row's blue "e" badge to a gray ✕.
  - **In API response:** write `{ ebayQuantity: ebayQty, ebayQuantitySold: ebaySoldNum, ebayDelisted: ebayQty === 0 ? true : false, physicalQuantity: ebayQty, stockStatus: ebayQty<=0 ? OOS : ebayQty<=2 ? LOW : IN_STOCK, status: ebayQty > 0 ? 'IN_STOCK' : 'SOLD' }`. Note the `ebayDelisted` flag is **cleared** when eBay shows the listing again with qty > 0.
- **Writes:** Batched at 400 per `writeBatch`. Patches Zustand store in-place via immer (mutates `state.items[i]` AND `state.filteredItems[i]` so any active sort/filter views also see new values), re-runs `applyFilters()`, then triggers `loadItems()` in the background.
- **Console:** `[CheckQty]` prefixed: button click info, CF round-trip time, qtyMap size, per-batch commit progress (`Batch 1 committed (400 items, 400/512 total)`), sample-item before/after dump. Console-tables the first 15 diffs.
- **Side effects:** `toast.info` on start, `toast.success("Mirrored X items from eBay · Y not found on eBay")` on done; progress bar via `setSyncProgress({ current, total })`.
- **Edge cases:** Already-running guard (toast warning + early return). Empty eBay-items list → toast error + early return. Auth guard. Errors caught and toast-error'd; `finally` block clears `isSyncingFromEbay` + `syncProgress`.

### `handleAIMatch(opts)` — `:1184`
- **What it does:** Wraps `matchListingsWithAI` CF call. (Legacy name; matcher is deterministic.) Opens `AIMatchProgressModal`, subscribes to `aiMatchRuns/{runId}/events` for live progress, on completion opens `AIMatchConfirmModal` with proposed matches.
- **Used by:** PlatformMatchModal (per-page Match)

### `handleApplyAiMatches(selected)` — `:1284`
- **What it does:** Writes the accepted matches back: updates `Item.{platform}ListingId` + URL, calls `bulkSetListingItemIds` on `PlatformListing`.
- **Writes:** `Item/{...}`, `PlatformListing/{...}`

### `handleRedoMatches(rejected)` — `:1338`
- **What it does:** Calls `clearPlatformBindings` CF for the rejected matches' platforms, then re-runs `handleAIMatch` with an `excludeMap` to prevent the same wrong pairings.

### `handleDotSold(item)` — `:370`
- **What it does:** Quick "dot sold" — calls `useSaleStore.createSale(...)` with sane defaults, updates `Item.status='SOLD'`, optionally triggers cross-platform delist via `gologinDelistItem` + `depopDelistItem`.

### `handleAcceptSuggestion(s)` / `handleRejectSuggestion(s)` / `handleSkipSuggestion(s)` — `:1402 / :1434 / :1442`
- **What they do:** Per-suggestion accept/reject/skip in the `MatchSuggestionsModal` row UI.

### `handleSyncFromEbay()` / `handleSyncFromDepop()` — `:595 / :2504`
- Pull active listings from each platform.

### `handleBulkDelistDepop()` — `:2479`
- Loops `depopDelistItem` CF over selected items.

### `handleBulkPriceUpdate(updates)` — `:2622`
- Loops `ebayReviseItemPrice` + `depopUpdateItemPrice` CFs.

### `handleBulkStatusChange(action, endEbayListings)` — `:2703`
- Bulk status flip. If `endEbayListings=true`, also calls `ebayEndItem` CF per item.

### `handleBulkClone(cloneType, options)` — `:2783`
### `handleBulkPromotion(promotionData)` — `:2853`
### `handlePromotedListings(action, adRate?)` — `:2888`
### `handleDeleteSelected()` — `:2657`
### `handleFixSizes()` — `:2920`
### `handleFixData()` — `:2934`
### `handleSendAIMessage()` — `:2953` (ClawdChat ask path)
### `handleConfirmAction()` — `:2992` (AIActionConfirmationModal trigger)
### `handleMarkAsSold(item)` — `:2552`
### `handleFetchQuantities()` — `:479` (older pre-CheckQty path; still wired up)
### `handleFindEbayIds()` — `:231`
### `handleRemoveDuplicates()` — `:162`
### `handleQuantityUpdate(itemId, newQty)` / `handleJerseyUpdate(itemId, value)` / `handleSizeUpdate(itemId, value)` — `:302 / :338 / :354`
- Inline cell editors.

### `handleSellQueryChange(q)` — `:2538`
- Closet search input.

---

## G. Modals & Widgets

### `DepopImportModal` — `src/components/depop/DepopImportModal.tsx:40`
- **Props:** `{ open: boolean, onClose: () => void }`
- **State:** `listings[]`, `selection: Record<id, string | 'none' | { manual: string }>`, `excludeMap`, `reloadingId`, `manualPickerListingId`, `manualSearch`, `importedThisSession: Set<id>`, `persistedImported` (derived from `Item.depopImportedAt`), `importing`, `unmatchedModalOpen`.
- **Polling on open:** Wipes `marketplaceData/{username}` doc, opens `https://www.depop.com/<seller-hub>` in new tab, polls `users/{userId}/marketplaceData/sync` first, then `marketplaceData/{userId|dallassports|265732668}` every 3s for up to 5 minutes. Stable-count detector ends polling early when listing count holds steady.
- **Per-row state:**
  - Default selection: top candidate per row (set once when candidates first appear, never overrides user choice).
  - Reload (excludes previous candidates by adding them to `excludeMap[listingId]`, triggers recompute of `candidatesByListing[listingId]` via `findTopEbayMatchesForListing(... excludeMap[id])`)
  - Manual match: opens search popover over full inventory; selection becomes `{ manual: ebayItemId }`.
  - "None of these": selection becomes `'none'` → goes to backlog on Import.
- **Imported badge:** A listing shows a persistent green Imported badge if `importedThisSession.has(id)` OR `persistedImported.has(id)`. `persistedImported` is rebuilt from `items` on every render — a listing whose `Item.depopImportedAt` is set lands here. The field outlives session refresh.
- **Import button:** Calls `importDepopItems(matched, userId, ebayMatchMap)` + `markListingsAsBacklog(userId, none)`.
- **"Review unmatched (N)"** → opens `DepopUnmatchedModal`.

### `DepopUnmatchedModal` — `src/components/depop/DepopUnmatchedModal.tsx`
- **Props:** `{ open, onClose, listings: DepopListing[], onDelisted?: (ids: string[]) => void }`
- **State machine:** `delisting: Set<id>` (in-flight per-row), `delisted: Set<id>` (completed). Row UI shows spinner while in `delisting`, green "Delisted" pill while in `delisted`.
- **Per-row "Delist from Depop"** → calls `depopDelistItem` CF with `{ itemId: listing.id }` (note: the CF arg is `productId`; client passes through `itemId` field).
- **Bulk "Delist all remaining"** → sequential loop over not-yet-delisted listings (NOT parallel — Depop unofficial API is rate-sensitive). One `window.confirm` before the batch. Calls `handleDelist` per row.
- **Hard-reload safe:** State resets on reopen because the parent passes a fresh `listings` array.

### `DepopSoldModal` — `src/components/depop/DepopSoldModal.tsx`
- **Props:** `{ open, onClose, soldItems, userId, ... }` (see source `:27`)
- **What it does:** Surfaces Depop sold items + lets user create `Sale` records.

### `PoshmarkImportModal` — `src/components/poshmark/PoshmarkImportModal.tsx:21`
- **Props:** `{ open, onClose }`
- **State + Actions:** Mirror of DepopImportModal. Polls `marketplaceData/poshmark_retrothriftc0` (and fallbacks). URL opened: `https://poshmark.com/closet/retrothriftc0?availability=available#autoScroll`. Calls `importPoshmarkItems` + `markListingsAsBacklog(... platform: 'poshmark')`.
- **`poshmarkImportedAt` is the persistent-imported field** — same pattern as `depopImportedAt`.

### `PoshmarkUnmatchedModal` — `src/components/poshmark/PoshmarkUnmatchedModal.tsx`
- **Props:** `{ open, onClose, unmatchedListings, userId, onUpdate, profileId }`
- **Per-row "Delist from Poshmark"** → `gologinDelistItem` CF (HTTP — onRequest, requires ID-token fetch) with `{ platform: 'poshmark', itemUrl, profileId }`.
- **Bulk variant** loops sequentially.
- **State machine:** Same `delisting`/`delisted` set pattern as DepopUnmatchedModal.

### `PoshmarkSoldModal` — `src/components/poshmark/PoshmarkSoldModal.tsx:28`
- Surfaces Poshmark sold items, creates `Sale` records.

### `EbaySoldModal` — `src/components/ebay/EbaySoldModal.tsx:28`
- Surfaces eBay sold items.

### `PlatformMatchModal` — `src/components/inventory/PlatformMatchModal.tsx:69`
- **Props:** `{ open, platform: 'depop'|'poshmark', onClose, onApplied }`
- **State:** Live event stream from `aiMatchRuns/{runId}/events` (Firestore `onSnapshot`).
- **Actions:** Trigger `matchListingsWithAI` CF, render proposed matches, accept/reject/redo. On Apply → `bulkSetListingItemIds` + `Item` back-pointer updates via `handleApplyAiMatches`.

### `LastSoldWidget` — `src/components/inventory/LastSoldWidget.tsx:51`
- **Props:** `{ platform: SaleSnapshotPlatform, count?: number (deprecated — widget now scrolls all entries) }`
- **Live data:** `onSnapshot(SaleSnapshot where userId=user.id)` filtered client-side to `r.platform === platform`, sorted by `soldAt` desc. Client-side filter (rather than composite query) so no Firestore index is required.
- **Totals strip (4 cells, computed via useMemo):** Revenue (sum of `salePrice`), Baseline (count where `status='baseline'`), Pending (count where `status='pending'`), Reconciled (count where `status='reconciled'`). Color-coded green / gray / amber / emerald.
- **Refresh button (top-right):**
  - Disabled for `platform === 'ebay'` (tooltip explains eBay flows through the API sync).
  - Opens `https://www.depop.com/sellinghub/sold-items/#autoScroll` (Depop) or `https://poshmark.com/order/sales/#autoScroll` (Poshmark) in new tab.
  - `setTimeout(() => window.focus(), 500)` to bring the closet tab back to front.
  - 30-second wait, then `await syncRecentSoldItems(user.id, platform)`.
  - On result: `toast.success("+X new {platform} sales · Y already in baseline")` if `inserted > 0`, `toast.info("No new {platform} sales (Y already in baseline)")` if only skipped, `toast.info("No {platform} sold items found in marketplaceData")` if both 0.
- **Revert button (amber ↺):** Shown only when `totals.pending > 0 || totals.reconciled > 0`. Opens a `window.confirm` that explicitly enumerates what will be kept vs deleted, then calls `deleteNonBaselineRows(user.id, platform)`. Baseline rows are preserved by the helper. Used to recover from a refresh that produced cross-source duplicates.
- **Row rendering:** Scrollable list `max-h-[420px] overflow-y-auto pr-1`. Each row: image thumbnail (10×10, lazy-loaded) OR `<Package>` placeholder for baseline rows without `imageUrl`; title (breakable, hover-title for full text); `Clock` + relative time + status pill (gray/amber/emerald per `STATUS_TINT`); right-aligned price chip.
- **Photos:** Baseline rows (status='baseline') pre-date the `imageUrl` field, so they render the Package icon. Pending rows from `syncRecentSoldItems` carry `imageUrl` extracted by `getDepopListingImage` or Poshmark's `cover_shot.url` resolution chain.
- **Edge cases:** Empty state: `"No sales captured yet."` Loading state: `"Loading…"`. Subscription error is caught and logged, loading clears.

### `NewSalesSinceBaselineWidget` — `src/components/inventory/NewSalesSinceBaselineWidget.tsx:35`
- **Props:** `{ platform: SaleSnapshotPlatform, count?: number = 8 }`
- **Live data:** Same `onSnapshot(... where userId=user.id)` pattern as LastSoldWidget, but client-filtered to `r.status === 'pending' && r.platform === platform`.
- **Display:** Top `count` most recent pending rows. Empty state ("No new X sales since calibration") uses emerald palette + checkmark icon; non-empty uses amber palette + alert-circle icon. Trailing `+ N more pending…` line if `total > visible.length`.
- **Used on:** `/depop` to surface the queue of decrement-pending sales. Each row is a "should decrement eBay stock" signal.

### `SyncStockModal`
- **File:** `src/components/inventory/SyncStockModal.tsx:36`
- **State machine:** Used in two modes — `mode='calibrate'` (locks the baseline) and `mode='sync'` (runs reconciliation). Orchestrates the scrape collection sequence: opens platform tabs, polls `marketplaceData/*`, builds `SyncStockData = { ebayActive, ebayQtyMap, ebaySold, depopSold, depopActive, poshmarkSold, poshmarkActive, saleWindowDays }`, then calls back `onApply(syncData)` which routes to `handleCalibrateBaseline` or `handleReconciliationFromSyncData`.
- **Current usage:** Still present but minimal — the per-page Match flow has subsumed most of its day-to-day role. Lives on for the Calibrate baseline ceremony.

### `AIMatchConfirmModal` — `src/components/inventory/AIMatchConfirmModal.tsx:27`
- **State machine:** Receives `proposedMatches[]` from `matchListingsWithAI`. User reviews each `{ ebayItem, listing, confidence, breakdown }`, can accept (checkbox stays checked), reject (uncheck), or "redo" (queue for re-match with this pairing excluded). On Apply, only checked matches are passed to `handleApplyAiMatches`. Rejected matches go to `handleRedoMatches`.

### `DelistingWarningModal`
- **State machine:** Pre-action confirm shown when user about to delist multiple items. Shows item count + per-platform breakdown + a typed-confirmation field for >10 items. Renders a list of items with thumbnails. On confirm fires the delist loop.

### Other inventory modals
- `StockReconciliationModal` (`:25`) — shows `reconcileStock` output, lets user pick actions per bucket.
- `CheckQuantityModal` (`:27`) — wraps `handleCheckEbayQuantities` flow with progress UI.
- `AIMatchProgressModal` (`:6`) — live event log during `matchListingsWithAI` run.
- `MatchSuggestionsModal` (`:14`) — accept/reject suggestions list.
- `MismatchAlertBanner` (`:21`) — surfaces critical mismatches.
- `ScanStatsWidget` (`:7`) — pulls `getInventoryScanStats` CF.
- `SoldActivityFeed` (`:35`) — activity log feed.
- `StockCheckWidget` (`:23`)
- `InventorySpreadsheet` (`:11`) — full-grid view variant.
- `PhysicalLocationEditor` (`:9`)

### Top-level UI components

#### `Navigation` — `src/components/Navigation.tsx:6`
- **What:** Sticky top nav. Left: logo + "Inventory Manager". Center: nav links Inventory / Sales / eBay / Depop / Poshmark / Offers.
- **Profile dropdown (new):** Replaces the inline email + sign-out. Uses Radix `DropdownMenu.Root` → `Trigger` (avatar circle with first 2 chars of email local-part, `+` `ChevronDown`) → `Portal/Content` (right-aligned, z-index 1100, animated zoom-in). Content rows:
  1. Header band: avatar + "Signed in as" label + `user.email` (truncated)
  2. `Profile` (disabled, "soon" tag)
  3. `Docs` (navigates `/docs` via `useNavigate`)
  4. Separator
  5. `Sign out` (red, calls `signOut()`)
- **Why Radix:** consistent with the rest of the app's modal/portal layer.

#### `DocsPage` — `src/pages/DocsPage.tsx:110`
- **Route:** `/docs`
- **Sources:** Fetches `/ARCHITECTURE.md`, `/FUNCTIONS.md`, `/AGENT.md` as static markdown via Vite's `public/`. No rebuild needed when docs agent updates the files at root + `public/`.
- **Parsing:** `parseDoc(md)` splits on top-level `## ` headings (regex `/^##\s+(.+?)\s*$/`). Anything before the first `## ` is `intro`. Each `## ` becomes a sidebar entry with a slugified `id`. Body includes the original heading so `ReactMarkdown` renders it.
- **Rendering:** `react-markdown` + `remark-gfm` (GFM tables, strikethrough, etc.). Three-pane layout: doc-switcher (left rail) → section nav (sidebar) → markdown body (main).
- **Anchor links:** Sidebar buttons set `activeSection` state; clicking scrolls the section body into view.

#### Other top-level modals (`src/components/`)
- `BulkPriceModal`, `BulkStatusModal`, `BulkScanModal`, `BulkCloneModal`, `BulkExportModal`, `BulkBarcodePrintModal`, `BulkPromotedListingsModal`, `BulkPromotionsModal`, `BatchPrintModal`, `QRCodePrintModal`, `LabelPrintModal` — bulk-action modals, each calling the corresponding `handle*` in `ClosetView`.
- `CreateSaleModal`, `SoldDelistModal`, `StockCheckModal`, `CSVImportModal`, `ListToEbayModal`, `ListToDepopModal`, `ListingSuggestionsModal`, `ListingSuggestionsPanel`, `DelistingWarningModal`, `DiagnosticsModal`, `EbayDetailsModal`, `AIActionConfirmationModal`, `ItemForm`, `ItemHistoryPanel`, `StatsDashboard`, `MarketplaceImporter`, `MarketplaceImporter_v2`, `SearchAndFilter`, `EbayConnector`, `BarcodeScanner`, `BarcodeScanModal`, `BarcodeImage`, `ClawdChat`, `SignIn`, `SkeletonCard`, `ErrorBoundary`.

---

## H. Chrome Extension (`depop-auth-extension/`)

### `background.js`
The extension is a single MV3 service worker injecting page-context fetch/XHR interceptors and DOM scrapers via `chrome.scripting.executeScript({ world: 'MAIN' })`.

#### Depop interceptor — installed on every `depop.com` page (`:454`)
- **What:** Replaces `window.fetch` + `XMLHttpRequest.prototype.open/send` to capture Depop's internal API responses. Filters for product / listing / receipts API URLs.
- **Auto-scroll mode (`shouldAutoScroll`):** Triggered when URL hash contains `autoScroll` (or `?autoScroll=true` query, or `document.referrer.includes('closet-da8f2')`). The widget Refresh button uses `https://www.depop.com/sellinghub/sold-items/#autoScroll`.
- **`MAX_SCROLL_ATTEMPTS = 6`** — was 18, cut to 6 after user reported "taking ages" on a fully-paginated sold view. Hard ceiling for "no Load More button found, just scroll" attempts.
- **`STALE_HEIGHT_LIMIT = 3`** — if `document.body.scrollHeight` doesn't change across 3 consecutive scroll attempts, bottom reached → early-exit. User explicitly asked: "make the extension stop when there is no load more, rn it keeps scrolling".
- **`QUIET_MS = 15000`** — was 30000. After scroll done, wait until Depop's `/receipts` API has been silent for 15s before firing `DEPOP_SCRAPE_COMPLETE`. Previously 30s but visibility-pokes (forced re-fetches) kept resetting it.
- **`SAFETY_MAX_MS = 60000`** — was 120000. Hard ceiling for the quiet-wait phase.
- **Visibility-poke loop:** Every 2.5s during the wait, dispatch `visibilitychange` + `focus` + `pageshow` events programmatically. Depop's seller-hub re-fetches receipts on these events, which is what loads the last 1-2 pages. Without this, the modal sees a partial count (e.g. 37 of 52).
- **DOM scrape:** On `DEPOP_SCRAPE_COMPLETE`, walks the seller-hub DOM (`querySelectorAll` on product card containers) for the canonical listings array. **Selling hub yields 107 items** in the working production state. Writes the deduped, enriched listings to `marketplaceData/{username}` via the syncWebhook CF.
- **Sold-items extraction:** When `/sellinghub/sold-items` page, the DOM scrape enriches each listing with `_purchaseId` (receipt id), `_soldPrice`, `_soldDate`, `_isBundle` (multi-item receipt flag), `_bundleSize`, `_itemsArrayMissing` (receipt where items[] is empty).

#### Poshmark interceptor — installed on every `poshmark.com` page (`:811`)
- **What:** Same fetch + XHR replacement pattern as Depop. Catches `vm-rest` URLs (Poshmark's internal API) and normalizes to a common shape.
- **DOM scrape (`scrapePoshmarkDOM`):** Poshmark server-renders closet data so the DOM is the source of truth. Scrapes title elements (`tile__title`) → walks up to common row container → extracts price, size, brand, image, listing_id, listing_url.
- **`/closet/...` page yields ~240+ items** (entire closet). The widget Refresh opens `https://poshmark.com/closet/retrothriftc0?availability=available#autoScroll`.
- **`/order/sales` page** is the sold-items scrape — the widget opens `https://poshmark.com/order/sales/#autoScroll`. Same auto-scroll + scrape pipeline, but writes to `marketplaceData/poshmark_sold_{username}`.

#### Auto-scroll convention
- **The `#autoScroll` hash is the trigger.** Both Depop and Poshmark interceptors check `window.location.hash.includes('autoScroll')` to enable the auto-scroll + scrape-when-done flow. The widget Refresh always appends this hash.
- **Without the hash:** Auto-scroll doesn't fire → user sees their normal seller-hub view → scrape collects only what's currently rendered (~10 items instead of 240+).

### `content-script.js` / `poshmark-content-script.js`
- **What:** Thin proxy that listens for `window.postMessage({ type: 'DEPOP_SCRAPE_COMPLETE', ... })` from the page-world interceptor, then calls `chrome.runtime.sendMessage` to forward the listings to `background.js`, which POSTs to the `syncWebhook` CF.
