/**
 * ListingMatcher — Layer 3
 * Matches items across platforms (eBay, Poshmark, Depop) using normalized
 * listing data. Produces auto-matches, review-queue candidates, and unmatched lists.
 */

import type { Item } from '../../types/item';
import { normalizeListing, NormalizedListing, extractPlayer, extractColor, detectJerseyType, detectSport } from './listingNormalizer';
import { normalizeSize, JERSEY_SIZE_MAP } from '../ebay/import';
import { wordOverlapSimilarity } from './mismatchDetector';

// Stop words to ignore when comparing titles
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'of', 'to', 'with',
  'new', 'nwt', 'nwot', 'size', 'mens', 'men', 'womens', 'women', 'youth',
  'free', 'shipping', 'fast', 'brand', 'authentic', 'official', 'licensed',
  'item', 'listing', 'description', 'condition', 'details',
]);

/**
 * Extract meaningful keywords from a title, filtering out stop words and short words.
 */
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Strip simple HTML tags from an eBay description so the raw HTML doesn't pollute
 * tokenization with tag names ("div", "span", "br", etc.).
 */
export function stripDescriptionHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decode the eBay description's HTML entities + tags to plain text suitable for
 * prefix-comparison against a PlatformListing.title.
 *
 * The Depop scraper writes the *first 100 chars of the eBay description* into
 * `PlatformListing.title` (verbatim, just truncated). So `description.startsWith(title)`
 * is a near-perfect match signal. But the description is stored with double-encoded
 * entities (`&amp;apos;` → `&apos;` → `'`) and curly quotes — both sides need to be
 * normalized to the same canonical form.
 *
 * Steps: strip HTML tags, decode standard entities (twice, to handle the &amp;apos;
 * double-encoding), normalize curly quotes/apostrophes to straight, lowercase,
 * collapse whitespace, trim.
 */
