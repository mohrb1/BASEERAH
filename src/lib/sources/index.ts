import type { EvidenceMatch, SourceRecord } from "@/types";
import { DemoSourceAdapter } from "./demoAdapter";
import { SourceProviderError } from "./errors";
import { CompositeLiveSourceAdapter } from "./liveAdapter";
import type { SourceAdapter } from "./types";

/**
 * Tries the live source layer first; transparently falls back to the Demo
 * Source Layer if (and only if) the live providers are unreachable
 * (network failure, timeout, rate limit, malformed response — see
 * SourceProviderError). A live search that succeeds but finds nothing is
 * NOT a failure — it's returned as-is (an empty array), which the
 * verification layer correctly reports as INSUFFICIENT_EVIDENCE.
 *
 * Every returned SourceRecord carries its own `isDemo` flag, so the UI
 * always shows the user exactly which records are demo vs. live — this
 * wrapper only decides which provider to *try*, it never relabels data.
 */
export class FallbackSourceAdapter implements SourceAdapter {
  readonly name = "Adaptive Source Layer (live with demo fallback)";
  readonly isDemo = false;

  constructor(
    private readonly live: SourceAdapter,
    private readonly demo: SourceAdapter
  ) {}

  async search(query: string, limit = 3): Promise<EvidenceMatch[]> {
    try {
      return await this.live.search(query, limit);
    } catch (err) {
      if (err instanceof SourceProviderError) {
        console.warn(`[sources] live provider unavailable, falling back to demo: ${err.message}`);
        return this.demo.search(query, limit);
      }
      throw err;
    }
  }

  async getById(id: string): Promise<SourceRecord | null> {
    if (id.startsWith("live-")) {
      try {
        return await this.live.getById(id);
      } catch (err) {
        if (err instanceof SourceProviderError) return null;
        throw err;
      }
    }
    return this.demo.getById(id);
  }
}

let adapter: SourceAdapter | null = null;

/**
 * Single point of configuration for the source layer.
 *
 * Set BASEERAH_FORCE_DEMO_SOURCES=true to always use the Demo Source Layer
 * (useful for offline development, tests, or a fully deterministic demo).
 * Otherwise, live retrieval (AlQuran Cloud + hadith-api) is attempted first
 * and falls back to demo automatically if those providers are unreachable.
 */
export function getSourceAdapter(): SourceAdapter {
  if (!adapter) {
    const forceDemo = process.env.BASEERAH_FORCE_DEMO_SOURCES === "true";
    const demo = new DemoSourceAdapter();
    adapter = forceDemo ? demo : new FallbackSourceAdapter(new CompositeLiveSourceAdapter(), demo);
  }
  return adapter;
}

export type { SourceAdapter };
