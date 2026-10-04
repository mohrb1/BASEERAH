export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-4 pb-2 text-center lg:pt-5">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald/20 bg-emerald-dim px-3 py-1.5 text-xs text-emerald-bright">
        <span className="size-1.5 rounded-full bg-emerald" />
        أداة ذكية للتحقق من المحتوى الإسلامي
      </div>
      <h1 className="animate-fade-in-up text-3xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-4xl lg:text-4xl">
        لا تكتفِ بالإجابة،
        <br />
        <span className="text-emerald">اعرف مصدرها.</span>
      </h1>
      <p
        className="animate-fade-in-up mx-auto mt-2 max-w-xl text-balance text-base leading-relaxed text-muted sm:text-lg"
        style={{ animationDelay: "80ms" }}
      >
        حلّل المحتوى الإسلامي، تحقّق من الادعاءات، واعرف مصدرها الموثوق.
      </p>
    </section>
  );
}
