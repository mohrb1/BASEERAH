import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="w-full border-b border-border-subtle bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-dim text-emerald">
            <ShieldCheck size={18} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-emerald-bright">
              BASEERAH
            </span>
            <span className="font-arabic mt-1 text-[13px] text-muted">بصيرة</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
