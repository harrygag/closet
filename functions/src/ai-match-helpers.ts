/**
 * Deterministic helpers used by the hybrid AI matcher (functions/src/ai-match.ts).
 * Tier 0 filters, Tier 1 unambiguous-bind logic, and Tier 2 candidate-pre-filtering all live here.
 *
 * NOTE: this module mirrors logic from src/services/inventory/listingMatcher.ts and
 * src/services/ebay/import.ts. We don't share code with the client because the CF
 * runs in Node 20 and the client uses the Vite browser bundle. Keep the regexes
 * in sync if either side is updated.
 */

const JERSEY_SIZE_MAP: Record<number, string> = {
  40: 'S', 42: 'S',
  44: 'M', 46: 'M', 48: 'M',
  50: 'L', 52: 'L',
  54: 'XL',
  56: 'XXL', 58: 'XXL',
  60: '3XL', 62: '3XL',
  64: '4XL',
};

const SIZE_WORD_MAP: Record<string, string> = {
  'small': 'S', 'medium': 'M', 'large': 'L',
  'x-large': 'XL', 'xx-large': 'XXL', 'xxx-large': '3XL',
  'xs': 'XS', 'xxs': 'XXS',
  's': 'S', 'm': 'M', 'l': 'L',
  'xl': 'XL', 'xxl': 'XXL', '2xl': 'XXL',
  '3xl': '3XL', '4xl': '4XL',
};

/** Decode entities + strip HTML tags. Order matters: the eBay description is stored
 *  with entities encoding the tags themselves (`&lt;p&gt;text&lt;/p&gt;`), so we MUST
 *  decode entities first to make the tags recognizable, then strip. Run two passes to
 *  handle double-encoded entities like `&amp;apos;` → `&apos;` → `'`. */
