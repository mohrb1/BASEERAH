import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BUKHARI_FIXTURE = {
  metadata: { name: "Sahih al Bukhari", sections: { "1": "Revelation" } },
  hadiths: [
    {
      hadithnumber: 1,
      arabicnumber: 1,
      text: "Actions are judged by intentions, and every person will get what he intended.",
      grades: [],
      reference: { book: 1, hadith: 1 },
    },
  ],
};

const EMPTY_FIXTURE = {
  metadata: { name: "Empty", sections: {} },
  hadiths: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// hadithAdapter.ts caches collection fetches at module scope, so each test
// re-imports a fresh module instance to avoid cross-test cache pollution.
// errors.ts is re-imported alongside it so `instanceof SourceProviderError`
// checks compare against the same module graph (resetModules() otherwise
// gives a second, structurally-identical-but-distinct class instance).
async function freshAdapterModule() {
  vi.resetModules();
  const [adapterModule, errorsModule] = await Promise.all([
    import("./hadithAdapter"),
    import("./errors"),
  ]);
  return { ...adapterModule, ...errorsModule };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveHadithAdapter", () => {
  it("is never marked as demo", async () => {
    const { LiveHadithAdapter } = await freshAdapterModule();
    expect(new LiveHadithAdapter().isDemo).toBe(false);
  });

  it("throws SourceProviderError when every collection fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { LiveHadithAdapter, SourceProviderError } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();
    await expect(adapter.search("actions judged intentions", 3)).rejects.toThrow(
      SourceProviderError
    );
  });

  it("returns ranked, real matches when collections load successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("eng-bukhari")) return jsonResponse(BUKHARI_FIXTURE);
        return jsonResponse(EMPTY_FIXTURE);
      })
    );
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("actions judged by intentions", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.isDemo).toBe(false);
    expect(results[0].source.reference).toBe("Sahih al-Bukhari 1");
    expect(results[0].source.sourceUrl).toBe("https://sunnah.com/bukhari:1");
    expect(results[0].source.text).toBe(BUKHARI_FIXTURE.hadiths[0].text);
  });

  it("returns an empty array (not an error) when nothing matches, even though providers are reachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(EMPTY_FIXTURE)));
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("completely unrelated query about rockets", 3);
    expect(results).toEqual([]);
  });

  it("applies the implied Sahih grade for Bukhari when no explicit grade is present, without fabricating a citation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("eng-bukhari")) return jsonResponse(BUKHARI_FIXTURE);
        return jsonResponse(EMPTY_FIXTURE);
      })
    );
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("actions judged by intentions", 3);
    expect(results[0].source.grade).toBe("Sahih (by scholarly consensus)");
  });

  it("getById returns null when the provider fails, rather than fabricating a record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const result = await adapter.getById("live-hadith-bukhari-1");
    expect(result).toBeNull();
  });

  it("getById returns null for an id with an unknown collection slug", async () => {
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();
    const result = await adapter.getById("live-hadith-notacollection-1");
    expect(result).toBeNull();
  });
});
