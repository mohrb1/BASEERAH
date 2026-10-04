import type { EvidenceMatch } from "@/types";
import { SourceCard } from "@/components/SourceCard";
import { Quote } from "lucide-react";

export function EvidenceCard({ evidence }: { evidence: EvidenceMatch }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-xl border border-border-subtle bg-surface/60 p-4 pl-5">
        <Quote
          size={14}
          className="absolute left-1.5 top-4 text-emerald-bright/60"
          strokeWidth={2}
        />
        <p className="text-sm italic leading-relaxed text-foreground/90" dir="auto">
          {evidence.source.text}
        </p>
      </div>
      <SourceCard source={evidence.source} />
    </div>
  );
}
