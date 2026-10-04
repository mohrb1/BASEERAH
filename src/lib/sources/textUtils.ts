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
  "muslim", "muslims", "islam", "islamic", "said", "says", "say",
]);

/** Lowercase, strip diacritics/punctuation, split on whitespace, drop stopwords and short tokens. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
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
