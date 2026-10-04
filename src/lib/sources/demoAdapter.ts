import type { EvidenceMatch, SourceRecord } from "@/types";
import { demoSources } from "./demoData";
import { scoreOverlap, tokenize } from "./textUtils";
import type { SourceAdapter } from "./types";

/**
 * Keyword-overlap retrieval over the curated demo dataset. No embeddings,
 * no external calls — fully deterministic and works offline. `matchStrength`
 * reflects how much of the claim's vocabulary overlaps with a source
 * record, not a judgment on whether the claim is true.
 */
export class DemoSourceAdapter implements SourceAdapter {
  readonly name = "Demo Source Layer (curated seed data)";
  readonly isDemo = true;

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    const queryTerms = new Set(tokenize(query));
    if (queryTerms.size === 0) return [];

    const scored = demoSources.map((source) => {
      const { score, matchedTerms } = scoreOverlap(
        queryTerms,
        [source.title, source.text, source.tags.join(" ")].join(" ")
      );
      return { source, matchStrength: score, matchedTerms } satisfies EvidenceMatch;
    });

    return scored
      .filter((m) => m.matchStrength > 0)
      .sort((a, b) => b.matchStrength - a.matchStrength)
      .slice(0, limit);
  }

  async getById(id: string): Promise<SourceRecord | null> {
    return demoSources.find((s) => s.id === id) ?? null;
  }
}
