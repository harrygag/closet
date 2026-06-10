# AGENT.md — Conceptual Handbook for the Next Agent

You are the next AI agent on this codebase. You have full Edit access and zero memory of how this system got here. This document is the briefing you need before you change anything. It is **not** a directory tree (see `FUNCTIONS.md` for that), and it is **not** a user manual. It is a handbook of system thinking: what the moving parts are, why they're shaped this way, and where the invariants live.

Read top-to-bottom once. After that, jump back to specific sections by name when you hit unfamiliar territory.

---

## 1. The mission

This is the RetroThriftCo Virtual Closet — a single-user web app that keeps the user's resale inventory honest across three platforms (eBay, Poshmark, Depop). The user lists physical thrift inventory on all three sites; whichever site sells first should immediately trigger a stock-decrement on the other two so the user never oversells. The app is the user's source of truth: which items exist, what's in stock, what sold, what's still listed where. There is real money on the line in both directions — overselling means refunds, apologies, and platform penalties; undercounting means he ends up with dead stock he forgot to relist. Every architectural decision in this codebase is downstream of *don't lose track of physical units*.

---

## 2. The stock model

This is the load-bearing concept in the entire application. Internalize it before touching anything in `src/services/inventory/`.

### The formula

```text
real_stock = baseline_stock
           − Σ(non-eBay sales since baseline)        // Posh + Depop SaleSnapshot rows status ≠ 'baseline'
           − (any eBay qty decrease since baseline)  // ebayQuantityAtBaseline − currentEbayQty
```

That's it. Three terms. Everything in the reconciler, in the LastSoldWidget, in the Sync Stock modal, in `Item.ebayQuantityAtBaseline` — it all exists to compute one of those three terms accurately, and to never double-count.

### Worked example (memorize this — it's how you sanity-check every change)

```text
Item A — eBay listing 123456
  ebayQuantityAtBaseline       = 3        (at calibration, eBay said qty=3)
  poshSales since baseline     = 1        (one Poshmark SaleSnapshot 'pending' row exists)
  depopSales since baseline    = 0
  expected currentEbayQty      = 3 − 1 − 0 = 2
  observed currentEbayQty      = 2        (live from ebayGetAllListings)
  discrepancy                  = 0        → stock matches
```

