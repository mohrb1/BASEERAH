import type { EvidenceMatch, SourceRecord } from "@/types";

/**
 * Contract for a source layer. Implementations today:
 *  - DemoSourceAdapter   (./demoAdapter.ts)   — curated local dataset, always available
 *  - LiveQuranAdapter    (./quranAdapter.ts)  — AlQuran Cloud API (keyless, public)
 *  - LiveHadithAdapter   (./hadithAdapter.ts) — hadith-api CDN (keyless, public domain)
 *  - CompositeLiveSourceAdapter (./liveAdapter.ts) — merges the two live adapters
 *
 * `getSourceAdapter()` in ./index.ts is the single place that decides which
 * adapter(s) callers get, including automatic fallback to Demo when a live
 * provider is unreachable. Nothing outside src/lib/sources should import a
 * concrete adapter class directly.
 *
 * Implementations MUST:
 *  - never invent a source, quote, reference, or URL
 *  - throw SourceProviderError (./errors.ts) on network/timeout/HTTP/parse
 *    failure, so the composite layer can fall back to Demo Mode
 *  - return an empty array (not an error) when the provider was reached
 *    successfully but has no relevant match
 */
export interface SourceAdapter {
  readonly name: string;
  readonly isDemo: boolean;
  search(query: string, limit?: number): Promise<EvidenceMatch[]>;
  /** Look up a single record by its SourceAdapter-scoped id (as returned in EvidenceMatch.source.id). */
  getById(id: string): Promise<SourceRecord | null>;
}
