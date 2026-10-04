import type { AnalysisResult } from "@/types";

function claimsCountText(count: number): string {
  if (count === 0) return "لم يتم تحديد أي ادعاء قابل للتحقق في هذا المحتوى.";
  if (count === 1) return "تم تحديد ادعاء واحد.";
  if (count === 2) return "تم تحديد ادعاءين.";
  if (count >= 3 && count <= 10) return `تم تحديد ${count} ادعاءات.`;
  return `تم تحديد ${count} ادعاءً.`;
}

export function ResultSummary({ result }: { result: AnalysisResult }) {
  const count = result.claims.length;
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          نتائج التحليل
        </h1>
        {result.mode === "demo" && (
          <span className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted">
            وضع تجريبي
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{claimsCountText(count)}</p>
    </div>
  );
}
