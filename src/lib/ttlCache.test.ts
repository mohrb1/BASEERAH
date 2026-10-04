import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttlCache";

describe("createTtlCache", () => {
  it("is disabled by default under Vitest (process.env.VITEST === 'true')", () => {
    expect(process.env.VITEST).toBe("true");
    const cache = createTtlCache<string, number>(60_000);
    cache.set("a", 1);
    expect(cache.get("a")).toBeUndefined();
  });

  it("stores and returns a value when explicitly enabled", () => {
    const cache = createTtlCache<string, number>(60_000, { disabled: false });
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("expires a value after the TTL elapses", () => {
    vi.useFakeTimers();
    try {
      const cache = createTtlCache<string, number>(1000, { disabled: false });
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(cache.get("a")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clear() empties the cache", () => {
    const cache = createTtlCache<string, number>(60_000, { disabled: false });
    cache.set("a", 1);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });

  it("returns undefined for a key that was never set", () => {
    const cache = createTtlCache<string, number>(60_000, { disabled: false });
    expect(cache.get("missing")).toBeUndefined();
  });
});
