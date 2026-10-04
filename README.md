# BASEERAH | بصيرة

> "Don't just get an answer. Know its source."

BASEERAH is an AI-assisted tool for analyzing Islamic content claims and tracing them back to retrieved evidence and sources. It is **not** a fatwa service, does not issue religious rulings, and does not guarantee correctness — it surfaces what claims were made, what evidence was found for them, and where that evidence came from, so a human can judge for themselves.

**BASEERAH prefers uncertainty over unsupported certainty.** A false "this is SUPPORTED" is a worse failure than an unnecessary "insufficient evidence" — the whole point of the product is accurate verification, so overclaiming support is the one failure mode the system is deliberately biased against. See [Verification safety](#verification-safety) for how that's enforced in both the LLM and heuristic paths.

```
Input (text or image)
  → OCR / text extraction
  → Claim extraction (LLM or heuristic)
  → Source retrieval        (Live providers, falling back to Demo)
  → Evidence matching        (keyword-coverage ranking)
  → Verification             (LLM or heuristic, grounded only in retrieved evidence)
  → Results (claim, status, evidence, source, context)
```

---

## Running it

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run test      # vitest unit suite
npm run lint
```

No environment variables are required to run the full flow — see [Environment variables](#environment-variables).

---

## Architecture

### The SourceAdapter abstraction

Everything that retrieves evidence implements one interface, `SourceAdapter` (`src/lib/sources/types.ts`):

```ts
interface SourceAdapter {
  readonly name: string;
  readonly isDemo: boolean;
  search(query: string, limit?: number): Promise<EvidenceMatch[]>;
  getById(id: string): Promise<SourceRecord | null>;
}
```

Every `SourceRecord` returned by any adapter carries:

- `isDemo: boolean` — was this a curated local record or a live fetch? The UI always shows this (`Demo Source` / `Live Source` badge) — demo data is never presented as if it came from a live database.
- `sourceUrl?: string` — a real, verified, clickable canonical URL (AlQuran Cloud / sunnah.com). Only ever a URL that was independently verified to load (see "Source Providers" below) — never fabricated.
- `provider?: string` — which provider/translation produced this record, for transparency.

Implementations:

| File | What it is |
|---|---|
| `src/lib/sources/demoAdapter.ts` | Curated local dataset (`demoData.ts`, 7 records). Always available, zero network calls. |
| `src/lib/sources/quranAdapter.ts` | Live Quran search via the AlQuran Cloud API (keyless, public). |
| `src/lib/sources/hadithAdapter.ts` | Live Hadith search via the hadith-api CDN (keyless, public domain), with local keyword ranking over fetched collections. |
| `src/lib/sources/liveAdapter.ts` | `CompositeLiveSourceAdapter` — merges the two live adapters above. |
| `src/lib/sources/index.ts` | `getSourceAdapter()` — the **only** place calling code should import from. Wraps the composite live adapter with automatic fallback to Demo. |
| `src/lib/sources/sunnahApiAdapter.ts` | Documented, **not wired in** extension point for a future Sunnah.com API integration. See [Adding another source provider](#adding-another-trusted-source-provider). |

Callers (`src/lib/verification/verify.ts`) only ever call `getSourceAdapter()` — they have no idea whether they're talking to Demo or Live, and don't need to; every `SourceRecord` self-reports that.

### Demo Mode vs. Live Mode — two independent axes

There are two separate "demo vs. live" switches in this app, and they are intentionally decoupled:

1. **AI mode** (`AnalysisResult.mode`: `"demo" | "live"`) — whether an `ANTHROPIC_API_KEY` is configured. Controls claim extraction and verification *reasoning*. Shown as a "Demo Mode" badge at the top of the Results page.
2. **Source mode** (`SourceRecord.isDemo`, per evidence item) — whether a given piece of evidence came from the local curated dataset or a live external API. Shown as a "Demo Source" / "Live Source" badge on every evidence card, with a clickable link to the real source when available.

You can be in "AI demo mode" (no Claude key) while still pulling real, live evidence from AlQuran Cloud / hadith-api — and you can be in "AI live mode" while the source layer has silently fallen back to Demo because the live providers were briefly unreachable. Both combinations are valid and both are always labeled honestly.

### Retrieval pipeline

1. **Normalize** — lowercase, strip diacritics/punctuation, tokenize, drop stopwords (`src/lib/sources/textUtils.ts`).
2. **Extract keywords** — for providers that only support keyword/phrase search (AlQuran Cloud), the most distinctive (longest) tokens are probed individually (`topKeywords`), since the claim's full sentence is almost never a verbatim substring of any translation.
3. **Search the provider** — AlQuran Cloud's real search endpoint for Quran; a locally-cached full-collection fetch + scan for Hadith (there is no public keyless Hadith search endpoint — see limitations below).
4. **Rank locally** — every adapter scores candidates with the same `scoreOverlap()` function: *query coverage* (what fraction of the claim's meaningful keywords appear in this evidence), not a length-normalized similarity score. This was a deliberate fix — an earlier cosine-style formula ranked a short, loosely-related verse above the actual best match purely because the best match's full verse text was longer. Coverage doesn't have that bias. Candidates below a minimum specificity floor (`matchedTerms.length >= 2`, to filter out single-coincidental-word noise on a large live corpus) are discarded.
5. **Return ranked `EvidenceMatch[]`** with the original source text preserved exactly — nothing is reworded or summarized by the retrieval layer.

### Verification

`src/lib/verification/verify.ts`:

- If `ANTHROPIC_API_KEY` is set, the retrieved evidence (with each item explicitly labeled `demo` or `live`) is sent to Claude for semantic verification (see [Verification safety](#verification-safety)).
- If no key is set (or the call fails), a conservative heuristic fallback runs instead — also described below.
- **No numerical confidence score is ever shown.** There is no technically-grounded way to calibrate one from keyword coverage, and showing a fake number would overstate precision.

### Verification safety

Keyword/coverage matching cannot tell the difference between "evidence that supports this claim" and "evidence that merely shares vocabulary with it." A claim can share almost every word with a source while asserting something narrower, broader, negated, conditional, or simply different — and early testing surfaced exactly that failure: claims like *"fasting guarantees instant Paradise no matter what"* were coming back `SUPPORTED` purely because they shared enough words with a real hadith about fasting. That's the one failure mode this product cannot afford, so both verification paths are deliberately biased toward saying "not sure" over guessing.

**LLM mode.** The system prompt (`SYSTEM_PROMPT` in `verify.ts`) explicitly instructs the model that lexical similarity is not evidentiary support, and requires it to separately check, before ever choosing `SUPPORTED`:

- **exact meaning** — the same thing, not just a related thing
- **scope** — a universal claim ("all"/"always"/"everyone") is not supported by evidence about one case
- **qualifiers** — "guaranteed"/"automatically"/"must" asserts more certainty than most evidence states
- **negation** — shared vocabulary with opposite polarity is not support
- **subject** — the evidence must be about the same actor/subject
- **numbers/dates** — the evidence must state the same figure, not just be topically related
- **causal and multi-part claims** — every condition must actually be addressed

The prompt also states explicitly: *when genuinely uncertain between two statuses, choose the more conservative one* — a false `SUPPORTED` is treated as a worse outcome than an unnecessary `INSUFFICIENT_EVIDENCE` or `NEEDS_CONTEXT`.

**Heuristic (no-API-key) mode** has no semantic understanding at all, so it's hardened structurally rather than persuasively. `src/lib/verification/claimComplexity.ts` detects, with cheap regex signals, whether a claim contains:

| Signal | Example trigger |
|---|---|
| Negation | "not", "never", "without", "n't" |
| Universal wording | "all", "every", "always", "everyone" |
| Absolute/guaranteed outcome | "guaranteed", "automatically", "no matter what" |
| A specific number/date/count | "2090", "five times a day" |
| Causal relationship | "because", "leads to", "results in" |
| Multiple conditions | "if … unless …", repeated "and" |
| Speculative/predictive wording | "predicted", "rumor", "a scholar said" |

**Any claim matching one of the first six signals can never be auto-classified `SUPPORTED` by the heuristic, no matter how high its keyword-coverage score is.** It's capped at `PARTIALLY_SUPPORTED` (coverage ≥ 0.35), `NEEDS_CONTEXT` (≥ 0.15), or `INSUFFICIENT_EVIDENCE` below that. A claim with no complexity signal still needs coverage ≥ 0.6 — not just "some overlap" — before `SUPPORTED`. A speculative/predictive claim with no retrieved evidence at all returns `UNVERIFIED` instead of `INSUFFICIENT_EVIDENCE`, since it's not the kind of statement text evidence could confirm or deny either way.

This means **Demo Mode will say "insufficient evidence" or "needs context" more often than it will confidently confirm something** — that's intentional. See `src/lib/verification/claimComplexity.test.ts` and the "conservative classification scenarios" block in `verify.test.ts` for the test coverage (overstated claims, negation, universal claims, numerical claims, unrelated/speculative claims, and the one case that *should* still say `SUPPORTED`).

---

## Source Providers

### Live — Quran: [AlQuran Cloud API](https://alquran.cloud/api)

- Public, keyless, no documented rate limit.
- Search: `GET https://api.alquran.cloud/v1/search/{keyword}/{surah|all}/{edition}` — a real free-text search across translation text (not semantic; literal phrase/keyword matching).
- Direct lookup: `GET https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/{edition}`.
- Canonical URL: `https://alquran.cloud/ayah/{surah}:{ayah}` — verified to load and show the correct verse.
- Default edition for direct lookups: `en.sahih` (Saheeh International).

### Live — Hadith: [hadith-api](https://github.com/fawazahmed0/hadith-api) (fawazahmed0, served via jsDelivr CDN)

- Public domain (Unlicense), keyless, no documented rate limit, static JSON per collection.
- No search endpoint exists, so the app fetches each configured collection's full English edition once (`GET https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{edition}.min.json`), caches it in memory for the process lifetime, and searches it locally.
- Configured collections: Sahih al-Bukhari, Sahih Muslim, Jami at-Tirmidhi, Sunan Abi Dawud.
- Each hadith record includes real `grades` (scholar name + grade, e.g. `"Al-Albani: Sahih"`) when the source data has them. Bukhari and Muslim entries with no explicit grade array are labeled `"Sahih (by scholarly consensus)"` — well-documented public knowledge about those two collections specifically, not an inference about the hadith's content.
- Canonical URL: `https://sunnah.com/{collection}:{number}` — sunnah.com's well-known public URL scheme, using the exact same collection slugs as this provider. Verified to load with a browser user agent (sunnah.com blocks some automated/bot requests, which is why a plain server-side fetch to sunnah.com itself was not used for data — see limitations).

### Demo — curated local dataset (`src/lib/sources/demoData.ts`)

Seven hand-picked, uncontroversial Quran/hadith records, used as:
- The deterministic fallback when live providers are unreachable.
- The dataset for `BASEERAH_FORCE_DEMO_SOURCES=true` (offline/deterministic runs).

Every demo record now also carries a real, independently-verified `sourceUrl` (same alquran.cloud / sunnah.com patterns as above) — demo mode is "curated," not "fake."

### Not integrated — Sunnah.com API

Sunnah.com runs the most authoritative hadith API available, but `api.sunnah.com` returns `403` without a registered API key, and we have not obtained one or verified the current request/response contract firsthand. Per the project's no-fabrication rule, we did **not** guess at the API shape and ship it. Instead, `src/lib/sources/sunnahApiAdapter.ts` documents exactly what's needed to add it for real — see below.

---

## Environment variables

| Variable | Required? | Default | Effect |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | unset | Enables Claude-based claim extraction and verification. Without it, a heuristic pipeline runs instead. |
| `BASEERAH_FORCE_DEMO_SOURCES` | No | `false` | Set to `true` to always use the local Demo Source Layer and skip live retrieval entirely. |
| `SUNNAH_API_KEY` | No | unset | Not yet integrated — read by the documented-but-unwired `sunnahApiAdapter.ts` stub only. |

No API key used anywhere in this app is ever read in a client component — all of the above are read only in server-side files (API routes / server-only modules under `src/lib`).

---

## Limitations

- **Keyword retrieval, not semantic search.** Evidence ranking is based on literal keyword/coverage overlap, not meaning. A claim can retrieve a topically-adjacent but not-quite-right hadith (e.g. a hadith that happens to share several words with the claim without being the most canonical citation on the topic). This is a known, disclosed limitation of a keyless, no-ML-infrastructure retrieval layer — the methodology note on the Results page says so explicitly.
- **The heuristic verification fallback (no API key) has no real semantic understanding.** It's hardened against the specific, serious failure mode of calling an overstated/negated/universal claim "SUPPORTED" from keyword overlap alone (see [Verification safety](#verification-safety)), but its complexity detection is regex-based pattern matching, not language understanding — it can both over-flag (treating an innocuous "and" as a multi-condition claim) and under-flag (a claim that overstates its evidence in a way none of the seven signals happen to catch). Real semantic judgment is the LLM path's job.
- **hadith-api (fawazahmed0)'s translations are community-maintained**, not an official publisher's edition. They're public domain and widely used in open-source Islamic software, but are not a substitute for consulting a scholar or the original Arabic for anything consequential.
- **AlQuran Cloud's search is literal substring/phrase matching**, not semantic — it only finds a verse if one of the probed keywords appears in at least one hosted translation's text.
- **No rate-limit documentation exists for either live provider.** Both have run reliably in testing with no observed throttling, but there is no SLA. `SourceProviderError` + automatic Demo fallback exists specifically to handle this gracefully if it ever happens.

---

## Adding another trusted source provider

1. Implement `SourceAdapter` (`src/lib/sources/types.ts`) in a new file under `src/lib/sources/`.
2. Verify the provider's endpoints actually exist and work (status 200, expected JSON shape) **before** writing adapter code against assumed field names — see `sunnahApiAdapter.ts`'s header comment for what "not yet verified" looks like when you can't do this step.
3. Throw `SourceProviderError` (`src/lib/sources/errors.ts`) on network failure, timeout, rate limit, or malformed response — never return fabricated data. Use the `fetchJson()` helper in the same file for consistent timeout/error handling.
4. Return an empty array from `search()` when the provider was reached successfully but found nothing — that's a different, non-error case (`INSUFFICIENT_EVIDENCE` downstream), not a failure.
5. Only ever set `sourceUrl` to a URL you've independently confirmed loads and shows the cited content.
6. Wire it into `src/lib/sources/liveAdapter.ts` (or build a new composite) and read any secret exclusively via `process.env` in that server-side file.
7. Add it to `getSourceAdapter()` in `src/lib/sources/index.ts` if it should participate in the default live-with-demo-fallback chain.
8. Add tests mirroring `quranAdapter.test.ts` / `hadithAdapter.test.ts`: provider failure → `SourceProviderError`, empty results, real-URL preservation, no fabricated evidence.

---

## Project structure

```
src/
  app/                 Next.js routes (/, /analysis, /results, /api/analyze)
  components/          UI components
  lib/
    ai/                Claude client + claim extraction
    sources/           SourceAdapter + all provider implementations (this doc's focus)
    verification/      Evidence-grounded status classification
    ocr/ (client-side) Tesseract.js text extraction from uploaded images
  types/               Shared TypeScript types
```
