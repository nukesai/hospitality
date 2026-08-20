import type {
  CacheEntryOptions,
  CacheEnvelope,
  CacheMetrics,
  CachePort,
  CacheStore,
} from "../ports/cache.js";

export interface CreateCacheDeps {
  readonly metrics?: CacheMetrics;
  /**
   * Serverless background-work scheduler (Vercel: `waitUntil` from "@vercel/functions").
   * When present, stale hits are served immediately and revalidated in the
   * background. When absent, revalidation is awaited — never a floating
   * promise that a frozen serverless instance would kill mid-write.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  readonly clock?: () => number;
}

/**
 * Decorates a CacheStore with the production policy, implemented exactly once:
 * - single-flight: concurrent misses for one key share one loader promise
 * - soft TTL (SWR): serve stale within staleTtlSeconds while revalidating
 * - fail-open: store errors degrade to the loader, never to a thrown 500
 * The in-flight map is per adapter instance and is deleted in `finally` —
 * it cannot grow beyond the number of concurrently loading keys (no leak).
 */
export const createCache = (store: CacheStore, deps: CreateCacheDeps = {}): CachePort => {
  const metrics: CacheMetrics = deps.metrics ?? {};
  const clock: () => number = deps.clock ?? Date.now;
  const inflight = new Map<string, Promise<unknown>>();

  const readEnvelope = async <T>(key: string): Promise<CacheEnvelope<T> | undefined> => {
    try {
      const raw = await store.get(key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as CacheEnvelope<T>;
    } catch (error) {
      metrics.onError?.("get", key, error);
      return undefined;
    }
  };

  const write = async <T>(key: string, value: T, options: CacheEntryOptions): Promise<void> => {
    const stale = options.staleTtlSeconds ?? 0;
    const envelope: CacheEnvelope<T> = { v: value, sea: clock() + options.ttlSeconds * 1000 };
    try {
      await store.set(
        key,
        JSON.stringify(envelope),
        options.ttlSeconds + stale,
        options.tags ?? [],
      );
    } catch (error) {
      metrics.onError?.("set", key, error);
    }
  };

  const loadAndWrite = async <T>(
    key: string,
    options: CacheEntryOptions,
    load: () => Promise<T>,
  ): Promise<T> => {
    const existing = inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const promise = (async (): Promise<T> => {
      const value = await load();
      await write(key, value, options);
      return value;
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };

  return {
    get: async <T>(key: string): Promise<T | undefined> => {
      const envelope = await readEnvelope<T>(key);
      if (envelope === undefined) {
        metrics.onMiss?.(key);
        return undefined;
      }
      metrics.onHit?.(key);
      return envelope.v;
    },
    set: write,
    del: async (keys: readonly string[]): Promise<void> => {
      try {
        await store.del(keys);
      } catch (error) {
        metrics.onError?.("del", keys.join(","), error);
      }
    },
    invalidateTags: async (tags: readonly string[]): Promise<void> => {
      // Invalidation must NOT fail open: a missed invalidation serves wrong
      // data. Let the error propagate to the mutation caller.
      await store.invalidateTags(tags);
    },
    getOrSet: async <T>(
      key: string,
      options: CacheEntryOptions,
      load: () => Promise<T>,
    ): Promise<T> => {
      const envelope = await readEnvelope<T>(key);
      const now = clock();
      if (envelope !== undefined && now < envelope.sea) {
        metrics.onHit?.(key);
        return envelope.v;
      }
      if (envelope !== undefined) {
        metrics.onStale?.(key);
        const refresh = loadAndWrite(key, options, load);
        if (deps.waitUntil !== undefined) {
          deps.waitUntil(
            refresh.catch((error: unknown) => {
              metrics.onError?.("set", key, error);
            }),
          );
          return envelope.v;
        }
        return refresh;
      }
      metrics.onMiss?.(key);
      return loadAndWrite(key, options, load);
    },
    close: async (): Promise<void> => store.close(),
  };
};
