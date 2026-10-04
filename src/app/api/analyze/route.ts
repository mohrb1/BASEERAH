import { NextRequest, NextResponse } from "next/server";
import { extractClaims } from "@/lib/ai/extractClaims";
import { verifyClaim } from "@/lib/verification/verify";
import type { AnalysisResult, AnalyzeRequestBody, ApiErrorResponse } from "@/types";

const MAX_TEXT_LENGTH = 6000;
const ANALYSIS_TIMEOUT_MS = 45000;

function errorResponse(code: ApiErrorResponse["code"], error: string, status: number) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

class AnalysisTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AnalysisTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function POST(req: NextRequest) {
  let body: AnalyzeRequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("UNKNOWN", "Invalid request body.", 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return errorResponse("EMPTY_INPUT", "Please provide some text to analyze.", 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return errorResponse(
      "TEXT_TOO_LONG",
      `Text is too long (max ${MAX_TEXT_LENGTH} characters).`,
      400
    );
  }

  try {
    const result = await withTimeout(runAnalysis(text, body.inputType), ANALYSIS_TIMEOUT_MS);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AnalysisTimeoutError) {
      return errorResponse(
        "TIMEOUT",
        "استغرق التحليل وقتًا أطول من المتوقع. فضلاً حاول مرة أخرى.",
        504
      );
    }
    console.error("[/api/analyze]", err);
    return errorResponse(
      "VERIFICATION_FAILED",
      "Something went wrong while analyzing this content. Please try again.",
      500
    );
  }
}

async function runAnalysis(
  text: string,
  inputType: AnalyzeRequestBody["inputType"]
): Promise<AnalysisResult> {
  const { claims: claimTexts, mode } = await extractClaims(text);

  if (claimTexts.length === 0) {
    return {
      id: `analysis-${Date.now()}`,
      createdAt: new Date().toISOString(),
      mode,
      inputType: inputType === "image" ? "image" : "text",
      originalText: text,
      claims: [],
    };
  }

  const idPrefix = `claim-${Date.now()}`;
  const claims = await Promise.all(
    claimTexts.map((claimText, index) => verifyClaim(claimText, index, idPrefix))
  );

  return {
    id: `analysis-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode,
    inputType: inputType === "image" ? "image" : "text",
    originalText: text,
    claims,
  };
}
