import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceMatch, SourceRecord } from "@/types";

const mockSearch = vi.fn<(query: string, limit?: number) => Promise<EvidenceMatch[]>>();
let liveAvailable = false;
const mockCreate = vi.fn();

vi.mock("@/lib/sources", () => ({
  getSourceAdapter: () => ({
    name: "mock-adapter",
    isDemo: false,
    search: mockSearch,
    getById: vi.fn(),
  }),
}));

vi.mock("@/lib/ai/client", () => ({
  isLiveModeAvailable: () => liveAvailable, // false by default — forces the heuristic (no API key) path deterministically unless a test opts into live mode
  getAnthropicClient: () => {
    if (!liveAvailable) {
      throw new Error("getAnthropicClient should not be called when isLiveModeAvailable() is false");
    }
    return { messages: { create: mockCreate } };
  },
  MODEL: "test-model",
}));

const { verifyClaim } = await import("./verify");

function makeEvidence(
  overrides: Partial<SourceRecord> = {},
  matchStrength = 0.5
): EvidenceMatch {
  const source: SourceRecord = {
    id: "x",
    type: "hadith",
    reference: "Ref",
    title: "Title",
    text: "Text",
    tags: [],
    isDemo: true,
    ...overrides,
  };
  return { source, matchStrength, matchedTerms: ["x"] };
}

beforeEach(() => {
  mockSearch.mockReset();
  mockCreate.mockReset();
  liveAvailable = false;
});

function textResponse(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

describe("verifyClaim (heuristic fallback — no API key)", () => {
  it("returns INSUFFICIENT_EVIDENCE when no evidence is found", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await verifyClaim("some claim with no matches", 0, "prefix");
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.evidence).toEqual([]);
  });

  it("never returns SUPPORTED when evidence is empty", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("returns SUPPORTED for strong match coverage", async () => {
    mockSearch.mockResolvedValue([makeEvidence({}, 0.6)]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.status).toBe("SUPPORTED");
  });

  it("returns PARTIALLY_SUPPORTED for medium match coverage", async () => {
    mockSearch.mockResolvedValue([makeEvidence({}, 0.3)]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.status).toBe("PARTIALLY_SUPPORTED");
  });

  it("returns NEEDS_CONTEXT for weak but non-zero match coverage", async () => {
    mockSearch.mockResolvedValue([makeEvidence({}, 0.05)]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.status).toBe("NEEDS_CONTEXT");
  });

  it("passes evidence through unchanged — never mutates or fabricates source fields", async () => {
    const ev = makeEvidence({ id: "bukhari-1-intentions", reference: "Sahih al-Bukhari 1" }, 0.6);
    mockSearch.mockResolvedValue([ev]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.evidence).toEqual([ev]);
  });

  it("preserves demo vs. live labeling on the evidence it returns", async () => {
    mockSearch.mockResolvedValue([makeEvidence({ isDemo: false }, 0.6)]);
    const liveResult = await verifyClaim("x", 0, "p");
    expect(liveResult.evidence[0].source.isDemo).toBe(false);

    mockSearch.mockResolvedValue([makeEvidence({ isDemo: true }, 0.6)]);
    const demoResult = await verifyClaim("y", 1, "p");
    expect(demoResult.evidence[0].source.isDemo).toBe(true);
  });

  it("explanation only references the actual retrieved evidence, never an invented one", async () => {
    const ev = makeEvidence({ title: "Unique Title XYZ", reference: "Unique Ref 123" }, 0.6);
    mockSearch.mockResolvedValue([ev]);
    const result = await verifyClaim("x", 0, "p");
    expect(result.explanation).toContain("Unique Title XYZ");
    expect(result.explanation).toContain("Unique Ref 123");
  });

  it("assigns a stable id using the given prefix and index", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await verifyClaim("x", 4, "analysis-123");
    expect(result.id).toBe("analysis-123-4");
    expect(result.index).toBe(4);
  });
});

/**
 * Lettered safety-hardening scenarios (see the verification-safety task).
 * These exercise the heuristic (no-API-key) path specifically, since it's
 * the deterministic part of the system — the LLM path's equivalent
 * safeguards live in the system prompt in verify.ts and aren't something
 * a unit test can meaningfully assert without mocking away the actual
 * reasoning being tested.
 */
