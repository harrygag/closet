/**
 * Deterministic multi-signal listing matcher.
 *
 * Replaces the AI-driven ai-match.ts. Every binding is fact-checked by requiring
 * agreement across at least two independent positive signals AND a 1.5× margin
 * over the runner-up candidate. Hard rejects on size/color/category/brand mismatches
 * apply universally.
 *
 * Inputs (Firestore):
 *   - Item: eBay-anchored inventory items (read-only here)
 *   - PlatformListing: scraper-populated rows with title + description + brand + sizeRaw + color + category
 *
 * Output:
 *   - proposedMatches array returned to the client
 *   - aiMatchRuns/{runId} + events subcollection for the live progress modal
 *
 * Decision rule per listing:
 *   1. Hard-reject candidates whose size/color/category/brand contradicts the listing.
 *   2. Score each surviving candidate via S1..S6.
 *   3. top score < 50 → unmatched
 *   4. top ≥ 80 AND ≥2 signals contributed AND top ≥ 1.5× second-best → HIGH
 *   5. top ≥ 50 AND ≥1 signal contributed AND top ≥ 1.3× second-best → MEDIUM
 *   6. else → unmatched (avoid ambiguous binds)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import {
  descriptionToPlainText,
  extractSize,
  extractColor,
  extractCategory,
  extractIdentifier,
  extractJerseyNumber,
  extractBrandFromSpecifics,
  normalizeText,
  tokenize,
  jaccard,
  truncate,
} from './ai-match-helpers';

interface MatchRequest {
  onlyItemIds?: string[];
  onlyListingIds?: string[];
  onlyPlatform?: 'poshmark' | 'depop';
  runId?: string;
  // For Redo: per-listing exclusions — these itemIds will be removed from the candidate pool.
  // Lets the user reject a proposed match and have the matcher pick the next-best candidate.
  excludeMap?: Record<string, string[]>;
}

interface ItemRow {
  id: string;
  title: string;
  size: string;
  color: string;
  category: string;
  brand: string;
  plainDesc: string;
  ebayFullTitle: string;
  identifier: string;
  jerseyNumber: string;
  titleTokens: Set<string>;
  descTokens: Set<string>;
  combinedText: string; // lowercased title + description, for substring search
}

interface ListingRow {
  listingId: string;
  platform: 'poshmark' | 'depop';
  title: string;
  description: string;
  size: string;
  color: string;
  category: string;
  brand: string;
  identifier: string;
  jerseyNumber: string;
  titleTokens: Set<string>;
  combinedText: string; // title + description, normalized
  combinedTokens: Set<string>;
}

interface SignalContribs {
  S1_descPrefix: number;
  S2_titlePrefix: number;
  S3_identifier: number;
  S4_jaccard: number;
  S5_allStructured: number;
  S6_jerseyNumber: number;
  S7_substring: number;
}

interface CandidateScore {
  itemId: string;
  itemTitle: string;
  total: number;
  contribs: SignalContribs;
  positiveSignalCount: number;
}

interface BindOutcome {
  listingId: string;
  itemId: string;
  confidence: 'high' | 'medium';
  reasoning: string;
  source: 'tier1_prefix' | 'tier1_structured' | 'tier2_ai';
  platform: 'poshmark' | 'depop';
  score: number;
  contribs: SignalContribs;
}

const MIN_PRICE = 40;

/** Collapse common color synonyms into a single canonical token so
 *  "navy"/"royal"/"baby blue" all compare equal to "blue", etc. */
const COLOR_SYNONYMS: Record<string, string> = {
  navy: 'blue',
  royal: 'blue',
  'baby blue': 'blue',
  'sky blue': 'blue',
  teal: 'blue',
  cream: 'white',
  ivory: 'white',
  'off-white': 'white',
  'off white': 'white',
  grey: 'gray',
  charcoal: 'gray',
  silver: 'gray',
  maroon: 'red',
  burgundy: 'red',
  crimson: 'red',
};
function canonicalColor(c: string): string {
  if (!c) return '';
  const lower = c.toLowerCase().trim();
  return COLOR_SYNONYMS[lower] || lower;
}

/** Bidirectional substring match for brand names. Catches "Nike" ↔ "Nike Inc.",
 *  "Fanatics" ↔ "Fanatics Branded", "Mitchell" ↔ "Mitchell & Ness". */
function brandsCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  return la.includes(lb) || lb.includes(la);
}

