"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  onExtracted: (text: string) => void;
  onError: (message: string) => void;
}

export function ImageUploader({ onExtracted, onError }: ImageUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      onError("فضلاً ارفع ملف صورة (PNG أو JPG أو WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError("حجم الصورة كبير جدًا. فضلاً ارفع ملفًا أقل من 10 ميجابايت.");
      return;
    }

    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    setIsProcessing(true);
    setProgress(0);

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", undefined, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(m.progress);
          }
        },
      });
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();

      const cleaned = text.trim();
      if (!cleaned) {
        onError(
          "لم يتم العثور على نص قابل للقراءة في هذه الصورة. جرّب لقطة شاشة أوضح أو الصق النص مباشرة."
        );
      } else {
        onExtracted(cleaned);
      }
    } catch {
      onError(
        "تعذّر استخراج النص من هذه الصورة (قد يحدث هذا بدون اتصال بالإنترنت). فضلاً الصق النص مباشرة بدلاً من ذلك."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function clear() {
    setPreviewUrl(null);
    setFileName(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="رفع صورة المنشور"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {!previewUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center transition-colors",
            "hover:border-emerald-bright/50 hover:bg-surface"
          )}
        >
          <ImageUp className="text-muted" size={28} strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-foreground">ارفع صورة المنشور</p>
            <p className="mt-1 text-xs text-muted">PNG أو JPG · حتى 10 ميجابايت</p>
          </div>
        </button>
      ) : (
        <div className="relative rounded-xl border border-border-subtle bg-surface/40 p-4">
          <button
            type="button"
            onClick={clear}
            aria-label="إزالة الصورة"
            className="absolute right-3 top-3 rounded-full bg-surface-2 p-1.5 text-muted transition-colors hover:text-foreground"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="معاينة الصورة المرفوعة"
              className="h-20 w-20 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">{fileName}</p>
              {isProcessing ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  جارٍ استخراج النص… {Math.round(progress * 100)}%
                </div>
              ) : (
                <p className="mt-2 text-xs text-status-supported">تم استخراج النص</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
