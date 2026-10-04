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
