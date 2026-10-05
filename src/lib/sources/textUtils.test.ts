import { describe, expect, it } from "vitest";
import { containsArabic, dedupeStrings, scoreOverlap, tokenize, topKeywords } from "./textUtils";

describe("tokenize — Unicode-aware behavior", () => {
  it("tokenizes plain English the same as before (stopwords and short tokens dropped)", () => {
    expect(tokenize("The Prophet taught that actions are judged by intentions.")).toEqual([
      "prophet",
      "taught",
      "actions",
      "judged",
      "intentions",
    ]);
  });

  it("strips Latin punctuation and lowercases", () => {
    expect(tokenize("Hello, World! Is this a test?")).toEqual(["hello", "world", "test"]);
  });

  it("strips Latin accents via NFKD (existing behavior, unchanged)", () => {
    expect(tokenize("café")).toEqual(["cafe"]);
  });

  it("does NOT silently erase Arabic text (the core regression)", () => {
    const tokens = tokenize("أركان الإسلام خمسة");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("tokenizes plain (undiacritized) Arabic into whole, unfragmented words", () => {
    // Note: "خمسة" normalizes to "خمسه" (ta marbuta -> ha) — see the
    // dedicated Arabic-orthography-normalization describe block below.
    expect(tokenize("أركان الإسلام خمسة")).toEqual(["اركان", "الاسلام", "خمسه"]);
  });

  it("strips Arabic diacritics (tashkeel) WITHOUT fragmenting the word", () => {
    // "الصَّلَاة" (prayer, fully diacritized) must collapse to one clean token,
    // not shatter into multiple pieces around each removed diacritic.
    expect(tokenize("الصَّلَاة")).toEqual(["الصلاه"]);
  });

  it("strips Arabic punctuation (Arabic comma و question mark)", () => {
    expect(tokenize("أهلاً، بالعالم؟")).toEqual(["اهلا", "بالعالم"]);
  });

  it("normalizes Arabic-Indic numerals to Western digits (searchable either way)", () => {
    const tokens = tokenize("خمس مرات يوميا ١٢٣");
    expect(tokens).toContain("123");
    expect(tokens).not.toContain("١٢٣");
  });

  it("handles mixed Arabic/English text, tokenizing both scripts", () => {
    const tokens = tokenize("Zakat الزكاة is obligatory");
    expect(tokens).toContain("zakat");
    expect(tokens).toContain("الزكاه"); // ta marbuta normalized to ha
    expect(tokens).toContain("obligatory");
  });

  it("still drops tokens of length <= 2 for both scripts", () => {
    expect(tokenize("a an to من في")).toEqual([]);
  });

  it("returns [] for empty or whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("tokenize — religious-domain stopword correction", () => {
  it("keeps 'Islam' as a usable anchor in a short query", () => {
    expect(tokenize("Islam five pillars")).toContain("islam");
  });

  it("keeps 'Islam' in a short bridged Arabic->English query", () => {
    const tokens = tokenize("Islam بني على five");
    expect(tokens).toContain("islam");
  });

  it("still drops 'Islam' from a normal, longer English claim (no regression)", () => {
    const tokens = tokenize(
      "Islam teaches that every Muslim should pray five times a day without exception."
    );
    expect(tokens).not.toContain("islam");
  });

  it("still drops 'Islam'/'Muslim' from a long hadith-style evidence passage (no regression)", () => {
    const tokens = tokenize(
      "The Prophet said that Islam is built upon five pillars and every Muslim must observe them faithfully throughout their life."
    );
    expect(tokens).not.toContain("islam");
    expect(tokens).not.toContain("muslim");
  });

  it("general (non-domain) stopwords are completely unaffected by this change", () => {
    expect(tokenize("the and of to in on")).toEqual([]);
  });
});

describe("tokenize — morphological normalization (retrieval layer only)", () => {
  it("normalizes 'fast' and 'fasting' to the same token", () => {
    expect(tokenize("fast")).toEqual(tokenize("fasting"));
  });

  it("normalizes 'pray' and 'prayer' to the same token", () => {
    expect(tokenize("pray")).toEqual(tokenize("prayer"));
  });

  it("normalizes 'pilgrim' and 'pilgrimage' to the same token", () => {
    expect(tokenize("pilgrim")).toEqual(tokenize("pilgrimage"));
  });

  it("normalizes the 'zakah' spelling variant to 'zakat'", () => {
    expect(tokenize("zakah")).toEqual(tokenize("zakat"));
  });

  it("lets scoreOverlap match a query using one form against evidence using the other", () => {
    // This is the exact V2.1 recall gap: a claim says "fast", the hadith
    // translation says "fasting" — plain token equality saw these as
    // unrelated and dropped the match entirely.
    const { score, matchedTerms } = scoreOverlap(
      new Set(tokenize("fast is one of the pillars")),
      "Islam is built upon five pillars: prayer, zakat, the fast of Ramadan, and pilgrimage."
    );
    expect(matchedTerms).toContain("fasting");
    expect(score).toBeGreaterThan(0);
  });

  it("does not affect unrelated words that merely share a prefix", () => {
    // "fastener"/"prayerful" are different words, not morphological
    // variants of "fast"/"pray" — must not be silently rewritten.
    expect(tokenize("fastener")).not.toContain("fasting");
    expect(tokenize("prayerful")).not.toContain("prayer");
  });

  it("does not change retrieval/ranking inputs beyond matchStrength — still a plain EvidenceMatch field, not a new decision path", () => {
    // Structural check: normalization only ever feeds the EXISTING
    // matchStrength/matchedTerms computation; it introduces no new return
    // shape or side channel.
    const result = scoreOverlap(new Set(tokenize("fast")), "fasting is rewarded");
    expect(Object.keys(result).sort()).toEqual(["matchedTerms", "score"]);
  });
});

describe("tokenize — Arabic orthography normalization (retrieval layer only)", () => {
  it("folds alef variants (أ/إ/آ) to bare alef (ا)", () => {
    expect(tokenize("أكرم")).toEqual(tokenize("اكرم"));
    expect(tokenize("إسلام")).toEqual(tokenize("اسلام"));
    expect(tokenize("آمن")).toEqual(tokenize("امن"));
  });

  it("folds ta marbuta (ة) to ha (ه) for matching purposes", () => {
    expect(tokenize("الصلاة")).toEqual(tokenize("الصلاه"));
    expect(tokenize("الزكاة")).toEqual(tokenize("الزكاه"));
  });

  it("folds alef maksura (ى) to ya (ي) for matching purposes", () => {
    expect(tokenize("مصطفى")).toEqual(tokenize("مصطفي"));
  });

  it("strips tatweel (ـ) without fragmenting the word", () => {
    expect(tokenize("اللـــه")).toEqual(tokenize("الله"));
  });

  it("normalizes Arabic-Indic digits to Western digits", () => {
    expect(tokenize("سنة ٢٠٢٤")).toEqual(tokenize("سنة 2024"));
  });

  it("lets two independently-worded Arabic strings using different spelling conventions match", () => {
    // Same word, two common real-world spellings (ة vs ه, أ vs ا).
    const { score, matchedTerms } = scoreOverlap(
      new Set(tokenize("الصلاة من أركان الاسلام")),
      "الصلاه من اركان الإسلام"
    );
    expect(score).toBeGreaterThan(0.5);
    expect(matchedTerms.length).toBeGreaterThan(0);
  });

  it("never alters the raw claim text itself — normalization is tokenize()-internal only", () => {
    // tokenize() returns a NEW token list; it must not mutate its input string.
    const original = "الصلاة من أركان الإسلام";
    tokenize(original);
    expect(original).toBe("الصلاة من أركان الإسلام");
  });
});

describe("scoreOverlap — unaffected by the tokenizer fix for same-script comparisons", () => {
  it("still scores plain English overlap exactly as before", () => {
    const { score, matchedTerms } = scoreOverlap(
      new Set(["pillars", "five"]),
      "Islam is built upon five pillars."
    );
    expect(score).toBe(1);
    expect(matchedTerms.sort()).toEqual(["five", "pillars"]);
  });

  it("can now score Arabic-vs-Arabic overlap (previously impossible — empty token sets both sides)", () => {
    const { score, matchedTerms } = scoreOverlap(new Set(tokenize("أركان الإسلام خمسة")), "الإسلام بني على خمس أركان");
    expect(score).toBeGreaterThan(0);
    expect(matchedTerms.length).toBeGreaterThan(0);
  });
});

describe("topKeywords / dedupeStrings — unaffected by the tokenizer fix", () => {
  it("topKeywords still picks the longest distinct tokens", () => {
    expect(topKeywords(["ab", "abcdef", "abc"], 2)).toEqual(["abcdef", "abc"]);
  });

  it("dedupeStrings still case-insensitively dedupes", () => {
    expect(dedupeStrings(["Zakat", "zakat", "Salah"])).toEqual(["Zakat", "Salah"]);
  });
});

describe("containsArabic", () => {
  it("detects Arabic script", () => {
    expect(containsArabic("أركان الإسلام خمسة")).toBe(true);
  });

  it("returns false for plain English", () => {
    expect(containsArabic("The pillars of Islam are five")).toBe(false);
  });

  it("detects a mixed Arabic/English string", () => {
    expect(containsArabic("pillars Islam five أركان")).toBe(true);
  });

  it("returns false for empty input", () => {
    expect(containsArabic("")).toBe(false);
  });
});
