import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { InputPanel } from "@/components/InputPanel";
import { Check, Link2, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center py-3 sm:py-4">
        <Hero />
        <InputPanel />

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 px-6 pb-2 text-xs text-muted-2">
          <span className="flex items-center gap-2">
            <Check size={14} className="text-emerald" />
            تحليل الادعاءات
          </span>
          <span className="flex items-center gap-2">
            <Link2 size={14} className="text-emerald" />
            مصادر قابلة للتتبع
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald" />
            بصيرة أداة تحقق وليست مرجعًا للفتوى
          </span>
        </div>
      </main>
    </div>
  );
}
