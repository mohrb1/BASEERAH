export type InputKind = "CLAIM" | "QUESTION" | "UNCLEAR";

export interface InputClassification {
  kind: InputKind;
  /** QUESTION only: the derived topic phrase to retrieve evidence for.
   *  Internal to retrieval — NEVER used as the displayed claim text. */
  retrievalIntent?: string;
}

const QUESTION_PREFIX_RE = /^(ما\s+هي|ما\s+هو|ماذا|هل|كيف|متى|لماذا|أين|من)\s+/u;
const QUESTION_MARK_RE = /[؟?]\s*$/u;
const QUESTION_STARTER_RE = /^(ما|ماذا|هل|كيف|متى|لماذا|أين|من)\b/u;

/**
 * Deterministic, offline "claim understanding" step, run before retrieval.
 * No AI call, no new infrastructure — reuses the existing Unicode-aware
 * tokenize(). Purely advisory: it never alters the displayed claim text
 * and never touches verification thresholds/complexity gating/the concept
 * gate. It only affects two things in verifyClaim():
 *  - UNCLEAR short-circuits before retrieval is even attempted (nothing
 *    coherent to search for).
 *  - QUESTION swaps which STRING retrieval searches on (a derived topic
 *    phrase) while the claim shown to the user stays the original question.
 */
export function classifyInput(text: string): InputClassification {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "UNCLEAR" };

  const looksLikeQuestion = QUESTION_MARK_RE.test(trimmed) || QUESTION_STARTER_RE.test(trimmed);
  if (looksLikeQuestion) {
    const intent = trimmed.replace(QUESTION_PREFIX_RE, "").replace(QUESTION_MARK_RE, "").trim();
    return { kind: "QUESTION", retrievalIntent: intent || trimmed };
  }

  // Deliberately narrow: UNCLEAR only catches empty/whitespace-only input
  // here. It does NOT try to detect "too short" or "gibberish" text more
  // generally — retrieval finding zero genuine evidence already guards
  // against that (see heuristicVerify's empty-evidence branch, which can
  // never return SUPPORTED), and a stricter length/token-count heuristic
  // would misclassify short-but-real claims as unclear.
  return { kind: "CLAIM" };
}