export function descriptionToPlainText(rawHtml: string): string {
  if (!rawHtml) return '';
  // First pass via the existing helper (tags + first level of common entities).
  let s = stripDescriptionHtml(rawHtml);
  // Second pass: decode entities that surfaced after the first &amp; → & decode,
  // plus &apos; (HTML5 only) and numeric apostrophe variants.
  s = s
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  // Curly → straight quotes/apostrophes (Depop scraper sometimes emits curly).
  s = s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"');
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a row title with the same rules used for the description plain text,
 * so a `String.startsWith` comparison is meaningful.
 */
function normalizeRowTitleForPrefix(rowTitle: string): string {
  if (!rowTitle) return '';
  return rowTitle
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when one of the strings is a prefix of the other after normalization.
 * Bidirectional because the description can be longer than the row title (typical:
 * Depop truncates at 100 chars) OR shorter (rare: very short description).
 *
 * Requires the row title to be at least 20 chars after normalization to avoid
 * accidental matches (a generic "the product is" prefix wouldn't be diagnostic).
 */
export function isDescriptionPrefixMatch(rowTitle: string, plainDesc: string): boolean {
  if (!rowTitle || !plainDesc) return false;
  const t = normalizeRowTitleForPrefix(rowTitle);
  const d = plainDesc; // already normalized by descriptionToPlainText
  if (t.length < 20) return false;
  if (d.length >= t.length) return d.startsWith(t);
  return t.startsWith(d);
}

/**
 * Tokenize an eBay full description for fuzzy matching against Depop/Posh titles
 * (the user pastes the eBay description into Depop title fields). Caps at first
 * `maxTokens` content words to keep TF in line with title-length items so one
 * giant description doesn't dominate scoring across all items.
 */
export function tokenizeDescription(rawHtml: string, maxTokens = 200): string[] {
  if (!rawHtml) return [];
  const text = stripDescriptionHtml(rawHtml);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  return words.slice(0, maxTokens);
}

/**
 * Strip AI/scraper-generated filler from a title before fuzzy matching.
 * Depop's seller-hub returns descriptions like:
 *   "The product is a size XL blue jersey for Team USA in the 2026 Olympics, featuring player Matthew Tka..."
 * After cleaning, the meaningful tokens dominate the keyword overlap.
 *
 * Deterministic regex — no ML.
 */
export function cleanDescriptiveTitle(raw: string): string {
  if (!raw) return '';
  let t = raw;

  // Remove leading filler phrases
  t = t.replace(/^(this product|the product|that product) is\s+(a |an |the |)/i, '');
  t = t.replace(/^(this product|the product|this item|the item|this jersey|the jersey)\s+is\s+(a |an |the |)/i, '');
  t = t.replace(/^(this is|that is|here is)\s+(a |an |the |)/i, '');
  t = t.replace(/^(brand[ -]?new|new with tags?|nwt|nwot|pre[ -]?owned|worn once|gently used)\s+/i, '');

  // Strip mid-text filler phrases that pad out scraper descriptions
  const fillerPhrases = [
    /\bfeaturing the (player|name|number)\s+/gi,
    /\bfeaturing\s+(the\s+)?player\s+/gi,
    /\bfeaturing the team\b/gi,
    /\brepresenting team\b/gi,
    /\bspecifically designed for\s+/gi,
    /\bdesigned for the\s+/gi,
    /\bdesigned for (men|women|youth|adults?)\b/gi,
    /\bdesigned for\s+/gi,
    /\bmade for\s+/gi,
    /\bofficially licensed (by\s+)?/gi,
    /\bis a jersey by\s+/gi,
    /\bis a (?:hockey|baseball|football|basketball) jersey\s+/gi,
    /\bmade by\s+/gi,
    /\bby (fanatics|nike|adidas|under armour)\b/gi,
    /\bin the (?:colors? of|color of)\s+/gi,
    /\bcolors? of\b/gi,
    /\bbrand new with tags?\s*[,\.]?\s*/gi,
    /\bwith tags?\s*[,\.]?\s*/gi,
    /\bworn once\s*[,\.]?\s*/gi,
    /\bpre[ -]?owned\s*[,\.]?\s*/gi,
    /\bbrand[ -]?new\s*[,\.]?\s*/gi,
    /\bin (excellent|great|good|like new) condition\s*[,\.]?\s*/gi,
    /\bperfect for fans of\s+/gi,
    /\bfor the (regular season|2026 olympics|olympics|nhl|nfl|mlb|nba)\s*/gi,
    /\bthis (?:jersey|shirt|hoodie|sweatshirt|polo)\s+(is|features|includes|comes)\s+/gi,
    /\bthis [a-z\s]+ is officially licensed\s*[,\.]?\s*/gi,
  ];
  for (const re of fillerPhrases) t = t.replace(re, ' ');

  // Trailing "by Fanatics." that often closes scraper descriptions
  t = t.replace(/\bby Fanatics?\.\s*$/i, '');

  // Trailing color-list phrases like "gray and red colors" or "in the gray and red colors"
  // → collapse to just the colors so they survive tokenization but the noise word "colors" is gone.
  t = t.replace(/\b((?:[a-z]+(?:\s+and\s+|\s*,\s*|\s+))+[a-z]+)\s+colors?\b/gi, '$1');

  // Strip trailing boilerplate that might pad the end
  t = t.replace(/\s+(?:show your support|show their pride|making it (?:a great|the perfect) choice).*$/i, '');

  // Collapse multiple spaces and trim
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Extract a jersey number from a title (e.g., "#30", "30 jersey", "number 30").
 * Returns null if no number found or if the only number looks like a year/size.
 */
function extractJerseyNumber(title: string): number | null {
  if (!title) return null;
  const t = title.toLowerCase();
  // Try explicit "#N" first
  const hashMatch = t.match(/#\s*(\d{1,3})\b/);
  if (hashMatch) {
    const n = parseInt(hashMatch[1], 10);
    if (n >= 0 && n <= 99) return n;
  }
  // Try "number N"
  const numWordMatch = t.match(/\bnumber\s+(\d{1,3})\b/);
  if (numWordMatch) {
    const n = parseInt(numWordMatch[1], 10);
    if (n >= 0 && n <= 99) return n;
  }
  // Try "N jersey" pattern (be careful — avoid sizes/years)
  const beforeJerseyMatch = t.match(/\b(\d{1,3})\s+(?:jersey|player)\b/);
  if (beforeJerseyMatch) {
    const n = parseInt(beforeJerseyMatch[1], 10);
    if (n >= 0 && n <= 99) return n;
  }
  return null;
}

/**
 * Keyword coverage: what % of the shorter title's keywords appear in the longer title.
 * This handles asymmetric titles well (short Depop title vs long eBay title).
 */
function keywordCoverage(titleA: string, titleB: string): number {
  const kwA = extractKeywords(titleA);
  const kwB = extractKeywords(titleB);
  if (kwA.length === 0 || kwB.length === 0) return 0;

  // Use the shorter keyword list as the reference
  const [shorter, longer] = kwA.length <= kwB.length ? [kwA, kwB] : [kwB, kwA];
  const longerSet = new Set(longer);
  const matches = shorter.filter(w => longerSet.has(w)).length;

  // Coverage = how many of the shorter title's words are found in the longer title
  return matches / shorter.length;
}

export interface MatchCandidate {
  ebayItem: Item;
  poshmarkItem: Item | null;
  depopItem: Item | null;
  confidence: number;
  matchBreakdown: {
    playerMatch: boolean;
    sizeMatch: boolean;
    colorMatch: boolean;
    titleSimilarity: number;
  };
  status: 'auto' | 'review';
}

export interface MatchingResult {
  matched: MatchCandidate[];
  reviewQueue: MatchCandidate[];
  unmatchedEbay: Item[];
  unmatchedPoshmark: Item[];
  unmatchedDepop: Item[];
}

export interface MatchOptions {
  autoThreshold?: number;   // Minimum confidence for auto-match (default 0.7)
  reviewThreshold?: number; // Minimum confidence for review queue (default 0.4)
}

const DEFAULT_AUTO_THRESHOLD = 0.7;
const DEFAULT_REVIEW_THRESHOLD = 0.4;

/**
 * Determine which platform an item belongs to.
 * eBay = has ebayListingId
 * Poshmark = has poshmarkListingId without ebayListingId
 * Depop = has depopListingId without ebayListingId
 */
function classifyPlatform(item: Item): 'ebay' | 'poshmark' | 'depop' | null {
  if (item.ebayListingId) return 'ebay';
  if (item.poshmarkListingId) return 'poshmark';
  if (item.depopListingId) return 'depop';
  return null;
}

/**
 * Check if two items share a matching platform listing ID (exact cross-platform link).
 * e.g., a Poshmark item that was imported referencing the same eBay listing ID.
 */
function hasExactPlatformLink(ebayItem: Item, otherItem: Item): boolean {
  // If the other item references the same eBay listing ID, it's a direct link
  if (ebayItem.ebayListingId && otherItem.ebayListingId &&
      ebayItem.ebayListingId === otherItem.ebayListingId) {
    return true;
  }
  return false;
}

/**
 * Extract the letter portion of a normalized size string. Handles:
 *   "M" / "L" / "XL" / "2XL" → letter as-is
 *   "50-M" / "52-L" → "M" / "L"
 *   "52" (pure numeric) → look up in JERSEY_SIZE_MAP (52→L)
 * Returns null if no letter can be derived.
 *
 * Used for fuzzy size comparison so eBay "L" matches Depop "52" (hockey numeric)
 * and vice versa. The strict-equality form would miss those.
 */
function extractSizeLetter(size: string): string | null {
  if (!size) return null;
  const upper = size.toUpperCase().trim();
  // Pure letter format
  if (/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)$/.test(upper)) return upper === '2XL' ? 'XXL' : upper === '3XL' ? 'XXXL' : upper;
  // Combined "50-M"
  const combined = upper.match(/-([A-Z0-9]+)$/);
  if (combined) {
    const part = combined[1];
    if (/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)$/.test(part)) return part === '2XL' ? 'XXL' : part === '3XL' ? 'XXXL' : part;
  }
  // Pure numeric → JERSEY_SIZE_MAP lookup
  const num = upper.match(/^(\d+)$/);
  if (num) {
    const letter = JERSEY_SIZE_MAP[parseInt(num[1], 10)];
    return letter || null;
  }
  return null;
}

/**
 * Compute match confidence between an eBay item and another platform's item.
 */
function computeConfidence(
  ebayNorm: NormalizedListing,
  otherNorm: NormalizedListing,
  ebayItem: Item,
  otherItem: Item,
): { confidence: number; breakdown: MatchCandidate['matchBreakdown'] } {
  // Exact platform link → perfect match
  if (hasExactPlatformLink(ebayItem, otherItem)) {
    return {
      confidence: 1.0,
      breakdown: {
        playerMatch: true,
        sizeMatch: true,
        colorMatch: true,
        titleSimilarity: 1.0,
      },
    };
  }

  const playerMatch = ebayNorm.player !== null &&
    otherNorm.player !== null &&
    ebayNorm.player === otherNorm.player;

  // Letter-equivalent size match — handles hockey numeric ↔ letter conversion
  // (50→M, 52→L, 54→XL via JERSEY_SIZE_MAP) so eBay "L" matches Depop "52".
  const ebayLetter = extractSizeLetter(ebayNorm.size);
  const otherLetter = extractSizeLetter(otherNorm.size);
  const sizeMatch = ebayLetter !== null && otherLetter !== null && ebayLetter === otherLetter;

  const colorMatch = ebayNorm.color !== null &&
    otherNorm.color !== null &&
    ebayNorm.color === otherNorm.color;

  // Keyword coverage handles asymmetric title lengths well
  const titleSimilarity = keywordCoverage(ebayNorm.rawTitle, otherNorm.rawTitle);
  // Also compute classic word overlap for reference
  const wordOverlap = wordOverlapSimilarity(ebayNorm.rawTitle, otherNorm.rawTitle);
  // Use the better of the two title similarity measures
  const bestTitleSim = Math.max(titleSimilarity, wordOverlap);

  // Score: title keywords are the primary signal, structured fields are bonuses
  let confidence = bestTitleSim * 0.6;

  // Bonuses for matching structured fields
  if (playerMatch) confidence += 0.20;
  if (sizeMatch) confidence += 0.12;
  if (colorMatch) confidence += 0.08;

  confidence = Math.min(confidence, 1.0);

  return {
    confidence: Math.min(confidence, 1.0),
    breakdown: {
      playerMatch,
      sizeMatch,
      colorMatch,
      titleSimilarity,
    },
  };
}

/**
 * Find the best eBay match for a given non-eBay item.
 * Returns null if no match exceeds the review threshold.
 */
function findBestEbayMatch(
  otherItem: Item,
  otherNorm: NormalizedListing,
  ebayItems: Item[],
  ebayNorms: Map<string, NormalizedListing>,
  reviewThreshold: number,
): { ebayItem: Item; confidence: number; breakdown: MatchCandidate['matchBreakdown'] } | null {
  let bestMatch: { ebayItem: Item; confidence: number; breakdown: MatchCandidate['matchBreakdown'] } | null = null;

  for (const ebayItem of ebayItems) {
    const ebayNorm = ebayNorms.get(ebayItem.id);
    if (!ebayNorm) continue;

    const { confidence, breakdown } = computeConfidence(ebayNorm, otherNorm, ebayItem, otherItem);

    if (confidence >= reviewThreshold && (bestMatch === null || confidence > bestMatch.confidence)) {
      bestMatch = { ebayItem, confidence, breakdown };
    }
  }

  return bestMatch;
}

/**
 * Match inventory items across platforms.
 *
 * Algorithm:
 * 1. Separate items by platform
 * 2. Normalize all items
 * 3. For each Posh/Depop item, find best eBay match
 * 4. Auto-match if >= autoThreshold, review if between reviewThreshold and autoThreshold
 * 5. One eBay item can match one Posh AND one Depop (but not two Posh or two Depop)
 */
export function matchInventory(items: Item[], options?: MatchOptions): MatchingResult {
  const autoThreshold = options?.autoThreshold ?? DEFAULT_AUTO_THRESHOLD;
  const reviewThreshold = options?.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;

  // Step 1: Separate items by platform
  const ebayItems: Item[] = [];
  const poshmarkItems: Item[] = [];
  const depopItems: Item[] = [];

  for (const item of items) {
    const platform = classifyPlatform(item);
    if (platform === 'ebay') ebayItems.push(item);
    else if (platform === 'poshmark') poshmarkItems.push(item);
    else if (platform === 'depop') depopItems.push(item);
  }

  // Step 2: Normalize all items
  const ebayNorms = new Map<string, NormalizedListing>();
  for (const item of ebayItems) {
    ebayNorms.set(item.id, normalizeListing(item, 'ebay'));
  }

  const poshNorms = new Map<string, NormalizedListing>();
  for (const item of poshmarkItems) {
    poshNorms.set(item.id, normalizeListing(item, 'poshmark'));
  }

  const depopNorms = new Map<string, NormalizedListing>();
  for (const item of depopItems) {
    depopNorms.set(item.id, normalizeListing(item, 'depop'));
  }

  // Track which eBay items have been matched to Posh and Depop separately
  const ebayToPoshMatch = new Map<string, MatchCandidate>();
  const ebayToDepopMatch = new Map<string, MatchCandidate>();
  const matchedPoshIds = new Set<string>();
  const matchedDepopIds = new Set<string>();

  // Step 3: Match Poshmark items to eBay
  // Sort by items most likely to match first (those with matching platform IDs)
  const poshSorted = [...poshmarkItems].sort((a, b) => {
    const aHasLink = a.ebayListingId ? 1 : 0;
    const bHasLink = b.ebayListingId ? 1 : 0;
    return bHasLink - aHasLink;
  });

  for (const poshItem of poshSorted) {
    const poshNorm = poshNorms.get(poshItem.id);
    if (!poshNorm) continue;

    // Only consider eBay items not yet matched to a Posh item
    const availableEbay = ebayItems.filter(e => !ebayToPoshMatch.has(e.id));
    const best = findBestEbayMatch(poshItem, poshNorm, availableEbay, ebayNorms, reviewThreshold);

    if (best) {
      const status: 'auto' | 'review' = best.confidence >= autoThreshold ? 'auto' : 'review';
      const candidate: MatchCandidate = {
        ebayItem: best.ebayItem,
        poshmarkItem: poshItem,
        depopItem: null,
        confidence: best.confidence,
        matchBreakdown: best.breakdown,
        status,
      };
      ebayToPoshMatch.set(best.ebayItem.id, candidate);
      matchedPoshIds.add(poshItem.id);
    }
  }

  // Step 4: Match Depop items to eBay
  const depopSorted = [...depopItems].sort((a, b) => {
    const aHasLink = a.ebayListingId ? 1 : 0;
    const bHasLink = b.ebayListingId ? 1 : 0;
    return bHasLink - aHasLink;
  });

  for (const depopItem of depopSorted) {
    const depopNorm = depopNorms.get(depopItem.id);
    if (!depopNorm) continue;

    // Only consider eBay items not yet matched to a Depop item
    const availableEbay = ebayItems.filter(e => !ebayToDepopMatch.has(e.id));
    const best = findBestEbayMatch(depopItem, depopNorm, availableEbay, ebayNorms, reviewThreshold);

    if (best) {
      const status: 'auto' | 'review' = best.confidence >= autoThreshold ? 'auto' : 'review';
      const candidate: MatchCandidate = {
        ebayItem: best.ebayItem,
        poshmarkItem: null,
        depopItem: depopItem,
        confidence: best.confidence,
        matchBreakdown: best.breakdown,
        status,
      };
      ebayToDepopMatch.set(best.ebayItem.id, candidate);
      matchedDepopIds.add(depopItem.id);
    }
  }

  // Step 5: Merge Posh and Depop matches for the same eBay item into a single candidate
  const mergedCandidates = new Map<string, MatchCandidate>();

  for (const [ebayId, poshCandidate] of ebayToPoshMatch) {
    mergedCandidates.set(ebayId, { ...poshCandidate });
  }

  for (const [ebayId, depopCandidate] of ebayToDepopMatch) {
    const existing = mergedCandidates.get(ebayId);
    if (existing) {
      // Merge: add depop item to existing posh match
      existing.depopItem = depopCandidate.depopItem;
      // Use the lower confidence as the overall (conservative)
      existing.confidence = Math.min(existing.confidence, depopCandidate.confidence);
      // Downgrade to review if either side is review
      if (existing.status === 'review' || depopCandidate.status === 'review') {
        existing.status = 'review';
      }
    } else {
      mergedCandidates.set(ebayId, { ...depopCandidate });
    }
  }

  // Step 6: Categorize into matched (auto) vs review queue
  const matched: MatchCandidate[] = [];
  const reviewQueue: MatchCandidate[] = [];
  const matchedEbayIds = new Set<string>();

  for (const [ebayId, candidate] of mergedCandidates) {
    matchedEbayIds.add(ebayId);
    if (candidate.status === 'auto') {
      matched.push(candidate);
    } else {
      reviewQueue.push(candidate);
    }
  }

  // Sort by confidence descending
  matched.sort((a, b) => b.confidence - a.confidence);
  reviewQueue.sort((a, b) => b.confidence - a.confidence);

  // Step 7: Collect unmatched items
  const unmatchedEbay = ebayItems.filter(e => !matchedEbayIds.has(e.id));
  const unmatchedPoshmark = poshmarkItems.filter(p => !matchedPoshIds.has(p.id));
  const unmatchedDepop = depopItems.filter(d => !matchedDepopIds.has(d.id));

  return {
    matched,
    reviewQueue,
    unmatchedEbay,
    unmatchedPoshmark,
    unmatchedDepop,
  };
}

/**
 * Lightweight match: find the best eBay item for a raw listing title + size.
 * Used by import modals to show eBay matches before importing.
 */
export interface EbayMatchResult {
  ebayItem: Item;
  confidence: number;
  breakdown: MatchCandidate['matchBreakdown'];
}

/**
 * Find the top N eBay matches for a raw listing title + size, ranked by confidence.
 * Excludes any item ids in `exclude` (used by the per-row "reload candidates" flow).
 * Same scoring as findEbayMatchForListing — Strategy A (player+size) and Strategy B
 * (sport+jersey#) shortcut high-confidence matches; otherwise Strategy C scores all.
 */
export function findTopEbayMatchesForListing(
  title: string,
  size: string,
  ebayItems: Item[],
  count = 3,
  exclude: Set<string> = new Set(),
  minConfidence = 0.15,
): EbayMatchResult[] {
  const pool = ebayItems.filter(it => !exclude.has(it.id));
  if (pool.length === 0) return [];

  const originalLength = (title || '').length;
  let cleanTitle = title || '';
  if (cleanTitle.includes('-') && !cleanTitle.includes(' ')) {
    cleanTitle = cleanTitle.replace(/-[a-f0-9]{4,}$/, '').replace(/-/g, ' ');
  }
  cleanTitle = cleanDescriptiveTitle(cleanTitle);
  const keywords = extractKeywords(cleanTitle);
  if (keywords.length < 2) return [];

  const otherPlayer = extractPlayer(cleanTitle);
  const otherSize = normalizeSize(size || '') || (function() {
    const sizeMatch = cleanTitle.match(/\b(xxs|xs|s|m|l|xl|xxl|2xl|3xl|small|medium|large|x-large|x large)\b/i);
    return sizeMatch ? normalizeSize(sizeMatch[1]) : '';
  })();
  const otherSport = detectSport(cleanTitle);

  const otherNorm: NormalizedListing = {
    player: otherPlayer,
    size: otherSize,
    color: extractColor(cleanTitle),
    jerseyType: detectJerseyType(cleanTitle),
    sport: otherSport,
    team: null,
    rawTitle: cleanTitle,
    sourceItemId: '',
    sourcePlatform: 'depop',
  };

  const adjustedMin = originalLength > 80 ? Math.min(minConfidence, 0.15) : minConfidence;
  const scored: EbayMatchResult[] = [];
  for (const item of pool) {
    const ebayNorm = normalizeListing(item, 'ebay');
    const { confidence, breakdown } = computeConfidence(
      ebayNorm,
      otherNorm,
      item,
      { id: '', name: cleanTitle, size, status: 'Active' } as Item,
    );
    if (confidence >= adjustedMin) {
      scored.push({ ebayItem: item, confidence, breakdown });
    }
  }
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, count);
}

export function findEbayMatchForListing(
  title: string,
  size: string,
  ebayItems: Item[],
  minConfidence = 0.15,
): EbayMatchResult | null {
  if (ebayItems.length === 0) return null;

  const originalLength = (title || '').length;

  // Clean up slug-derived titles (dashes → spaces, remove hash suffixes)
  let cleanTitle = title || '';
  if (cleanTitle.includes('-') && !cleanTitle.includes(' ')) {
    cleanTitle = cleanTitle.replace(/-[a-f0-9]{4,}$/, '').replace(/-/g, ' ');
  }
  // NEW: strip AI/scraper filler from descriptions before extracting signals.
  cleanTitle = cleanDescriptiveTitle(cleanTitle);

  // Skip if title is empty or too short to match meaningfully
  const keywords = extractKeywords(cleanTitle);
  if (keywords.length < 2) return null;

  // Extract structured signals from the cleaned title
  const otherPlayer = extractPlayer(cleanTitle);
  const otherSize = normalizeSize(size || '') || (function() {
    // Try to extract size from cleanTitle if not provided separately
    const sizeMatch = cleanTitle.match(/\b(xxs|xs|s|m|l|xl|xxl|2xl|3xl|small|medium|large|x-large|x large)\b/i);
    return sizeMatch ? normalizeSize(sizeMatch[1]) : '';
  })();
  const otherSport = detectSport(cleanTitle);
  const otherJerseyNum = extractJerseyNumber(cleanTitle);

  // Pre-normalize all eBay items + extract their structured signals once
  type EbayPrep = { item: Item; norm: NormalizedListing; size: string; sport: string | null; jerseyNum: number | null; player: string | null };
  const ebayPreps: EbayPrep[] = ebayItems.map(item => ({
    item,
    norm: normalizeListing(item, 'ebay'),
    size: normalizeSize(item.size || ''),
    sport: detectSport(item.name || ''),
    jerseyNum: extractJerseyNumber(item.name || '') ?? (item.jerseyNumber != null ? Number(item.jerseyNumber) : null),
    player: extractPlayer(item.name || ''),
  }));

  // ───── Strategy A — Player + Size exact match ─────
  // If both extract on the unknown side AND match on the eBay side, this is high-precision.
  // Most jersey listings are unique by (player, size) within a single seller's inventory.
  if (otherPlayer && otherSize) {
    const matches = ebayPreps.filter(p =>
      p.player && p.player.toLowerCase() === otherPlayer.toLowerCase() &&
      p.size && p.size === otherSize
    );
    if (matches.length === 1) {
      const m = matches[0];
      return {
        ebayItem: m.item,
        confidence: 0.92,
        breakdown: { playerMatch: true, sizeMatch: true, colorMatch: false, titleSimilarity: keywordCoverage(cleanTitle, m.item.name || '') },
      };
    }
    // Multiple — narrow with color tiebreaker
    if (matches.length > 1) {
      const otherColor = extractColor(cleanTitle);
      if (otherColor) {
        const colorNarrowed = matches.filter(p =>
          extractColor(p.item.name || '')?.toLowerCase() === otherColor.toLowerCase()
        );
        if (colorNarrowed.length === 1) {
          const m = colorNarrowed[0];
          return {
            ebayItem: m.item,
            confidence: 0.88,
            breakdown: { playerMatch: true, sizeMatch: true, colorMatch: true, titleSimilarity: keywordCoverage(cleanTitle, m.item.name || '') },
          };
        }
      }
    }
  }

  // ───── Strategy B — Sport + Jersey number unique match ─────
  if (otherJerseyNum != null && otherSport) {
    const matches = ebayPreps.filter(p =>
      p.jerseyNum === otherJerseyNum &&
      p.sport && p.sport === otherSport
    );
    if (matches.length === 1) {
      const m = matches[0];
      return {
        ebayItem: m.item,
        confidence: 0.85,
        breakdown: { playerMatch: false, sizeMatch: false, colorMatch: false, titleSimilarity: keywordCoverage(cleanTitle, m.item.name || '') },
      };
    }
    // Narrow by size if we have one
    if (matches.length > 1 && otherSize) {
      const sizeNarrowed = matches.filter(p => p.size === otherSize);
      if (sizeNarrowed.length === 1) {
        const m = sizeNarrowed[0];
        return {
          ebayItem: m.item,
          confidence: 0.83,
          breakdown: { playerMatch: false, sizeMatch: true, colorMatch: false, titleSimilarity: keywordCoverage(cleanTitle, m.item.name || '') },
        };
      }
    }
  }

  // ───── Strategy C — Cleaned-keyword fallback (existing computeConfidence) ─────
  // Lower threshold for descriptions (originally long titles) since keyword density was diluted.
  const adjustedMin = originalLength > 80 ? Math.min(minConfidence, 0.15) : minConfidence;

  const otherNorm: NormalizedListing = {
    player: otherPlayer,
    size: otherSize,
    color: extractColor(cleanTitle),
    jerseyType: detectJerseyType(cleanTitle),
    sport: otherSport,
    team: null,
    rawTitle: cleanTitle,
    sourceItemId: '',
    sourcePlatform: 'depop',
  };

  let best: EbayMatchResult | null = null;
  for (const p of ebayPreps) {
    const { confidence, breakdown } = computeConfidence(
      p.norm,
      otherNorm,
      p.item,
      { id: '', name: cleanTitle, size, status: 'Active' } as Item,
    );
    if (confidence >= adjustedMin && (!best || confidence > best.confidence)) {
      best = { ebayItem: p.item, confidence, breakdown };
    }
  }
  return best;
}
