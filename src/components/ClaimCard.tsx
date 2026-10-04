"use client";

import { useState } from "react";
import type { ClaimResult } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { EvidenceCard } from "@/components/EvidenceCard";
import { ChevronDown } from "lucide-react";
import { cn, toArabicDigits } from "@/lib/utils";

export function ClaimCard({ claim }: { claim: ClaimResult }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="animate-fade-in-up overflow-hidden rounded-2xl border border-border-subtle bg-surface/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-6"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono tracking-widest text-muted-2">
            الادعاء {toArabicDigits(String(claim.index + 1).padStart(2, "0"))}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground sm:text-base" dir="auto">
            {claim.claimText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge status={claim.status} />
          <ChevronDown
            size={16}
            className={cn("text-muted transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border-subtle px-5 py-5">
          <Section title="لماذا؟">
            <p className="text-sm leading-relaxed text-muted" dir="auto">{claim.explanation}</p>
          </Section>

          {claim.context && (
            <Section title="السياق">
              <p className="text-sm leading-relaxed text-muted" dir="auto">{claim.context}</p>
            </Section>
          )}

          {claim.evidence.length > 0 ? (
            <Section title={claim.evidence.length > 1 ? "الأدلة والمصادر" : "الدليل والمصدر"}>
              <div className="flex flex-col gap-4">
                {claim.evidence.map((e) => (
                  <EvidenceCard key={e.source.id} evidence={e} />
                ))}
              </div>
            </Section>
          ) : (
            <Section title="الأدلة">
              <p className="text-sm leading-relaxed text-muted-2">
                الأدلة غير كافية للتحقق من هذا الادعاء. لم يتم العثور على سجل
                مطابق في قاعدة المصادر الحالية.
              </p>
            </Section>
          )}

          <Section title="درجة اليقين">
            <p className="text-xs leading-relaxed text-muted-2">
              لا تُصدر بصيرة درجة يقين رقمية للمحتوى الديني. راجع الدليل
              والمصدر أعلاه لتكوين حكمك الخاص — هذه الأداة تقدّم تحقّقًا
              بمساعدة الذكاء الاصطناعي، وليست فتوى دينية.
            </p>
          </Section>
        </div>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-2">
        {title}
      </h4>
      {children}
    </div>
  );
}
