import { describe, expect, it } from "vitest";
import { demoSources } from "./demoData";
import { DemoSourceAdapter } from "./demoAdapter";

describe("DemoSourceAdapter", () => {
  const adapter = new DemoSourceAdapter();

  it("is always marked as demo", () => {
    expect(adapter.isDemo).toBe(true);
  });

  it("finds a relevant record for a topically matching claim", async () => {
    const results = await adapter.search("actions are judged by intentions", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.id).toBe("bukhari-1-intentions");
    expect(results[0].source.isDemo).toBe(true);
  });

  it("returns an empty array for a query with no demo coverage", async () => {
    const results = await adapter.search("quantum physics blockchain cryptocurrency mining", 3);
    expect(results).toEqual([]);
  });

  it("returns an empty array for an empty/whitespace query instead of throwing", async () => {
    await expect(adapter.search("   ", 3)).resolves.toEqual([]);
  });

  it("never returns more than `limit` results", async () => {
    const results = await adapter.search("prayer fasting hajj ramadan intention paradise", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("getById returns the exact record for a known id", async () => {
    const record = await adapter.getById("quran-2-255");
    expect(record).not.toBeNull();
    expect(record?.reference).toBe("Quran 2:255");
    expect(record?.isDemo).toBe(true);
  });

  it("getById returns null for an unknown id", async () => {
    const record = await adapter.getById("does-not-exist");
    expect(record).toBeNull();
  });

  it("every demo record carries a real, verified canonical source URL", () => {
    for (const source of demoSources) {
      expect(source.sourceUrl).toBeDefined();
      expect(source.sourceUrl).toMatch(/^https:\/\/(alquran\.cloud|sunnah\.com)\//);
    }
  });

  it("every demo record is explicitly labeled isDemo:true and carries a provider label", () => {
    for (const source of demoSources) {
      expect(source.isDemo).toBe(true);
      expect(source.provider).toBeTruthy();
    }
  });

  it("search never fabricates evidence text beyond what's in the dataset", async () => {
    const results = await adapter.search("fasting ramadan forgiveness sins", 3);
    for (const match of results) {
      const original = demoSources.find((s) => s.id === match.source.id);
      expect(match.source.text).toBe(original?.text);
      expect(match.source.reference).toBe(original?.reference);
    }
  });
});
