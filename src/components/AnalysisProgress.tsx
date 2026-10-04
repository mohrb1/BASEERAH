import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const ANALYSIS_STAGES = [
  "استخراج المحتوى",
  "تحديد الادعاءات",
  "البحث في المصادر",
  "مطابقة الأدلة",
  "إعداد النتيجة",
] as const;

export function AnalysisProgress({ currentStage }: { currentStage: number }) {
  return (
    <ol className="mx-auto flex max-w-sm flex-col gap-1">
      {ANALYSIS_STAGES.map((label, i) => {
        const num = String(i + 1).padStart(2, "0");
        const isDone = i < currentStage;
        const isActive = i === currentStage;

        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-4 rounded-xl px-4 py-3 transition-colors duration-500",
              isActive && "bg-surface/60"
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-mono transition-all duration-500",
                isDone &&
                  "border-emerald-bright/50 bg-emerald-dim text-emerald-bright",
                isActive &&
                  "animate-pulse-ring border-emerald-bright bg-emerald-dim text-emerald-bright",
                !isDone && !isActive && "border-border-subtle text-muted-2"
              )}
            >
              {isDone ? <Check size={14} /> : num}
            </span>
            <span
              className={cn(
                "text-sm transition-colors duration-500",
                isDone && "text-muted",
                isActive && "font-medium text-foreground",
                !isDone && !isActive && "text-muted-2"
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
