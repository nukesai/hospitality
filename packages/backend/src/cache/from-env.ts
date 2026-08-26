import type { PosEnv } from "../env.js";
import type { CachePort, CacheStore } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";
import { createCache, type CreateCacheDeps } from "./create-cache.js";

export interface CacheFromEnvDeps extends CreateCacheDeps {
  readonly onStoreError: (error: Error) => void;
  /**
   * Called whenever the in-memory driver is selected — in EVERY environment, not
   * just production. A public staging box on the default driver has per-process
   * cache invalidation and per-process rate limits and used to say nothing at
   * all about it.
   */
  readonly onMemoryFallback?: () => void;
}

export interface CacheFromEnvResult {
  readonly cache: CachePort;
  /**
   * ALWAYS present. Backs API rate limiting, which must not depend on whether
   * anyone provisioned Redis — an infrastructure choice should not silently
   * decide a security posture. Memory-backed when no Redis is configured, which
   * makes the limit per-process rather than absent.
   */
  readonly kv: KvPort;
  /**
   * Non-null ONLY when the KV is shared across processes and outlives them.
   * better-auth's SecondaryStorage goes here and nowhere else: without Redis it
   * falls back to Postgres, which is SHARED, so handing it a per-process memory
   * store would make sessions and better-auth's own limiter LESS correct.
   */
  readonly sharedKv: KvPort | null;
}

/**
 * Driver selection from the validated env (CACHE_DRIVER is explicit — the env
 * schema refines per-driver requirements). Dynamic imports keep ioredis and
 * @upstash/redis optional peers: only the selected driver is ever loaded.
 */
export const createCacheFromEnv = async (
  env: PosEnv,
  deps: CacheFromEnvDeps,
): Promise<CacheFromEnvResult> => {
  if (env.CACHE_DRIVER === "upstash") {
    const { createUpstashCacheStore, createUpstashKv, createUpstashKvClient } =
      await import("../adapters/cache/upstash.js");
    /* v8 ignore next 3 -- unreachable: the env schema refines this before we get here; kept as a type guard */
    if (env.UPSTASH_REDIS_REST_URL === undefined || env.UPSTASH_REDIS_REST_TOKEN === undefined) {
      throw new Error(
        "upstash driver requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
      );
    }
    const options = { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
    const store: CacheStore = createUpstashCacheStore(options);
    const upstashKv = createUpstashKv(createUpstashKvClient(options));
    return { cache: createCache(store, deps), kv: upstashKv, sharedKv: upstashKv };
  }
  if (env.CACHE_DRIVER === "ioredis") {
    const { createRedisCacheStore, createRedisKv, getSharedIoredisClient } =
      await import("../adapters/cache/redis.js");
    /* v8 ignore next -- unreachable: the env schema refines this before we get here; kept as a type guard */
    if (env.CACHE_URL === undefined) throw new Error("ioredis driver requires CACHE_URL");
    const client = getSharedIoredisClient({ url: env.CACHE_URL, onError: deps.onStoreError });
    const redisKv = createRedisKv(client);
    return {
      cache: createCache(createRedisCacheStore(client), deps),
      kv: redisKv,
      sharedKv: redisKv,
    };
  }
  deps.onMemoryFallback?.();
  const { createMemoryCacheStore, createMemoryKv } = await import("../adapters/cache/memory.js");
  return {
    cache: createCache(createMemoryCacheStore(), deps),
    kv: createMemoryKv(),
    sharedKv: null,
  };
};
