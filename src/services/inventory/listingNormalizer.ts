/**
 * ListingNormalizer — Layer 2
 * Parses raw listing titles to extract structured fields for matching.
 */

import type { Item } from '../../types/item';
import { normalizeSize, extractSizeFromTitle } from '../ebay/import';
import { resolvePlayerName } from './playerAliases';

export type JerseyType = 'fanatics' | 'authentic' | 'unknown';
export type Sport = 'nhl' | 'nfl' | 'mlb' | 'soccer';

export interface NormalizedListing {
  player: string | null;
  size: string;
  color: string | null;
  jerseyType: JerseyType;
  sport: Sport | null;
  team: string | null;
  rawTitle: string;
  sourceItemId: string;
  sourcePlatform: 'ebay' | 'poshmark' | 'depop';
}

const KNOWN_COLORS = [
  'white', 'black', 'navy', 'blue', 'red', 'green', 'yellow', 'gold',
  'purple', 'orange', 'pink', 'grey', 'gray', 'teal', 'cream',
  'burgundy', 'maroon', 'silver', 'royal', 'scarlet',
];

/**
 * Normalize a listing from any platform into structured fields for matching.
 *
 * For eBay items, rawTitle is augmented with the first ~240 chars of the cleaned
 * eBay description so the keyword-overlap scorer (`keywordCoverage`) can see player,
 * color, size, and jersey number tokens that often live in the description body
 * rather than the title.
 */
export function normalizeListing(item: Item, platform: 'ebay' | 'poshmark' | 'depop'): NormalizedListing {
  const title = (item as any).ebayFullTitle || item.name || '';
  const specs = (item as any).ebayItemSpecifics as Record<string, string | string[]> | undefined;

  const rawSize = item.size || extractSizeFromTitle(title);
  const size = normalizeSize(rawSize);

  let rawTitle = title;
  if (platform === 'ebay') {
    const descRaw = (item as any).ebayFullDescription as string | undefined;
    if (typeof descRaw === 'string' && descRaw.length > 0) {
      const descPlain = descRaw
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
      rawTitle = `${title} ${descPlain}`.trim();
    }
  }

  return {
    player: extractPlayer(rawTitle),
    size,
    color: extractColor(rawTitle, specs),
    jerseyType: detectJerseyType(rawTitle),
    sport: detectSport(rawTitle, specs),
    team: null, // Future enhancement
    rawTitle,
    sourceItemId: item.id,
    sourcePlatform: platform,
  };
}

/**
 * Extract player name from a listing title using alias dictionary.
 */
export function extractPlayer(title: string): string | null {
  return resolvePlayerName(title);
}

/**
 * Extract color from title or eBay item specifics.
 */
export function extractColor(title: string, itemSpecifics?: Record<string, string | string[]>): string | null {
  // Check eBay item specifics first (most reliable)
  if (itemSpecifics) {
    const specColor = itemSpecifics['Color'] || itemSpecifics['color'];
    if (specColor) {
      const c = Array.isArray(specColor) ? specColor[0] : specColor;
      return c.toLowerCase();
    }
  }

  // Regex against known colors in title
  const lower = title.toLowerCase();
  for (const color of KNOWN_COLORS) {
    if (new RegExp(`\\b${color}\\b`, 'i').test(lower)) {
      return color === 'grey' ? 'gray' : color;
    }
  }

  // Check for common jersey color terms
  if (/\b(home)\b/i.test(lower)) return 'home';
  if (/\b(away|road)\b/i.test(lower)) return 'away';
  if (/\b(alternate|alt|third)\b/i.test(lower)) return 'alternate';

  return null;
}

/**
 * Detect jersey type from title.
 * CRITICAL: Fanatics replicas must NEVER be labeled as authentic/stitched/embroidered.
 */
export function detectJerseyType(title: string): JerseyType {
  const lower = title.toLowerCase();
  const isAuthentic = /\b(authentic|stitched|embroidered|on-?field|elite|vapor)\b/i.test(lower);
  const isFanatics = /\b(fanatics|replica|breakaway|premier|screen.?print)\b/i.test(lower);

  if (isAuthentic && !isFanatics) return 'authentic';
  if (isFanatics && !isAuthentic) return 'fanatics';
  return 'unknown';
}

/**
 * Detect sport from title or item specifics.
 */
export function detectSport(title: string, itemSpecifics?: Record<string, string | string[]>): Sport | null {
  // Check item specifics first
  if (itemSpecifics) {
    const sport = itemSpecifics['Sport'] || itemSpecifics['sport'];
    const league = itemSpecifics['League'] || itemSpecifics['league'];
    const val = (Array.isArray(sport) ? sport[0] : sport) || (Array.isArray(league) ? league[0] : league) || '';
    const lower = val.toLowerCase();
    if (lower.includes('hockey') || lower.includes('nhl')) return 'nhl';
    if (lower.includes('football') && !lower.includes('soccer')) return 'nfl';
    if (lower.includes('baseball') || lower.includes('mlb')) return 'mlb';
    if (lower.includes('soccer') || lower.includes('mls') || lower.includes('fifa')) return 'soccer';
  }

  // Keyword detection from title
  const lower = title.toLowerCase();
  if (/\b(nhl|hockey|puck)\b/i.test(lower)) return 'nhl';
  if (/\b(nfl|touchdown)\b/i.test(lower)) return 'nfl';
  if (/\b(mlb|baseball)\b/i.test(lower)) return 'mlb';
  if (/\b(soccer|futbol|premier\s*league|la\s*liga|serie\s*a|bundesliga|mls|fifa)\b/i.test(lower)) return 'soccer';

  // Team-name based detection (common teams)
  if (/\b(maple leafs|canadiens|bruins|rangers|penguins|oilers|avalanche|lightning|stars|jets|flames|canucks|senators|devils|islanders|panthers|hurricanes|predators|blues|wild|ducks|sharks|kraken|coyotes|sabres|flyers|capitals|red wings|blackhawks|blue jackets|kings)\b/i.test(lower)) return 'nhl';
  if (/\b(chiefs|eagles|49ers|cowboys|packers|bills|ravens|bengals|dolphins|lions|bears|vikings|chargers|seahawks|rams|broncos|saints|texans|jaguars|steelers|colts|falcons|cardinals|giants|jets|commanders|titans|patriots|raiders|browns|panthers|buccaneers)\b/i.test(lower)) return 'nfl';
  if (/\b(yankees|dodgers|mets|red sox|astros|braves|phillies|padres|cubs|cardinals|brewers|orioles|guardians|mariners|rangers|rays|twins|royals|diamondbacks|pirates|reds|white sox|tigers|rockies|nationals|marlins|giants|athletics|angels|blue jays)\b/i.test(lower)) return 'mlb';

  return null;
}
