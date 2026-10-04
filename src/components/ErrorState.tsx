"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

export function ErrorState({
  title = "حدث خطأ ما",
  message,
  retryHref = "/",
  retryLabel = "العودة إلى الصفحة الرئيسية",
  onRetry,
  onRetryLabel = "إعادة المحاولة",
}: {
  title?: string;
  message: string;
  retryHref?: string;
  retryLabel?: string;
  onRetry?: () => void;
  onRetryLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-status-unverified/40 bg-status-unverified/10 text-status-unverified">
        <AlertCircle size={22} />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-emerald px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-bright"
          >
            {onRetryLabel}
          </button>
        )}
        <Link
          href={retryHref}
          className="rounded-xl bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
        >
          {retryLabel}
        </Link>
      </div>
    </div>
  );
}
