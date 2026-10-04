import { dedupeStrings } from "./textUtils";

/**
 * Deliberately small, data-driven EN/AR Islamic-terminology map used only to
 * reformulate a SEARCH QUERY (never to alter the claim text shown to the
 * user, and never to add/remove meaning from the claim itself). Each entry
 * maps a term to its most common alternate; heuristicExpand() below
 * substitutes every recognized term it finds in one pass to build a single
 * extra query.
 *
 * Arabic entries are intentionally one-directional (Arabic -> English
 * only, never mirrored back). The retrievable corpus (Quran/Hadith
 * translations, demo data) is English text today, so mapping FROM Arabic
 * lets an Arabic-language claim reach that corpus; the reverse direction
 * would only ever make an English query worse by introducing Arabic text
 * that can't lexically match English haystack text.
 *
 * This is the deterministic fallback for query expansion — see
 * src/lib/ai/expandQuery.ts for the live (LLM) path, which can translate
 * Arabic freely and falls back to this exact function on any failure or
 * when no API key is configured.
 */
const ISLAMIC_TERM_VARIANTS: Record<string, string> = {
  // English / transliteration <-> English synonym (bidirectional)
  zakat: "almsgiving",
  almsgiving: "zakat",
  salah: "prayer",
  salat: "prayer",
  prayer: "salah",
  sawm: "fasting",
  fasting: "sawm",
  hajj: "pilgrimage",
  pilgrimage: "hajj",
  shahada: "testimony of faith",
  tawhid: "oneness of god",
  hadith: "prophetic narration",
  sunnah: "prophetic tradition",
  quran: "scripture",
  paradise: "jannah",
  jannah: "paradise",
  hellfire: "jahannam",
  jahannam: "hellfire",
  niyyah: "intention",
  intention: "niyyah",

  // Arabic -> English bridge (one-directional; see note above)
  "أركان": "pillars",
  "ركن": "pillar",
  "الإسلام": "Islam",
  "إسلام": "Islam",
  "خمسة": "five",
  "خمس": "five",
  "الصلاة": "prayer",
  "صلاة": "prayer",
  "الزكاة": "zakat",
  "زكاة": "zakat",
  zakah: "zakat", // common alternate transliteration
  "الصوم": "fasting",
  "صوم": "fasting",
  "الصيام": "fasting",
  "صيام": "fasting",
  "الحج": "pilgrimage",
  "حج": "pilgrimage",
};

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches any recognized term as a whole word, in any script, via
 * Unicode-aware lookarounds rather than `\b`. Plain `\b` in JS is defined
 * relative to ASCII `\w` — since Arabic letters are never `\w`, `\b` never
 * reports a boundary around them at all, so `/\bأركان\b/` silently fails to
 * match even when the word is right there in the string. These lookarounds
 * use the same \p{L}/\p{N} "word-like" definition as tokenize() in
 * textUtils.ts instead, so matching works the same way for any script.
 */
const TERM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(ISLAMIC_TERM_VARIANTS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu"
);

/**
 * Small, explicit table of multi-word Arabic phrases whose meaning isn't
 * recoverable by substituting one term at a time — a literal word-by-word
 * translation of each word individually would miss the construction
 * entirely. Each entry is a REUSABLE grammatical/verbal phrase (not a full
 * claim), so adding one here benefits every claim that happens to use that
 * same common construction, not just one specific claim's exact wording.
 *
 * Deliberately narrow in scope: this is NOT general Arabic grammar
 * translation. It does not translate "على" or any other preposition on its
 * own — only this specific named phrase, as a fixed unit, in the same
 * spirit as (and extendable the same way as) ISLAMIC_TERM_VARIANTS above.
 */
const PHRASE_VARIANTS: { arabic: string; english: string }[] = [
  // "Islam is/was built upon [five ...]" — the verbal-phrase opening of the
  // well-known "Islam is built on five [pillars]" hadith construction.
  { arabic: "بني على", english: "is built upon" },
  { arabic: "مبني على", english: "is built upon" },
  { arabic: "بنيت على", english: "is built upon" },
];

function buildPhraseRegex(phrase: string): RegExp {
  const pattern = phrase
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "u");
}

const COMPILED_PHRASE_VARIANTS = PHRASE_VARIANTS.map((p) => ({
  regex: buildPhraseRegex(p.arabic),
  english: p.english,
}));

/** Applies every recognized multi-word phrase substitution, in order. Pure
 *  string replacement on known fixed phrases — never touches any other
 *  word in the text. */
function applyPhraseVariants(text: string): string {
  let result = text;
  for (const { regex, english } of COMPILED_PHRASE_VARIANTS) {
    result = result.replace(regex, english);
  }
  return result;
}

/**
 * Deterministic, offline query expansion: always returns the original claim
 * text as the first query, plus a second, bridged query built in two
 * composable passes:
 *  1. Phrase-level substitution (PHRASE_VARIANTS) for fixed multi-word
 *     constructions a word-by-word pass would miss entirely.
 *  2. Term-level substitution (ISLAMIC_TERM_VARIANTS), applied to the
 *     result of step 1 — EVERY recognized single term is substituted in
 *     one left-to-right pass (not just the first match), so a multi-term
 *     phrase (e.g. several Islamic terms in one Arabic sentence) gets
 *     fully bridged into one coherent extra query rather than needing one
 *     query per term.
 * Never invents new claim content; only ever substitutes known terms/
 * phrases for search purposes, and the result count still respects `max`
 * (the same MAX_EXPANDED_QUERIES budget every caller already uses).
 */
export function heuristicExpand(claimText: string, max = 2): string[] {
  const base = claimText.trim();
  if (!base) return [];

  const phraseBridged = applyPhraseVariants(base);

  const matches = [...phraseBridged.matchAll(TERM_RE)];
  if (matches.length === 0) {
    return dedupeStrings([base, phraseBridged]).slice(0, max);
  }

  let variant = "";
  let cursor = 0;
  for (const m of matches) {
    const term = m[1];
    if (m.index === undefined) continue;
    const alternate = ISLAMIC_TERM_VARIANTS[term.toLowerCase()] ?? ISLAMIC_TERM_VARIANTS[term];
    if (alternate === undefined) continue;
    variant += phraseBridged.slice(cursor, m.index) + alternate;
    cursor = m.index + term.length;
  }
  variant += phraseBridged.slice(cursor);

  return dedupeStrings([base, variant]).slice(0, max);
}