export const matchListingsWithAI = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data: MatchRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = context.auth.uid;
    const onlyItemIds = Array.isArray(data?.onlyItemIds) ? new Set(data.onlyItemIds) : null;
    const onlyListingIds = Array.isArray(data?.onlyListingIds) ? new Set(data.onlyListingIds) : null;
    const onlyPlatform: 'poshmark' | 'depop' | null =
      data?.onlyPlatform === 'poshmark' || data?.onlyPlatform === 'depop' ? data.onlyPlatform : null;
    const runId = typeof data?.runId === 'string' && data.runId ? data.runId : null;
    const excludeMap: Record<string, Set<string>> = {};
    if (data?.excludeMap && typeof data.excludeMap === 'object') {
      for (const [listingId, itemIds] of Object.entries(data.excludeMap)) {
        if (Array.isArray(itemIds)) excludeMap[listingId] = new Set(itemIds);
      }
    }

    const db = admin.firestore();

    // Live event stream wiring (no-op when runId absent).
    let eventIdx = 0;
    const writeEvent = async (type: string, summary: string, payload?: any) => {
      if (!runId) return;
      const idx = eventIdx++;
      try {
        await db.collection('aiMatchRuns').doc(runId).collection('events').add({
          idx,
          type,
          summary,
          payload: payload || null,
          ts: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn(`[match] event write failed (idx=${idx})`, err);
      }
    };
    const updateRunMeta = async (patch: Record<string, any>) => {
      if (!runId) return;
      try { await db.collection('aiMatchRuns').doc(runId).set(patch, { merge: true }); }
      catch (err) { console.warn('[match] meta write failed', err); }
    };
    if (runId) {
      await updateRunMeta({
        userId, status: 'running',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        scope: onlyItemIds ? 'selected' : 'all',
        platform: onlyPlatform || 'all',
      });
    }

    const startedAt = Date.now();

    // ── Fetch items ──
    const itemSnap = await db.collection('Item').where('user_uuid', '==', userId).get();
    const itemsRaw = itemSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const inventoryItems: ItemRow[] = itemsRaw
      .filter(i => i.ebayListingId || i.ebayItemId)
      .filter(i => !onlyItemIds || onlyItemIds.has(i.id))
      .map(i => {
        const rawTitle = String(i.title || i.name || '');
        const ebayFullTitle = String(i.ebayFullTitle || rawTitle);
        const plainDesc = i.ebayFullDescription ? descriptionToPlainText(i.ebayFullDescription) : '';
        const size = (i.size && String(i.size).toUpperCase()) || extractSize(ebayFullTitle) || extractSize(rawTitle) || '';
        const color = extractColor(ebayFullTitle) || extractColor(rawTitle) || extractColor(plainDesc.slice(0, 400)) || '';
        const category = extractCategory(ebayFullTitle) || extractCategory(rawTitle) || extractCategory(plainDesc.slice(0, 400)) || '';
        const brand = extractBrandFromSpecifics(i.ebayItemSpecifics);
        const identifier = extractIdentifier(ebayFullTitle) || extractIdentifier(rawTitle);
        const jerseyNumber = extractJerseyNumber(ebayFullTitle) || extractJerseyNumber(rawTitle);
        const combinedText = `${normalizeText(ebayFullTitle)} ${plainDesc}`.trim();
        return {
          id: i.id,
          title: rawTitle,
          size,
          color: color || '',
          category: category || '',
          brand,
          plainDesc,
          ebayFullTitle,
          identifier,
          jerseyNumber,
          titleTokens: tokenize(ebayFullTitle),
          descTokens: tokenize(plainDesc),
          combinedText,
        };
      });

    // ── Fetch listings ──
    const listingSnap = await db.collection('PlatformListing').where('userId', '==', userId).get();
    const listingsRaw = listingSnap.docs.map(d => d.data() as any);

    // ── Tier 0: pre-filter ──
    const preFilterStats = { total: 0, alreadyBound: 0, subPrice: 0, inactive: 0, wrongPlatform: 0 };
    const allRelevant = listingsRaw
      .filter(l => l.platform === 'poshmark' || l.platform === 'depop')
      .filter(l => !onlyListingIds || onlyListingIds.has(l.listingId));
    const platformListings: ListingRow[] = [];
    for (const l of allRelevant) {
      preFilterStats.total++;
      if (l.status !== 'active') { preFilterStats.inactive++; continue; }
      if (l.itemId) { preFilterStats.alreadyBound++; continue; }
      const isLowPrice = l.flagged === 'low_price' || (typeof l.price === 'number' && l.price < MIN_PRICE);
      if (isLowPrice) { preFilterStats.subPrice++; continue; }
      if (onlyPlatform && l.platform !== onlyPlatform) { preFilterStats.wrongPlatform++; continue; }

      const rawTitle = String(l.title || '');
      const description = String(l.description || '');
      // Prefer scraper-provided structured fields; fall back to extraction from title.
      const sizeFromRaw = l.sizeRaw ? extractSize(String(l.sizeRaw)) : '';
      const size = sizeFromRaw || extractSize(rawTitle) || '';
      const color = (l.color ? String(l.color).toLowerCase() : '') || extractColor(rawTitle) || extractColor(description) || '';
      const categoryRaw = l.category ? String(l.category).toLowerCase() : '';
      const category = extractCategory(categoryRaw) || extractCategory(rawTitle) || extractCategory(description) || '';
      const brand = (l.brand ? String(l.brand).toLowerCase().trim() : '');
      const identifier = extractIdentifier(rawTitle) || extractIdentifier(description);
      const jerseyNumber = extractJerseyNumber(rawTitle) || extractJerseyNumber(description);
      const combinedText = normalizeText(`${rawTitle} ${description}`);
      const combinedTokens = tokenize(`${rawTitle} ${description}`);
      platformListings.push({
        listingId: String(l.listingId),
        platform: l.platform,
        title: rawTitle,
        description,
        size,
        color: color || '',
        category: category || '',
        brand,
        identifier,
        jerseyNumber,
        titleTokens: tokenize(rawTitle),
        combinedText,
        combinedTokens,
      });
    }

    await writeEvent('start',
      `Loaded ${inventoryItems.length} items + ${platformListings.length} listings (skipped: ${preFilterStats.alreadyBound} bound · ${preFilterStats.subPrice} sub-$${MIN_PRICE} · ${preFilterStats.inactive} inactive · ${preFilterStats.wrongPlatform} other-platform)`,
      { itemsConsidered: inventoryItems.length, listingsConsidered: platformListings.length, preFilterStats });

    if (inventoryItems.length === 0 || platformListings.length === 0) {
      await writeEvent('finish', 'Nothing to match.', { itemsConsidered: inventoryItems.length, listingsConsidered: platformListings.length });
      await updateRunMeta({ status: 'complete', endedAt: admin.firestore.FieldValue.serverTimestamp() });
      return {
        success: true, runId,
        proposedMatches: [],
        stats: { itemsConsidered: inventoryItems.length, listingsConsidered: platformListings.length, tier1Bound: 0, tier2Bound: 0, tier2MediumPending: 0, hardRejected: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, preFilterStats },
      };
    }

    // ── Bind invariants ──
    const claimedListings = new Set<string>();
    const claimedByPlatform: Record<'poshmark' | 'depop', Set<string>> = { poshmark: new Set(), depop: new Set() };
    const bindings: BindOutcome[] = [];
    const mediumPending: BindOutcome[] = [];
    // For the per-page UI: top-3 ranked candidates per listing (after hard rejects),
    // independent of bind/medium decision. Used by the per-card 3-radio + reload flow.
    const candidatesByListing: Record<string, Array<{ itemId: string; itemTitle: string; score: number; contribs: SignalContribs }>> = {};
    let totalHardRejected = 0;
    let unmatchedCount = 0;

    const tryClaim = (l: ListingRow, itemId: string): boolean => {
      if (claimedListings.has(l.listingId)) return false;
      if (claimedByPlatform[l.platform].has(itemId)) return false;
      claimedListings.add(l.listingId);
      claimedByPlatform[l.platform].add(itemId);
      return true;
    };

    // ── Per-listing scoring ──
    for (const listing of platformListings) {
      // Hard rejects + scoring per item
      const candidates: CandidateScore[] = [];
      let rejectedThisListing = 0;

      const exclusions = excludeMap[listing.listingId];
      for (const item of inventoryItems) {
        if (claimedByPlatform[listing.platform].has(item.id)) continue;
        if (exclusions && exclusions.has(item.id)) continue; // user-rejected on a prior Redo

        // Hard rejects — lenient on cross-vocabulary fields.
        // Size stays strict (both sides canonicalized via extractSize → S/M/L/XL/XXL).
        if (listing.size && item.size && listing.size !== item.size) { rejectedThisListing++; continue; }
        // Color: collapse synonyms before comparing.
        if (listing.color && item.color && canonicalColor(listing.color) !== canonicalColor(item.color)) {
          rejectedThisListing++; continue;
        }
        // Category: both sides go through extractCategory so the vocabulary matches.
        if (listing.category && item.category && listing.category !== item.category) { rejectedThisListing++; continue; }
        // Brand: bidirectional substring — "nike" matches "nike inc."; "fanatics" matches "fanatics branded".
        if (listing.brand && item.brand && !brandsCompatible(listing.brand, item.brand)) {
          rejectedThisListing++; continue;
        }

        // Positive signals
        const contribs: SignalContribs = {
          S1_descPrefix: 0,
          S2_titlePrefix: 0,
          S3_identifier: 0,
          S4_jaccard: 0,
          S5_allStructured: 0,
          S6_jerseyNumber: 0,
          S7_substring: 0,
        };

        // S1: description prefix — listing's combined (title + description) is a prefix of item's plain description.
        // Bidirectional + length-tolerant: handles Depop's truncated 100-char title vs full eBay description.
        if (listing.combinedText && item.plainDesc) {
          const lc = listing.combinedText;
          const id = item.plainDesc;
          if (lc.length >= 20) {
            if (id.startsWith(lc)) {
              contribs.S1_descPrefix = 50; // listing is exact prefix of description
            } else if (lc.length > id.length && lc.startsWith(id) && id.length >= 20) {
              contribs.S1_descPrefix = 50; // description is exact prefix of (longer) listing
            } else {
              // Partial-prefix tolerance: trim trailing partial word from listing, retry.
              // Catches Depop's mid-word truncation at exactly 100 chars.
              const lastSpace = lc.lastIndexOf(' ');
              if (lastSpace >= 30 && id.startsWith(lc.slice(0, lastSpace))) {
                contribs.S1_descPrefix = 45;
              }
            }
          }
        }

        // S2: title prefix — listing.title is a prefix of item.ebayFullTitle (or vice versa).
        if (listing.title && item.ebayFullTitle) {
          const lt = normalizeText(listing.title);
          const it = normalizeText(item.ebayFullTitle);
          if (lt.length >= 15) {
            if (it.startsWith(lt) || lt.startsWith(it.slice(0, Math.min(it.length, lt.length)))) {
              contribs.S2_titlePrefix = 40;
            }
          }
        }

        // S7: listing.combinedText (or its leading clause) appears as a substring inside item.combinedText.
        // Catches cases where the listing's first ~60 chars appear mid-description (manual paste,
        // edited eBay title, etc). Lower weight than prefix because less precise.
        if (listing.combinedText.length >= 30 && contribs.S1_descPrefix === 0) {
          const head = listing.combinedText.slice(0, Math.min(80, listing.combinedText.length));
          // Trim partial word at the end
          const lastSpace = head.lastIndexOf(' ');
          const probe = lastSpace >= 25 ? head.slice(0, lastSpace) : head;
          if (probe.length >= 25 && item.combinedText.includes(probe)) {
            contribs.S7_substring = 30;
          }
        }

        // S3: identifier match — listing.identifier appears in item.combinedText.
        if (listing.identifier && listing.identifier.length >= 4) {
          if (item.combinedText.includes(listing.identifier)) {
            contribs.S3_identifier = 25;
          }
        }

        // S4: Jaccard token overlap.
        const jac = jaccard(listing.combinedTokens, new Set([...item.titleTokens, ...item.descTokens]));
        contribs.S4_jaccard = Math.round(jac * 20);

        // S5: all-structured agreement (only when both sides have all four fields).
        // Uses the same lenient comparators as the hard rejects.
        if (
          listing.size && item.size && listing.size === item.size &&
          listing.color && item.color && canonicalColor(listing.color) === canonicalColor(item.color) &&
          listing.category && item.category && listing.category === item.category &&
          listing.brand && item.brand && brandsCompatible(listing.brand, item.brand)
        ) {
          contribs.S5_allStructured = 15;
        }

        // S6: jersey number co-occurrence.
        if (listing.jerseyNumber && item.combinedText.match(new RegExp(`\\b#?${listing.jerseyNumber.replace(/^0/, '0?')}\\b`))) {
          contribs.S6_jerseyNumber = 10;
        }

        const total =
          contribs.S1_descPrefix +
          contribs.S2_titlePrefix +
          contribs.S3_identifier +
          contribs.S4_jaccard +
          contribs.S5_allStructured +
          contribs.S6_jerseyNumber +
          contribs.S7_substring;

        const positiveSignalCount = (Object.values(contribs) as number[]).filter(v => v > 0).length;

        if (total >= 25) {
          candidates.push({ itemId: item.id, itemTitle: item.ebayFullTitle || item.title, total, contribs, positiveSignalCount });
        }
      }

      totalHardRejected += rejectedThisListing;

      if (candidates.length === 0) {
        unmatchedCount++;
        continue;
      }

      candidates.sort((a, b) => b.total - a.total);
      // Persist top 3 for the per-page UI regardless of the bind decision below.
      candidatesByListing[listing.listingId] = candidates.slice(0, 3).map(c => ({
        itemId: c.itemId,
        itemTitle: c.itemTitle,
        score: c.total,
        contribs: c.contribs,
      }));
      const top = candidates[0];
      const second = candidates[1];
      const margin = second ? top.total / Math.max(1, second.total) : Infinity;

      // Decision rule — biased toward FINDING a match for every listing the user
      // has on the other platform. The user's framing: every Posh/Depop listing should
      // map to an eBay item (with a few genuine no-match edge cases).
      //
      // HIGH bind:
      //   (a) score ≥ 60 AND ≥2 signals AND ≥1.5× margin — multi-signal corroborated, OR
      //   (b) S1 prefix ≥ 45 AND prefix length ≥ 40 chars AND ≥1.8× margin — strong prefix alone, OR
      //   (c) "uniqueness bonus" — only ONE candidate scored ≥25 AND that candidate has score ≥ 40 AND
      //       ≥1 signal — when nothing else is in contention, the lone match is reliable.
      // MEDIUM bind:
      //   score ≥ 30 AND ≥1 signal AND ≥1.2× margin
      const summary = (label: string, c: CandidateScore) => {
        const parts: string[] = [];
        if (c.contribs.S1_descPrefix > 0) parts.push(`S1=${c.contribs.S1_descPrefix}`);
        if (c.contribs.S2_titlePrefix > 0) parts.push(`S2=${c.contribs.S2_titlePrefix}`);
        if (c.contribs.S3_identifier > 0) parts.push(`S3=${c.contribs.S3_identifier}`);
        if (c.contribs.S4_jaccard > 0) parts.push(`S4=${c.contribs.S4_jaccard}`);
        if (c.contribs.S5_allStructured > 0) parts.push(`S5=${c.contribs.S5_allStructured}`);
        if (c.contribs.S6_jerseyNumber > 0) parts.push(`S6=${c.contribs.S6_jerseyNumber}`);
        if (c.contribs.S7_substring > 0) parts.push(`S7=${c.contribs.S7_substring}`);
        return `${parts.join(' ')} → ${c.total} (${label})`;
      };

      const multiSignalHigh = top.total >= 60 && top.positiveSignalCount >= 2 && margin >= 1.5;
      const strongPrefixHigh =
        top.contribs.S1_descPrefix >= 45 &&
        listing.combinedText.length >= 40 &&
        margin >= 1.8;
      const uniqueCandidateHigh =
        candidates.length === 1 &&
        top.total >= 40 &&
        top.positiveSignalCount >= 1;

      if (multiSignalHigh || strongPrefixHigh || uniqueCandidateHigh) {
        if (tryClaim(listing, top.itemId)) {
          const reasoning = summary('high', top) + (uniqueCandidateHigh ? ' [unique candidate]' : '');
          const source: BindOutcome['source'] =
            top.contribs.S1_descPrefix > 0 ? 'tier1_prefix' :
            top.contribs.S5_allStructured > 0 ? 'tier1_structured' : 'tier2_ai';
          bindings.push({ listingId: listing.listingId, itemId: top.itemId, confidence: 'high', reasoning, source, platform: listing.platform, score: top.total, contribs: top.contribs });
          await writeEvent('tier1_bind',
            `🟢 ${listing.platform}: ${truncate(listing.title, 50)} ↔ ${truncate(top.itemTitle, 50)}`,
            { listingId: listing.listingId, itemId: top.itemId, listingTitle: listing.title, itemTitle: top.itemTitle, source, score: top.total, contribs: top.contribs, reasoning });
        }
        continue;
      }

      if (top.total >= 30 && top.positiveSignalCount >= 1 && margin >= 1.2) {
        const reasoning = summary('medium', top);
        mediumPending.push({ listingId: listing.listingId, itemId: top.itemId, confidence: 'medium', reasoning, source: 'tier2_ai', platform: listing.platform, score: top.total, contribs: top.contribs });
        await writeEvent('tier2_medium',
          `🟡 ${listing.platform}: ${truncate(listing.title, 50)} ↔ ${truncate(top.itemTitle, 50)}`,
          { listingId: listing.listingId, itemId: top.itemId, listingTitle: listing.title, itemTitle: top.itemTitle, score: top.total, contribs: top.contribs, reasoning });
        continue;
      }

      // Otherwise unmatched (ambiguous, or below threshold)
      unmatchedCount++;
    }

    const durationMs = Date.now() - startedAt;
    const stats = {
      itemsConsidered: inventoryItems.length,
      listingsConsidered: platformListings.length,
      tier1Bound: bindings.length,
      tier2Bound: 0,
      tier2MediumPending: mediumPending.length,
      hardRejected: totalHardRejected,
      unmatched: unmatchedCount,
      durationMs,
      inputTokens: 0,
      outputTokens: 0,
      preFilterStats,
    };

    await writeEvent('finish',
      `Done: ${bindings.length} high + ${mediumPending.length} medium proposals · ${unmatchedCount} unmatched · ${totalHardRejected} hard-rejected candidates`,
      stats);
    await updateRunMeta({ status: 'complete', endedAt: admin.firestore.FieldValue.serverTimestamp(), stats });

    const proposedMatches = [...bindings, ...mediumPending].map(b => {
      const listing = platformListings.find(l => l.listingId === b.listingId);
      const item = inventoryItems.find(i => i.id === b.itemId);
      return {
        listingId: b.listingId,
        platform: b.platform,
        listingTitle: listing?.title || '(no title)',
        itemId: b.itemId,
        itemTitle: item?.ebayFullTitle || item?.title || '(no title)',
        confidence: b.confidence,
        source: b.source,
        reasoning: b.reasoning,
        score: b.score,
        contribs: b.contribs,
      };
    });

    return { success: true, runId, proposedMatches, candidatesByListing, stats };
  });