If observed eBay qty drops to 1 with no new SaleSnapshot rows, the model attributes that drop to a missed cross-platform sale (or a direct eBay sale we haven't yet recorded a SaleSnapshot for) — the user manually decrements his physical count too, but the *model* knows eBay went down by one and reports that as `ebaySalesSinceBaseline = 1` next time around.

### The user rule that locks the model

There is one rule from the user that turns this from a guess into a guarantee, and the entire codebase depends on it staying true:

> **The user does not manually update eBay stock after the baseline.** If eBay shows a lower qty than `Item.ebayQuantityAtBaseline`, the only explanation is an eBay-side sale. Period.

This is why `Item.ebayQuantityAtBaseline` is sacred. It is the only number that lets us say "the difference between then and now must be a sale" with certainty. If a future feature ever introduces a code path that lets the user nudge eBay qty without going through an actual eBay listing edit, the model breaks. Guard this invariant with your life.

### Baseline immutability — the SaleSnapshot story

Every sold-line-item across all three platforms gets stored as a row in the `SaleSnapshot` Firestore collection ([src/services/inventory/saleSnapshot.ts](src/services/inventory/saleSnapshot.ts)). Each row carries a `status` field with one of three values, and **the difference between them is what makes the model work**:

- **`baseline`** — written by Calibrate. These rows are a snapshot of "every sale that had already happened by the time the user calibrated his baseline numbers." They are **immutable**. No code path is allowed to overwrite them, and the reconciler **never counts them** as new sales — they're already absorbed into `ebayQuantityAtBaseline`. If you accidentally let a Refresh write a duplicate of a baseline sale as a `pending` row, you will silently double-decrement the user's stock and he will oversell.
- **`pending`** — written by `syncRecentSoldItems` during a LastSoldWidget Refresh. These are sales detected after baseline that haven't been applied to eBay stock yet. They count as "new sales since baseline" — meaning `real_stock` drops by one for each pending row on Posh or Depop.
- **`reconciled`** — pending rows that were applied (eBay qty decremented, other-platform listing delisted). Today nothing flips this status automatically; it's reserved for the future cross-platform orchestrator (Linear 444-139). Treat the reconciled status as "already counted" — same arithmetic role as pending, semantically post-action.

### Why dedup is so hard

A single physical sale of a Poshmark item can produce two completely different `SaleSnapshot` row candidates if the user calibrated from a CSV export and then later runs a Refresh that scrapes the same sale from the Poshmark sold-items page. Both rows describe the *same physical event*, but:

- The **CSV baseline row** was built from a Vendoo export, which has no consistent order_id field, no consistent ISO date, and prices as floats in dollars.
- The **scrape pending row** was built from the live Poshmark order page, with a real order_id, a different ISO date format, and (depending on the field) prices in cents.

If both rows land in Firestore, the user has the same sale counted twice: once already absorbed in his baseline, once as a "new sale" subtracted again. The fix lives in `writeSnapshotBatch` ([src/services/inventory/saleSnapshot.ts:180](src/services/inventory/saleSnapshot.ts)) and is the most subtle code in the project. See Section 5 for the full dedup chapter — it earned its own section because two days of work went into it.

---

## 3. The data lifecycle — calibrate → import-match → refresh → reconcile

Walk a single Poshmark sale through the system, from "user listed it" to "eBay qty decremented."

### Step 1: Calibrate (a one-time act, then again whenever the user restocks)

The user clicks **Calibrate** on the Closet page. The Sync Stock modal opens in calibrate mode and collects a coherent snapshot of the world: every active eBay listing + its qty/sold, every Depop active and sold listing (from the extension scrape in `marketplaceData`), every Poshmark active and sold.

`handleCalibrateBaseline` in [ClosetView.tsx:1450](src/components/ClosetView.tsx) is the entry point. It does five things in order:

1. **Writes baseline SaleSnapshot rows.** Every sold receipt across all three platforms becomes a `status='baseline'` row via `writeSnapshotBatch`. These rows now represent "the sales that are already absorbed into current eBay qty."
2. **Upserts PlatformListing rows** for every active Poshmark/Depop listing. Auto-binds to an eBay Item where the listingId already matches; runs a fuzzy `findEbayMatchForListing` for the rest; flags listings under $40 as `low_price` so the user can review them later.
3. **Seeds the per-item baseline.** For every Item with an `ebayListingId`, it writes `ebayQuantityAtBaseline`, `physicalQuantityAtBaseline`, `baselineCalibratedAt`. The eBay qty value comes from the live API response collected in step 1.
4. **Updates `CalibrationStatus`** so the UI knows the user has calibrated and stops nagging him.
5. **Writes an `InventorySnapshot`** with `reason='calibration'` — an audit trail of what the world looked like at the moment of calibration. The `saleSnapshotIds` array on this row is the only place that maps back to "which SaleSnapshot rows were created by this calibration run."

After Calibrate finishes, the stock model is grounded. Every future event is interpreted relative to this moment.

### Step 2: Import-Match (the user adds Poshmark + Depop listings to the closet)

The user opens `/depop` (or `/poshmark`) and clicks Import. The modal opens, wipes the user's `marketplaceData/{username}` doc, opens the platform's seller-hub URL in a new tab, and polls Firestore every 3 seconds. The Chrome extension at [depop-auth-extension/](depop-auth-extension/) sees the page load, scrapes the DOM, and writes the scraped listings into `marketplaceData/{username}`. The modal sees the write and shows the user every active listing alongside up to 3 candidate eBay items per row (computed locally by `findTopEbayMatchesForListing` in [src/services/inventory/listingMatcher.ts](src/services/inventory/listingMatcher.ts), deterministic — no AI in this path).

For each listing the user picks one of four outcomes per row: pick a candidate, click Reload to fetch the next 3, search the full inventory manually, or click **None of these**. "None of these" is **not** a skip — it writes a `PlatformListing` row with `flagged='backlog'` so the listing is preserved as an explicit overstock candidate for the future cross-platform orchestrator. Skipping silently is the failure mode: a future Sync would re-prompt the user about the same listing forever.

When the user clicks Import, the modal calls `importDepopItems` (or Poshmark equivalent) which sets `Item.depopListingId`, `Item.depopUrl`, `Item.depopQuantity`, and crucially `Item.depopImportedAt`. The `*ImportedAt` field is what the modal reads on subsequent opens to render persistent green "Imported" badges — it is distinct from `*ListingId` (which can be set by auto-link in Calibrate or by sync flows too), and the modal cares specifically about whether the *user* did an explicit import on this listing.

### Step 3: Refresh (the user wants to know if anything sold today)

The user is on `/depop` or `/poshmark` and clicks **Refresh** on the LastSoldWidget. The widget opens the platform's sold-items URL with the `#autoScroll` hash appended (this hash is the signal to the extension to auto-scroll the page and wait for the quiet period). The extension scrapes the sold-items page, writes the results to `marketplaceData/{platform}_sold_{username}` (not `marketplaceData/{username}` — that's the active-listings doc). After a 30-second wait, the widget calls `syncRecentSoldItems` in [src/services/inventory/syncSoldItems.ts](src/services/inventory/syncSoldItems.ts).

