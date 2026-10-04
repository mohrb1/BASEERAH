import { getAnthropicClient, isLiveModeAvailable, MODEL } from "@/lib/ai/client";
import { createTtlCache } from "@/lib/ttlCache";
import type { RetrievedCandidate } from "./retrieve";

/** Cap on how many deduped candidates get sent to the reranker in one call —
 *  bounds LLM prompt size and latency regardless of how many candidates
 *  retrieval turned up across queries/adapters. */
const MAX_CANDIDATES = 20;

const RERANK_CACHE_TTL_MS = 60 * 60 * 1000;

export interface RankedEvidence extends RetrievedCandidate {
  /** 0–1 RETRIEVAL relevance signal — never a verification verdict. A high
   *  score means "worth showing the verifier," nothing more. */
  relevanceScore: number;
  /** Internal-only rationale for the relevance score. Never shown to end
   *  users; logged via src/lib/observability/trace.ts only. */
  relevanceRationale?: string;
}

const rerankCache = createTtlCache<string, RankedEvidence[]>(RERANK_CACHE_TTL_MS);

/** Test-only: see clearRetrievalCache() in retrieve.ts for why this exists. */
export function clearRerankCache(): void {
  rerankCache.clear();
}

const SYSTEM_PROMPT = `You score how relevant each candidate source is to a claim, for RETRIEVAL RANKING ONLY.

This is NOT a verification judgment. Do not decide whether the claim is true, supported, or false — a downstream step with the full claim and evidence text does that separately and more carefully. Your only job is to help pick which candidates are worth that downstream step's attention.

For each candidate, give a relevanceScore from 0 (not relevant / different topic or subject) to 1 (same topic, same subject, plausibly bears on the claim's specific meaning). Score topical/semantic relevance, not truth. A candidate can score high even if it ultimately turns out NOT to support the claim once read carefully — that distinction is intentionally not yours to make here.

Give a one-sentence rationale per candidate. Never invent a source, quote, or fact — you are only scoring the candidates given to you.`;

const RERANK_SCHEMA = {
  type: "object" as const,
  properties: {
    scores: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          index: { type: "integer" as const },
          relevanceScore: { type: "number" as const },
          rationale: { type: "string" as const },
        },
        required: ["index", "relevanceScore"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
};

/**
 * Scores and sorts retrieval candidates by relevance. Live mode (API key
 * configured): one LLM call, JSON-schema constrained, explicitly scoped to
 * "relevance for ranking" and barred from making a support/not-support
 * judgment — that judgment stays exclusively in verify.ts. Heuristic mode
 * (no key, or the LLM call fails): relevanceScore is set to the candidate's
 * existing matchStrength (the same deterministic scoreOverlap value the
 * adapter already computed) — never recomputed, so the no-key path's
 * numbers are bit-for-bit identical to what verify.ts's heuristic bands
 * were tuned against.
 */
export async function rerankEvidence(
  claimText: string,
  candidates: RetrievedCandidate[]
): Promise<RankedEvidence[]> {
  if (candidates.length === 0) return [];

  const bounded = candidates.slice(0, MAX_CANDIDATES);
  const cacheKey = buildCacheKey(claimText, bounded);
  const cached = rerankCache.get(cacheKey);
  if (cached) return cached;

  if (!isLiveModeAvailable()) {
    const ranked = heuristicRerank(bounded);
    rerankCache.set(cacheKey, ranked);
    return ranked;
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: RERANK_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            claim: claimText,
            candidates: bounded.map((c, index) => ({
              index,
              title: c.source.title,
              reference: c.source.reference,
              text: c.source.text,
              type: c.source.type,
            })),
          }),
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no text block in rerank response");

    const parsed = JSON.parse(block.text) as {
      scores: { index: number; relevanceScore: number; rationale?: string }[];
    };

    const ranked = bounded
      .map((candidate, index) => {
        const scoreEntry = parsed.scores?.find((s) => s.index === index);
        const relevanceScore = scoreEntry
          ? clamp01(scoreEntry.relevanceScore)
          : candidate.matchStrength;
        return {
          ...candidate,
          relevanceScore,
          relevanceRationale: scoreEntry?.rationale,
        } satisfies RankedEvidence;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    rerankCache.set(cacheKey, ranked);
    return ranked;
  } catch {
    const ranked = heuristicRerank(bounded);
    rerankCache.set(cacheKey, ranked);
    return ranked;
  }
}

function heuristicRerank(candidates: RetrievedCandidate[]): RankedEvidence[] {
  return [...candidates]
    .map((c) => ({ ...c, relevanceScore: c.matchStrength }) satisfies RankedEvidence)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function buildCacheKey(claimText: string, candidates: RetrievedCandidate[]): string {
  const ids = candidates
    .map((c) => c.source.id)
    .sort()
    .join(",");
  return `${claimText.trim().toLowerCase()}::${ids}`;
}
