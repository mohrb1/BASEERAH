export type VerificationStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "NEEDS_CONTEXT"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVERIFIED";

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "NEEDS_CONTEXT",
  "INSUFFICIENT_EVIDENCE",
  "UNVERIFIED",
];

export type SourceType = "quran" | "hadith" | "scholarly_note";

/**
 * A single reference record in the Source Layer.
 *
 * `isDemo: true` means this record came from the curated local demo
 * dataset (src/lib/sources/demoData.ts). `isDemo: false` means it was
 * fetched live from a real, verified external provider (see
 * src/lib/sources/quranAdapter.ts and hadithAdapter.ts). The UI must
 * always show this distinction to the user — never present demo data
 * as if it came from a live database.
 */
export interface SourceRecord {
  id: string;
  type: SourceType;
  reference: string;
  collection?: string;
  grade?: string;
  title: string;
  text: string;
  arabicText?: string;
  tags: string[];
  isDemo: boolean;
  /** Canonical, human-clickable URL to the original source. Only ever a
   *  real, verified URL — never fabricated. Omitted when none exists. */
  sourceUrl?: string;
  /** Human-readable name of the provider this record came from, e.g.
   *  "AlQuran Cloud API" or "BASEERAH Demo Source Layer". */
  provider?: string;
}

export interface EvidenceMatch {
  source: SourceRecord;
  matchStrength: number;
  matchedTerms: string[];
}

export interface ClaimResult {
  id: string;
  index: number;
  claimText: string;
  status: VerificationStatus;
  explanation: string;
  context?: string;
  evidence: EvidenceMatch[];
}

export type AnalysisMode = "live" | "demo";

export interface AnalysisResult {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  inputType: "text" | "image";
  originalText: string;
  claims: ClaimResult[];
}

export interface AnalyzeRequestBody {
  text: string;
  inputType: "text" | "image";
}

export interface ApiErrorResponse {
  error: string;
  code:
    | "EMPTY_INPUT"
    | "TEXT_TOO_LONG"
    | "OCR_FAILED"
    | "EXTRACTION_FAILED"
    | "VERIFICATION_FAILED"
    | "TIMEOUT"
    | "UNKNOWN";
}