`syncRecentSoldItems` resolves which sold-data doc to read via `resolveDepopSyncData` / `resolvePoshmarkSyncData` — these try the sold-specific doc IDs first (`{platform}_sold_{username}`), fall back to the active doc, then the user-subcollection, then scan for any matching doc. **The resolver order matters.** Reading the active doc when the sold doc exists will silently produce zero sales.

The resolved rows are mapped into `SnapshotInput[]` (with `imageUrl` where present) and passed to `writeSnapshotBatch(userId, inputs, 'pending')`. Every input that doesn't match a dedup key against existing baseline/pending/reconciled rows gets inserted as a new `pending` row. The widget's `onSnapshot` subscription picks them up automatically and renders them in the timeline; the toast reports `+X new sales · Y already in baseline`.

### Step 4: Reconcile (today: manual; tomorrow: orchestrator at Linear 444-139)

Today the user looks at pending Poshmark/Depop sales in the widgets and manually decrements eBay qty (and delists the corresponding listing on the *other* non-selling platform) using whatever cross-platform tooling he's got. The codebase has the primitives for both decrement and delist (`ebayReviseItemQuantity`, `gologinDelistItem`, `depopDelistItem`) but no scheduler that wires them together. When Linear 444-139 ships, this is where the `pending → reconciled` status flip will happen, alongside automated calls to those primitives.

### Step 5: Check Quantity (the eBay reconciliation half of the model)

The user clicks **Check Quantity** in the Closet toolbar. This is the *eBay side* of the formula — it reads live eBay qty for every listing and updates `Item.ebayQuantity` / `Item.ebayDelisted`. Implementation in `handleCheckEbayQuantities` at [ClosetView.tsx:2265](src/components/ClosetView.tsx). The model's `ebaySalesSinceBaseline` term is computed implicitly as `max(0, ebayQuantityAtBaseline − ebayQuantity)`; you don't write that to a Firestore field, the reconciler derives it on the fly.

The OOS badge in the closet grid is the user-visible signal of this step: blue "e" for in-stock, gray "✕" for delisted/zero-qty. Render rule lives at [ClosetView.tsx:3383](src/components/ClosetView.tsx): `isOos = item.ebayDelisted === true || (item.ebayQuantity ?? 1) === 0`.

---

## 4. The three modal patterns

You will end up modifying one of these every time the user asks for a per-platform UX tweak. Understand the pattern; don't reinvent it.

### The Match modal — 3 candidates per row

`PlatformMatchModal.tsx` ([src/components/inventory/PlatformMatchModal.tsx](src/components/inventory/PlatformMatchModal.tsx)) and the per-platform Import modals share this DNA. Every row in the modal shows a single Poshmark or Depop listing, alongside up to 3 candidate eBay Items chosen by `findTopEbayMatchesForListing`. The user picks one (radio), reloads (grows the `excludeSet`, fetches the next 3 candidates), searches manually (popover over the full inventory store), or hits **None of these** to mark this listing as backlog. Three candidates is enough to almost always include the right match without overwhelming the user's eye; the Reload escape hatch handles the edge case.

The matcher is **deterministic** — no AI. The function name `matchListingsWithAI` in [functions/src/match.ts:151](functions/src/match.ts) is historical and misleading. There are no `@anthropic-ai/sdk` or `openai` imports in this path and there are not going to be — see Critical Invariant #3 (no AI in matcher path). The "AI" naming sticks around for backward compat with old log keys and Linear references.

### The Import modal — extension-driven, backlog-preserving

Pattern: wipe `marketplaceData/{username}`, open seller-hub URL, poll Firestore 3s × 5min, render listings with match candidates, write `Item.{platform}ImportedAt` on Import click, write `flagged='backlog'` on "None of these" rows. The persistent green Imported badge on subsequent opens reads `Item.{platform}ImportedAt` — not `{platform}ListingId`, because the listing ID may have been set by Calibrate's auto-link rather than an explicit user import. Conflating those two fields was a real bug; keep them distinct.

### The Sold widget — Refresh + Revert + photos + totals strip on the right of each platform page

`LastSoldWidget.tsx` ([src/components/inventory/LastSoldWidget.tsx](src/components/inventory/LastSoldWidget.tsx)) lives on `/depop` and `/poshmark` (and the eBay variant on `/ebay`). It does four things, in one strip:

