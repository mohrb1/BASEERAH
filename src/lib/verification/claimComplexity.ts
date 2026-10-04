/**
 * Cheap, deterministic signals that a claim needs more than keyword
 * overlap to verify safely. None of these require NLP infrastructure —
 * they're regex heuristics over the claim's surface wording, used only to
 * decide how cautious the heuristic (no-API-key) verifier should be.
 *
 * This exists because keyword-coverage scoring cannot tell the difference
 * between "evidence that supports this claim" and "evidence that merely
 * shares vocabulary with this claim." A claim with negation, an absolute
 * or universal qualifier, a specific number, a causal link, or multiple
 * conditions can share almost all of its keywords with evidence that
 * actually says something different or narrower — so those claims must
 * never be auto-classified SUPPORTED from lexical overlap alone.
 */
export interface ClaimComplexityFlags {
  /** "not", "never", "cannot", "n't", "without", ... — claim could assert the opposite of what shared-vocabulary evidence says. */
  negation: boolean;
  /** "all", "every", "always", "no one", ... — evidence about a specific case doesn't establish a universal claim. */
  universal: boolean;
  /** "guaranteed", "automatically", "must", "no matter what", ... — overstates certainty beyond what evidence typically supports. */
  absolute: boolean;
  /** A specific number, year, percentage, or count — evidence must state the *same* figure, not just be topically related. */
  numerical: boolean;
  /** "because", "causes", "leads to", ... — evidence must state the causal relationship itself, not just both halves separately. */
  causal: boolean;
  /** "if/unless/as long as", or multiple conjunctions — evidence must address every condition, not just one. */
  multiCondition: boolean;
  /** Predictions, rumors, or vague attributions — not the kind of claim text evidence can confirm or deny. */
  speculative: boolean;
}

const NEGATION_RE = /\b(not|never|no|none|n't|cannot|can't|won't|wont|doesn't|doesnt|didn't|didnt|isn't|isnt|aren't|arent|wasn't|wasnt|weren't|werent|without|neither|nor)\b/i;
const UNIVERSAL_RE = /\b(all|every|everyone|everybody|everything|always|anyone|anybody|no\s?one|nobody|nothing|only\s+way|sole(ly)?)\b/i;
const ABSOLUTE_RE = /\b(guarantee[sd]?|certainly|definitely|automatically|instantly|immediately|absolutely|no matter what|regardless of|forever|eternally|must\b)\b/i;
const NUMERICAL_RE = /\b\d{1,4}\b|\b(percent|%|times a (day|week|month|year))\b/i;
const CAUSAL_RE = /\b(because|causes?|caused|leads? to|results? in|therefore|so that|due to)\b/i;
const MULTI_CONDITION_RE = /\b(if|unless|as long as|provided that|no matter what|regardless)\b/i;
const SPECULATIVE_RE = /\b(predict(s|ed)?|prophe(c|s)y|prophesied|will happen|said to happen|forecast(s|ed)?|rumou?r|some say|a (famous )?scholar (said|claims?)|it is (said|rumou?red))\b/i;

export function detectClaimComplexity(claimText: string): ClaimComplexityFlags {
  return {
    negation: NEGATION_RE.test(claimText),
    universal: UNIVERSAL_RE.test(claimText),
    absolute: ABSOLUTE_RE.test(claimText),
    numerical: NUMERICAL_RE.test(claimText),
    causal: CAUSAL_RE.test(claimText),
    multiCondition:
      MULTI_CONDITION_RE.test(claimText) || (claimText.match(/\band\b/gi)?.length ?? 0) >= 2,
    speculative: SPECULATIVE_RE.test(claimText),
  };
}

/** True if any qualifier is present that lexical keyword overlap cannot reliably verify. Deliberately excludes `speculative` — that's routed to UNVERIFIED separately, not treated as "needs a stricter SUPPORTED bar." */
export function isComplexClaim(flags: ClaimComplexityFlags): boolean {
  return (
    flags.negation ||
    flags.universal ||
    flags.absolute ||
    flags.numerical ||
    flags.causal ||
    flags.multiCondition
  );
}
