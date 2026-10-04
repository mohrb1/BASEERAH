import type { EvidenceMatch, SourceRecord } from "@/types";
import { SourceProviderError } from "./errors";
import type { SourceAdapter } from "./types";

/**
 * INTEGRATION POINT — NOT WIRED IN. Do not import this from ./index.ts
 * until it has been properly implemented and verified.
 *
 * Sunnah.com runs the most authoritative hadith API available (collections
 * graded by recognized scholars, official sunnah.com citations), but as of
 * this integration:
 *
 *   - https://api.sunnah.com returns 403 without an API key — it requires
 *     registering for a key (historically via a request form linked from
 *     sunnah.com/developers; that page itself also returned 403 to this
 *     app's automated fetch, likely bot protection rather than the page
 *     being gone).
 *   - We have NOT obtained a key, so we have NOT been able to verify the
 *     exact current base URL, auth header, endpoint paths, or response
 *     JSON shape firsthand. Older community docs reference a base URL of
 *     `https://api.sunnah.com/v1` with an `X-API-Key` header and endpoints
 *     like `/collections/{collection}/hadiths/{hadithNumber}`, but this
 *     constructor deliberately does NOT hardcode that as fact — treat it
 *     as a starting point to re-verify, not a confirmed contract.
 *
 * To implement this for real:
 *   1. Request an API key at sunnah.com (see their developer page).
 *   2. Make one real authenticated request and confirm the response shape
 *      against what's assumed above — field names, pagination, grading
 *      format, and the collection slug list.
 *   3. Fill in `search()` and `getById()` below using the verified shape.
 *   4. Read SUNNAH_API_KEY from `process.env` only in this server-side
 *      file — never pass it to a client component or expose it in any
 *      response body.
 *   5. Wire it into src/lib/sources/liveAdapter.ts (e.g. as a third
 *      provider alongside Quran/Hadith-CDN, preferred over the CDN
 *      adapter when SUNNAH_API_KEY is set) and update README.md.
 *
 * Until then, this class exists only to document the extension point.
 * Instantiating and calling it will throw rather than silently return
 * fabricated or incorrect data.
 */
export class SunnahApiAdapter implements SourceAdapter {
  readonly name = "Sunnah.com API (not yet implemented)";
  readonly isDemo = false;

  private readonly apiKey = process.env.SUNNAH_API_KEY;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept to match SourceAdapter; see class comment
  async search(_query: string, _limit?: number): Promise<EvidenceMatch[]> {
    throw new SourceProviderError(
      this.name,
      this.apiKey
        ? "SUNNAH_API_KEY is set but this adapter's request/response handling has not been implemented or verified yet — see the class-level comment in sunnahApiAdapter.ts"
        : "SUNNAH_API_KEY is not configured"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept to match SourceAdapter; see class comment
  async getById(_id: string): Promise<SourceRecord | null> {
    throw new SourceProviderError(this.name, "not implemented");
  }
}
