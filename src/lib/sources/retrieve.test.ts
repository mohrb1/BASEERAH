import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceMatch } from "@/types";

const mockSearch = vi.fn<(query: string, limit?: number) => Promise<EvidenceMatch[]>>();
const mockExpand = vi.fn();

vi.mock("@/lib/sources", () => ({
  getSourceAdapter: () => ({
    name: "mock-adapter",
    isDemo: false,
    search: mockSearch,
    getById: vi.fn(),
  }),
}));

vi.mock("@/lib/ai/expandQuery", () => ({
  expandClaimQueries: (claimText: string) => mockExpand(claimText),
  MAX_EXPANDED_QUERIES: 2,
}));

const { retrieveEvidencePack } = await import("./retrieve");

function evidence(id: string, matchStrength = 0.5): EvidenceMatch {
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
  };
}

beforeEach(() => {
  mockSearch.mockReset();
  mockExpand.mockReset();
});

describe("retrieveEvidencePack", () => {
  it("dispatches one adapter.search call per unique expanded query", async () => {
    mockExpand.mockResolvedValue({ queries: ["query a", "query b"], mode: "heuristic" });
    mockSearch.mockResolvedValue([]);

    await retrieveEvidencePack("some claim");

    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch).toHaveBeenCalledWith("query a", expect.any(Number));
    expect(mockSearch).toHaveBeenCalledWith("query b", expect.any(Number));
  });

  it("deduplicates queries (case-insensitive) before dispatching, bounding external requests", async () => {
    mockExpand.mockResolvedValue({ queries: ["Query A", "query a"], mode: "heuristic" });
    mockSearch.mockResolvedValue([]);

    await retrieveEvidencePack("some claim");

    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it("surfaces evidence found by a lexically different second query that the first query alone would have missed", async () => {
    // Simulates the exact V1 failure mode: a claim phrased with "almsgiving"
    // only lexically matches a source indexed under "zakat" once a second,
    // differently-worded query actually reaches it.
    mockExpand.mockResolvedValue({
      queries: ["almsgiving is 2.5 percent of savings", "zakat nisab percentage"],
      mode: "heuristic",
    });
    mockSearch.mockImplementation(async (query: string) => {
      if (query.includes("zakat")) return [evidence("zakat-record", 0.7)];
      return []; // the literal "almsgiving" query alone finds nothing
    });

    const pack = await retrieveEvidencePack("Almsgiving is 2.5% of one's savings.");

    expect(pack.candidates).toHaveLength(1);
    expect(pack.candidates[0].source.id).toBe("zakat-record");
    expect(pack.candidates[0].foundByQueries).toContain("zakat nisab percentage");
  });

  it("unions and dedupes candidates found by multiple queries, merging foundByQueries", async () => {
    mockExpand.mockResolvedValue({ queries: ["query a", "query b"], mode: "heuristic" });
    mockSearch.mockImplementation(async (query: string) => {
      if (query === "query a") return [evidence("shared", 0.4), evidence("only-a", 0.3)];
      return [evidence("shared", 0.4), evidence("only-b", 0.2)];
    });

    const pack = await retrieveEvidencePack("some claim");
    const ids = pack.candidates.map((c) => c.source.id).sort();

    expect(ids).toEqual(["only-a", "only-b", "shared"]);
    const shared = pack.candidates.find((c) => c.source.id === "shared");
    expect(shared?.foundByQueries.sort()).toEqual(["query a", "query b"]);
  });

  it("never invents a matchStrength — keeps whichever value the adapter actually returned, picking the higher one on conflict", async () => {
    mockExpand.mockResolvedValue({ queries: ["query a", "query b"], mode: "heuristic" });
    mockSearch.mockImplementation(async (query: string) => {
      if (query === "query a") return [evidence("dup", 0.2)];
      return [evidence("dup", 0.9)];
    });

    const pack = await retrieveEvidencePack("some claim");
    expect(pack.candidates).toHaveLength(1);
    expect(pack.candidates[0].matchStrength).toBe(0.9);
  });

  it("returns an empty candidate list when every query finds nothing", async () => {
    mockExpand.mockResolvedValue({ queries: ["query a"], mode: "heuristic" });
    mockSearch.mockResolvedValue([]);

    const pack = await retrieveEvidencePack("some claim");
    expect(pack.candidates).toEqual([]);
  });

  it("records which expansion mode produced the queries", async () => {
    mockExpand.mockResolvedValue({ queries: ["query a"], mode: "live" });
    mockSearch.mockResolvedValue([]);

    const pack = await retrieveEvidencePack("some claim");
    expect(pack.expansionMode).toBe("live");
  });
});
