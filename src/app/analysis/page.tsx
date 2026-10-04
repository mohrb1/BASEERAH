"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { AnalysisProgress, ANALYSIS_STAGES } from "@/components/AnalysisProgress";
import { ErrorState } from "@/components/ErrorState";
import { ANALYZE_INPUT_KEY, ANALYZE_RESULT_KEY, type StoredAnalyzeInput } from "@/lib/session";
import type { ApiErrorResponse } from "@/types";

const STAGE_INTERVAL_MS = 850;
const MAX_AUTO_STAGE = ANALYSIS_STAGES.length - 2; // hold before the final stage until fetch resolves
const REQUEST_TIMEOUT_MS = 50000;
const GENERIC_ERROR = "تعذّر التحليل، فضلاً حاول مرة أخرى.";
const TIMEOUT_ERROR = "استغرق التحليل وقتًا طويلاً جدًا. فضلاً حاول مرة أخرى.";

export default function AnalysisPage() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [missingInput, setMissingInput] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(false);
  const inputRef = useRef<StoredAnalyzeInput | null>(null);
  const latestAttemptRef = useRef(0);

  useEffect(() => {
    latestAttemptRef.current = attempt;
    const raw = sessionStorage.getItem(ANALYZE_INPUT_KEY);
    if (!raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage, a browser-only external system unavailable during SSR
      setMissingInput(true);
      return;
    }

    try {
      inputRef.current = JSON.parse(raw);
    } catch {
      setMissingInput(true);
      return;
    }

    // Skip the duplicate run from React's effect double-invoke in dev, but
    // still allow every explicit retry (attempt > 0) to fire a real request.
    if (attempt === 0) {
      if (startedRef.current) return;
      startedRef.current = true;
    }

    const input = inputRef.current;
    if (!input) return;

    setStage(0);
    setError(null);

    const interval = setInterval(() => {
      setStage((s) => (s < MAX_AUTO_STAGE ? s + 1 : s));
    }, STAGE_INTERVAL_MS);

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const myAttempt = attempt;

    async function run() {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          throw new Error(errBody?.error ?? GENERIC_ERROR);
        }

        const result = await res.json();
        // A newer retry superseded this request while it was in flight.
        if (latestAttemptRef.current !== myAttempt) return;

        clearInterval(interval);
        clearTimeout(timeoutTimer);
        setStage(ANALYSIS_STAGES.length - 1);
        sessionStorage.setItem(ANALYZE_RESULT_KEY, JSON.stringify(result));

        setTimeout(() => {
          router.push("/results");
        }, 500);
      } catch (e) {
        if (latestAttemptRef.current !== myAttempt) return;
        clearInterval(interval);
        clearTimeout(timeoutTimer);
        const isAbort = e instanceof DOMException && e.name === "AbortError";
        setError(isAbort ? TIMEOUT_ERROR : e instanceof Error ? e.message : GENERIC_ERROR);
      }
    }

    run();

    // Intentionally does not abort `controller` here: React's dev-mode
    // effect double-invoke on initial mount would otherwise cancel the one
    // real request before it ever resolves. The AbortController exists
    // solely to enforce REQUEST_TIMEOUT_MS above, not to cancel on cleanup.
    return () => {
      clearInterval(interval);
      clearTimeout(timeoutTimer);
    };
  }, [router, attempt]);

  function retry() {
    setAttempt((a) => a + 1);
  }

  if (missingInput) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <ErrorState
            title="لا يوجد محتوى للتحليل"
            message="لم نجد أي محتوى لتحليله. فضلاً عد إلى الصفحة الرئيسية وأدخل نصًا أو ارفع صورة."
          />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <ErrorState title="تعذّر التحليل" message={error} onRetry={retry} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <p className="mb-10 text-xs font-medium uppercase tracking-widest text-muted-2">
          جارٍ تحليل المحتوى
        </p>
        <AnalysisProgress currentStage={stage} />
      </main>
    </div>
  );
}
