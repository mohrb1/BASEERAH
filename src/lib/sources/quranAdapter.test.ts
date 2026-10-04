import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveQuranAdapter } from "./quranAdapter";
import { SourceProviderError } from "./errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

function searchResponse(matches: unknown[]) {
  return new Response(JSON.stringify({ data: { count: matches.length, matches } }), {
    status: 200,
  });
}

describe("LiveQuranAdapter", () => {
  it("is never marked as demo", () => {
    expect(new LiveQuranAdapter().isDemo).toBe(false);
  });

  it("throws SourceProviderError when every keyword search fails (provider unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const adapter = new LiveQuranAdapter();
    await expect(adapter.search("ever living sleeps tired", 3)).rejects.toThrow(
      SourceProviderError
    );
  });

  it("does not throw when a keyword legitimately has no matches (404) but others succeed", async () => {
    const match = {
      numberInSurah: 255,
      text: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of all existence. Neither drowsiness overtakes Him nor sleeps, and preservation does not leave Him tired.",
      edition: { identifier: "en.sahih", englishName: "Saheeh International", language: "en" },
      surah: { number: 2, name: "البقرة", englishName: "Al-Baqarah", englishNameTranslation: "The Cow" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search/sleeps/")) return new Response("not found", { status: 404 });
        return searchResponse([match]);
      })
    );

    const adapter = new LiveQuranAdapter();
    const results = await adapter.search("ever living sleeps tired", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.isDemo).toBe(false);
    expect(results[0].source.reference).toBe("Quran 2:255");
  });

  it("every returned record carries a real alquran.cloud canonical URL, never fabricated", async () => {
    const match = {
      numberInSurah: 255,
      text: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of all existence. Neither drowsiness overtakes Him nor sleeps, and preservation does not leave Him tired.",
      edition: { identifier: "en.sahih", englishName: "Saheeh International", language: "en" },
      surah: { number: 2, name: "البقرة", englishName: "Al-Baqarah", englishNameTranslation: "The Cow" },
    };
    vi.stubGlobal("fetch", vi.fn(async () => searchResponse([match])));

    const adapter = new LiveQuranAdapter();
    const results = await adapter.search("ever living sleeps tired", 3);

    for (const r of results) {
      expect(r.source.sourceUrl).toBe(`https://alquran.cloud/ayah/2:255`);
      expect(r.source.text).toBe(match.text); // evidence text is exactly what the API returned
    }
  });

  it("getById returns null (not fabricated data) when the provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const adapter = new LiveQuranAdapter();
    const result = await adapter.getById("live-quran-2:255");
    expect(result).toBeNull();
  });

  it("getById returns null for a malformed id", async () => {
    const adapter = new LiveQuranAdapter();
    const result = await adapter.getById("not-a-quran-id");
    expect(result).toBeNull();
  });
});
