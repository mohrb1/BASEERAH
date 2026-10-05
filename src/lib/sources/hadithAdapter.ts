import type { EvidenceMatch, SourceRecord } from "@/types";
import { fetchJson, SourceProviderError } from "./errors";
import { containsArabic, scoreOverlap, tokenize } from "./textUtils";
import type { SourceAdapter } from "./types";

/**
 * Live Hadith provider backed by the hadith-api CDN
 * (github.com/fawazahmed0/hadith-api, served via jsDelivr). Public domain
 * (Unlicense), keyless, no documented rate limit, served as static JSON
 * per collection — verified reachable and returning real hadith text,
 * references, and scholarly grading as of this integration (see
 * README.md "Source Providers").
 *
 * There is no search endpoint, so each configured collection's full
 * edition is fetched once and cached in memory for the process lifetime;
 * search is then a local keyword-overlap scan over real, verified hadith
 * text — never invented.
 *
 * Canonical URLs point to sunnah.com's well-known public URL scheme
 * (https://sunnah.com/{collection}:{number}), which uses the exact same
 * collection slugs as this provider.
 *
 * ARABIC EVIDENCE: each collection also has a verified Arabic edition
 * (ara-bukhari, ara-muslim, ara-tirmidhi, ara-abudawud — confirmed
 * reachable, same JSON shape, and using the SAME `hadithnumber` as the
 * English edition for the same underlying hadith; spot-checked e.g.
 * English "Sahih Muslim 111" against Arabic edition hadithnumber 111,
 * which returns the real Arabic text of that exact hadith). For an
 * Arabic-language query, the Arabic edition is fetched best-effort
 * alongside the English one, and whichever text scores at least as well
 * against the query is used as the displayed evidence — never an LLM
 * translation, always the source edition's own real text. If the Arabic
 * edition is unavailable for any reason, this silently falls back to the
 * English edition exactly as before (not a provider failure).
 */

const PROVIDER = "hadith-api (fawazahmed0, public domain CDN)";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";
const SUNNAH_BASE = "https://sunnah.com";

interface CollectionConfig {
  slug: string;
  displayName: string;
  /** Canonical Arabic name of the collection — well-established public
   *  knowledge (e.g. "صحيح مسلم"), not a fabricated or machine-translated
   *  label. Used only in the display title when Arabic evidence text is
   *  shown; the citation `reference` stays in its canonical English form
   *  regardless (see toRecord). */
  displayNameAr: string;
  edition: string;
  editionAr: string;
  /** Collections universally graded authentic by scholarly consensus, used
   *  only when the source data itself has no explicit grade entries. This
   *  is well-documented public knowledge, not an inference about content. */
  impliedGrade?: string;
}

const COLLECTIONS: CollectionConfig[] = [
  { slug: "bukhari", displayName: "Sahih al-Bukhari", displayNameAr: "صحيح البخاري", edition: "eng-bukhari", editionAr: "ara-bukhari", impliedGrade: "Sahih (by scholarly consensus)" },
  { slug: "muslim", displayName: "Sahih Muslim", displayNameAr: "صحيح مسلم", edition: "eng-muslim", editionAr: "ara-muslim", impliedGrade: "Sahih (by scholarly consensus)" },
  { slug: "tirmidhi", displayName: "Jami at-Tirmidhi", displayNameAr: "جامع الترمذي", edition: "eng-tirmidhi", editionAr: "ara-tirmidhi" },
  { slug: "abudawud", displayName: "Sunan Abi Dawud", displayNameAr: "سنن أبي داود", edition: "eng-abudawud", editionAr: "ara-abudawud" },
];

interface HadithEntry {
  hadithnumber: number;
  text: string;
  grades: { name: string; grade: string }[];
  reference: { book: number; hadith: number };
}

interface HadithEditionFile {
  metadata: { name: string; sections: Record<string, string> };
  hadiths: HadithEntry[];
}

/** Keyed by the full edition string ("eng-bukhari", "ara-bukhari", ...) so
 *  the English and Arabic editions of the same collection cache
 *  independently. */
const editionCache = new Map<string, Promise<HadithEditionFile>>();

function loadEdition(edition: string): Promise<HadithEditionFile> {
  let pending = editionCache.get(edition);
  if (!pending) {
    pending = fetchJson<HadithEditionFile>(PROVIDER, `${CDN_BASE}/${edition}.min.json`, 10000).catch(
      (err) => {
        editionCache.delete(edition); // allow retry on a later request
        throw err;
      }
    );
    editionCache.set(edition, pending);
  }
  return pending;
}

function formatGrade(entry: HadithEntry, config: CollectionConfig): string | undefined {
  if (entry.grades.length === 0) return config.impliedGrade;
  const unique = entry.grades.filter(
    (g, i, arr) => arr.findIndex((o) => o.grade === g.grade && o.name === g.name) === i
  );
  return unique
    .slice(0, 3)
    .map((g) => `${g.name}: ${g.grade}`)
    .join("; ");
}

