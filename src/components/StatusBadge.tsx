import type { VerificationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Check, CircleDot, AlertTriangle, HelpCircle, CircleSlash } from "lucide-react";

const STATUS_CONFIG: Record<
  VerificationStatus,
  { label: string; icon: typeof Check; className: string }
> = {
  SUPPORTED: {
    label: "مدعوم بالمصدر",
    icon: Check,
    className: "text-status-supported border-status-supported/40 bg-status-supported/10",
  },
  PARTIALLY_SUPPORTED: {
    label: "مدعوم جزئيًا",
    icon: CircleDot,
    className: "text-status-partial border-status-partial/40 bg-status-partial/10",
  },
  NEEDS_CONTEXT: {
    label: "يحتاج إلى سياق",
    icon: AlertTriangle,
    className: "text-status-context border-status-context/40 bg-status-context/10",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "الأدلة غير كافية",
    icon: HelpCircle,
    className: "text-status-insufficient border-status-insufficient/40 bg-status-insufficient/10",
  },
  UNVERIFIED: {
    label: "غير متحقق منه",
    icon: CircleSlash,
    className: "text-status-unverified border-status-unverified/40 bg-status-unverified/10",
  },
};

export function StatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        config.className,
        className
      )}
    >
      <Icon size={13} strokeWidth={2.5} />
      {config.label}
    </span>
  );
}
