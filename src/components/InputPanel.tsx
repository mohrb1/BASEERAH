"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageUploader } from "@/components/ImageUploader";
import { DEMO_EXAMPLE_TEXT } from "@/lib/demo/exampleInput";
import { ANALYZE_INPUT_KEY } from "@/lib/session";

type Tab = "text" | "image";

const MAX_CHARS = 6000;

export function InputPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputType, setInputType] = useState<"text" | "image">("text");

  function handleAnalyze() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("فضلاً أدخل نصًا أو ارفع صورة قبل التحليل.");
      return;
    }
    sessionStorage.setItem(
      ANALYZE_INPUT_KEY,
      JSON.stringify({ text: trimmed, inputType })
    );
    router.push("/analysis");
  }

  return (
    <section className="mx-auto max-w-2xl px-6">
      <div className="rounded-2xl border border-border-subtle bg-surface p-2 text-right shadow-[0_18px_50px_rgba(24,55,38,0.08)]">
        <div className="flex items-center justify-between border-b border-surface-2 px-3">
          <div className="flex gap-5 text-sm">
            {(["text", "image"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "relative py-4 font-medium transition-colors",
                  tab === t ? "text-emerald" : "text-muted-2 hover:text-foreground"
                )}
              >
                {t === "text" ? "نص" : "صورة"}
                {tab === t && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald" />
                )}
              </button>
            ))}
          </div>
          <span className="hidden items-center gap-2 text-xs text-muted-2 sm:flex">
            <FileSearch size={14} className="text-emerald" />
            تحقّق قائم على المصادر
          </span>
        </div>

        <div className="p-4">
          {tab === "text" ? (
            <>
              <label htmlFor="content" className="sr-only">
                المحتوى المراد التحقق منه
              </label>
              <textarea
                id="content"
                dir="auto"
                value={text}
                onChange={(e) => {
                  setText(e.target.value.slice(0, MAX_CHARS));
                  setInputType("text");
                  setError(null);
                }}
                placeholder="الصق المحتوى الذي تريد التحقق منه..."
                rows={4}
                aria-label="المحتوى المراد تحليله"
                className="min-h-[104px] w-full resize-none bg-transparent px-1 py-3 text-lg leading-9 text-foreground outline-none placeholder:text-muted-2"
              />
              <div className="flex flex-col gap-3 border-t border-surface-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setText(DEMO_EXAMPLE_TEXT);
                    setInputType("text");
                    setTab("text");
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-emerald hover:underline"
                >
                  <Sparkles size={13} />
                  جرّب مثالًا
                </button>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-2" dir="ltr">
                    {text.length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")}
                  </span>
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-bright sm:w-auto"
                  >
                    تحليل ↗
                  </button>
                </div>
              </div>
            </>
          ) : (
            <ImageUploader
              onExtracted={(extracted) => {
                setText(extracted);
                setInputType("image");
                setTab("text");
                setError(null);
              }}
              onError={(msg) => setError(msg)}
            />
          )}
        </div>

        {error && (
          <p role="alert" className="px-4 pb-3 text-xs text-status-unverified">
            {error}
          </p>
        )}
      </div>

      <p className="mt-3 text-center text-xs leading-relaxed text-muted-2">
        الذكاء الاصطناعي يساعد في التحليل، لكن المصدر هو الدليل.
      </p>
    </section>
  );
}