function toRecord(
  entry: HadithEntry,
  config: CollectionConfig,
  file: HadithEditionFile,
  arabic?: { entry: HadithEntry; displayAsArabic: boolean }
): SourceRecord {
  const chapter = file.metadata.sections?.[String(entry.reference.book)];
  const displayAsArabic = arabic?.displayAsArabic ?? false;
  const titlePrefix = displayAsArabic ? config.displayNameAr : config.displayName;
  return {
    id: `live-hadith-${config.slug}-${entry.hadithnumber}`,
    type: "hadith",
    // Citation stays in its canonical English form regardless of which
    // language the evidence TEXT is shown in — this is the stable,
    // accurate reference identity ("Sahih Muslim 111"), not a translation.
    reference: `${config.displayName} ${entry.hadithnumber}`,
    collection: config.displayName,
    grade: formatGrade(entry, config),
    title: chapter ? `${titlePrefix} — ${chapter}` : titlePrefix,
    text: displayAsArabic ? arabic!.entry.text : entry.text,
    // Populated whenever the Arabic edition had this hadith, regardless of
    // which text is primary — real source text, never a translation.
    arabicText: arabic?.entry.text,
    tags: [],
    isDemo: false,
    sourceUrl: `${SUNNAH_BASE}/${config.slug}:${entry.hadithnumber}`,
    provider: displayAsArabic
      ? `${PROVIDER} — Arabic edition (${config.editionAr})`
      : `${PROVIDER} — translation: English`,
  };
}

export class LiveHadithAdapter implements SourceAdapter {
  readonly name = PROVIDER;
  readonly isDemo = false;

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    const queryTerms = new Set(tokenize(query));
    if (queryTerms.size === 0) return [];

    // Only worth fetching the Arabic edition when the query itself has
    // Arabic content — a purely English/bridged query never scores higher
    // against Arabic text, so this keeps English-only retrieval exactly as
    // fast as before (no extra fetch at all).
    const wantArabic = containsArabic(query);

    const errors: unknown[] = [];
    const candidates: EvidenceMatch[] = [];

    await Promise.all(
      COLLECTIONS.map(async (config) => {
        let file: HadithEditionFile;
        try {
          file = await loadEdition(config.edition);
        } catch (err) {
          errors.push(err);
          return;
        }

        // Best-effort only: an Arabic-edition failure is NOT a provider
        // failure and must never block English results — safe fallback,
        // exactly as the existing CompositeLiveSourceAdapter/demo fallback
        // pattern already does one layer up.
        let arabicFile: HadithEditionFile | null = null;
        if (wantArabic) {
          try {
            arabicFile = await loadEdition(config.editionAr);
          } catch {
            arabicFile = null;
          }
        }
        const arabicByNumber = arabicFile
          ? new Map(arabicFile.hadiths.map((h) => [h.hadithnumber, h]))
          : null;

        for (const entry of file.hadiths) {
          const enResult = scoreOverlap(queryTerms, entry.text);
          const arEntry = arabicByNumber?.get(entry.hadithnumber);
          const arResult = arEntry ? scoreOverlap(queryTerms, arEntry.text) : null;

          // Prefer Arabic whenever it's at least as strong a genuine match
          // as the English text — never because it's Arabic alone, only
          // because the query's own evidence says so.
          const useArabic = !!(arResult && arResult.score > 0 && arResult.score >= enResult.score);
          const chosen = useArabic ? arResult! : enResult;

          if (chosen.matchedTerms.length >= 2 || chosen.score >= 0.5) {
            candidates.push({
              source: toRecord(
                entry,
                config,
                file,
                arEntry ? { entry: arEntry, displayAsArabic: useArabic } : undefined
              ),
              matchStrength: chosen.score,
              matchedTerms: chosen.matchedTerms,
            });
          }
        }
      })
    );

    if (errors.length === COLLECTIONS.length) {
      const first = errors[0];
      throw first instanceof SourceProviderError
        ? first
        : new SourceProviderError(PROVIDER, "all hadith collections failed to load", first);
    }

    return candidates.sort((a, b) => b.matchStrength - a.matchStrength).slice(0, limit);
  }

  async getById(id: string): Promise<SourceRecord | null> {
    const match = /^live-hadith-([a-z]+)-(\d+)$/.exec(id);
    if (!match) return null;
    const [, slug, numberStr] = match;
    const config = COLLECTIONS.find((c) => c.slug === slug);
    if (!config) return null;

    try {
      const file = await loadEdition(config.edition);
      const entry = file.hadiths.find((h) => h.hadithnumber === Number(numberStr));
      return entry ? toRecord(entry, config, file) : null;
    } catch {
      return null;
    }
  }
}
