import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, NotFoundSignal, SourceProviderError } from "./errors";

function mockFetchOnce(impl: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed JSON on a 200 response", async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ hello: "world" }), { status: 200 }));
    const result = await fetchJson<{ hello: string }>("test-provider", "https://example.com");
    expect(result).toEqual({ hello: "world" });
  });

  it("throws NotFoundSignal (not SourceProviderError) on 404", async () => {
    mockFetchOnce(() => new Response("not found", { status: 404 }));
    await expect(fetchJson("test-provider", "https://example.com")).rejects.toBeInstanceOf(
      NotFoundSignal
    );
  });

  it("throws SourceProviderError on 429 rate limit", async () => {
    mockFetchOnce(() => new Response("too many requests", { status: 429 }));
    await expect(fetchJson("test-provider", "https://example.com")).rejects.toThrow(
      SourceProviderError
    );
  });

  it("throws SourceProviderError on a 5xx server error", async () => {
    mockFetchOnce(() => new Response("boom", { status: 503 }));
    await expect(fetchJson("test-provider", "https://example.com")).rejects.toThrow(
      SourceProviderError
    );
  });

  it("throws SourceProviderError when the network request itself fails", async () => {
    mockFetchOnce(() => {
      throw new TypeError("network error");
    });
    await expect(fetchJson("test-provider", "https://example.com")).rejects.toThrow(
      SourceProviderError
    );
  });

  it("throws SourceProviderError on malformed (non-JSON) response bodies", async () => {
    mockFetchOnce(() => new Response("<html>not json</html>", { status: 200 }));
    await expect(fetchJson("test-provider", "https://example.com")).rejects.toThrow(
      SourceProviderError
    );
  });

  it("includes the provider name in the error message", async () => {
    mockFetchOnce(() => new Response("boom", { status: 500 }));
    await expect(fetchJson("My Provider", "https://example.com")).rejects.toThrow(
      /My Provider/
    );
  });
});
