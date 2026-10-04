import { tokenize } from "./textUtils";

/**
 * Data-driven "concept groups" for a small set of known polysemous Islamic
 * terms. The problem this solves: `scoreOverlap`'s coverage ratio treats
 * every matched token equally, so a claim and an evidence record sharing
 * ONE generic word (e.g. "pillars") can score as a strong match even when
 * the word is being used in an entirely different sense — architectural
 * pillars/columns vs. the doctrinal "Five Pillars of Islam". Lexical
 * overlap alone cannot tell these apart.
 *
 * A concept group names an `anchors` term (the ambiguous word) plus the
 * `relatedConcepts` that, if ALSO present in a piece of evidence, confirm
 * the doctrinal/domain sense is actually being discussed — not just
 * coincidentally sharing one word. This is purely a PRECISION signal: it
 * never asserts a claim is true, and it is entirely general — adding a new
 * group here protects every claim that touches that concept, not one
 * specific claim's wording.
 *
 * Consumed by heuristicVerify() in verify.ts as an additional downgrade
 * gate: an unconfirmed anchor-only match is never allowed to reach
 * SUPPORTED, regardless of its raw matchStrength.
 */
export interface ConceptGroup {
  name: string;
  /** The polysemous anchor term(s) — NOT sufficient evidence by themselves. */
  anchors: string[];
  /** Other concept terms whose presence in the evidence confirms the intended sense. */
  relatedConcepts: string[];
  /** Minimum distinct relatedConcepts that must appear in the evidence before an anchor match is trusted. */
  minRelatedMatches: number;
}

const RAW_CONCEPT_GROUPS: ConceptGroup[] = [
  {
    name: "pillars of Islam",
    // "built" is included alongside the literal "pillars"/"أركان" words
    // because the query-expansion phrase bridge "بني على" -> "is built
    // upon" (see terminology.ts PHRASE_VARIANTS) surfaces "built" as the
    // search-side stand-in for the elliptical Arabic hadith construction
    // "Islam is built upon five [pillars]" — the word "pillars" is never
    // actually said in that phrasing, so without this, a claim using it
    // would never trigger the gate at all, even though it's invoking the
    // exact same doctrinal concept.
    anchors: ["pillar", "pillars", "ركن", "أركان", "built"],
    relatedConcepts: [
      "prayer", "salah", "salat", "الصلاة",
      "zakat", "almsgiving", "الزكاة",
      "fasting", "fast", "sawm", "الصوم", "الصيام",
      "hajj", "pilgrimage", "الحج",
      "shahada", "testimony",
      "islam", "الإسلام",
    ],
    minRelatedMatches: 2,
  },
];

interface CompiledConceptGroup {
  name: string;
  anchors: Set<string>;
  relatedConcepts: Set<string>;
  minRelatedMatches: number;
}

function canonicalTokens(terms: string[]): Set<string> {
  const set = new Set<string>();
  for (const term of terms) {
    for (const t of tokenize(term)) set.add(t);
  }
  return set;
}

const CONCEPT_GROUPS: CompiledConceptGroup[] = RAW_CONCEPT_GROUPS.map((g) => ({
  name: g.name,
  anchors: canonicalTokens(g.anchors),
  relatedConcepts: canonicalTokens(g.relatedConcepts),
  minRelatedMatches: g.minRelatedMatches,
}));

export interface ConceptCoverageResult {
  /** True if the claim invokes a known polysemous anchor term. */
  anchorInvoked: boolean;
  /** True if the evidence demonstrates enough of the group's other concepts to trust the anchor match. False whenever anchorInvoked is false too (nothing to confirm). */
  confirmed: boolean;
  group?: string;
  relatedMatches?: number;
}

/**
 * Checks whether a claim invokes a known polysemous anchor concept, and if
 * so, whether a specific piece of evidence actually demonstrates the
 * group's other recognized concepts (confirming the intended sense) or
 * only contains the bare anchor word (a coincidental or unrelated use of
 * the same word, e.g. literal architectural pillars).
 */
export function evaluateConceptCoverage(
  claimTokens: Set<string>,
  evidenceTokens: Set<string>
): ConceptCoverageResult {
  for (const group of CONCEPT_GROUPS) {
    const claimHasAnchor = [...group.anchors].some((a) => claimTokens.has(a));
    if (!claimHasAnchor) continue;

    const relatedMatches = [...group.relatedConcepts].filter((t) => evidenceTokens.has(t)).length;

    return {
      anchorInvoked: true,
      confirmed: relatedMatches >= group.minRelatedMatches,
      group: group.name,
      relatedMatches,
    };
  }
  return { anchorInvoked: false, confirmed: false };
}
