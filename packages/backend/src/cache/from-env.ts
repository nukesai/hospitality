import type { PosEnv } from "../env.js";
import type { CachePort, CacheStore } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";
import { createCache, type CreateCacheDeps } from "./create-cache.js";

export interface CacheFromEnvDeps extends CreateCacheDeps {
  readonly onStoreError: (error: Error) => void;
  /** Called when production falls back to the in-memory driver (no shared invalidation). */
  readonly onMemoryFallbackInProduction?: () => void;
}

export interface CacheFromEnvResult {
  readonly cache: CachePort;
  /** Redis-backed KV for better-auth SecondaryStorage / rate limiting; null on memory. */
  readonly kv: KvPort | null;
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
    const options = {
      // Refined by the env schema; assert for the type system only.
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    };
    const store: CacheStore = createUpstashCacheStore(options);
    return { cache: createCache(store, deps), kv: createUpstashKv(createUpstashKvClient(options)) };
  }
  if (env.CACHE_DRIVER === "ioredis") {
    const { createRedisCacheStore, createRedisKv, getSharedIoredisClient } =
      await import("../adapters/cache/redis.js");
    const client = getSharedIoredisClient({
      url: env.CACHE_URL!,
      onError: deps.onStoreError,
    });
    return { cache: createCache(createRedisCacheStore(client), deps), kv: createRedisKv(client) };
  }
  if (env.NODE_ENV === "production") deps.onMemoryFallbackInProduction?.();
  const { createMemoryCacheStore } = await import("../adapters/cache/memory.js");
  return { cache: createCache(createMemoryCacheStore(), deps), kv: null };
};
