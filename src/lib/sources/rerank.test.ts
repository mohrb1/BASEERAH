import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievedCandidate } from "./retrieve";

const mockCreate = vi.fn();
let liveAvailable = false;

vi.mock("@/lib/ai/client", () => ({
  isLiveModeAvailable: () => liveAvailable,
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
  MODEL: "test-model",
}));

const { rerankEvidence } = await import("./rerank");

function candidate(id: string, matchStrength: number, foundByQueries = ["q"]): RetrievedCandidate {
  return {
    source: {
      id,
      type: "hadith",
      reference: `Ref ${id}`,
      title: `Title ${id}`,
      text: `Text ${id}`,
      tags: [],
      isDemo: true,
    },
    matchStrength,
    matchedTerms: ["x"],
    foundByQueries,
  };
}

function textResponse(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  liveAvailable = false;
});

describe("rerankEvidence — heuristic mode (no API key)", () => {
  it("returns [] for an empty candidate list without calling the LLM", async () => {
    const result = await rerankEvidence("claim", []);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sets relevanceScore to exactly the candidate's existing matchStrength — never recomputed", async () => {
    const candidates = [candidate("a", 0.42)];
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].relevanceScore).toBe(0.42);
  });

  it("sorts descending by relevanceScore", async () => {
    const candidates = [candidate("low", 0.1), candidate("high", 0.9), candidate("mid", 0.5)];
    const result = await rerankEvidence("claim", candidates);
    expect(result.map((r) => r.source.id)).toEqual(["high", "mid", "low"]);
  });

  it("never mutates the underlying source/matchStrength/matchedTerms fields", async () => {
    const candidates = [candidate("a", 0.42)];
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].source).toEqual(candidates[0].source);
    expect(result[0].matchStrength).toBe(candidates[0].matchStrength);
    expect(result[0].matchedTerms).toEqual(candidates[0].matchedTerms);
  });
});

describe("rerankEvidence — live mode (API key configured)", () => {
  beforeEach(() => {
    liveAvailable = true;
  });

  it("applies the LLM's scores and re-sorts accordingly", async () => {
    const candidates = [candidate("a", 0.5), candidate("b", 0.5)];
    mockCreate.mockResolvedValue(
      textResponse({
        scores: [
          { index: 0, relevanceScore: 0.2, rationale: "tangential" },
          { index: 1, relevanceScore: 0.9, rationale: "directly on topic" },
        ],
      })
    );

    const result = await rerankEvidence("claim", candidates);
    expect(result[0].source.id).toBe("b");
    expect(result[0].relevanceScore).toBe(0.9);
    expect(result[0].relevanceRationale).toBe("directly on topic");
  });

  it("clamps an out-of-range LLM score into [0, 1]", async () => {
    const candidates = [candidate("a", 0.5)];
    mockCreate.mockResolvedValue(textResponse({ scores: [{ index: 0, relevanceScore: 5 }] }));
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].relevanceScore).toBe(1);
  });

  it("falls back to heuristic reranking when the LLM call throws", async () => {
    const candidates = [candidate("a", 0.42)];
    mockCreate.mockRejectedValue(new Error("boom"));
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].relevanceScore).toBe(0.42);
  });

  it("falls back to heuristic reranking on a malformed response", async () => {
    const candidates = [candidate("a", 0.42)];
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].relevanceScore).toBe(0.42);
  });

  it("falls back to matchStrength for a candidate the LLM didn't score", async () => {
    const candidates = [candidate("a", 0.33), candidate("b", 0.77)];
    mockCreate.mockResolvedValue(textResponse({ scores: [{ index: 0, relevanceScore: 0.1 }] }));
    const result = await rerankEvidence("claim", candidates);
    const b = result.find((r) => r.source.id === "b");
    expect(b?.relevanceScore).toBe(0.77);
  });

  it("never fabricates a new source, reference, or text — only scores what was given", async () => {
    const candidates = [candidate("a", 0.5)];
    mockCreate.mockResolvedValue(textResponse({ scores: [{ index: 0, relevanceScore: 0.8 }] }));
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].source).toEqual(candidates[0].source);
  });
});

describe("rerankEvidence — cannot itself produce a verification verdict", () => {
  it("output contains no status/verdict field — relevance is structurally separate from verification", async () => {
    const candidates = [candidate("a", 0.1)];
    const result = await rerankEvidence("claim", candidates);
    expect(result[0]).not.toHaveProperty("status");
  });

  it("a maximal relevance score does not alter matchStrength, the only field heuristicVerify's SUPPORTED threshold reads", async () => {
    liveAvailable = true;
    const candidates = [candidate("misleading", 0.1)]; // low lexical coverage, i.e. would NOT clear heuristicVerify's SUPPORTED bar (0.6)
    mockCreate.mockResolvedValue(
      textResponse({ scores: [{ index: 0, relevanceScore: 1, rationale: "looks highly relevant" }] })
    );
    const result = await rerankEvidence("claim", candidates);
    expect(result[0].relevanceScore).toBe(1);
    expect(result[0].matchStrength).toBe(0.1); // unchanged — this is what verification actually gates on in heuristic mode
  });
});
