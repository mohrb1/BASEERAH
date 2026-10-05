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

/**
 * Arabic source evidence (BASEERAH "Arabic source evidence fix"). Fixture
 * text below is the REAL English/Arabic pairing for Sahih Muslim 111,
 * confirmed via a live fetch against the actual hadith-api CDN before
 * writing this test (hadithnumber 111 is the same underlying hadith in
 * both the eng-muslim and ara-muslim editions).
 */
const ENGLISH_MUSLIM_111 = {
  metadata: { name: "Sahih Muslim", sections: { "1": "The Book of Faith" } },
  hadiths: [
    {
      hadithnumber: 111,
      text: "(The superstructure of) al-Islam is raised on five (pillars), i. e. the oneness of Allah, the establishment of prayer, payment of Zakat, the fast of Ramadan, Pilgrimage (to Mecca).",
      grades: [],
      reference: { book: 1, hadith: 19 },
    },
  ],
};

const ARABIC_MUSLIM_111 = {
  metadata: { name: "صحيح مسلم", sections: { "1": "كتاب الإيمان" } },
  hadiths: [
    {
      hadithnumber: 111,
      text: "بُنِيَ الإِسْلاَمُ عَلَى خَمْسَةٍ عَلَى أَنْ يُوَحَّدَ اللَّهُ وَإِقَامِ الصَّلاَةِ وَإِيتَاءِ الزَّكَاةِ وَصِيَامِ رَمَضَانَ وَالْحَجِّ",
      grades: [],
      reference: { book: 1, hadith: 19 },
    },
  ],
};

function mockEnglishAndArabic(englishFixture: unknown, arabicFixture: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("eng-muslim")) return jsonResponse(englishFixture);
      if (url.includes("ara-muslim")) return jsonResponse(arabicFixture);
      return jsonResponse(EMPTY_FIXTURE);
    })
  );
}

describe("LiveHadithAdapter — Arabic source evidence", () => {
  it('1. "أركان الإسلام خمسة" (Arabic query) prefers the Arabic edition\'s own real text, keeps the canonical English reference', async () => {
    mockEnglishAndArabic(ENGLISH_MUSLIM_111, ARABIC_MUSLIM_111);
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("أركان الإسلام خمسة", 3);

    expect(results.length).toBeGreaterThan(0);
    const top = results[0].source;
    expect(top.text).toBe(ARABIC_MUSLIM_111.hadiths[0].text);
    expect(top.reference).toBe("Sahih Muslim 111"); // citation stays canonical English
    expect(top.arabicText).toBe(ARABIC_MUSLIM_111.hadiths[0].text);
    expect(top.isDemo).toBe(false);
  });

  it("2. does not fetch the Arabic edition at all for a plain English query (no wasted request, no regression)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("eng-muslim")) return jsonResponse(ENGLISH_MUSLIM_111);
      return jsonResponse(EMPTY_FIXTURE);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("the pillars of Islam are five", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.text).toBe(ENGLISH_MUSLIM_111.hadiths[0].text);
    expect(results[0].source.provider).toContain("English");
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("ara-"))).toBe(false);
  });

  it("4. Arabic-triggering query but the Arabic edition fails to load -> safe fallback to English, no fabricated translation, no thrown error", async () => {
    // A query containing Arabic (so the Arabic edition IS attempted) plus
    // the English-bridged terms that genuinely overlap with the English
    // text (exactly what retrieve.ts's query expansion produces in
    // practice) — the realistic shape of "Arabic requested, Arabic
    // unavailable, English still findable".
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("eng-muslim")) return jsonResponse(ENGLISH_MUSLIM_111);
        if (url.includes("ara-muslim")) return new Response("boom", { status: 500 });
        return jsonResponse(EMPTY_FIXTURE);
      })
    );
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("pillars Islam five أركان", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.text).toBe(ENGLISH_MUSLIM_111.hadiths[0].text);
    expect(results[0].source.arabicText).toBeUndefined();
    expect(results[0].source.provider).toContain("English");
  });

  it("a purely Arabic query that cannot match English text, with the Arabic edition unavailable, returns no candidates rather than throwing or fabricating a match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("eng-muslim")) return jsonResponse(ENGLISH_MUSLIM_111);
        if (url.includes("ara-muslim")) return new Response("boom", { status: 500 });
        return jsonResponse(EMPTY_FIXTURE);
      })
    );
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    await expect(adapter.search("أركان الإسلام خمسة", 3)).resolves.toEqual([]);
  });

  it("5. English evidence is never silently relabeled as Arabic when no Arabic edition was requested/available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(ENGLISH_MUSLIM_111)));
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    const results = await adapter.search("the pillars of Islam are five", 3);
    expect(results[0].source.text).toBe(ENGLISH_MUSLIM_111.hadiths[0].text);
    expect(results[0].source.provider).not.toContain("Arabic");
  });

  it("only prefers Arabic when it is genuinely at least as strong a match — never merely because it's Arabic", async () => {
    // Arabic text here shares nothing with the query; English text matches well.
    const weakArabic = {
      metadata: { name: "صحيح مسلم", sections: {} },
      hadiths: [{ hadithnumber: 111, text: "نص غير ذي صلة إطلاقًا", grades: [], reference: { book: 1, hadith: 19 } }],
    };
    mockEnglishAndArabic(ENGLISH_MUSLIM_111, weakArabic);
    const { LiveHadithAdapter } = await freshAdapterModule();
    const adapter = new LiveHadithAdapter();

    // Mixed-script query: English-bridged terms dominate, so English text should win.
    const results = await adapter.search("pillars Islam five أركان", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.text).toBe(ENGLISH_MUSLIM_111.hadiths[0].text);
  });
});
