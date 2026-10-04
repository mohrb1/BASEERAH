"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { ResultSummary } from "@/components/ResultSummary";
import { ClaimCard } from "@/components/ClaimCard";
import { EmptyState } from "@/components/EmptyState";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ANALYZE_RESULT_KEY } from "@/lib/session";
import type { AnalysisResult } from "@/types";

export default function ResultsPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(ANALYZE_RESULT_KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage, a browser-only external system unavailable during SSR
        setResult(JSON.parse(raw));
      } catch {
        setResult(null);
      }
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <EmptyState
            title="لا توجد نتائج بعد"
            message="حلّل محتوى من الصفحة الرئيسية لترى الادعاءات والأدلة والمصادر هنا."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <ResultSummary result={result} />
        <MethodologyNote />

        {result.claims.length === 0 ? (
          <EmptyState
            title="لم يتم العثور على ادعاءات قابلة للتحقق"
            message="لم نتمكن من تحديد أي ادعاء قابل للتحقق في هذا المحتوى. جرّب نصًا مختلفًا، أو نصًا يتضمّن عبارة واقعية أو دينية محددة."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {result.claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-muted transition-colors hover:text-emerald"
          >
            تحليل محتوى آخر
          </Link>
        </div>
      </main>
    </div>
  );
}
