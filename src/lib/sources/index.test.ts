import { describe, expect, it, vi } from "vitest";
import { SourceProviderError } from "./errors";
import { FallbackSourceAdapter } from "./index";
import type { SourceAdapter } from "./types";
import type { EvidenceMatch, SourceRecord } from "@/types";

function fakeEvidence(id: string, isDemo: boolean): EvidenceMatch {
  const source: SourceRecord = {
    id,
    type: "hadith",
    reference: `Fake ${id}`,
    title: `Fake record ${id}`,
    text: "Fake evidence text.",
    tags: [],
    isDemo,
  };
  return { source, matchStrength: 0.5, matchedTerms: ["fake"] };
}

function stubAdapter(overrides: Partial<SourceAdapter>): SourceAdapter {
  return {
    name: "stub",
    isDemo: false,
    search: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    ...overrides,
  };
}

describe("FallbackSourceAdapter", () => {
  it("falls back to demo search when the live provider throws SourceProviderError", async () => {
    const demoResult = [fakeEvidence("demo-1", true)];
    const live = stubAdapter({
      search: vi.fn(async () => {
        throw new SourceProviderError("live", "network down");
      }),
    });
    const demo = stubAdapter({ search: vi.fn(async () => demoResult) });

    const adapter = new FallbackSourceAdapter(live, demo);
    const result = await adapter.search("some claim", 3);

    expect(result).toBe(demoResult);
    expect(demo.search).toHaveBeenCalledWith("some claim", 3);
  });

  it("does NOT fall back to demo when live succeeds with zero matches (genuine no-evidence)", async () => {
    const live = stubAdapter({ search: vi.fn(async () => []) });
    const demo = stubAdapter({ search: vi.fn(async () => [fakeEvidence("demo-1", true)]) });

    const adapter = new FallbackSourceAdapter(live, demo);
    const result = await adapter.search("some claim", 3);

    expect(result).toEqual([]);
    expect(demo.search).not.toHaveBeenCalled();
  });

  it("re-throws unexpected (non-SourceProviderError) errors instead of silently falling back", async () => {
    const live = stubAdapter({
      search: vi.fn(async () => {
        throw new Error("unexpected bug");
      }),
    });
    const demo = stubAdapter({});

    const adapter = new FallbackSourceAdapter(live, demo);
    await expect(adapter.search("x", 3)).rejects.toThrow("unexpected bug");
    expect(demo.search).not.toHaveBeenCalled();
  });

  it("routes getById for live-prefixed ids to the live adapter", async () => {
    const liveRecord: SourceRecord = {
      id: "live-quran-2:255",
      type: "quran",
      reference: "Quran 2:255",
      title: "Ayat al-Kursi",
      text: "...",
      tags: [],
      isDemo: false,
    };
    const live = stubAdapter({ getById: vi.fn(async () => liveRecord) });
    const demo = stubAdapter({});

    const adapter = new FallbackSourceAdapter(live, demo);
    const result = await adapter.getById("live-quran-2:255");

    expect(result).toBe(liveRecord);
    expect(demo.getById).not.toHaveBeenCalled();
  });

  it("routes getById for non-live ids to the demo adapter", async () => {
    const demoRecord: SourceRecord = {
      id: "quran-2-255",
      type: "quran",
      reference: "Quran 2:255",
      title: "Ayat al-Kursi",
      text: "...",
      tags: [],
      isDemo: true,
    };
    const live = stubAdapter({});
    const demo = stubAdapter({ getById: vi.fn(async () => demoRecord) });

    const adapter = new FallbackSourceAdapter(live, demo);
    const result = await adapter.getById("quran-2-255");

    expect(result).toBe(demoRecord);
    expect(live.getById).not.toHaveBeenCalled();
  });

  it("returns null (not an error) when a live getById fails", async () => {
    const live = stubAdapter({
      getById: vi.fn(async () => {
        throw new SourceProviderError("live", "timeout");
      }),
    });
    const demo = stubAdapter({});

    const adapter = new FallbackSourceAdapter(live, demo);
    const result = await adapter.getById("live-quran-2:255");

    expect(result).toBeNull();
  });
});