1. **Refresh** — kicks off the lifecycle in Section 3, Step 3.
2. **Revert** (amber ↺) — `deleteNonBaselineRows(userId, platform)` in [saleSnapshot.ts:249](src/services/inventory/saleSnapshot.ts). Wipes every pending and reconciled row for this platform, leaves baseline rows untouched. This is the user's escape hatch when a Refresh produced duplicates; he reverts, then re-runs Refresh to try again. The confirmation dialog tells him exactly what will be kept vs deleted.
3. **Photo strip** — visual confirmation. Each pending/reconciled row renders a thumbnail.
4. **Totals strip** — counts of baseline/pending/reconciled per platform, plus net new since calibration. This is the diagnostic the user looks at first when he suspects something's off.

The widget's onSnapshot subscription means everything refreshes live; you never need to imperatively re-render after a write.

---

## 5. Cross-source dedup — the deep dive

This is the chapter that will save you when something breaks. The bug took two days to root-cause; understand the pieces before you touch `writeSnapshotBatch`.

### The setup

Every sale flowing into `SaleSnapshot` has two identities:

1. **A `saleKey`** — a deterministic string built from platform-specific receipt identifiers (`'poshmark:order:{orderId}'`, `'depop:{_purchaseId}:{id}'`, `'ebay:{listingId}:sold:{index}'`). Exact match on saleKey is the primary dedup signal. **But:** the saleKey shape depends on which import source produced the row. The CSV baseline often lacks `orderId`. The scrape always has it. Same sale, different saleKey.
2. **A content fingerprint** — what the sale "looks like" semantically. Title + price, with some normalization. This is the fallback when saleKey exact-match fails.

### Why a single fingerprint isn't enough — the ladder of fallback keys

The implementation in `buildContentDedupKeys` at [saleSnapshot.ts:119](src/services/inventory/saleSnapshot.ts) doesn't return one key — it returns *every plausible key* the row could match under. Every existing row's keys get unioned into a Set; an incoming row matches if ANY of its candidate keys hits ANY existing key. The five candidates are:

- **`${title}|${dollars}`** — strongest signal. Normalized title plus price expressed in dollars with two decimals (`60.00`).
- **`${title}|${cents}`** — same row, price re-expressed in cents (`6000`). Handles the case where the existing row stored price as dollars but the incoming row has it in cents (the eBay API and the Poshmark CSV disagree on this).
- **`${title}|${reverseCents}`** — incoming price is in cents, existing is in dollars. The inverse of the above. Both directions get registered so it doesn't matter which side stored which.
- **`${title}|${date}`** — when price is missing, use ISO date (first 10 chars). Lower precision but catches imports where the price field didn't survive.
- **`${title}`** — title alone. Last-resort fallback.

This ladder evolved through real failures:

1. **First pass** was `title|YYYY-MM-DD|price`. Broke immediately because CSV-imported baseline rows often have no `soldAt`, so the date piece was empty and the key didn't collide with the scrape's row that *did* have a date.
2. **Dropped date**, went to `title|price`. Broke because the two sources stored price in different units (dollars vs cents).
3. **Added cents/dollars normalization**, both directions. Got us most of the way there.
4. **Added Jaccard token overlap fallback** because the title strings themselves disagreed across sources (one side had brand prefixes, "Listing for…", etc.).
5. **Realized we were over-deduping within a batch** — three legitimate sales of the same item type ("Aho L Hockey Jersey, $68") were getting collapsed into one. Fixed the within-batch vs DB-only distinction (see below).

### The Jaccard fallback

When none of the five content keys match, the algorithm extracts content tokens from each title — lowercase, alphanumeric, length ≥ 3, with a small stoplist (`new`, `nwt`, `size`, `mens`, `jersey`, etc.). If incoming title shares **≥ 70%** token overlap (Jaccard similarity) with any existing row's tokens, it counts as a duplicate. Implementation: `tokenizeForDedup` + `jaccard` at [saleSnapshot.ts:144-161](src/services/inventory/saleSnapshot.ts), threshold check at [saleSnapshot.ts:262](src/services/inventory/saleSnapshot.ts).

The Jaccard fallback only fires when `incomingToks.size >= 3` — too-short titles trigger false positives.

### Within-batch vs DB-only — the subtle bit

There are two dedup scopes, and they have different rules:

- **saleKey dedup IS within-batch.** A saleKey corresponds to a unique receipt identifier — if you see the same saleKey twice in one incoming batch, that's a duplicate from the scrape itself. Add the incoming saleKey to the `seen` set as you insert, so subsequent rows in the same batch get skipped.
- **Content/token dedup is NOT within-batch.** A user can legitimately sell the same item type multiple times — three separate "Aho L $68" hockey jerseys, each a distinct sale with a distinct order_id. If you add each new insert's content keys to `existingContent` as you go, the second and third sales of the same item type get dropped. Don't do that. Only check incoming content keys against the **existing DB rows** (baseline + pending + reconciled at the start of the batch); never against rows you just inserted in this batch.

