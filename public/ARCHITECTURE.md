# RetroThriftCo Virtual Closet — Architecture

This is the engineering source-of-truth doc. It is paired with `FUNCTIONS.md`
(alphabetized function reference). When the assistant hits context compaction
or a new agent comes in cold, these two docs are designed to bring them up to
speed without re-reading the entire codebase.

---

## 1. Project Overview

**What the app does.** A multi-platform resale inventory manager for
RetroThriftCo. eBay is the inventory anchor; Poshmark and Depop are
cross-listed via per-platform import/match flows. The app tracks live stock
across all three sites, surfaces new sales, and prevents overselling.

**Tech stack.**

- React 18 + TypeScript + Vite
- Tailwind CSS
- Firebase v9 modular SDK — Firestore (data), Auth, Hosting, Cloud Functions (Node 20, 1st gen)
- Zustand state management (with `immer`)
- Chrome extension at `depop-auth-extension/` — scrapes Depop and Poshmark listings/sales via DOM, posts to `marketplaceData/*` Firestore docs
- OpenClaw (`src/services/openclawService.ts`, `http://localhost:18789`) — local automation bridge for cross-platform delisting / mark-sold actions
- **Firebase project ID:** `closet-da8f2`
- **Hosting URL:** https://closet-da8f2.web.app

**Routing surfaces (see `src/pages/`).**

- `/closet` (`ClosetPage` → `ClosetView`) — main inventory grid (eBay-anchored)
- `/ebay` (`EbayIntegrationPage`) — eBay integration, OAuth, stats
- `/poshmark` (`PoshmarkIntegrationPage`) — Poshmark integration page: Import → Match → LastSoldWidget
- `/depop` (`DepopIntegrationPage`) — Depop integration page: Import → Match → LastSoldWidget + NewSalesSinceBaselineWidget
- `/import` (`ImportPage`) — CSV / Vendoo imports
- `/items/:id` (`ItemDetailPage`) — per-item detail
- `/sales` (`SalesPage`) — sales tracker
- `/docs` (`DocsPage`) — renders this `ARCHITECTURE.md` + `FUNCTIONS.md` + `AGENT.md` from `/public/*.md` at runtime
- `/marketplaces` (`MarketplacesPage`), `/shopify` (`ShopifyAdminPage`, `ShopifyStorefront`) — secondary surfaces

**Removed (2026-05-07):** `/activity`, `/connections`, `/scan` and their nav
items; in-ClosetView Sync Stock and Match Depop/Poshmark dropdown actions
(Match is now per-page).

**Added (2026-05-09 → 2026-05-10):** Profile dropdown in nav (Radix
`DropdownMenu`), `/docs` route with runtime markdown fetch, `LastSoldWidget`
Revert button (amber ↺), content-fingerprint dedup in `writeSnapshotBatch`.

---

## 2. Stock Model — load-bearing formula

```text
real_stock = baseline_stock
           − Σ(non-eBay sales since baseline)        // Posh + Depop SaleSnapshot rows status≠'baseline'
           − (any eBay qty decrease since baseline)  // ebayQuantityAtBaseline − currentEbayQty
```

**The exact user rule (lock these — never re-derive):**

> **Baseline = restock moment.** `SaleSnapshot` rows with `status='baseline'`
> are an audit trail of sales **already absorbed** in the calibrated baseline
> quantities. **They are NEVER counted by the reconciler.** Only `pending`
> and `reconciled` rows count as new sales.
>
> **Any decrease in eBay qty since baseline IS a real sale.** The user does
> NOT manually update eBay stock after the baseline. So if eBay shows a lower
> qty than `Item.ebayQuantityAtBaseline`, the only thing that explains the
> drop is an eBay-side sale.

