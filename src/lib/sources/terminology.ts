import { dedupeStrings } from "./textUtils";

/**
 * Deliberately small, static EN/AR Islamic-terminology map used only to
 * reformulate a SEARCH QUERY (never to alter the claim text shown to the
 * user, and never to add/remove meaning from the claim itself). Each entry
 * maps a term to its most common alternate(s); the first alternate is used
 * to build a second search query when the no-API-key / LLM-unavailable
 * path needs a lexically different probe of the same corpus.
 *
 * This is the deterministic fallback for query expansion — see
 * src/lib/ai/expandQuery.ts for the live (LLM) path, which falls back to
 * this exact function on any failure or when no API key is configured.
 */
const ISLAMIC_TERM_VARIANTS: Record<string, string> = {
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
};

const TERM_RE = new RegExp(
  `\\b(${Object.keys(ISLAMIC_TERM_VARIANTS)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "i"
);

/**
 * Deterministic, offline query expansion: always returns the original claim
 * text as the first query, plus (when an Islamic term with a known
 * alternate appears in the claim) a second query with that one term
 * substituted — a cheap, explainable way to probe the corpus with a
 * lexically different but meaning-preserving variant. Never invents new
 * claim content; only ever substitutes a single term for search purposes.
 */
export function heuristicExpand(claimText: string, max = 2): string[] {
  const base = claimText.trim();
  if (!base) return [];

  const match = TERM_RE.exec(base);
  if (!match) return dedupeStrings([base]).slice(0, max);

  const term = match[1].toLowerCase();
  const alternate = ISLAMIC_TERM_VARIANTS[term];
  const variantRe = new RegExp(`\\b${match[1]}\\b`);
  const variant = base.replace(variantRe, alternate);

  return dedupeStrings([base, variant]).slice(0, max);
}
