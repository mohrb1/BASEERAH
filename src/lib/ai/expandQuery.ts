import { getAnthropicClient, isLiveModeAvailable, MODEL } from "./client";
import { heuristicExpand } from "@/lib/sources/terminology";
import { dedupeStrings } from "@/lib/sources/textUtils";

/** Hard cap on search queries dispatched per claim, in both live and
 *  heuristic mode — the single source of truth for the "max 2 expanded
 *  queries" performance budget. Keeping this low bounds external-API fan-out
 *  and keeps the retrieval step well inside the server timeout. */
export const MAX_EXPANDED_QUERIES = 2;

const SYSTEM_PROMPT = `You generate search queries used to retrieve Quran/Hadith evidence records for fact-checking a claim about Islamic content. You do not verify, answer, or add information to the claim — you only reformulate it for search.

Rules:
- Output at most ${MAX_EXPANDED_QUERIES} short search queries, ordered by priority.
- The first query should be the claim restated plainly as a search phrase (keep it close to the original wording).
- A second query (only if it would meaningfully help) should probe a different angle: a key concept, an Arabic/English Islamic-terminology variant (e.g. zakat/almsgiving, salah/prayer, sawm/fasting), or canonical topical vocabulary — not a rephrasing of the same words.
- Never invent religious content, rulings, names, numbers, or facts not already present in the claim text.
- Never attempt to answer or judge the claim.
- If the claim is already a good, specific search query, output just one query.`;

const EXPAND_SCHEMA = {
  type: "object" as const,
  properties: {
    queries: {
      type: "array" as const,
      items: { type: "string" as const },
      description: `1 to ${MAX_EXPANDED_QUERIES} search queries, in priority order.`,
    },
  },
  required: ["queries"],
  additionalProperties: false,
};

export interface QueryExpansion {
  queries: string[];
  mode: "live" | "heuristic";
}

/**
 * Turns one claim into up to MAX_EXPANDED_QUERIES targeted search queries.
 * Live mode (API key configured): one small LLM call, JSON-schema
 * constrained, explicitly barred from inventing content or judging the
 * claim. Heuristic mode (no key, or the LLM call fails for any reason):
 * deterministic fallback via heuristicExpand — same contract, same cap,
 * fully offline. The fallback is the ONLY path exercised in the existing
 * test suite (isLiveModeAvailable is mocked false there), matching
 * extractClaims.ts's established live/heuristic split.
 */
export async function expandClaimQueries(claimText: string): Promise<QueryExpansion> {
  const heuristicQueries = heuristicExpand(claimText, MAX_EXPANDED_QUERIES);

  if (!isLiveModeAvailable()) {
    return { queries: heuristicQueries, mode: "heuristic" };
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: EXPAND_SCHEMA },
      },
      messages: [{ role: "user", content: claimText }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { queries: heuristicQueries, mode: "heuristic" };
    }

    const parsed = JSON.parse(block.text) as { queries: string[] };
    const queries = dedupeStrings([claimText, ...(parsed.queries ?? [])]).slice(
      0,
      MAX_EXPANDED_QUERIES
    );

    return queries.length > 0
      ? { queries, mode: "live" }
      : { queries: heuristicQueries, mode: "heuristic" };
  } catch {
    return { queries: heuristicQueries, mode: "heuristic" };
  }
}
