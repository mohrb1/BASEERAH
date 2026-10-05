/**
 * Deliberately broad — this is the single biggest lever against false
 * positives on live full-text search. A short stopword list lets generic
 * adverbs/conjunctions ("never", "nor", "ever", "always"...) slip through
 * as "matched keywords" against a long hadith narration purely by chance,
 * which previously caused an unrelated multi-hundred-word hadith to
 * outrank the actually-relevant short Quran verse on a coverage score.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "at", "by", "for", "with", "about", "against",
  "between", "into", "through", "during", "before", "after", "above",
  "below", "from", "up", "down", "out", "off", "over", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "only", "own", "same", "than", "too", "very", "just",
  "and", "or", "but", "if", "because", "as", "until", "while", "nor",
  "not", "no", "so",
  "this", "that", "these", "those", "it", "its", "itself",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "they", "them", "their", "theirs", "themselves",
  "who", "whom", "which", "what", "whose",
  "am", "is", "are", "was", "were", "has", "have", "had", "having",
  "do", "does", "did", "doing", "will", "would", "shall", "should",
  "can", "could", "may", "might", "must", "let",
  "ever", "never", "always", "also", "even", "still", "yet", "already",
  "almost", "quite", "rather", "really", "actually", "simply", "indeed",
  "said", "says", "say",
]);

/**
 * "muslim"/"islam"-family words are non-discriminating in a LONG text —
 * virtually every record in this corpus mentions Islam somewhere, so
 * letting them count as a "matched keyword" against a long hadith narration
 * tells us nothing about relevance (the original reason these were lumped
 * into STOPWORDS). But in a SHORT query — e.g. an Arabic claim bridged
 * term-by-term into English — they can be one of only a handful of
 * surviving tokens, and dropping them unconditionally can leave too few
 * anchors for retrieval to work with at all. These are kept separate from
 * STOPWORDS and only dropped once a text has enough OTHER surviving tokens
 * that losing them doesn't matter (see MIN_TOKENS_TO_DROP_DOMAIN_STOPWORDS
 * below) — the same conditional applies uniformly to every call site
 * (queries and evidence text alike), so long evidence text keeps today's
 * exact behavior while short queries no longer lose their only anchor.
 */
const DOMAIN_STOPWORDS = new Set(["muslim", "muslims", "islam", "islamic"]);

/** Below this many surviving (non-domain) tokens, domain stopwords are kept
 *  rather than dropped. Chosen to cover a short bridged query (e.g. "Islam
 *  بني على five" — 4 tokens) while still stripping them from any normal
 *  sentence-length claim or evidence record (which reliably has more than
 *  a handful of content words). */
const MIN_TOKENS_TO_DROP_DOMAIN_STOPWORDS = 5;

/**
 * Small, explicit table of common English morphological/spelling variants
 * actually seen across this corpus and typical claim wording — e.g. a
 * claim says "fast" (verb) while a hadith translation says "fasting"
 * (noun); same concept, different surface form, zero lexical overlap under
 * plain token equality. Mapping both to one canonical form lets
 * scoreOverlap recognize them as the same token.
 *
 * Deliberately a short, hand-picked table, not a stemming algorithm or NLP
 * dependency — its effect stays small and auditable. This only changes
 * which tokens COUNT AS EQUAL for retrieval/ranking (matchStrength,
 * matchedTerms, concept-group matching); it never touches
 * heuristicVerify's thresholds or the concept gate, both of which simply
 * receive whatever matchStrength results from this — same as any other
 * retrieval-layer change.
 */
const MORPHOLOGICAL_VARIANTS: Record<string, string> = {
  fast: "fasting",
  pray: "prayer",
  pilgrim: "pilgrimage",
  zakah: "zakat",
};

function normalizeMorphology(token: string): string {
  return MORPHOLOGICAL_VARIANTS[token] ?? token;
}

