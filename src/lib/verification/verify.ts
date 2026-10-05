import { getAnthropicClient, isLiveModeAvailable, MODEL } from "@/lib/ai/client";
import { retrieveEvidencePack } from "@/lib/sources/retrieve";
import { rerankEvidence, type RankedEvidence } from "@/lib/sources/rerank";
import { evaluateConceptCoverage } from "@/lib/sources/conceptGroups";
import { tokenize } from "@/lib/sources/textUtils";
import { logClaimTrace } from "@/lib/observability/trace";
import type { ClaimResult, EvidenceMatch, VerificationStatus } from "@/types";
import { VERIFICATION_STATUSES } from "@/types";
import { detectClaimComplexity, isComplexClaim } from "./claimComplexity";

/** Final number of ranked candidates shown to the verifier / returned on
 *  ClaimResult.evidence — unchanged from V1's default so the UI's evidence
 *  list keeps the same shape and size. Retrieval itself now casts a wider
 *  net (see src/lib/sources/retrieve.ts); this only bounds what survives
 *  reranking. */
const EVIDENCE_PACK_SIZE = 3;

const SYSTEM_PROMPT = `You are the verification layer of BASEERAH, an Islamic content fact-checking tool. BASEERAH prefers uncertainty over unsupported certainty — when in doubt, say so rather than guess.

You will be given ONE claim and a list of candidate evidence records retrieved from a source database.

Your job: decide a verification status for the claim using ONLY the provided evidence. You are not a mufti and you must not issue religious rulings or add any Quranic verse, hadith, or source that is not in the provided evidence list.

CRITICAL: lexical similarity is NOT evidentiary support. A source that shares many words with the claim does not thereby support the claim. Before choosing SUPPORTED, explicitly compare:
- exact meaning — does the evidence state the same thing the claim states, not just a related thing?
- scope — a claim about "all/every/always/everyone" is NOT supported by evidence about one case, one group, or one instance. A claim with no qualifier is not automatically supported by evidence that is itself conditional or limited.
- qualifiers — words like "guaranteed", "automatically", "must", "instantly", "no matter what" assert a stronger or more unconditional outcome than most evidence actually states. If the claim asserts more certainty or unconditionality than the evidence does, that is PARTIALLY_SUPPORTED at most, not SUPPORTED.
- negation — check whether the claim and the evidence agree on polarity. Shared vocabulary between a claim and evidence that assert opposite things is not support. A negated claim is never SUPPORTED by evidence that only discusses the positive case (or vice versa).
- subject — confirm the evidence is actually about the same subject/actor the claim is about, not a similar-sounding but different one.
- numbers/dates — if the claim states a specific number, date, or count, the evidence must state that same figure. Evidence that is merely topically related but silent on or different from the number does NOT support the claim.
- causal claims — evidence that mentions both halves of a cause-and-effect claim separately does not establish that the evidence asserts the causal link itself.
- multi-part/conditional claims ("if X then Y", "X unless Y") — every condition must be addressed by the evidence, not just one clause.

Status options (choose exactly one):
- SUPPORTED: the retrieved evidence actually and specifically supports the claim's exact meaning, scope, and qualifiers as stated above — not merely a related or similar-sounding statement.
- PARTIALLY_SUPPORTED: the evidence is genuinely on-topic and supports part of the claim, but the claim overstates, understates, narrows, broadens, or adds a qualifier/condition/number the evidence does not establish.
- NEEDS_CONTEXT: the evidence is relevant but the claim as phrased is commonly misunderstood or misused without additional explanation, which you must give.
- INSUFFICIENT_EVIDENCE: the provided evidence does not clearly address the claim, or only shares vocabulary without addressing its actual meaning.
- UNVERIFIED: the claim is speculative, a prediction, unattributed, or not the kind of statement that text evidence can confirm or deny.

Rules:
- Never invent a source, quote, reference, URL, or ruling that is not in the evidence list below. Your own background knowledge about Islam is NOT evidence and must never be presented as if it were — only reason over the specific evidence records you were given.
- When genuinely uncertain between two statuses, choose the more conservative (less certain) one. A false SUPPORTED is a worse failure than an unnecessary INSUFFICIENT_EVIDENCE or NEEDS_CONTEXT — this product's entire purpose is accurate verification, so overclaiming support is the failure mode to avoid above all others.
- If the evidence list is empty or irrelevant, you must choose INSUFFICIENT_EVIDENCE or UNVERIFIED.
- "explanation" must be 1-3 plain sentences, neutral and factual, citing which evidence index (if any) supports your status, and naming the specific mismatch (scope/qualifier/negation/number/etc.) when status is not SUPPORTED.
- "context" is optional extra nuance (e.g. "this hadith is often quoted without X"); omit if not needed.
- "evidenceIndices" lists the 0-based indices of the evidence items you actually relied on (empty array if none).
- You present AI-assisted verification, not a fatwa, and never a guarantee of correctness. Do not phrase explanations as a religious ruling.
- Each evidence item includes whether it is from a "demo" or "live" source database. This does not change how you judge it — judge every item on its text alone — but never claim an item is live if it is marked demo or vice versa.
- Each evidence item also includes a "retrievalRelevanceHint" (high/medium/low). This reflects ONLY how topically relevant a retrieval step judged the item to be — it is a search-ranking signal, not evidentiary proof. A "high" hint does not mean the item supports the claim; you must still independently verify meaning, scope, negation, subject, numbers, dates, and conditions before choosing SUPPORTED, exactly as for any other evidence item.`;

const VERIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const, enum: VERIFICATION_STATUSES },
    explanation: { type: "string" as const },
    context: { type: "string" as const },
    evidenceIndices: {
      type: "array" as const,
      items: { type: "integer" as const },
    },
  },
  required: ["status", "explanation", "evidenceIndices"],
  additionalProperties: false,
};

/** True if the claim text is predominantly Arabic script — used only to
 *  pick which LANGUAGE the heuristic verifier's explanation text is
 *  written in. Never affects retrieval, scoring, or the status decision
 *  itself. Source titles/reference text are never translated (see
 *  explanationText below) — only the surrounding explanatory sentence is. */
function isArabicText(text: string): boolean {
  const arabicChars = text.match(/[؀-ۿݐ-ݿ]/g)?.length ?? 0;
  const letterChars = text.match(/\p{L}/gu)?.length ?? 0;
  return letterChars > 0 && arabicChars / letterChars > 0.5;
}

/**
 * No-API-key fallback. Deliberately conservative: keyword-coverage alone
 * cannot distinguish "evidence that supports this claim" from "evidence
 * that merely shares vocabulary with it," so this function leans toward
 * INSUFFICIENT_EVIDENCE / NEEDS_CONTEXT rather than guessing SUPPORTED.
 *
 * Claims flagged as "complex" by detectClaimComplexity — negation,
 * universal/absolute qualifiers, specific numbers, causal links, or
 * multi-part conditions — can NEVER be auto-classified SUPPORTED here,
 * no matter how high the keyword-coverage score is. Lexical overlap on a
 * claim like "fasting guarantees instant Paradise no matter what" doesn't
 * tell us the evidence actually agrees with "guaranteed" / "no matter
 * what" — only a real semantic read (the LLM path) can do that.
 *
 * Explanation LANGUAGE (Arabic vs English) is picked from the input
 * claim's own language — purely a presentation choice, layered on top of
 * the exact same status/threshold/concept-gate logic either way. Evidence
 * source titles and reference text are always reproduced verbatim from the
 * source record, in whatever language that metadata actually is — never
 * translated or fabricated.
 */
