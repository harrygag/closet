/**
 * Player name alias dictionary for cross-platform jersey matching.
 * Used by ListingNormalizer to resolve different spellings/nicknames
 * to a canonical player name.
 */

export interface PlayerAlias {
  canonical: string;
  aliases: string[];
}

export const PLAYER_ALIASES: PlayerAlias[] = [
  // MLB
  { canonical: 'Ohtani', aliases: ['ohtani', 'shohei', 'sho'] },
  { canonical: 'Judge', aliases: ['judge', 'aaron'] },
  { canonical: 'Soto', aliases: ['soto', 'juan'] },
  { canonical: 'Trout', aliases: ['trout', 'mike'] },
  { canonical: 'Guerrero', aliases: ['guerrero', 'vladdy', 'vlad', 'vgj'] },
  { canonical: 'Acuna', aliases: ['acuna', 'acuña', 'ronald'] },
  { canonical: 'Tatis', aliases: ['tatis', 'fernando'] },
  { canonical: 'Betts', aliases: ['betts', 'mookie'] },
  { canonical: 'Harper', aliases: ['harper', 'bryce'] },
  { canonical: 'Lindor', aliases: ['lindor', 'francisco'] },
  { canonical: 'Machado', aliases: ['machado', 'manny'] },
  { canonical: 'Crochet', aliases: ['crochet', 'garrett'] },
  { canonical: 'Devers', aliases: ['devers', 'rafael'] },
  { canonical: 'Freeman', aliases: ['freeman', 'freddie'] },
  // NHL
  { canonical: 'McDavid', aliases: ['mcdavid', 'mcd'] },
  { canonical: 'MacKinnon', aliases: ['mackinnon', 'mac', 'nate'] },
  { canonical: 'Matthews', aliases: ['matthews', 'auston', 'am34', 'papi'] },
  { canonical: 'Crosby', aliases: ['crosby', 'sidney', 'sid'] },
  { canonical: 'Ovechkin', aliases: ['ovechkin', 'ovi'] },
  { canonical: 'Bedard', aliases: ['bedard'] },
  { canonical: 'Draisaitl', aliases: ['draisaitl', 'leon'] },
  { canonical: 'Makar', aliases: ['makar', 'cale'] },
  { canonical: 'Kaprizov', aliases: ['kaprizov', 'kirill'] },
  { canonical: 'Hellebuyck', aliases: ['hellebuyck', 'helly'] },
  { canonical: 'Oettinger', aliases: ['oettinger', 'otter'] },
  { canonical: 'Kopitar', aliases: ['kopitar', 'anze'] },
  { canonical: 'Tkachuk', aliases: ['tkachuk'] },
  { canonical: 'Schaefer', aliases: ['schaefer'] },
  { canonical: 'Kucherov', aliases: ['kucherov', 'nikita'] },
  { canonical: 'Pastrnak', aliases: ['pastrnak', 'pasta'] },
  { canonical: 'Marchand', aliases: ['marchand', 'brad'] },
  { canonical: 'Caufield', aliases: ['caufield', 'cole'] },
  // NFL
  { canonical: 'Mahomes', aliases: ['mahomes', 'patrick'] },
  { canonical: 'Allen', aliases: ['allen'] },
  { canonical: 'Burrow', aliases: ['burrow', 'joey'] },
  { canonical: 'Jackson', aliases: ['jackson', 'lamar'] },
  { canonical: 'Kelce', aliases: ['kelce', 'travis'] },
  { canonical: 'Chase', aliases: ['chase', 'jamarr'] },
  { canonical: 'Jefferson', aliases: ['jefferson', 'justin'] },
  { canonical: 'Stroud', aliases: ['stroud', 'cj'] },
  { canonical: 'Hurts', aliases: ['hurts', 'jalen'] },
  // Soccer
  { canonical: 'Messi', aliases: ['messi', 'lionel', 'leo'] },
  { canonical: 'Ronaldo', aliases: ['ronaldo', 'cristiano', 'cr7'] },
  { canonical: 'Haaland', aliases: ['haaland', 'erling'] },
  { canonical: 'Mbappe', aliases: ['mbappe', 'mbappé', 'kylian'] },
  { canonical: 'Pulisic', aliases: ['pulisic', 'christian'] },
  { canonical: 'Bellingham', aliases: ['bellingham', 'jude'] },
  // NBA
  { canonical: 'Flagg', aliases: ['flagg', 'cooper'] },
  { canonical: 'Morant', aliases: ['morant', 'ja'] },
  { canonical: 'Curry', aliases: ['curry', 'steph', 'stephen'] },
  { canonical: 'James', aliases: ['james', 'lebron'] },
];

/**
 * Resolve a raw string (title or partial name) to a canonical player name.
 * Returns null if no match found.
 */
export function resolvePlayerName(raw: string): string | null {
  const lower = raw.toLowerCase();
  const tokens = lower.replace(/[^a-z0-9\s']/g, '').split(/\s+/).filter(Boolean);

  // Check each token against alias lists
  for (const alias of PLAYER_ALIASES) {
    for (const token of tokens) {
      if (alias.aliases.includes(token)) return alias.canonical;
    }
    // Check 2-word combos
    for (let i = 0; i < tokens.length - 1; i++) {
      const twoWord = tokens[i] + ' ' + tokens[i + 1];
      if (alias.aliases.includes(twoWord)) return alias.canonical;
    }
  }

  // Check if canonical name appears in the string
  for (const alias of PLAYER_ALIASES) {
    if (lower.includes(alias.canonical.toLowerCase())) return alias.canonical;
  }

  return null;
}
