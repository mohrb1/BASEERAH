import type { VerificationStatus } from "@/types";

/**
 * Server-side-only structured trace of one claim's V2 retrieval →
 * reranking → verification pipeline — exists so "why was this source
 * ranked here" / "why was this claim classified this way" can be answered
 * from logs without re-deriving it by hand.
 *
 * This is intentionally NOT part of any API response type in
 * src/types/index.ts. Nothing in src/app/api/analyze/route.ts reads or
 * forwards it. It is logged (console.info, structured JSON line) and
 * nothing else — never serialized to the client, never shown in the UI.
 */
export interface ClaimTrace {
  claimText: string;
  queries: string[];
  expansionMode: "live" | "heuristic";
  candidatesConsidered: number;
  rerankedEvidence: {
    sourceId: string;
    relevanceScore: number;
    foundByQueries: string[];
  }[];
  finalEvidenceIds: string[];
  classificationStatus: VerificationStatus;
  classificationMode: "live" | "heuristic";
}

export function logClaimTrace(trace: ClaimTrace): void {
  if (process.env.VITEST === "true") return; // keep test output clean
  console.info(JSON.stringify({ evt: "claim_trace", ...trace }));
}
