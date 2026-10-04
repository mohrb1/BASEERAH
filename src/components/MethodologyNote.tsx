import { Info } from "lucide-react";

export function MethodologyNote() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
      <Info size={15} className="mt-0.5 shrink-0 text-muted-2" strokeWidth={1.75} />
      <p className="text-xs leading-relaxed text-muted-2">
        تستخدم بصيرة الذكاء الاصطناعي لتحليل الادعاءات ومقارنتها بالمصادر
        المسترجعة. النص الذي يولّده الذكاء الاصطناعي لا يُعتبر دليلاً بحد
        ذاته — فكل حالة تحقق أعلاه مبنية على الدليل والمصدر الموضّحين أسفله.
        يُشار إلى كل دليل بأنه <span className="text-muted">مصدر تجريبي</span> (بيانات
        محلية منسّقة) أو <span className="text-emerald-bright">مصدر مباشر</span> (مسترجع
        فوريًا من مزوّد خارجي موثّق).
      </p>
    </div>
  );
}