**Baseline preservation guarantee.** `writeSnapshotBatch` (see
`src/services/inventory/saleSnapshot.ts`) dedupes cross-status via
`getSnapshotKeySet` (returns ALL statuses' saleKeys) — any new write whose
`saleKey` already exists at any status is silently skipped. As a second
defense, the function also dedupes by content fingerprint
(`normalizeTitleForMatch(title) | salePrice.toFixed(2)`) so cross-source
duplicates (CSV-imported baseline vs extension-scraped refresh) are also
caught. The baseline rows the user calibrated on are immutable for all
subsequent flows. `upsertListings` does NOT write `firstSeenAt` either —
that's set exactly once by the `onPlatformListingCreate` Cloud Function
trigger.

**Per-item baseline (Linear 444-142 Phase 1, deployed).** Each eBay-anchored
`Item` carries:
- `ebayQuantityAtBaseline` — what eBay reported the listing qty as at
  calibration time
- `physicalQuantityAtBaseline` — the user's physical count
- `baselineCalibratedAt` — ISO timestamp

These are written by `handleCalibrateBaseline` in a 400-doc `writeBatch`
sweep over every Item with `ebayListingId || ebayItemId`. Source of the
baseline value: prefer the `syncData.ebayActive` lookup map (the qty eBay
reported at calibration time); fall back to `Item.ebayQuantity` if the
listing isn't in syncData; fall back to 0 if neither.

### Worked example

```text
Item A — eBay listing 123456
  ebayQuantityAtBaseline       = 3   (baseline state)
  currentEbayQty               = 2   (live from ebayGetAllListings)
  poshSales (since baseline)   = 0   (SaleSnapshot poshmark rows status≠baseline)
  depopSales (since baseline)  = 0
  ebaySalesSinceBaseline       = max(0, 3 − 2) = 1
  expectedCurrentQty           = 3 − 1 − 0 − 0 = 2
  discrepancy                  = currentEbayQty − expectedCurrentQty = 2 − 2 = 0   ✓ stock matches
```

If `discrepancy < 0` → suspected oversell (eBay shows fewer than expected → 
likely an unreconciled Posh/Depop sale we missed).
If `discrepancy > 0` → suspected over-decrement (we attributed a sale that
didn't actually happen).

---

## 3. Firestore Collections

| Collection | Doc ID shape | Writes by | Reads by |
|---|---|---|---|
| `Item` | auto | `useItemStore.addItem/updateItem`, `handleCheckEbayQuantities`, `importDepopItems`, `importPoshmarkItems`, `importCSVData` CF, `handleCalibrateBaseline` (per-item baseline seed), `handleReconciliationFromSyncData` (eBay-qty mirror + sold decrements + platform-link backfill) | `useItemStore.initializeStore`, every UI page, matcher, reconciler |
| `PlatformListing` | `{userId}:{platform}:{listingId}` | `upsertListings`, `markListingsAsBacklog`, `setListingItemId`, `bulkSetListingItemIds`, `markRemovedListings`, `matchListingsWithAI` CF, `clearPlatformBindings` CF | `getListings`, `getActiveListings`, `PlatformMatchModal`, sync flows |
| `SaleSnapshot` | auto | `writeSnapshotBatch`, `markCounted`, `markUncounted`, `syncRecentSoldItems`, `handleCalibrateBaseline`, `handleReconciliationFromSyncData`. **Deleted by `deleteNonBaselineRows`** (non-baseline only) | `getSnapshot`, `getSnapshotKeySet`, `LastSoldWidget` (`onSnapshot`), `NewSalesSinceBaselineWidget` (`onSnapshot`) |
| `InventorySnapshot` | auto | `writeSnapshot` (called by calibrate + sync) | `getLatestSnapshot`, `getCalibrationSnapshot`, `listSnapshots` |
| `CalibrationStatus` | `{userId}` | `confirmPlatformCount`, `recordBaselineSnapshot`, `resetCalibration` | `getCalibrationStatus`, UI banner reads |
| `marketplaceData` | `{username}` (active), `depop_sold_{username}`, `poshmark_sold_{username}` | Chrome extension (DOM scrape), `saveMarketplaceSync` CF, `syncWebhook` CF | `syncRecentSoldItems`, Depop/Poshmark Import modals (poll), `handleReconciliationFromSyncData` |
| `depop_user_info` | `{userId}` | extension auth flow | `resolveDepopSyncData` (read username) |
| `depop_cookies` | `{userId}` | extension auth flow | `depop-service.ts` CFs (read cookies/token) |
| `ebay_credentials` | `{userId}` | `ebayCallback` CF (OAuth completion) | all `ebay*` CFs |
| `ebay_pending_oauth` | `{state}` | `ebayOAuthUrl` CF | `ebayCallback` CF |
| `gmail_credentials` | `{userId}` | `gmailCallback` CF | `gmailFetchInventoryCSVs` CF |
| `ActivityLog` | auto | `activityLog.ts` all `log*` helpers, `onActivityLogCreate` CF (sets verification status) | analytics pages, scan stats |
| `aiMatchRuns/{runId}/events/{idx}` | auto | `matchListingsWithAI` CF (live event stream) | `AIMatchProgressModal` (live progress) |
| `Sale` | auto | `useSaleStore` create/update/bulkDelete, `recordSale` | `useSaleStore.loadSales`, `/sales` page |
| `users/{userId}/marketplaceData/sync` | subcollection | extension auth-sync path | `resolveDepopSyncData`, `resolvePoshmarkSyncData` (fallback) |

### Doc shapes (the fields that matter)

**`Item`** — eBay-anchored. Carries:
- `name` / `title`, `size`, `status`, `physicalQuantity`, `ebayQuantity`, `ebayQuantitySold`, `stockStatus`
- `ebayListingId`, `ebayItemId`, `ebayUrl`, `ebayFullTitle`, `ebayFullDescription`, `ebayItemSpecifics`, `ebaySku`
- **`ebayDelisted`** — `true` when `handleCheckEbayQuantities` couldn't find the listing in the eBay API response (or when eBay returns qty=0). Read by the closet row to render a gray ✕ instead of the blue "e" badge.
- `poshmarkListingId`, `poshmarkUrl`, `poshmarkQuantity`
- **`poshmarkImportedAt`** — ISO timestamp. Set ONLY by `importPoshmarkItems` (i.e. the user explicitly imported this Posh listing via `PoshmarkImportModal`). Used by the modal to render persistent green Imported badges across sessions. Distinct from `poshmarkListingId` (which can be set by auto-link / calibrate / sync flows too).
- `depopListingId`, `depopUrl`, `depopQuantity`
- **`depopImportedAt`** — ISO timestamp. Same pattern as `poshmarkImportedAt` but for Depop.
- **`ebayQuantityAtBaseline`** — eBay qty at calibration time. Written by `handleCalibrateBaseline` Step 3. Read by the Phase 2 reconciler (pending) to compute `ebaySalesSinceBaseline = max(0, baseline - current)`.
- **`physicalQuantityAtBaseline`** — physical stock at calibration time.
- **`baselineCalibratedAt`** — ISO timestamp of the per-item baseline write. Set by Step 3 of `handleCalibrateBaseline`.
- `unitSales[]` — historical sales with `{ platform, soldAt, priceCents, note? }` shape used by `reconcileStock`. Note key formats: `'ebay:auto'`, `'depop:{_purchaseId}[ [BUNDLE Nx]]'`, `'posh:{order_id||listing_id}'`.
- `itemActivity[]` — per-action audit log, capped at 50 entries (tail-sliced).
- `imageUrl`, `ebayPrimaryImage`, `ebayPhotos[]`, `barcode`, `notes` (includes `Hanger: H123` prefix)
- `dateAdded`, `tags`, `normalizedTags`

**`PlatformListing`** — `userId:platform:listingId` keyed.
- `userId`, `platform`, `listingId`, `title`, `status` (`active`/`removed`), `lastSeenAt`, `firstSeenAt` (set ONCE by CF), `removedAt`
- `price`, `qty`, `qtySold`, `itemId` (binding to `Item`)
- `flagged: 'low_price' | 'backlog'` + `backloggedAt`
- scraper extracted: `description`, `brand`, `sizeRaw`, `color`, `category`

**`SaleSnapshot`** — append-only sales log.
- `userId`, `platform`, `saleKey` (cross-status dedup key), `listingId`, `title`
- `status: 'baseline' | 'pending' | 'reconciled'`, `firstSeenAt`, `lastSeenAt`, `reconciledAt`
- `soldAt?`, `salePrice?`, `imageUrl?` (new pending rows only — baseline pre-dates field)

**`InventorySnapshot`** — `{ userId, reason: 'calibration'|'sync', takenAt, totals, saleSnapshotIds, notes? }`. The `calibration` snapshot is immutable.

**`CalibrationStatus`** — `{ userId, ebay, poshmark, depop, fullyCalibrated, fullyCalibratedAt }` where each per-platform field is `{ platform, isConfirmed, confirmedCount, confirmedAt, baselineSnapshotAt, baselineCount }`.

**`marketplaceData`** — raw extension scrape dumps. Shape: `{ platform, listings: any[], updatedAt, ... }`. Active doc per user/username (`{username}`), sold-specific docs at `depop_sold_{username}` / `poshmark_sold_{username}`.

---

## 4. Cross-source dedup (the load-bearing detail)

`writeSnapshotBatch` (`src/services/inventory/saleSnapshot.ts:143`) is the
single chokepoint for every sale write — Calibrate, Sync, and per-platform
Refresh all funnel through it. It dedupes against existing rows using **two
independent keys**:

### Primary: `saleKey`

A deterministic string built from platform-specific receipt/order identifiers:

- **eBay:** `'ebay:{listingId}:sold:{index}'` — one synthetic key per sold unit so a 3-of-3-sold listing gets 3 distinct keys.
- **Depop:** `'depop:{_purchaseId}:{id}'` when both exist; falls back to `'depop:{id|purchaseId}:{N}'` for receipts with missing fields. `_purchaseId` is critical for bundle dedup — a 3-item bundle has one `_purchaseId` shared across all 3 line items.
- **Poshmark:** `'poshmark:order:{orderId}'` (preferred — unique per sale); falls back to `'poshmark:listing:{listingId}:{sold_date_iso}'`; final fallback `'poshmark:row:{N}'`.

When the import source generates the same saleKey twice, the second write is
silently skipped. This is the baseline-preservation guarantee — re-running
Calibrate doesn't duplicate the existing baseline rows.

### Secondary: content fingerprint

```text
fingerprint = normalizeTitleForMatch(title) | salePrice.toFixed(2)
```

`normalizeTitleForMatch` lowercases, swaps curly quotes/apostrophes for
straight ASCII, strips every non-alphanumeric-non-whitespace char to a space,
collapses whitespace, trims. Two titles that look the same to a human
collapse to the same string.

**Why date was dropped from the fingerprint.** The original implementation
keyed on `title|YYYY-MM-DD|price`. That was too strict because:
1. CSV-imported baseline rows often lack `soldAt`.
2. The extension scrape carries `soldAt` in a different ISO format than the
   CSV.
3. Resale items are unique by listing — title + price is plenty diagnostic
   for catching cross-source duplicates.

The fix: drop the date entirely. Now `title|price` catches every cross-source
duplicate regardless of how the sold-date was stored on either side.

### Algorithm (per platform, per input)

1. Fetch existing rows for `(userId, platform)` via `getSnapshot` — no status filter, so baseline + pending + reconciled all in scope.
2. Build `Set<saleKey>` and `Set<contentFingerprint>` from existing rows.
3. For each input:
   - If `existing.saleKey.has(input.saleKey)` → skip (already exists, any status).
   - Else if `input.fingerprint` non-empty AND `existing.fingerprint.has(input.fingerprint)` → skip (cross-source duplicate).
   - Else → insert with the given target status (`baseline` / `pending` / `reconciled`).
4. Batched at 400 ops. Undefined fields stripped before write (Firestore rejects them).

---

## 5. OOS badge flow

The closet row renders a small platform badge (blue "e" / purple "P" / red "D")
in the bottom-right of each thumbnail. eBay's badge has an alternate state:
**gray ✕** when the eBay listing is out-of-stock or delisted.

### The data path

`handleCheckEbayQuantities` (`ClosetView.tsx:2265`) reconciles each
eBay-anchored Item against the live `ebayGetAllListings` API response:

- **Listing in API response:** `Item.ebayDelisted = ebayQty === 0 ? true : false`. So a qty-0 listing AND a delisted listing both flip the badge.
- **Listing NOT in API response:** `Item.ebayDelisted = true` (the user delisted it, eBay ended it, or the listing went private).

### The render path

`ClosetView.tsx:3383`:

```tsx
const isOos = item.ebayDelisted === true || ((item.ebayQuantity ?? 1) === 0);
return isOos
  ? <span className="... bg-gray-700 ... text-red-300 ..." title="eBay — out of stock / delisted (was: e)">✕</span>
  : <span className="... bg-blue-600 ..." title="eBay">e</span>;
```

The blue → gray transition happens automatically on the next Zustand store
patch after `handleCheckEbayQuantities` finishes. No reload required.

---

## 6. Data Flow Diagrams

### A. Calibrate baseline (user clicks "Calibrate" → SyncStockModal in calibrate mode → onApply)

```text
[User clicks Calibrate]
        │
        ▼
SyncStockModal collects:
  ebayActive[], ebayQuantitySold per listing
  depopSold[], depopActive[]   (from marketplaceData via extension)
  poshmarkSold[], poshmarkActive[]
        │
        ▼
handleCalibrateBaseline(syncData)   (src/components/ClosetView.tsx:1450)
        │
        ├──► writeSnapshotBatch(userId, salesInputs, 'baseline')
        │       → SaleSnapshot/{...} status=baseline (dedupe by saleKey + content fingerprint)
        │
        ├──► (build PlatformListing inputs + auto-bind by listingId)
        │       fuzzy-match unmatched via findEbayMatchForListing
        │       flag listings under $40 as low_price
        │
        ├──► upsertListings(userId, listingInputs)
        │       → PlatformListing/{userId:platform:listingId}
        │         (CF onPlatformListingCreate sets firstSeenAt once)
        │
        ├──► per-Item baseline seed (writeBatch update, batched at 400)
        │       → Item.ebayQuantityAtBaseline,
        │         Item.physicalQuantityAtBaseline,
        │         Item.baselineCalibratedAt
        │
        ├──► confirmPlatformCount(userId, 'ebay'|'poshmark'|'depop', count)
        │    recordBaselineSnapshot(userId, platform, count)
        │       → CalibrationStatus/{userId}
        │
        ├──► writeSnapshot({ reason:'calibration', totals, saleSnapshotIds })
        │       → InventorySnapshot/{...}
        │
        └──► logCalibrationRun(userId, { ...metadata })
                → ActivityLog/{...} activityType=CALIBRATION_RUN
```

### B. Depop Import flow (per-page on `/depop` → DepopImportModal)

```text
[User opens DepopImportModal]
        │
        ▼
On open: wipe marketplaceData/{username},
         window.open(https://www.depop.com/<seller-hub>)
         poll Firestore every 3s for up to 5 minutes
        │
        ▼
Extension DOM-scrapes Depop, writes marketplaceData/{username}
        │
        ▼
Modal reads listings, builds rows. Per-row:
  findTopEbayMatchesForListing(title, size, ebayItems, 3, excludeSet)
        │
        ├── User clicks a candidate radio  → selection[id] = ebayItemId
        ├── User clicks "Reload"            → grow excludeSet → next 3 candidates
        ├── User clicks "Match manually"    → search popover over FULL inventory
        └── User clicks "None of these"     → selection[id] = 'none'
        │
        ▼
[User clicks Import]
        │
        ├──► importDepopItems(matchedListings, userId, ebayMatchMap)
        │       → Item.depopListingId / depopUrl / depopQuantity / depopImportedAt
        │
        └──► markListingsAsBacklog(userId, noneSelectedListings)
                → PlatformListing/{...} flagged='backlog', backloggedAt
                  itemId=null (clears any prior binding)
        │
        ▼
"Review unmatched (N)" → DepopUnmatchedModal
  Per-row "Delist from Depop" → depopDelistItem CF
  Bulk "Delist all remaining" → loop depopDelistItem (sequential, rate-safe)
```

Poshmark import flow is identical structure (`PoshmarkImportModal`), using
`importPoshmarkItems`, `markListingsAsBacklog` with `platform: 'poshmark'`,
and `gologinDelistItem` (with `platform: 'poshmark'`) for unmatched delists.

### C. LastSoldWidget Refresh (per-platform, on `/depop` or `/poshmark`)

```text
[User clicks Refresh on LastSoldWidget]
        │
        ▼
window.open(<platform sold-items URL>#autoScroll)
   ◦ Depop: https://www.depop.com/sellinghub/sold-items/#autoScroll
   ◦ Poshmark: https://poshmark.com/order/sales/#autoScroll
        │
        ▼
Extension sees #autoScroll hash → triggers MAX_SCROLL_ATTEMPTS=6 + receipts-API
quiet-wait (QUIET_MS=15000) → scrapes → writes marketplaceData/{platform}_sold_{username}
        │
        ▼
Wait 30s (widget setTimeout)
        │
        ▼
syncRecentSoldItems(userId, platform)        (src/services/inventory/syncSoldItems.ts)
        │
        ├── resolveDepopSyncData(userId)         (depop)
        │   resolvePoshmarkSyncData(userId)      (poshmark)
        │     → tries `marketplaceData/depop_sold_{u}` first, then `{u}`, then subcollection,
        │       then scan for `depop_sold_*` docs, then any `platform=depop` doc
        │
        ├── Build SnapshotInput[] (with imageUrl per row)
        │
        └── writeSnapshotBatch(userId, inputs, 'pending')
              → SaleSnapshot/{...} status='pending'
              → dedup against ALL existing saleKeys (incl. baseline) — locked rows
                never overwritten
              → AND dedup against content fingerprint (title|price)
                catches cross-source duplicates from CSV-imported baseline rows
        │
        ▼
LastSoldWidget's live `onSnapshot(SaleSnapshot where userId=...)`
  picks up the new pending rows automatically — no manual reload.
  Toast: "+X new {platform} sales · Y already in baseline".
```

### D. LastSoldWidget Revert (cleanup after a duplicating refresh)

```text
[User clicks amber ↺ on LastSoldWidget]
        │
        ▼
window.confirm("Revert {platform} back to baseline? KEEP N baseline rows. DELETE M pending + K reconciled.")
        │  (yes)
        ▼
deleteNonBaselineRows(userId, platform)   (src/services/inventory/saleSnapshot.ts:249)
        │
        ├── getSnapshot(userId, platform)  → all rows for (userId, platform)
        ├── filter r.status !== 'baseline'  → toDelete[]
        └── for each chunk of 400:
              writeBatch.delete(doc(SaleSnapshot/{id}))
              batch.commit()
        │
        ▼
Toast: "Reverted N {platform} rows → baseline restored"
LastSoldWidget's onSnapshot re-renders with only baseline rows visible
```

### E. Check Quantity (eBay sync) — ClosetView toolbar

```text
[User clicks "Check Quantity"]
        │
        ▼
handleCheckEbayQuantities()         (src/components/ClosetView.tsx:2265)
        │
        ▼
ebayGetAllListings CF (functions/src/index.ts:1579, runWith timeout 300s)
  → returns Array<{ itemId, quantity, quantityAvailable, quantitySold }>
        │
        ▼
Build qtyMap + soldMap. For each local eBay-anchored Item:
        │
        ├── Listing NOT in API response
        │     → Item.ebayDelisted=true, ebayQuantity=0,
        │       stockStatus='OUT_OF_STOCK', status='SOLD'
        │       → closet row swaps blue "e" badge for gray "✕"
        │
        └── Listing in API response
              → Item.ebayQuantity = ebayQty
                Item.ebayQuantitySold = ebaySoldNum
                Item.ebayDelisted = (ebayQty === 0)  // clears flag when relisted
                Item.physicalQuantity = ebayQty
                Item.stockStatus = (ebayQty<=0 ? OOS : ebayQty<=2 ? LOW : IN_STOCK)
                Item.status = (ebayQty>0 ? IN_STOCK : SOLD)
        │
        ▼
Batched writeBatch (size 400) → Item updates
Zustand `useItemStore.setState` immer-patch (mutates items[] AND filteredItems[]) → applyFilters()
loadItems() → background re-fetch
```

### F. Profile dropdown + Docs route

```text
Navigation.tsx
   │
   ├── nav links (Inventory / Sales / eBay / Depop / Poshmark / Offers)
   │
   └── Radix DropdownMenu.Root
        │
        ├── Trigger: avatar circle (first 2 chars of email) + ChevronDown
        │
        └── Portal/Content (z-1100)
             ├── Header band — avatar + "Signed in as" + email
             ├── Profile (disabled, "soon")
             ├── Docs → navigate('/docs')
             │           │
             │           ▼
             │   DocsPage.tsx renders:
             │     · doc-switcher rail (Architecture / Functions / Agent)
             │     · section sidebar (parsed from `## ` h2 headings)
             │     · markdown body via react-markdown + remark-gfm
             │
             │   Sources:
             │     /ARCHITECTURE.md  (this file, served from public/)
             │     /FUNCTIONS.md
             │     /AGENT.md
             │
             │   Production: https://closet-da8f2.web.app/docs
             │
             └── Sign out → signOut() → redirected to sign-in
```

---

## 7. Deploy + Dev Workflow

**Build.** `npm run build` (TypeScript + Vite).

**Hosting deploy.**

```bash
NODE_OPTIONS=--use-system-ca firebase deploy --only hosting
```

The `NODE_OPTIONS=--use-system-ca` env var is REQUIRED on Node 24. Without it
Node rejects Google's TLS chain with "unable to verify the first certificate"
because the cert chain isn't in Node's bundled root CAs.

**Cloud Functions deploy.**

```bash
NODE_OPTIONS=--use-system-ca firebase deploy --only functions
```

(Same TLS reason. Builds from `functions/` workspace.)

**Local dev.** `npm run dev` → Vite dev server. Auth/Firestore hit prod
backend directly.

**Hosting URL.** https://closet-da8f2.web.app
**Docs URL.** https://closet-da8f2.web.app/docs

---

## 8. Linear Workspace

- **Team:** `444` — id `e11b6a72-756b-40fa-8443-795cfa8fe6c8`
- **PRD doc id:** `c27c879c-ea13-4391-8f95-b8b6dade35f9` (canonical source of truth, synced from Firestore `/prd/current`)

**Issues to know:**

| ID | Summary | Status |
|---|---|---|
| 444-137 | Per-page match flow + remove Sync Stock + retire Activity/Connections/Scan | Done |
| 444-138 | Unified inventory filter | Backlog |
| 444-139 | Cross-platform decrement orchestrator (auto-decrement eBay qty + delist on non-eBay sale) | Backlog |
| 444-140 | LastSoldWidget refresh button, photo thumbnails, scrollable in-place, totals strip | Done |
| 444-141 | Poshmark import depop-parity (list layout, backlog, unmatched modal) | Done |
| 444-142 | Sync Stock model phases | Phase 1 Done; Phase 2/3 pending |

---

## 9. Hallucination Blacklist (carry-over from PRD)

Never invent or assume without explicit confirmation:

- Firestore collection names (verify via Firebase MCP)
- eBay API field names or response shapes
- Vendoo CSV column names
- Depop API endpoints (unofficial — change frequently)
- Component prop interfaces (read the source)
- Poshmark / Depop platform rules

**Legal constraint (non-negotiable).** Fanatics replica jerseys must NEVER
be described as "authentic", "stitched", or "embroidered" anywhere in the
app or in any worker prompt.

---

## 10. Where to find things

- Cloud Functions index: `functions/src/index.ts`
- Matcher (server, deterministic): `functions/src/match.ts`
- Matcher (client, deterministic): `src/services/inventory/listingMatcher.ts`
- Stock model writes: `src/services/inventory/saleSnapshot.ts`, `platformListing.ts`, `inventorySnapshot.ts`
- Reconciliation: `src/services/inventory/reconciliation.ts`
- Sync flow: `src/services/inventory/syncSoldItems.ts`
- ClosetView (main inventory grid + handlers): `src/components/ClosetView.tsx`
- Per-platform pages: `src/pages/DepopIntegrationPage.tsx`, `PoshmarkIntegrationPage.tsx`, `EbayIntegrationPage.tsx`
- Import modals: `src/components/depop/DepopImportModal.tsx`, `src/components/poshmark/PoshmarkImportModal.tsx`
- Unmatched modals: `src/components/depop/DepopUnmatchedModal.tsx`, `src/components/poshmark/PoshmarkUnmatchedModal.tsx`
- Widgets: `src/components/inventory/LastSoldWidget.tsx`, `NewSalesSinceBaselineWidget.tsx`
- Match modal: `src/components/inventory/PlatformMatchModal.tsx`
- Navigation + profile dropdown: `src/components/Navigation.tsx`
- Docs page: `src/pages/DocsPage.tsx`
- Stores: `src/store/useItemStore.ts`, `useAuthStore.ts`, `useSaleStore.ts`, `useEbayStore.ts`, `useInventoryScanStore.ts`
- Activity log: `src/services/activityLog.ts`
- Extension: `depop-auth-extension/`
- Static docs served at runtime: `public/ARCHITECTURE.md`, `public/FUNCTIONS.md`, `public/AGENT.md`
