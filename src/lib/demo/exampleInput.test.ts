import { describe, expect, it } from "vitest";
import { DEMO_EXAMPLES, DEMO_EXAMPLE_TEXT } from "./exampleInput";

describe("DEMO_EXAMPLES", () => {
  it("provides exactly 3 examples", () => {
    expect(DEMO_EXAMPLES).toHaveLength(3);
  });

  it("every example is Arabic, not English", () => {
    for (const example of DEMO_EXAMPLES) {
      expect(/[؀-ۿ]/.test(example)).toBe(true);
      expect(/[A-Za-z]{3,}/.test(example)).toBe(false);
    }
  });

  it("every example is a short, independent sentence", () => {
    for (const example of DEMO_EXAMPLES) {
      expect(example.trim().endsWith(".")).toBe(true);
      expect(example).not.toContain("\n");
    }
  });

  it("includes the required example claims", () => {
    expect(DEMO_EXAMPLES).toContain("أركان الإسلام خمسة.");
    expect(DEMO_EXAMPLES).toContain("الأعمال بالنيات.");
    expect(DEMO_EXAMPLES).toContain("الزكاة من أركان الإسلام.");
  });

  it("every example is distinct (no duplicates)", () => {
    expect(new Set(DEMO_EXAMPLES).size).toBe(DEMO_EXAMPLES.length);
  });
});

describe("DEMO_EXAMPLE_TEXT", () => {
  it("joins the 3 examples on separate lines, each splittable by the heuristic claim extractor", () => {
    const lines = DEMO_EXAMPLE_TEXT.split("\n").filter(Boolean);
    expect(lines).toEqual(DEMO_EXAMPLES);
  });
});