This distinction is enforced by the structure of the loop in `writeSnapshotBatch`: after a successful insert, `seen?.add(input.saleKey)` is called but **no equivalent update happens** to `existingContent` or `existingTokens`. See the long comment at [saleSnapshot.ts:293-302](src/services/inventory/saleSnapshot.ts) — that comment exists specifically because someone (this agent) tried to "fix" the missing update and silently introduced an over-dedup bug.

### How to debug a dedup failure

When the user reports duplicates or missing rows after a Refresh:

1. Open the browser console and grep for `[writeSnapshotBatch]`. Every call logs the per-platform existing count and a sample of 5 content keys. Compare the sample to what you'd expect for the incoming rows.
2. Look at the `inserting (no match)` lines — first 5 inserts log saleKey + title + price. Verify these are sales that *should* be new.
3. Use [scripts/inspect-poshmark-sales.ts](scripts/inspect-poshmark-sales.ts) as a template to simulate the dedup against live Firestore without writing anything.

---

## 6. Critical invariants

Each invariant is one rule the system depends on. Each has a philosophy, an enforcement site, and a way to detect the failure mode.

### 6.1 SaleSnapshot baseline rows are immutable

**Philosophy:** baseline rows are the audit trail of "what was already sold at calibration time." If you ever let a non-baseline write overwrite a baseline row's `saleKey`, the same sale gets counted twice in the model and the user oversells.

**Enforcement:** `writeSnapshotBatch` at [saleSnapshot.ts:180](src/services/inventory/saleSnapshot.ts) dedups against the **cross-status union** of saleKeys + content fingerprints + token sets. `getSnapshot(userId, platform)` returns rows of every status, no status filter — that's the union. Any incoming row whose saleKey matches an existing row of *any status* gets silently skipped.

**How to grep for the failure:** look for any direct `setDoc(doc(db, 'SaleSnapshot', ...))` or `addDoc(collection(db, 'SaleSnapshot'), ...)` call outside `writeSnapshotBatch`. There should be zero. If you find any, that's the bypass.

### 6.2 `PlatformListing.firstSeenAt` is set exactly once by the Cloud Function

**Philosophy:** the `firstSeenAt` timestamp anchors when this listing first showed up in our system. Subsequent upserts (every Sync) must not overwrite it, or the calibration-relative timestamps drift.

**Enforcement:** the field is written by the `onPlatformListingCreate` onCreate trigger at [functions/src/platformListingFirstSeen.ts:15](functions/src/platformListingFirstSeen.ts). The client-side `upsertListings` at [src/services/inventory/platformListing.ts](src/services/inventory/platformListing.ts) **intentionally omits** `firstSeenAt` from the payload — it sets `lastSeenAt` but not `firstSeenAt`.

**How to grep for the failure:** `grep -rn "firstSeenAt" src/services/inventory/`. If anything outside a *read* path writes it, that's a bug. The CF is the only writer.

### 6.3 No AI in the matcher path

**Philosophy:** the matcher (server and client) must be 100% deterministic and auditable. The user needs to be able to point at any candidate and explain to himself why it was suggested. AI ranking would make matches non-reproducible and silently degrade as model versions change.

**Enforcement:** no `@anthropic-ai/sdk` or `openai` imports in `functions/src/match.ts` or `src/services/inventory/listingMatcher.ts`. The "AI" in `matchListingsWithAI` is a misnomer kept for log-key compatibility.

**How to grep for the failure:** `grep -rE "anthropic|openai" functions/src/match.ts src/services/inventory/listingMatcher.ts` → must return zero hits.

### 6.4 eBay listing ID is the canonical cross-platform join key

**Philosophy:** eBay is the inventory anchor. Every Item exists primarily because it's listed on eBay. `Item.ebayListingId` (or its alias `Item.ebayItemId`) is the canonical primary key for cross-platform binding. `Item.depopListingId` and `Item.poshmarkListingId` are secondary attributes — pointers from the anchor to the other platforms.

**Enforcement:** the store subscription in `useItemStore.ts` queries `Item` by `user_uuid`. The matcher in [functions/src/match.ts](functions/src/match.ts) treats `ebayItemId`/`ebayListingId` as the join target. The closet grid renders one row per eBay-anchored Item.