function heuristicVerify(
  claimText: string,
  evidence: EvidenceMatch[],
  searchQueries: string[] = [claimText]
): {
  status: VerificationStatus;
  explanation: string;
  context?: string;
} {
  const flags = detectClaimComplexity(claimText);
  const ar = isArabicText(claimText);

  if (evidence.length === 0) {
    if (flags.speculative) {
      return {
        status: "UNVERIFIED",
        explanation: ar
          ? "هذا الادعاء تخميني أو تنبؤي أو غير منسوب بوضوح — وهو ليس من النوع الذي يمكن للأدلة النصية تأكيده أو نفيه — ولم يُعثر على أي سجل مطابق له."
          : "This claim is speculative, predictive, or vaguely attributed — not the kind of statement text evidence can confirm or deny — and no matching record was found either way.",
      };
    }
    return {
      status: "INSUFFICIENT_EVIDENCE",
      explanation: ar
        ? "لم يُعثر على أي سجل مطابق لهذا الادعاء في قاعدة المصادر المستخدمة."
        : "No matching record was found in the configured source database for this claim.",
    };
  }

  const top = evidence[0];
  const sourceLabel = top.source.isDemo ? "demo source database" : "live source database";
  const sourceLabelAr = top.source.isDemo ? "قاعدة المصادر التجريبية" : "قاعدة المصادر المباشرة";

  // Precision gate: lexical coverage alone can't tell a genuine match from
  // a polysemous one (e.g. "pillars" meaning literal architectural columns
  // vs. the doctrinal Five Pillars). If the claim invokes a known anchor
  // concept and this evidence only shares the bare anchor word — without
  // the OTHER concepts that would confirm the same intended sense — that
  // match is never trusted enough to clear SUPPORTED or PARTIALLY_SUPPORTED,
  // no matter how high the raw coverage score is.
  //
  // Deliberately checks `top.source.text` ONLY, never `title`: hadith
  // collections are filed under book/chapter titles like "Prayer (Kitab
  // Al-Salat)" that trivially contain a related-concept word regardless of
  // what the specific narration is actually about — titles are
  // organizational metadata, not narrative content, and including them
  // let an unrelated hadith "confirm" via its chapter heading alone.
  //
  // Checks the UNION of every SEARCH QUERY actually dispatched (which
  // always includes the raw claim text as one of them — see
  // retrieve.ts/expandQuery.ts), not just the raw claim text alone. An
  // anchor word can be introduced by query expansion itself (e.g. the
  // phrase bridge "بني على" -> "is built upon" surfaces the word "built",
  // which never appears in the original Arabic) — the gate needs to see
  // that anchor to do its job, since it's deciding whether THIS retrieved
  // evidence actually earned its match, regardless of which formulation
  // found it.
  const claimConceptTokens = new Set(searchQueries.flatMap((q) => tokenize(q)));
  const conceptCoverage = evaluateConceptCoverage(claimConceptTokens, new Set(tokenize(top.source.text)));
  const anchorOnlyMatch = conceptCoverage.anchorInvoked && !conceptCoverage.confirmed;

  if (isComplexClaim(flags)) {
    const reason = ar ? complexityReasonAr(flags) : complexityReason(flags);
    if (top.matchStrength >= 0.35) {
      if (anchorOnlyMatch) {
        return {
          status: "NEEDS_CONTEXT",
          explanation: ar
            ? `هذا الادعاء ${reason} ويشير إلى مفهوم "${conceptCoverage.groupAr}"، لكن أقرب سجل ذي صلة، "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}، يشترك فقط في تلك الكلمة الواحدة دون المفاهيم الأخرى التي قد تؤكد أنه يتحدث عن الأمر نفسه — وهو بحاجة إلى قراءة متأنية قبل اعتباره تأكيدًا.`
            : `This claim ${reason} and references "${conceptCoverage.group}", but the closest related record, "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}, only shares that one word without the other concepts that would confirm it is discussing the same thing — it needs careful reading before it can be considered confirmation.`,
        };
      }
      return {
        status: "PARTIALLY_SUPPORTED",
        explanation: ar
          ? `هذا الادعاء ${reason}، وهو أمر لا يمكن لمطابقة الكلمات المفتاحية وحدها التحقق منه بالكامل. أقرب سجل ذي صلة، "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}، قد يدعم جزءًا من هذا الادعاء لكنه لا يؤكده كما ورد بالضبط.`
          : `This claim ${reason}, which keyword matching alone cannot fully verify. The closest related record, "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}, may support part of this claim but does not confirm it exactly as stated.`,
      };
    }
    if (top.matchStrength >= 0.15) {
      return {
        status: "NEEDS_CONTEXT",
        explanation: ar
          ? `هذا الادعاء ${reason}. "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr} ذو صلة بعيدة ويحتاج إلى قراءة متأنية مقابل الصياغة الدقيقة للادعاء قبل اعتباره تأكيدًا.`
          : `This claim ${reason}. "${top.source.title}" (${top.source.reference}) in the ${sourceLabel} is loosely related but needs careful reading against the claim's exact wording before it can be considered confirmation.`,
      };
    }
    return {
      status: "INSUFFICIENT_EVIDENCE",
      explanation: ar
        ? `هذا الادعاء ${reason}، والأدلة المسترجعة لا تتناوله بوضوح كما ورد.`
        : `This claim ${reason}, and the retrieved evidence does not clearly address it as stated.`,
    };
  }

  // Simple, unqualified claim — still requires a high coverage bar before SUPPORTED.
  if (top.matchStrength >= 0.6) {
    if (anchorOnlyMatch) {
      return {
        status: "NEEDS_CONTEXT",
        explanation: ar
          ? `يشير هذا الادعاء إلى مفهوم "${conceptCoverage.groupAr}"، لكن أقرب تطابق، "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}، يشترك فقط في تلك الكلمة الواحدة دون المفاهيم الأخرى (مثل الصلاة والزكاة والصوم والحج) التي قد تؤكد أنه يتحدث عن المجموعة نفسها بدلاً من استخدام غير ذي صلة لتلك الكلمة.`
          : `This claim references "${conceptCoverage.group}", but the closest match, "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}, only shares that one word without the other concepts (e.g. prayer, zakat, fasting, pilgrimage) that would confirm it is discussing that same grouping rather than an unrelated use of the word.`,
      };
    }
    return {
      status: "SUPPORTED",
      explanation: ar
        ? `يتطابق هذا الادعاء بشكل وثيق مع "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}.`
        : `This claim closely matches "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}.`,
    };
  }
  if (top.matchStrength >= 0.3) {
    if (anchorOnlyMatch) {
      return {
        status: "NEEDS_CONTEXT",
        explanation: ar
          ? `يشير هذا الادعاء إلى مفهوم "${conceptCoverage.groupAr}"، لكن أقرب تطابق، "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}، يشترك فقط في تلك الكلمة الواحدة دون المفاهيم الأخرى التي قد تؤكد أنه يتحدث عن المجموعة نفسها.`
          : `This claim references "${conceptCoverage.group}", but the closest match, "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}, only shares that one word without the other concepts that would confirm it is discussing the same grouping.`,
      };
    }
    return {
      status: "PARTIALLY_SUPPORTED",
      explanation: ar
        ? `هذا الادعاء ذو صلة بـ "${top.source.title}" (${top.source.reference}) في ${sourceLabelAr}، لكن التطابق جزئي — فقد يضيف الادعاء أو يحذف تفاصيل غير موجودة في المصدر.`
        : `This claim is related to "${top.source.title}" (${top.source.reference}) in the ${sourceLabel}, but the match is partial — the claim may add or omit detail not present in the source.`,
    };
  }
  return {
    status: "NEEDS_CONTEXT",
    explanation: ar
      ? `تم العثور على سجل ذي صلة بعيدة، "${top.source.title}" (${top.source.reference})، في ${sourceLabelAr}، لكنه لا يؤكد هذا الادعاء المحدد بوضوح دون سياق إضافي.`
      : `A loosely related record, "${top.source.title}" (${top.source.reference}), was found in the ${sourceLabel}, but it does not clearly confirm this specific claim without more context.`,
  };
}

