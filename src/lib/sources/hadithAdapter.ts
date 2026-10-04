import type { EvidenceMatch, SourceRecord } from "@/types";
import { fetchJson, SourceProviderError } from "./errors";
import { scoreOverlap, tokenize } from "./textUtils";
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
 * English edition is fetched once and cached in memory for the process
 * lifetime; search is then a local keyword-overlap scan over real,
 * verified hadith text — never invented.
 *
 * Canonical URLs point to sunnah.com's well-known public URL scheme
 * (https://sunnah.com/{collection}:{number}), which uses the exact same
 * collection slugs as this provider.
 */

const PROVIDER = "hadith-api (fawazahmed0, public domain CDN)";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";
const SUNNAH_BASE = "https://sunnah.com";

interface CollectionConfig {
  slug: string;
  displayName: string;
  edition: string;
  /** Collections universally graded authentic by scholarly consensus, used
   *  only when the source data itself has no explicit grade entries. This
   *  is well-documented public knowledge, not an inference about content. */
  impliedGrade?: string;
}

const COLLECTIONS: CollectionConfig[] = [
  { slug: "bukhari", displayName: "Sahih al-Bukhari", edition: "eng-bukhari", impliedGrade: "Sahih (by scholarly consensus)" },
  { slug: "muslim", displayName: "Sahih Muslim", edition: "eng-muslim", impliedGrade: "Sahih (by scholarly consensus)" },
  { slug: "tirmidhi", displayName: "Jami at-Tirmidhi", edition: "eng-tirmidhi" },
  { slug: "abudawud", displayName: "Sunan Abi Dawud", edition: "eng-abudawud" },
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

const collectionCache = new Map<string, Promise<HadithEditionFile>>();

function loadCollection(config: CollectionConfig): Promise<HadithEditionFile> {
  let pending = collectionCache.get(config.slug);
  if (!pending) {
    pending = fetchJson<HadithEditionFile>(
      PROVIDER,
      `${CDN_BASE}/${config.edition}.min.json`,
      10000
    ).catch((err) => {
      collectionCache.delete(config.slug); // allow retry on a later request
      throw err;
    });
    collectionCache.set(config.slug, pending);
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
  file: HadithEditionFile
): SourceRecord {
  const chapter = file.metadata.sections?.[String(entry.reference.book)];
  return {
    id: `live-hadith-${config.slug}-${entry.hadithnumber}`,
    type: "hadith",
    reference: `${config.displayName} ${entry.hadithnumber}`,
    collection: config.displayName,
    grade: formatGrade(entry, config),
    title: chapter ? `${config.displayName} — ${chapter}` : config.displayName,
    text: entry.text,
    tags: [],
    isDemo: false,
    sourceUrl: `${SUNNAH_BASE}/${config.slug}:${entry.hadithnumber}`,
    provider: `${PROVIDER} — translation: English`,
  };
}

export class LiveHadithAdapter implements SourceAdapter {
  readonly name = PROVIDER;
  readonly isDemo = false;

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    const queryTerms = new Set(tokenize(query));
    if (queryTerms.size === 0) return [];

    const errors: unknown[] = [];
    const candidates: EvidenceMatch[] = [];

    await Promise.all(
      COLLECTIONS.map(async (config) => {
        let file: HadithEditionFile;
        try {
          file = await loadCollection(config);
        } catch (err) {
          errors.push(err);
          return;
        }

        for (const entry of file.hadiths) {
          const { score, matchedTerms } = scoreOverlap(queryTerms, entry.text);
          if (matchedTerms.length >= 2 || score >= 0.5) {
            candidates.push({
              source: toRecord(entry, config, file),
              matchStrength: score,
              matchedTerms,
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
      const file = await loadCollection(config);
      const entry = file.hadiths.find((h) => h.hadithnumber === Number(numberStr));
      return entry ? toRecord(entry, config, file) : null;
    } catch {
      return null;
    }
  }
}
