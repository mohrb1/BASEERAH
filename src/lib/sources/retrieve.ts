import type { EvidenceMatch } from "@/types";
import { getSourceAdapter } from "@/lib/sources";
import { expandClaimQueries, MAX_EXPANDED_QUERIES } from "@/lib/ai/expandQuery";
import { dedupeStrings } from "./textUtils";
import { createTtlCache } from "@/lib/ttlCache";

/** Candidates fetched per query, before dedup/reranking trims the pack down
 *  to what's actually shown to the verifier. Higher than the old single-shot
 *  limit (3) since we now fan out across up to MAX_EXPANDED_QUERIES queries
 *  and rely on reranking — not just the adapter's own sort — to narrow. */
const PER_QUERY_LIMIT = 5;

const RETRIEVAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — corpus text doesn't change; this only bounds memory + repeat API/LLM load.

/** A retrieval candidate plus which of the (deduped) expanded queries found
 *  it — internal-only metadata for observability and reranking, stripped
 *  before a candidate is ever placed in a user-facing ClaimResult. */
export interface RetrievedCandidate extends EvidenceMatch {
  foundByQueries: string[];
}

export interface EvidencePack {
  claimText: string;
  /** The deduped, capped queries actually dispatched. */
  queries: string[];
  /** Whether query expansion used the LLM or the deterministic fallback. */
  expansionMode: "live" | "heuristic";
  /** Deduped (by source.id) candidates, union across all queries, NOT yet reranked. */
  candidates: RetrievedCandidate[];
}

const retrievalCache = createTtlCache<string, EvidencePack>(RETRIEVAL_CACHE_TTL_MS);

/** Test-only: clears the in-process retrieval cache. Production code never
 *  needs this — the cache is already auto-disabled under Vitest (see
 *  src/lib/ttlCache.ts) — but it's exported for any test that explicitly
 *  exercises caching behavior with the disable flag overridden. */
export function clearRetrievalCache(): void {
  retrievalCache.clear();
}

/**
 * V2 retrieval entry point: expands the claim into up to
 * MAX_EXPANDED_QUERIES search queries, runs each against the currently
 * configured SourceAdapter (same adapter every other part of the app
 * already uses — this does not bypass the live→demo fallback chain), and
 * returns a deduped candidate pool for src/lib/sources/rerank.ts to score.
 *
 * Deliberately still calls `getSourceAdapter()` (not a new adapter type) so
 * the existing SourceAdapter contract, and the existing test-mocking seam
 * (`vi.mock("@/lib/sources", ...)`), both keep working unchanged.
 */
export async function retrieveEvidencePack(claimText: string): Promise<EvidencePack> {
  const cacheKey = claimText.trim().toLowerCase();
  const cached = retrievalCache.get(cacheKey);
  if (cached) return cached;

  const { queries: rawQueries, mode } = await expandClaimQueries(claimText);
  const queries = dedupeStrings(rawQueries).slice(0, MAX_EXPANDED_QUERIES);

  const adapter = getSourceAdapter();
  const perQueryResults = await Promise.all(
    queries.map(async (query) => ({
      query,
      matches: await adapter.search(query, PER_QUERY_LIMIT),
    }))
  );

  const bySourceId = new Map<string, RetrievedCandidate>();
  for (const { query, matches } of perQueryResults) {
    for (const match of matches) {
      const existing = bySourceId.get(match.source.id);
      if (!existing) {
        bySourceId.set(match.source.id, { ...match, foundByQueries: [query] });
        continue;
      }
      if (!existing.foundByQueries.includes(query)) {
        existing.foundByQueries.push(query);
      }
      // Never invent a score: if a different query's result for the same
      // source carries a higher matchStrength (as actually computed by the
      // adapter), keep that one — otherwise keep what we already have.
      if (match.matchStrength > existing.matchStrength) {
        bySourceId.set(match.source.id, {
          ...match,
          foundByQueries: existing.foundByQueries,
        });
      }
    }
  }

  const pack: EvidencePack = {
    claimText,
    queries,
    expansionMode: mode,
    candidates: [...bySourceId.values()],
  };

  retrievalCache.set(cacheKey, pack);
  return pack;
}
