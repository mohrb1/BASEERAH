import type { SourceRecord } from "@/types";
import { BookMarked, ExternalLink } from "lucide-react";

const TYPE_LABEL: Record<SourceRecord["type"], string> = {
  quran: "القرآن الكريم",
  hadith: "حديث",
  scholarly_note: "ملاحظة علمية",
};

export function SourceCard({ source }: { source: SourceRecord }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
      <BookMarked size={16} className="mt-0.5 shrink-0 text-emerald" strokeWidth={1.75} />
      <div className="min-w-0 flex-1" dir="auto">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{source.reference}</p>
          <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-muted">
            {TYPE_LABEL[source.type]}
          </span>
          {source.grade && (
            <span className="text-[10px] text-muted-2">{source.grade}</span>
          )}
        </div>
        {source.collection && (
          <p className="mt-0.5 text-xs text-muted">{source.collection}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2" dir="rtl">
          <span
            className={
              source.isDemo
                ? "inline-flex items-center rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted"
                : "inline-flex items-center rounded border border-emerald/30 bg-emerald-dim px-1.5 py-0.5 text-[10px] font-medium text-emerald-bright"
            }
          >
            {source.isDemo ? "مصدر تجريبي" : "مصدر مباشر"}
          </span>

          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-emerald"
            >
              فتح المصدر
              <ExternalLink size={11} />
            </a>
          )}
        </div>

        {source.provider && (
          <p className="mt-1 text-[10px] text-muted-2" dir="auto">
            {source.provider}
          </p>
        )}
      </div>
    </div>
  );
}