**How to grep for the failure:** any code path that creates an Item without `ebayListingId` and treats it as a peer of eBay-anchored items is suspect. CSV imports that pre-stage Items without eBay IDs need to either get matched to an eBay listing later or be flagged as not-yet-listed.

### 6.5 `Item.ebayQuantityAtBaseline` is set by Calibrate only

**Philosophy:** see Section 2. The reconciler computes `ebaySalesSinceBaseline = max(0, ebayQuantityAtBaseline − ebayQuantity)`. If anything else mutates the baseline value, that subtraction lies.

**Enforcement:** `handleCalibrateBaseline` in [ClosetView.tsx](src/components/ClosetView.tsx) is the only writer. Don't add others. The reconciler reads but never writes.

### 6.6 Fanatics replica jerseys language rules — legal, non-negotiable

**Philosophy:** Fanatics-branded replica jerseys are not authentic, not stitched, not embroidered. Describing them as such in any user-facing listing copy, AI prompt, or text generation is a legal exposure for the user. Non-negotiable.

**Enforcement:** human review + `grep -rE "(authentic|stitched|embroidered)" src/ functions/src/` before any deploy that touches text generation, listing creation, or AI prompts.

### 6.7 `NODE_OPTIONS=--use-system-ca` is mandatory on this dev box

**Philosophy:** Node 24's bundled CA store doesn't include the corporate root CA that signs Google API certs on this machine. Without the env var, every `npm`, `firebase`, and (sometimes) `tsc` invocation fails with `unable to verify the first certificate`. This is a property of this box, not of the project — but every command in any workflow on this machine needs the prefix.

**Enforcement:** all build/deploy commands in this document and in `package.json` document the env var. PowerShell uses `$env:NODE_OPTIONS = "--use-system-ca"`; bash uses `NODE_OPTIONS=--use-system-ca` inline.

---

## 7. Workflows you'll hit

Each workflow is a recipe with the reasoning, not just the steps. The reasoning is what saves you from breaking something three steps later.

### "Add a new field to Item"

The Item type at [src/types/item.ts](src/types/item.ts) is big and grown organically. Adding a field is not just an interface change.

The trap: every write site needs to be aware of the new field. If you add it as required and one write site forgets to populate it, that document is malformed and every read that assumes the field will throw. The pragma: **make new fields optional** unless you have a hard reason. Then `grep -rn "updateDoc(doc(db, 'Item'" src/` and `grep -rn "addDoc(collection(db, 'Item'" src/` to find every write site. Decide for each: does this site need to populate the new field? If yes, add the value. If no, leave it.

Backfilling existing documents to populate the new field is a separate decision. Use `src/services/backfill*.ts` (mirror an existing one) and run it once from a diagnostics modal. Don't try to backfill inline during a normal user flow — Firestore writes are slow at scale and you'll wedge the user's session.

### "Write to SaleSnapshot"

**Always** through `writeSnapshotBatch`. Always.

Direct `setDoc(doc(db, 'SaleSnapshot', ...))` bypasses the entire dedup pipeline — saleKey check, 5-key content fingerprint, Jaccard token fallback, batch ops, undefined-field stripping. Every one of those is load-bearing. The dedup pipeline has caught hundreds of cross-source duplicates in real usage; bypassing it is how you introduce a regression that the user notices three days later when his stock is off by 7.

If you need to mutate an existing row (e.g. flip `status` from `pending` to `reconciled`), use `markCounted` / `markUncounted` in the same file — those operate on existing rows by document ID and don't invoke the dedup pipeline because they're not inserting.

If you genuinely need a write path that the existing helpers don't cover, add it inside `saleSnapshot.ts` so it shares the same dedup primitives. Don't write to the collection from outside the module.

### "Add a new Cloud Function"

Decide first: `onCall` or `onRequest`?

- **`onCall`** — call from the client with `httpsCallable(functions, 'name')`. Auth is implicit (Firebase Auth context passed automatically). Default timeout is short (~60s). Response shape is `{ data: ... }` unwrapped by the SDK. Use this for short, auth-required RPCs.
- **`onRequest`** — call from the client with `fetch()` and a manual `Authorization: Bearer <ID_TOKEN>` header. Auth is your responsibility (verify the token server-side, e.g. with `admin.auth().verifyIdToken`). Timeouts can run much longer. Response shape is whatever you write to `res.json({ data: ... })`. Use this for long-running puppeteer jobs, OAuth callbacks, webhooks, or anything the onCall 60s limit can't fit.