export function stripDescriptionHtml(html: string): string {
  if (!html) return '';
  let s = html;
  // Pass 1: decode entities (twice for double-encoded like &amp;lt;).
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
  // Pass 2: strip the now-literal HTML tags.
  s = s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Description → lowercased plain text suitable for prefix comparison. */
export function descriptionToPlainText(html: string): string {
  if (!html) return '';
  let s = stripDescriptionHtml(html);
  // Normalize curly quotes/apostrophes to straight.
  s = s.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"');
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeRowTitle(t: string): string {
  if (!t) return '';
  return t
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the row's title is a prefix of the item's plain-text description (or vice versa). */
export function isDescriptionPrefixMatch(rowTitle: string, plainDesc: string): boolean {
  if (!rowTitle || !plainDesc) return false;
  const t = normalizeRowTitle(rowTitle);
  if (t.length < 20) return false; // too short to be diagnostic
  if (plainDesc.length >= t.length) return plainDesc.startsWith(t);
  return t.startsWith(plainDesc);
}

/** Extract canonical S/M/L/XL/XXL/3XL/4XL from any text. Returns '' when unable. */
export function extractSize(text: string): string {
  if (!text) return '';
  const t = text.toLowerCase();

  // 1) Letter-then-number: "XL 54", "L (52)"
  const letterNum = t.match(/\b(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\s*[\s\(\/]\s*(\d{2})\b/i);
  if (letterNum) {
    const num = parseInt(letterNum[2], 10);
    return JERSEY_SIZE_MAP[num] || (SIZE_WORD_MAP[letterNum[1]] || letterNum[1].toUpperCase());
  }

  // 2) Number-then-letter: "Size 52 L", "54-XL", "50/M"
  const numLetter = t.match(/\b(?:size\s+)?(\d{2})\s*[-\/]?\s*(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\b/i);
  if (numLetter) {
    const num = parseInt(numLetter[1], 10);
    if (JERSEY_SIZE_MAP[num]) return JERSEY_SIZE_MAP[num];
    return SIZE_WORD_MAP[numLetter[2]] || numLetter[2].toUpperCase();
  }

  // 3) Pure jersey number: "Blue 54"
  const pureNum = t.match(/\b(\d{2})\b/);
  if (pureNum) {
    const num = parseInt(pureNum[1], 10);
    if (JERSEY_SIZE_MAP[num]) return JERSEY_SIZE_MAP[num];
  }

  // 4) Explicit "Men's L"
  const mens = t.match(/\bmen'?s\s+(xxl|2xl|3xl|4xl|xl|xs|xxs|large|medium|small|[lm])\b/i);
  if (mens) return SIZE_WORD_MAP[mens[1]] || mens[1].toUpperCase();

  // 5) Word size: "Large" / "X-Large"
  const word = t.match(/\b(xxl|2xl|3xl|4xl|xl|xs|xxs|x-large|xx-large|large|medium|small)\b/i);
  if (word) return SIZE_WORD_MAP[word[1].toLowerCase()] || word[1].toUpperCase();

  // 6) Standalone L/M with no possessive context
  const letter = t.match(/(?<!['\w])\b([lm])\b(?!['\w])/i);
  if (letter) return letter[1].toUpperCase();

  return '';
}

/** Extract primary color (lowercased) or null. */
const COLORS = [
  'white', 'black', 'gray', 'grey', 'navy', 'red', 'blue', 'green', 'yellow', 'orange',
  'purple', 'pink', 'brown', 'silver', 'gold', 'cream', 'maroon', 'royal', 'teal',
];
export function extractColor(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const c of COLORS) {
    if (t.match(new RegExp(`\\b${c}\\b`))) {
      // "royal blue" / "navy blue" — collapse to base
      if (c === 'royal' && t.match(/\broyal\s+blue\b/)) return 'blue';
      if (c === 'navy' && t.match(/\bnavy\s+blue\b/)) return 'navy';
      if (c === 'baby' && t.match(/\bbaby\s+blue\b/)) return 'blue';
      if (c === 'grey') return 'gray';
      return c;
    }
  }
  return null;
}

/** Item category — Jersey, Hoodie, Polo, Jacket, Tshirt, Bottoms, Pullover. Or null. */
export function extractCategory(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bjersey\b/.test(t)) return 'jersey';
  if (/\bhoodie\b|\bhoody\b|\bsweatshirt\b/.test(t) && !/\bcrewneck\b/.test(t)) return 'hoodie';
  if (/\bpolo\b/.test(t) && !/\bpullover\b/.test(t)) return 'polo';
  if (/\bjacket\b|\bwindbreaker\b|\bbomber\b|\bcoat\b/.test(t)) return 'jacket';
  if (/\bt[-\s]?shirt\b|\btee\b/.test(t)) return 'tshirt';
  if (/\bpants\b|\bshorts\b|\bbottoms\b/.test(t)) return 'bottoms';
  if (/\bpullover\b|\b1\/4\s*zip\b|\bquarter[\s-]?zip\b|\bcrewneck\b|\bsweater\b/.test(t)) return 'pullover';
  return null;
}

/** Cap output at maxChars; trim at last space. */
export function truncate(s: string, maxChars: number): string {
  if (!s || s.length <= maxChars) return s || '';
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.7 ? cut.slice(0, lastSpace) : cut).trim();
}

const IDENTIFIER_STOP = new Set([
  'mens', 'men', "men's", 'womens', 'women', "women's", 'youth', 'kids', 'unisex',
  'jersey', 'jerseys', 'hoodie', 'sweatshirt', 'pullover', 'shirt', 'tshirt', 't-shirt', 'tee',
  'polo', 'jacket', 'coat', 'pants', 'shorts', 'bottoms', 'crewneck', 'sweater',
  'authentic', 'replica', 'official', 'licensed', 'vintage', 'retro', 'reverse',
  'small', 'medium', 'large', 'xlarge', 'xxl', 'xxxl',
  'red', 'blue', 'white', 'black', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
  'navy', 'gray', 'grey', 'silver', 'gold', 'cream', 'maroon', 'royal', 'teal',
  'nike', 'adidas', 'puma', 'reebok', 'champion', 'fanatics', 'mitchell', 'ness', 'starter',
  'new', 'nwt', 'nwot', 'used', 'rare', 'vtg',
  'home', 'away', 'alternate', 'edition', 'limited',
  'size', 'style', 'color', 'colour', 'condition',
  'mlb', 'nfl', 'nba', 'nhl', 'mls', 'ncaa', 'wnba',
]);

/**
 * Extract the longest run of capitalized words (proper-noun phrase) from a title.
 * Filters out words in IDENTIFIER_STOP. Returns the lowercase form for case-insensitive
 * comparison against item titles/descriptions, or '' if no diagnostic phrase found.
 *
 * Examples:
 *   "Matthew Tkachuk Reverse Retro Calgary Flames Jersey XL" → "matthew tkachuk"
 *   (Calgary Flames is also a run, but Tkachuk is the longer single proper-noun anchor;
 *   we pick the longest run with ≥2 words preferred, ≥1 word otherwise. If the longest
 *   has length=1 and another run also has length=1, we return the one with more chars.)
 */
export function extractIdentifier(title: string): string {
  if (!title) return '';
  const tokens = title.split(/\s+/);
  const runs: string[][] = [];
  let cur: string[] = [];
  for (const tok of tokens) {
    const stripped = tok.replace(/[^A-Za-z'-]/g, '');
    if (!stripped) {
      if (cur.length) { runs.push(cur); cur = []; }
      continue;
    }
    const isCap = /^[A-Z]/.test(stripped);
    const lower = stripped.toLowerCase();
    if (isCap && !IDENTIFIER_STOP.has(lower)) {
      cur.push(lower);
    } else {
      if (cur.length) { runs.push(cur); cur = []; }
    }
  }
  if (cur.length) runs.push(cur);
  if (runs.length === 0) return '';
  // Prefer longest run by word count, ties broken by total char length.
  runs.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.join(' ').length - a.join(' ').length;
  });
  const best = runs[0];
  // Single-word runs <4 chars are non-diagnostic (e.g. "XL").
  if (best.length === 1 && best[0].length < 4) return '';
  return best.join(' ');
}

/**
 * Extract a 2-digit jersey number (00-99) from a title. Picks the first one found,
 * preferring numbers preceded by '#'.
 */
export function extractJerseyNumber(title: string): string {
  if (!title) return '';
  const hashed = title.match(/#\s*(\d{1,2})\b/);
  if (hashed) return hashed[1].padStart(2, '0');
  const plain = title.match(/\b(\d{1,2})\b/);
  if (plain) {
    const n = parseInt(plain[1], 10);
    if (n >= 0 && n <= 99) return plain[1].padStart(2, '0');
  }
  return '';
}

/** Lowercase, collapse whitespace. Used for tokenization + prefix comparison. */
export function normalizeText(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'of', 'to', 'with',
  'new', 'nwt', 'nwot', 'size', 'mens', 'men', 'womens', 'women', 'youth',
  'free', 'shipping', 'fast', 'brand', 'authentic', 'official', 'licensed',
  'item', 'listing', 'description', 'condition', 'details', 'used',
]);

/**
 * Tokenize a title or description into words ≥4 chars after stop-word removal.
 * Used for Jaccard similarity scoring.
 */
export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const tokens = normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

/** Jaccard similarity over two token sets. Returns 0–1. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** Pull a brand string from the eBay item specifics object. Returns lowercase or ''. */
export function extractBrandFromSpecifics(specifics: Record<string, any> | undefined): string {
  if (!specifics) return '';
  const raw = specifics.Brand || specifics.brand || specifics.BRAND;
  if (!raw) return '';
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' ? v.toLowerCase().trim() : '';
}
