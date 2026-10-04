import type { EvidenceMatch, SourceRecord } from "@/types";
import { SourceProviderError } from "./errors";
import { LiveHadithAdapter } from "./hadithAdapter";
import { LiveQuranAdapter } from "./quranAdapter";
import type { SourceAdapter } from "./types";

/**
 * Merges the live Quran and Hadith adapters into a single SourceAdapter.
 * Queries both in parallel and combines the ranked results.
 *
 * If BOTH sub-providers fail (network down, both APIs unreachable), this
 * throws SourceProviderError so the caller (./index.ts) can fall back to
 * Demo Mode. If only one fails, results from the other are still returned
 * — a partial live result, not a hard failure.
 */
export class CompositeLiveSourceAdapter implements SourceAdapter {
  readonly name = "Live Source Layer (AlQuran Cloud + hadith-api)";
  readonly isDemo = false;

  private readonly quran = new LiveQuranAdapter();
  private readonly hadith = new LiveHadithAdapter();

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    const results = await Promise.allSettled([
      this.quran.search(query, limit),
      this.hadith.search(query, limit),
    ]);

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length === results.length) {
      const first = failures[0] as PromiseRejectedResult;
      throw first.reason instanceof SourceProviderError
        ? first.reason
        : new SourceProviderError(this.name, "both live providers failed", first.reason);
    }

    const combined: EvidenceMatch[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") combined.push(...r.value);
    }

    return combined.sort((a, b) => b.matchStrength - a.matchStrength).slice(0, limit);
  }

  async getById(id: string): Promise<SourceRecord | null> {
    if (id.startsWith("live-quran-")) return this.quran.getById(id);
    if (id.startsWith("live-hadith-")) return this.hadith.getById(id);
    return null;
  }
}
