/**
 * Text matching for search.
 *
 * Kept free of any geography or ranking knowledge so it can be unit-exercised
 * purely as string logic. `index.ts` is the only caller.
 */

/** Lower tiers are better. Kept as plain numbers (no enum) to match this codebase's style. */
export const TIER_EXACT = 0;
export const TIER_PREFIX = 1;
export const TIER_WORD_PREFIX = 2;
export const TIER_SUBSTRING = 3;
/** Fuzzy matches occupy `[TIER_FUZZY, TIER_FUZZY + 1)`, ordered by gap score within the band. */
export const TIER_FUZZY = 4;

/**
 * Case- and diacritic-folding normalisation ("zurich" must find "Zürich").
 *
 * NFD decomposition splits an accented letter into the base letter plus a
 * combining mark, so stripping the Unicode combining-marks block removes the
 * accent without a hand-maintained transliteration table. Punctuation folds to
 * spaces (not to nothing) so "St. Helena" and "st helena" normalise the same
 * way without gluing unrelated words together, and whitespace collapses so
 * repeated separators do not create spurious empty words.
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // U+0300–U+036F, the "Combining Diacritical Marks" block — every accent an
    // NFD decomposition of Latin text produces. Written as literal characters
    // rather than a \u-escape because both compile to the identical range;
    // verified directly (see search.test.ts) rather than trusted on sight.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Gap-counted fuzzy subsequence match: every character of `query`, in order,
 * somewhere in `name`. Returns the total skipped characters between matches
 * (lower is a tighter, more plausible match), or `null` if `query` cannot be
 * spelled out of `name` at all.
 *
 * Greedy earliest-position matching rather than a globally-optimal alignment
 * (e.g. dynamic-programming edit distance) — this runs against every
 * candidate on every keystroke, and "roughly how scattered are these letters"
 * is all a fallback tier needs to be useful.
 */
function fuzzySubsequenceGaps(name: string, query: string): number | null {
  let searchFrom = 0;
  let gaps = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < query.length; i++) {
    const found = name.indexOf(query[i]!, searchFrom);
    if (found === -1) return null;
    if (lastMatchIndex !== -1) gaps += found - lastMatchIndex - 1;
    lastMatchIndex = found;
    searchFrom = found + 1;
  }
  return gaps;
}

/**
 * Score how well an already-normalised `name` matches an already-normalised
 * `query`. Lower is better; `null` means no match at all. Callers normalise
 * once at index-build time and once per query, never per comparison.
 */
export function matchScore(name: string, query: string): number | null {
  if (query.length === 0) return null;
  if (name === query) return TIER_EXACT;
  if (name.startsWith(query)) return TIER_PREFIX;
  // Word-boundary prefix so "york" surfaces "new york" via its second word,
  // not only names that literally begin with the query.
  if (name.split(' ').some((word) => word.startsWith(query))) return TIER_WORD_PREFIX;
  if (name.includes(query)) return TIER_SUBSTRING;

  const gaps = fuzzySubsequenceGaps(name, query);
  if (gaps === null) return null;
  // Normalised into the fuzzy band so an ugly scatter never sorts as "better"
  // than a tight one, but no fuzzy match ever outranks a real substring hit.
  return TIER_FUZZY + Math.min(0.99, gaps / (name.length + 1));
}