**The trap:** the gologin functions (`gologinDelistItem`, `gologinMarkSold`, `gologinSyncListings`) are `onRequest` because puppeteer runs need 2–5 minutes. If you call them with `httpsCallable`, you get a 405 because there's no onCall handler registered for that function name. The client must use `fetch` + ID token. The server unwraps `req.body?.data || req.body` so either body shape works. The example pattern lives in [PoshmarkUnmatchedModal.tsx](src/components/poshmark/PoshmarkUnmatchedModal.tsx) — copy it; don't try to wire onCall to it.

Once the trigger type is decided: export from `functions/src/index.ts` (or import a new file from there), build via the predeploy hook (`npm --prefix functions run build` — runs automatically on deploy), and ship with `NODE_OPTIONS=--use-system-ca firebase deploy --only functions:<name>`.

### "Deploy fails silently"

The most painful failure in this codebase: `npm run build` is `tsc && vite build`. When `tsc` errors, `vite build` is skipped (the `&&` short-circuit). `dist/` keeps its prior contents. `firebase deploy --only hosting` happily deploys the *old* bundle — the deploy "succeeds" but the user sees no change in prod.

**Always** check the build output for the line `✓ built in Xs`. If you don't see that line, the bundle didn't rebuild and a deploy will publish stale code.

Alternative escape hatches in `package.json`:
- `npm run build:skip-types` — Vite-only, skips `tsc`. Useful when TS noise is blocking but you've verified types separately.
- `npm run deploy` — `build:skip-types && firebase deploy --only hosting`. Doesn't apply NODE_OPTIONS — set it via `$env:NODE_OPTIONS` first on PowerShell.

After deploying hosting, the user often needs to hard-reload (Ctrl+Shift+R) because the service worker / cache may hold the old bundle. Build a reflex: deploy, then tell the user "hard-reload to pick it up."

### "Cross-platform decrement — when ready (Linear 444-139)"

The primitives all exist: `ebayReviseItemQuantity` decrements eBay qty, `gologinDelistItem` removes a Poshmark/Depop listing via puppeteer, `depopDelistItem` does the Depop side via the unofficial API. What does not exist yet is the orchestrator that ties them together: "when a SaleSnapshot row of status `pending` exists for platform P, decrement eBay qty by 1 and call gologinDelistItem on the other non-P platform's listing for the same Item." When you implement this, the right place is a new `src/services/inventory/orchestrator.ts` that consumes `pending` rows, calls the primitives, and flips the row's status to `reconciled`. Until then, the reconciliation half of the lifecycle is manual.

---

## 8. Things that have gone wrong (root causes, brief)

- **Duplicate pending Poshmark rows after Refresh.** Root cause: extension-scrape saleKey shape ≠ CSV-baseline saleKey shape; original date-based fingerprint failed because CSV had no `soldAt`. Fix: 5-key content ladder + Jaccard fallback in `buildContentDedupKeys` at [saleSnapshot.ts:119](src/services/inventory/saleSnapshot.ts). Linear 444-144.

- **TLS cert errors on every npm/firebase command.** Root cause: corporate root CA not bundled into Node 24's CA store. Fix: `NODE_OPTIONS=--use-system-ca` prefix on every command. See Invariant 6.7.

- **Extension auto-scroll didn't fire on Poshmark sales page.** Root cause: extension only triggers the scroll routine when it sees the URL hash `#autoScroll`. Fix: open `https://poshmark.com/order/sales/#autoScroll` (with the hash, not without). Same hash trick for Depop's sold page.

- **`gologinDelistItem` returned 405 Method Not Allowed.** Root cause: function is `onRequest`, client was calling it with `httpsCallable`. Fix: switch client to `fetch` + ID token. See [PoshmarkUnmatchedModal.tsx](src/components/poshmark/PoshmarkUnmatchedModal.tsx) for the pattern.

- **Deploy succeeded but prod looked unchanged.** Root cause: `tsc` errored, `vite build` was skipped via `&&`, `dist/` stayed stale, Firebase deployed the prior bundle. Fix: always check for `✓ built in Xs` in the build output before deploying.

- **`PlatformListing.firstSeenAt` overwritten on every Sync.** Root cause: a client write included the field, overwriting the original onCreate-set timestamp. Fix: strip the field from client `upsertListings` payloads; only the CF trigger writes it. See Invariant 6.2.

- **Wrong `marketplaceData` doc read during Refresh.** Root cause: code read `marketplaceData/{username}` (the *active* listings doc) when it needed `marketplaceData/{platform}_sold_{username}` (the *sold* listings doc). Fix: sold-specific resolver in `syncSoldItems.ts` tries the sold doc IDs first, falls back to the active doc only if nothing sold-specific exists.