/**
 * Clear all PlatformListing bindings for one platform AND the corresponding Item back-pointers.
 * Lets the user wipe stale bindings before re-running the matcher.
 */
export const clearPlatformBindings = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data: { platform: 'poshmark' | 'depop' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = context.auth.uid;
    const platform = data?.platform;
    if (platform !== 'poshmark' && platform !== 'depop') {
      throw new functions.https.HttpsError('invalid-argument', 'platform must be "poshmark" or "depop"');
    }

    const db = admin.firestore();
    const snap = await db.collection('PlatformListing')
      .where('userId', '==', userId)
      .where('platform', '==', platform)
      .get();

    const itemIdsToClear = new Set<string>();
    let listingsCleared = 0;

    const WRITE_BATCH = 400;
    const docs = snap.docs;
    for (let start = 0; start < docs.length; start += WRITE_BATCH) {
      const slice = docs.slice(start, start + WRITE_BATCH);
      const batch = db.batch();
      for (const d of slice) {
        const data = d.data() as any;
        if (data.itemId) {
          itemIdsToClear.add(String(data.itemId));
          batch.set(d.ref, { itemId: null }, { merge: true });
          listingsCleared++;
        }
      }
      if (listingsCleared > 0) await batch.commit();
    }

    let itemsCleared = 0;
    if (itemIdsToClear.size > 0) {
      const ids = Array.from(itemIdsToClear);
      const patch = platform === 'poshmark'
        ? { poshmarkListingId: null, poshmarkUrl: null }
        : { depopListingId: null, depopUrl: null };
      for (let start = 0; start < ids.length; start += WRITE_BATCH) {
        const slice = ids.slice(start, start + WRITE_BATCH);
        const batch = db.batch();
        for (const id of slice) {
          batch.set(db.collection('Item').doc(id), patch, { merge: true });
          itemsCleared++;
        }
        await batch.commit();
      }
    }

    return { success: true, listingsCleared, itemsCleared };
  });
