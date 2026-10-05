import { describe, expect, it } from "vitest";
import { DEMO_EXAMPLE_TEXT } from "./exampleInput";

describe("DEMO_EXAMPLE_TEXT", () => {
  it("is Arabic, not English", () => {
    expect(/[؀-ۿ]/.test(DEMO_EXAMPLE_TEXT)).toBe(true);
    expect(/[A-Za-z]{3,}/.test(DEMO_EXAMPLE_TEXT)).toBe(false);
  });

  it("includes the pillars-of-Islam example claims", () => {
    expect(DEMO_EXAMPLE_TEXT).toContain("أركان الإسلام خمسة");
    expect(DEMO_EXAMPLE_TEXT).toContain("الصلاة من أركان الإسلام");
  });

  it("is formatted as separate sentences the heuristic claim extractor can split", () => {
    const lines = DEMO_EXAMPLE_TEXT.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      expect(line.trim().endsWith(".")).toBe(true);
    }
  });
});
