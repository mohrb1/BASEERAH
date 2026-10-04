import { describe, expect, it } from "vitest";
import { heuristicExpand } from "./terminology";

describe("heuristicExpand", () => {
  it("returns an empty array for empty input", () => {
    expect(heuristicExpand("")).toEqual([]);
    expect(heuristicExpand("   ")).toEqual([]);
  });

  it("returns just the original claim when no known term appears", () => {
    const result = heuristicExpand("The sky is blue on a clear day.");
    expect(result).toEqual(["The sky is blue on a clear day."]);
  });

  it("adds a terminology-variant second query when a known term appears", () => {
    const result = heuristicExpand("Zakat is 2.5% of savings.");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Zakat is 2.5% of savings.");
    expect(result[1].toLowerCase()).toContain("almsgiving");
    expect(result[1].toLowerCase()).not.toContain("zakat");
  });

  it("substitutes salah/prayer in both directions", () => {
    const fromSalah = heuristicExpand("Salah is obligatory five times a day.");
    expect(fromSalah[1].toLowerCase()).toContain("prayer");

    const fromPrayer = heuristicExpand("Prayer is obligatory five times a day.");
    expect(fromPrayer[1].toLowerCase()).toContain("salah");
  });

  it("never drops or alters the original claim text", () => {
    const claim = "Fasting Ramadan with sincere faith leads to forgiveness of past sins.";
    const result = heuristicExpand(claim);
    expect(result[0]).toBe(claim);
  });

  it("respects the max cap", () => {
    const result = heuristicExpand("Zakat and salah are two of the five pillars.", 1);
    expect(result).toHaveLength(1);
  });

  it("only replaces a whole-word match, not a substring", () => {
    // "prayerful" contains "prayer" but should not trigger substitution as if it were the standalone word.
    const result = heuristicExpand("She felt prayerful during the ceremony.");
    expect(result).toEqual(["She felt prayerful during the ceremony."]);
  });

  it("deduplicates when the substitution would be identical to the original", () => {
    // Degenerate case: claim already uses a canonical, non-substitutable phrase.
    const result = heuristicExpand("Hajj pilgrimage is the fifth pillar.");
    // "hajj" -> "pilgrimage" substitution is still a distinct string here, so expect 2 unique queries.
    expect(new Set(result.map((q) => q.toLowerCase())).size).toBe(result.length);
  });
});

describe("heuristicExpand — Arabic terminology bridge", () => {
  it("bridges a single Arabic term to its English equivalent", () => {
    const result = heuristicExpand("الصلاة واجبة على كل مسلم.");
    expect(result).toHaveLength(2);
    expect(result[1]).toContain("prayer");
  });

  it("never drops the original Arabic claim text", () => {
    const claim = "أركان الإسلام خمسة";
    const result = heuristicExpand(claim);
    expect(result[0]).toBe(claim);
  });

  it("matches Arabic terms despite JS's \\b being ASCII-only (the word-boundary regression)", () => {
    // Plain `\b` in JS never bounds non-Latin scripts at all — this would
    // previously have failed to match "أركان" even though it's right there.
    const result = heuristicExpand("أركان");
    expect(result).toHaveLength(2);
    expect(result[1]).toBe("pillars");
  });

  it("substitutes MULTIPLE recognized Arabic terms in a single pass, within the same query", () => {
    const result = heuristicExpand("أركان الإسلام خمسة");
    expect(result).toHaveLength(2);
    const variant = result[1].toLowerCase();
    expect(variant).toContain("pillars");
    expect(variant).toContain("islam");
    expect(variant).toContain("five");
  });

  it("bridges each of the four required pillar-name claims to an English-leaning variant", () => {
    const cases: [string, string][] = [
      ["الصلاة من أركان الإسلام", "prayer"],
      ["الزكاة من أركان الإسلام", "zakat"],
      ["الصوم من أركان الإسلام", "fasting"],
      ["الحج من أركان الإسلام", "pilgrimage"],
    ];
    for (const [claim, expectedWord] of cases) {
      const result = heuristicExpand(claim);
      expect(result).toHaveLength(2);
      const variant = result[1].toLowerCase();
      expect(variant).toContain(expectedWord);
      expect(variant).toContain("pillars");
      expect(variant).toContain("islam");
    }
  });

  it("still respects the max cap for Arabic input (never more than 2 queries)", () => {
    const result = heuristicExpand("الصلاة والزكاة والصوم من أركان الإسلام الخمسة", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("does not mirror English terms back into Arabic (one-directional bridge only)", () => {
    const result = heuristicExpand("Prayer is one of the five pillars of Islam.");
    for (const q of result) {
      expect(/[؀-ۿ]/.test(q)).toBe(false);
    }
  });
});

describe("heuristicExpand — phrase-level query expansion", () => {
  it("bridges 'الإسلام بني على خمس' into an English-leaning phrase (the core V2.2 target)", () => {
    const result = heuristicExpand("الإسلام بني على خمس");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("الإسلام بني على خمس");
    const variant = result[1].toLowerCase();
    expect(variant).toContain("islam");
    expect(variant).toContain("built");
    expect(variant).toContain("upon");
    expect(variant).toContain("five");
  });

  it("recognizes the phrase regardless of the verb's gender/voice variant (مبني / بنيت)", () => {
    expect(heuristicExpand("الدين مبني على اليسر")[1].toLowerCase()).toContain("built upon");
    expect(heuristicExpand("الشريعة بنيت على المصلحة")[1].toLowerCase()).toContain("built upon");
  });

  it("does not translate 'على' or other prepositions OUTSIDE the recognized fixed phrase", () => {
    // "على" appears here but NOT as part of "بني على" — must be left alone,
    // proving this is phrase-specific, not generic grammar translation.
    const result = heuristicExpand("الكتاب على الطاولة");
    expect(result).toHaveLength(1); // no phrase match, no term match -> no variant at all
  });

  it("composes phrase substitution with term substitution in the same pass", () => {
    // "بني على" -> "is built upon", THEN "خمس" -> "five" on the already-bridged text.
    const result = heuristicExpand("بني على خمس");
    expect(result[1].toLowerCase()).toContain("is built upon five");
  });

  it("never invents religious content — the phrase table only ever reformulates for search", () => {
    const result = heuristicExpand("الإسلام بني على خمس");
    for (const q of result) {
      expect(q.length).toBeLessThan(80); // sanity: no elaboration/explanation appended
    }
  });

  it("still respects the max query cap when a phrase match is the only expansion found", () => {
    const result = heuristicExpand("بني على خمس", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});
