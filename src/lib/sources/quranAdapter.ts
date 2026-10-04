import type { EvidenceMatch, SourceRecord } from "@/types";
import { fetchJson, NotFoundSignal, SourceProviderError } from "./errors";
import { scoreOverlap, tokenize, topKeywords } from "./textUtils";
import type { SourceAdapter } from "./types";

/**
 * Live Quran provider backed by the AlQuran Cloud API (api.alquran.cloud).
 * Public, keyless, no documented rate limit. Verified reachable and
 * returning real Quranic text + metadata as of this integration — see
 * README.md "Source Providers" for the verification notes.
 *
 * Docs: https://alquran.cloud/api
 * Search: GET /v1/search/{keyword}/{surah|all}/{edition}
 * Ayah lookup: GET /v1/ayah/{surah}:{ayah}/{edition}
 *
 * The search endpoint does literal phrase/keyword matching against
 * translation text, not semantic search — so we probe it with the most
 * distinctive keywords extracted from the claim (see textUtils.topKeywords)
 * rather than the raw claim sentence, then re-rank candidates locally with
 * the same overlap scoring used everywhere else in the app.
 */

const PROVIDER = "AlQuran Cloud API";
const API_BASE = "https://api.alquran.cloud/v1";
const CANONICAL_BASE = "https://alquran.cloud/ayah";
/** Saheeh International — the most widely used English Quran translation. */
const DEFAULT_EDITION = "en.sahih";
const KEYWORD_PROBES = 3;
const MAX_MATCHES_PER_KEYWORD = 10;

interface AlQuranSurah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
}

interface AlQuranSearchMatch {
  numberInSurah: number;
  text: string;
  edition: { identifier: string; englishName: string; language: string };
  surah: AlQuranSurah;
}

interface AlQuranSearchResponse {
  data: { count: number; matches: AlQuranSearchMatch[] };
}

interface AlQuranAyahResponse {
  data: {
    text: string;
    numberInSurah: number;
    surah: AlQuranSurah;
  };
}

function toRecord(
  surah: AlQuranSurah,
  ayah: number,
  text: string,
  translationLabel: string
): SourceRecord {
  const reference = `Quran ${surah.number}:${ayah}`;
  return {
    id: `live-quran-${surah.number}:${ayah}`,
    type: "quran",
    reference,
    title: `${surah.englishName} (${surah.englishNameTranslation}), Ayah ${ayah}`,
    text,
    tags: [],
    isDemo: false,
    sourceUrl: `${CANONICAL_BASE}/${surah.number}:${ayah}`,
    provider: `${PROVIDER} — translation: ${translationLabel}`,
  };
}

export class LiveQuranAdapter implements SourceAdapter {
  readonly name = PROVIDER;
  readonly isDemo = false;

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    const queryTermList = tokenize(query);
    const queryTermSet = new Set(queryTermList);
    if (queryTermSet.size === 0) return [];

    const keywords = topKeywords(queryTermList, KEYWORD_PROBES);
    const seen = new Map<string, EvidenceMatch>();
    const errors: unknown[] = [];
    let anyReachable = false;

    await Promise.all(
      keywords.map(async (kw) => {
        const url = `${API_BASE}/search/${encodeURIComponent(kw)}/all/en`;
        try {
          const json = await fetchJson<AlQuranSearchResponse>(PROVIDER, url);
          anyReachable = true;
          for (const m of json.data.matches.slice(0, MAX_MATCHES_PER_KEYWORD)) {
            const key = `${m.surah.number}:${m.numberInSurah}`;
            if (seen.has(key)) continue;
            const record = toRecord(m.surah, m.numberInSurah, m.text, m.edition.englishName);
            const { score, matchedTerms } = scoreOverlap(queryTermSet, m.text);
            seen.set(key, { source: record, matchStrength: score, matchedTerms });
          }
        } catch (err) {
          if (err instanceof NotFoundSignal) {
            anyReachable = true; // provider responded; this keyword just had no hits
            return;
          }
          errors.push(err);
        }
      })
    );

    if (!anyReachable && errors.length > 0) {
      const first = errors[0];
      throw first instanceof SourceProviderError
        ? first
        : new SourceProviderError(PROVIDER, "all keyword searches failed", first);
    }

    return [...seen.values()]
      .filter((m) => m.matchedTerms.length >= 2 || m.matchStrength >= 0.5)
      .sort((a, b) => b.matchStrength - a.matchStrength)
      .slice(0, limit);
  }

  async getById(id: string): Promise<SourceRecord | null> {
    const match = /^live-quran-(\d+):(\d+)$/.exec(id);
    if (!match) return null;
    const [, surah, ayah] = match;

    try {
      const json = await fetchJson<AlQuranAyahResponse>(
        PROVIDER,
        `${API_BASE}/ayah/${surah}:${ayah}/${DEFAULT_EDITION}`
      );
      return toRecord(json.data.surah, json.data.numberInSurah, json.data.text, "Saheeh International");
    } catch {
      return null;
    }
  }
}