describe("verifyClaim — conservative classification scenarios", () => {
  it("A. high keyword overlap but wrong meaning (negation) must NOT be SUPPORTED", async () => {
    // Negation flag forces complex-claim handling regardless of how high
    // the keyword-coverage score is.
    mockSearch.mockResolvedValue([makeEvidence({ title: "Purification hadith", reference: "Ref A" }, 0.9)]);
    const result = await verifyClaim(
      "Prayer is never required without proper purification beforehand.",
      0,
      "p"
    );
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("B. correct source but claim needs additional context → NEEDS_CONTEXT", async () => {
    // "guarantees" (absolute) + moderate score lands in the NEEDS_CONTEXT band.
    mockSearch.mockResolvedValue([makeEvidence({ title: "Dua hadith", reference: "Ref B" }, 0.2)]);
    const result = await verifyClaim(
      "Reciting this specific dua after prayer guarantees your sins are forgiven.",
      0,
      "p"
    );
    expect(result.status).toBe("NEEDS_CONTEXT");
  });

  it("C. overstated claim based on a narrower source → PARTIALLY_SUPPORTED or NEEDS_CONTEXT, never SUPPORTED", async () => {
    mockSearch.mockResolvedValue([
      makeEvidence({ title: "Ramadan forgiveness hadith", reference: "Ref C" }, 0.5),
    ]);
    const result = await verifyClaim(
      "If you fast all of Ramadan you are guaranteed instant entry to Paradise no matter what else you do.",
      0,
      "p"
    );
    expect(result.status).not.toBe("SUPPORTED");
    expect(["PARTIALLY_SUPPORTED", "NEEDS_CONTEXT"]).toContain(result.status);
  });

  it("D. negated claim vs. positive evidence must NOT be SUPPORTED", async () => {
    mockSearch.mockResolvedValue([
      makeEvidence({ title: "Monday fasting hadith", reference: "Ref D" }, 0.85),
    ]);
    const result = await verifyClaim("Fasting on Mondays is not recommended in Islam.", 0, "p");
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("E. universal claim vs. evidence about a subset must NOT be SUPPORTED", async () => {
    mockSearch.mockResolvedValue([
      makeEvidence({ title: "Prayer times hadith", reference: "Ref E" }, 0.7),
    ]);
    const result = await verifyClaim(
      "All Muslims are required to pray five times a day without exception.",
      0,
      "p"
    );
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("F. completely unrelated/speculative claim with no evidence → UNVERIFIED or INSUFFICIENT_EVIDENCE", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await verifyClaim("A mysterious rumor claims the world will end in the year 2200.", 0, "p");
    expect(["UNVERIFIED", "INSUFFICIENT_EVIDENCE"]).toContain(result.status);
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("G. exact, simple claim with strong matching evidence → SUPPORTED", async () => {
    mockSearch.mockResolvedValue([
      makeEvidence({ title: "Intentions hadith", reference: "Ref G" }, 0.8),
    ]);
    const result = await verifyClaim("The Prophet taught that actions are judged by intentions.", 0, "p");
    expect(result.status).toBe("SUPPORTED");
  });
});

/**
 * V2 retrieval/reranking pipeline — adversarial scenarios.
 *
 * These exercise the full verifyClaim() -> retrieveEvidencePack() ->
 * rerankEvidence() -> (heuristicVerify | LLM verify) chain, proving:
 *  (1) multi-query retrieval surfaces evidence a single literal query would
 *      have missed (the exact V1 "Insufficient Evidence" failure mode),
 *  (2) a high relevance/rerank score can NEVER by itself produce SUPPORTED,
 *  (3) a misleading, high-scoring candidate is still correctly rejected by
 *      the final verification gate when its actual meaning doesn't support
 *      the claim.
 */
describe("verifyClaim — V2 retrieval/reranking adversarial scenarios", () => {
  it("heuristic multi-query retrieval surfaces evidence a single literal query would miss (paraphrase/synonym recall)", async () => {
    // "almsgiving" only resolves to evidence via the heuristic terminology
    // expansion's "zakat" variant query — the literal claim text alone
    // finds nothing, reproducing the exact V1 bug this upgrade targets.
    mockSearch.mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes("zakat")) {
        return [makeEvidence({ title: "Zakat obligation hadith", reference: "Ref Z" }, 0.7)];
      }
      return [];
    });

    const result = await verifyClaim("Almsgiving is 2.5% of one's savings.", 0, "p");

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.status).not.toBe("INSUFFICIENT_EVIDENCE");
  });

  it("a maximal rerank relevance score cannot by itself produce SUPPORTED — the live verify call's own judgment still governs", async () => {
    liveAvailable = true;
    mockSearch.mockResolvedValue([
      makeEvidence({ title: "Lexically similar but different-subject hadith", reference: "Ref M" }, 0.9),
    ]);

    mockCreate
      .mockImplementationOnce(async () => textResponse({ queries: ["misleading claim"] })) // expand
      .mockImplementationOnce(async () =>
        textResponse({ scores: [{ index: 0, relevanceScore: 1, rationale: "looks highly relevant" }] })
      ) // rerank — maximal score
      .mockImplementationOnce(async () =>
        textResponse({
          status: "INSUFFICIENT_EVIDENCE",
          explanation: "The evidence is topically similar but does not address the claim's actual subject.",
          evidenceIndices: [],
        })
      ); // verify — correctly rejects despite the maximal relevance score

    const result = await verifyClaim("A misleading claim that sounds like the evidence.", 0, "p");

    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("live pipeline degrades gracefully to heuristic verification if the final verify LLM call fails, even though expand/rerank succeeded", async () => {
    liveAvailable = true;
    mockSearch.mockResolvedValue([makeEvidence({ title: "Intentions hadith", reference: "Ref G" }, 0.8)]);

    mockCreate
      .mockImplementationOnce(async () => textResponse({ queries: ["actions judged by intentions"] })) // expand
      .mockImplementationOnce(async () =>
        textResponse({ scores: [{ index: 0, relevanceScore: 0.9 }] })
      ) // rerank
      .mockImplementationOnce(async () => {
        throw new Error("verify call failed");
      }); // verify — fails

    const result = await verifyClaim("The Prophet taught that actions are judged by intentions.", 0, "p");

    // Falls back to heuristicVerify — never silently drops the analysis, never fabricates a result.
    expect(result.status).toBe("SUPPORTED"); // same deterministic outcome as test G, since matchStrength (0.8) is unchanged
    expect(result.evidence).toHaveLength(1);
  });

  it("evidence returned on ClaimResult is a plain EvidenceMatch — never leaks relevanceScore/rationale/foundByQueries to the API shape", async () => {
    mockSearch.mockResolvedValue([makeEvidence({ title: "Some hadith", reference: "Ref X" }, 0.6)]);
    const result = await verifyClaim("x", 0, "p");

    expect(result.evidence[0]).not.toHaveProperty("relevanceScore");
    expect(result.evidence[0]).not.toHaveProperty("relevanceRationale");
    expect(result.evidence[0]).not.toHaveProperty("foundByQueries");
    expect(Object.keys(result.evidence[0]).sort()).toEqual(["matchStrength", "matchedTerms", "source"]);
  });
});
