import { Inbox } from "lucide-react";
import Link from "next/link";

export function EmptyState({
  title,
  message,
  actionHref = "/",
  actionLabel = "العودة إلى الصفحة الرئيسية",
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface text-muted">
        <Inbox size={20} />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      <Link
        href={actionHref}
        className="mt-2 rounded-xl bg-emerald px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-emerald-bright"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