/**
 * Standard Arabic search-normalization — the same scheme used by e.g.
 * Lucene's ArabicNormalizer, not something invented here: fold alef
 * variants (أ/إ/آ/ٱ) to bare ا, ta marbuta (ة) to ha (ه), alef maksura (ى)
 * to ya (ي), and strip tatweel (ـ, a purely decorative elongation
 * character with no phonetic value — Unicode classifies it as a letter,
 * so the \p{L} filter below would otherwise keep it sitting inside a
 * word). This treats common real-world spelling variants of the SAME
 * word (e.g. a ta-marbuta/ha slip) as equal for MATCHING purposes only.
 *
 * Runs only inside tokenize(), so it only ever affects retrieval/ranking
 * token sets — the original claim text shown in the UI, passed to
 * heuristicVerify/claimComplexity, or stored on ClaimResult is never
 * touched by this.
 */
function normalizeArabicOrthography(input: string): string {
  return input
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, ""); // tatweel — delete, not space, so it doesn't fragment the word
}

/** Arabic-Indic digits (٠-٩) -> Western digits, so a number written either
 *  way is searchable the same. */
const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => ARABIC_INDIC_DIGITS[d]);
}

/**
 * Lowercase, strip diacritics/punctuation, split on whitespace, drop
 * stopwords and short tokens.
 *
 * Two deliberate steps before splitting:
 *  1. Strip combining marks (\p{M}) separately, by deletion rather than
 *     replacement. NFKD decomposes accented/diacritical letters into a base
 *     letter + combining mark(s); Arabic diacritics (tashkeel) in
 *     particular appear after nearly every consonant, so replacing them
 *     with a space (as step 2 does for punctuation) would fragment one
 *     word into several meaningless pieces. Deleting them first collapses
 *     e.g. "الصَّلَاة" back to one clean token "الصلاة", same as "café" -> "cafe".
 *  2. Replace remaining non-letter/non-number characters with a space using
 *     Unicode property escapes (\p{L}, \p{N}), not ASCII `\w`. `\w` only
 *     covers [A-Za-z0-9_] — under the old `[^\w\s]` pattern, every Arabic
 *     (or other non-Latin-script) letter was treated as "punctuation" and
 *     silently erased, which made tokenize() return [] for any Arabic-only
 *     claim and short-circuited every adapter before a single comparison
 *     ran. \p{L}/\p{N} preserve letters and digits from any script
 *     (including Arabic-Indic numerals) while still stripping real
 *     punctuation (Latin and Arabic alike, e.g. "،" "؟").
 */
export function tokenize(input: string): string[] {
  const tokens = normalizeDigits(normalizeArabicOrthography(input))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  const domainFiltered =
    tokens.length >= MIN_TOKENS_TO_DROP_DOMAIN_STOPWORDS
      ? tokens.filter((t) => !DOMAIN_STOPWORDS.has(t))
      : tokens;

  return domainFiltered.map(normalizeMorphology);
}

/**
 * Query-coverage relevance score: what fraction of the claim's meaningful
 * keywords are actually present in this evidence text. Deterministic,
 * offline, and used by every adapter (demo + live) so ranking is
 * comparable app-wide.
 *
 * Deliberately NOT normalized by haystack size (no cosine-style
 * sqrt(|q|*|d|) denominator): live evidence varies wildly in length (a
 * short ayah vs. a long hadith narration), and that normalization was
 * found to rank a short, loosely-related verse above the actual best
 * match simply because the best match's full text was longer. Coverage
 * answers the question that matters here — "how much of this claim is
 * grounded in this specific piece of evidence" — without penalizing
 * correct matches for being verbatim and complete.
 */
export function scoreOverlap(
  queryTerms: Set<string>,
  haystackText: string
): { score: number; matchedTerms: string[] } {
  const haystackSet = new Set(tokenize(haystackText));
  const matchedTerms = [...queryTerms].filter((t) => haystackSet.has(t));
  const score = queryTerms.size === 0 ? 0 : matchedTerms.length / queryTerms.size;
  return { score, matchedTerms };
}

/** Pick the N most distinctive (longest) keywords from a query — used to
 *  probe keyword-only search APIs (e.g. AlQuran Cloud) that don't support
 *  free-form semantic queries. */
export function topKeywords(queryTerms: string[], n: number): string[] {
  return [...new Set(queryTerms)]
    .sort((a, b) => b.length - a.length)
    .slice(0, n);
}

/** Trim, drop blanks, and case-insensitively dedupe a list of strings while
 *  preserving first-seen order and original casing. Shared by query
 *  expansion (heuristic + LLM) so the same normalization rule applies
 *  everywhere a set of search queries is assembled. */
export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