- **`Item.depopImportedAt` confused with `Item.depopListingId`.** Root cause: three different code paths set `depopListingId` (Calibrate auto-link, Calibrate fuzzy match, DepopImportModal explicit import), but only the modal sets `depopImportedAt`. The persistent Imported badge depends on `depopImportedAt`, not the listing ID. A change that used the ID as the badge signal showed Imported badges for every auto-linked listing the user had never seen the modal for.

- **AGENT.md has been rewritten three times.** First as a user manual ("here's how the user uses the app") — wrong audience. Second as a flat code reference — too listy, too index-like, didn't teach the *why*. Third (this version) as a conceptual handbook. The lesson: the next agent reading this is not a junior dev looking for filenames; they're a peer who needs to understand the model well enough to make a safe change. Optimize for transferable understanding, not searchability — `FUNCTIONS.md` already covers searchability.

---

## 9. How to verify your change is working

Three diagnostic surfaces, in order of how much code they need.

**Console log keys.** The codebase emits structured `[ContextTag]` logs at every state transition:
- `[syncRecentSoldItems]` — Refresh flow, prints the resolver path taken and the resulting `inserted=X skipped=Y` summary.
- `[writeSnapshotBatch]` — per-platform existing-row count + content-key sample on entry, plus first 5 inserts with `saleKey · title · price`.
- `[CheckQty]` — Check Quantity flow, listing-by-listing reconciliation outcomes.
- `[Apply]` — PlatformMatchModal commit path, candidate selection + writes.

Open DevTools, hit the action, grep the console for the tag. If the tag's missing entirely, the code path didn't execute. If the tag's there but the counts don't match what you expect, the dedup or matcher logic disagreed with you — and that's the trail.

**Live-Firestore simulation.** [scripts/inspect-poshmark-sales.ts](scripts/inspect-poshmark-sales.ts) is a Node script that authenticates as a user, reads the live SaleSnapshot collection, and runs the dedup pipeline against a synthetic input batch without writing. Use it (or copy its pattern) to verify a Refresh would do what you expect *before* you let the user click the button.

**The hard-reload reflex.** After deploying hosting, the service worker may serve the prior bundle. Ctrl+Shift+R in the browser to bypass. Tell the user to do the same. If you skip this step you'll convince yourself the deploy "didn't work" and spend 30 minutes debugging code that's already fixed in prod.

The diagnostic loop you'll run dozens of times:
1. Change code, `npm run build`, **confirm the `✓ built in Xs` line**.
2. `NODE_OPTIONS=--use-system-ca firebase deploy --only hosting`. **Confirm `release complete` and `Deploy complete!` lines.**
3. Hard-reload the prod tab.
4. Open DevTools, trigger the action.
5. Grep console for the relevant `[Tag]` logs.
6. Cross-check Firestore (the Firebase console works fine) for the expected writes.

---

## 10. How to work with the user

Keep this brief. The user has high context on his own app; he doesn't need explanations of features he built. He needs an agent that ships.

- **Ship-first, not perfect-first.** The user prefers a working change today over a polished change in three days. If a fix is 80% right, ship it; he'll tell you what the other 20% is.
- **Tight responses.** Long replies frustrate him. Lead with the result, follow with the reason, skip the preamble.
- **"Send an agent" → parallel agents.** When the user says "send an agent" or "have an agent do X," he means use the Agent tool with `run_in_background: true` and brief them fully. Otherwise — for trivial single-file edits — just edit directly. Don't over-delegate.
- **"Baseline is what was there before."** When he reframes a question with this phrase, that's the non-negotiable invariant on every change in the area he's pointing at. Accept the reframe; don't argue. (Invariant 6.1 is the technical version of this rule.)
- **Push back when you think he's wrong; accept the reframe when he restates.** He'll respect a disagreement that's argued from the code. He won't respect a soft re-litigation after he's already restated the rule.

---

## 11. Linear workspace + PRD

The PRD doc lives at Linear doc id `c27c879c-ea13-4391-8f95-b8b6dade35f9` (slug `retrothriftco-virtual-closet-prd-730f5cab76b8`) in team `444` (id `e11b6a72-756b-40fa-8443-795cfa8fe6c8`). Update the Task Log section after every meaningful ship — `mcp__linear-server__get_document` first to preserve content, then `mcp__linear-server__save_document` with the appended row.

When passing string content to Linear MCP tools, send real newlines, not literal `\n` characters.

The Firebase MCP has been unreliable in past sessions. Don't gate critical work on it; use the Firebase CLI for ops.

---

*Last updated: 2026-05-11. If you rewrite this file, the lesson from prior attempts is in Section 8 — write for understanding, not for indexing. The directory tree and function-by-function reference belong in `FUNCTIONS.md`.*