function complexityReason(flags: ReturnType<typeof detectClaimComplexity>): string {
  const reasons: string[] = [];
  if (flags.negation) reasons.push("contains a negation");
  if (flags.universal) reasons.push("makes a universal claim (\"all\"/\"always\"/\"everyone\"-type wording)");
  if (flags.absolute) reasons.push("asserts an absolute or guaranteed outcome");
  if (flags.numerical) reasons.push("cites a specific number, date, or count");
  if (flags.causal) reasons.push("asserts a cause-and-effect relationship");
  if (flags.multiCondition) reasons.push("involves multiple conditions");
  if (reasons.length === 0) return "has wording that requires careful reading";
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

function complexityReasonAr(flags: ReturnType<typeof detectClaimComplexity>): string {
  const reasons: string[] = [];
  if (flags.negation) reasons.push("يتضمن نفيًا");
  if (flags.universal) reasons.push('يقدّم ادعاءً عامًا شاملاً (بصيغة "كل"/"دائمًا"/"الجميع")');
  if (flags.absolute) reasons.push("يؤكد نتيجة قطعية أو مضمونة");
  if (flags.numerical) reasons.push("يذكر رقمًا أو تاريخًا أو عددًا محددًا");
  if (flags.causal) reasons.push("يفترض علاقة سببية");
  if (flags.multiCondition) reasons.push("يتضمن عدة شروط");
  if (reasons.length === 0) return "صياغته تتطلب قراءة متأنية";
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join("، ")} و${reasons[reasons.length - 1]}`;
}

export async function verifyClaim(
  claimText: string,
  index: number,
  idPrefix: string
): Promise<ClaimResult> {
  const pack = await retrieveEvidencePack(claimText);
  const ranked = await rerankEvidence(claimText, pack.candidates);
  // Reranking only ever reorders/narrows candidates (relevance, not
  // support). Nothing below this line can make a claim SUPPORTED on the
  // strength of a relevance score alone — only heuristicVerify's thresholds
  // or the LLM verify call's own meaning/scope/negation reasoning can.
  const topRanked = ranked.slice(0, EVIDENCE_PACK_SIZE);
  const evidence: EvidenceMatch[] = topRanked.map(toEvidenceMatch);

  function trace(classificationMode: "live" | "heuristic", status: VerificationStatus, finalEvidence: EvidenceMatch[]) {
    logClaimTrace({
      claimText,
      queries: pack.queries,
      expansionMode: pack.expansionMode,
      candidatesConsidered: pack.candidates.length,
      rerankedEvidence: topRanked.map((r) => ({
        sourceId: r.source.id,
        relevanceScore: r.relevanceScore,
        foundByQueries: r.foundByQueries,
      })),
      finalEvidenceIds: finalEvidence.map((e) => e.source.id),
      classificationStatus: status,
      classificationMode,
    });
  }

  if (!isLiveModeAvailable() || evidence.length === 0) {
    const result = heuristicVerify(claimText, evidence, pack.queries);
    trace("heuristic", result.status, evidence);
    return {
      id: `${idPrefix}-${index}`,
      index,
      claimText,
      status: result.status,
      explanation: result.explanation,
      context: result.context,
      evidence,
    };
  }

  try {
    const client = getAnthropicClient();
    const evidenceForPrompt = topRanked.map((r, i) => ({
      index: i,
      reference: r.source.reference,
      title: r.source.title,
      text: r.source.text,
      type: r.source.type,
      sourceDatabase: r.source.isDemo ? "demo" : "live",
      retrievalRelevanceHint: relevanceBucket(r.relevanceScore),
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 768,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: VERIFY_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: JSON.stringify({ claim: claimText, evidence: evidenceForPrompt }),
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("no text block in response");
    }
    const parsed = JSON.parse(block.text) as {
      status: VerificationStatus;
      explanation: string;
      context?: string;
      evidenceIndices: number[];
    };

    const usedEvidence = (parsed.evidenceIndices ?? [])
      .filter((i) => i >= 0 && i < evidence.length)
      .map((i) => evidence[i]);
    const finalEvidence = usedEvidence.length > 0 ? usedEvidence : evidence;

    trace("live", parsed.status, finalEvidence);

    return {
      id: `${idPrefix}-${index}`,
      index,
      claimText,
      status: parsed.status,
      explanation: parsed.explanation,
      context: parsed.context,
      evidence: finalEvidence,
    };
  } catch {
    const result = heuristicVerify(claimText, evidence, pack.queries);
    trace("heuristic", result.status, evidence);
    return {
      id: `${idPrefix}-${index}`,
      index,
      claimText,
      status: result.status,
      explanation: result.explanation,
      context: result.context,
      evidence,
    };
  }
}

function toEvidenceMatch(r: RankedEvidence): EvidenceMatch {
  return { source: r.source, matchStrength: r.matchStrength, matchedTerms: r.matchedTerms };
}

function relevanceBucket(score: number): "high" | "medium" | "low" {
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "medium";
  return "low";
}
