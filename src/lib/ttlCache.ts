/**
 * Minimal in-process TTL cache. Used by the V2 retrieval/reranking pipeline
 * to cut repeated external-API/LLM calls for identical claims (see
 * src/lib/sources/retrieve.ts and src/lib/sources/rerank.ts) — the same
 * "plain Map, process lifetime, no external infra" approach already used by
 * src/lib/sources/hadithAdapter.ts's collection cache.
 *
 * Auto-disabled under Vitest (`process.env.VITEST === "true"`, the
 * officially-documented flag Vitest always sets) so repeated test cases that
 * reuse the same claim text with different mocked adapter responses never
 * silently read a stale cached result from an earlier test.
 */
export interface TtlCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  clear(): void;
}

export function createTtlCache<K, V>(
  ttlMs: number,
  options: { disabled?: boolean } = {}
): TtlCache<K, V> {
  const disabled = options.disabled ?? process.env.VITEST === "true";
  const store = new Map<K, { value: V; expiresAt: number }>();

  return {
    get(key) {
      if (disabled) return undefined;
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (disabled) return;
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}
