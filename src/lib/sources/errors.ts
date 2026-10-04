/**
 * Thrown by a SourceAdapter when the underlying provider could not be
 * reached or returned something unusable — network failure, timeout,
 * rate limit, non-2xx status, or a response that doesn't match the
 * expected shape.
 *
 * This is distinct from a normal "no matches" result (which is just an
 * empty array). Callers (see ./index.ts) catch this specifically to
 * decide whether to fall back to the Demo Source Layer.
 */
export class SourceProviderError extends Error {
  readonly provider: string;
  readonly cause2?: unknown;

  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "SourceProviderError";
    this.provider = provider;
    this.cause2 = cause;
  }
}

/** Wraps `fetch` with a hard timeout and turns network/HTTP failures into a SourceProviderError. */
export async function fetchJson<T>(
  provider: string,
  url: string,
  timeoutMs = 6000
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new SourceProviderError(
      provider,
      isTimeout ? `request timed out after ${timeoutMs}ms` : "network request failed",
      err
    );
  }

  if (res.status === 404) {
    throw new NotFoundSignal(provider);
  }
  if (res.status === 429) {
    throw new SourceProviderError(provider, "rate limited (429)");
  }
  if (!res.ok) {
    throw new SourceProviderError(provider, `unexpected HTTP ${res.status}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new SourceProviderError(provider, "malformed JSON response", err);
  }
}

/** Internal signal for "the provider affirmatively said no results" (e.g. AlQuran Cloud's 404-on-no-match). Not a failure. */
export class NotFoundSignal extends Error {
  constructor(provider: string) {
    super(`[${provider}] no results`);
    this.name = "NotFoundSignal";
  }
}
