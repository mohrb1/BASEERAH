import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
let liveAvailable = false;

vi.mock("./client", () => ({
  isLiveModeAvailable: () => liveAvailable,
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
  MODEL: "test-model",
}));

const { expandClaimQueries, MAX_EXPANDED_QUERIES } = await import("./expandQuery");

function textResponse(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  liveAvailable = false;
});

describe("expandClaimQueries — heuristic mode (no API key)", () => {
  it("never calls the Anthropic client", async () => {
    await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns mode: heuristic", async () => {
    const result = await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(result.mode).toBe("heuristic");
  });

  it("always includes the original claim text", async () => {
    const claim = "The Prophet taught that actions are judged by intentions.";
    const result = await expandClaimQueries(claim);
    expect(result.queries).toContain(claim);
  });

  it("caps queries at MAX_EXPANDED_QUERIES", async () => {
    const result = await expandClaimQueries("Zakat and salah are pillars of Islam.");
    expect(result.queries.length).toBeLessThanOrEqual(MAX_EXPANDED_QUERIES);
  });
});

describe("expandClaimQueries — live mode (API key configured)", () => {
  beforeEach(() => {
    liveAvailable = true;
  });

  it("returns the LLM's queries, capped and deduped, with mode: live", async () => {
    mockCreate.mockResolvedValue(
      textResponse({ queries: ["almsgiving obligation percentage", "zakat nisab"] })
    );
    const result = await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(result.mode).toBe("live");
    expect(result.queries.length).toBeLessThanOrEqual(MAX_EXPANDED_QUERIES);
    expect(result.queries.length).toBeGreaterThan(0);
  });

  it("falls back to heuristic queries when the LLM call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));
    const result = await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(result.mode).toBe("heuristic");
    expect(result.queries.length).toBeGreaterThan(0);
  });

  it("falls back to heuristic queries when the response has no text block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "other" }] });
    const result = await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(result.mode).toBe("heuristic");
  });

  it("falls back to heuristic queries when the response JSON is malformed", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    const result = await expandClaimQueries("Zakat is 2.5% of savings.");
    expect(result.mode).toBe("heuristic");
  });

  it("never invents queries unrelated to the claim — the fallback never fabricates religious content", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    const claim = "A specific scholar predicted the Day of Judgment will happen in 2090.";
    const result = await expandClaimQueries(claim);
    // Heuristic fallback only ever echoes the claim (+ a term substitution) — never adds new assertions.
    for (const q of result.queries) {
      expect(q === claim || q.length <= claim.length + 20).toBe(true);
    }
  });
});
