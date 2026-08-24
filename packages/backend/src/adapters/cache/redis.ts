import "server-only";

import { Redis } from "ioredis";
import type { CacheStore } from "../../ports/cache.js";

/** Tag sets expire on their own so orphaned tag members can never accumulate
 * forever. Must be >= the largest entry hardTtl; 24h is a safe ceiling. */
const TAG_SET_TTL_SECONDS = 86_400;
const SSCAN_BATCH = 500;

const tagSetKey = (tag: string): string => `pos:tagset:{${tag}}`;

export interface RedisCacheOptions {
  readonly url: string;
  readonly onError: (error: Error) => void;
}

/**
 * ioredis client builder. Serverless/Vercel-Fluid-safe:
 * - lazyConnect: no TCP work at module evaluation
 * - maxRetriesPerRequest 2: fail fast; createCache() fail-open covers reads
 * - enableAutoPipelining: same-tick commands coalesce into one RTT
 * - bounded retryStrategy: reconnect forever, capped backoff
 * - 'error' listener: ioredis emits 'error' SILENTLY when unhandled (README
 *   §events), so this is for observability via the logger port, not crash
 *   prevention. Still mandatory here: silent Redis outages are unacceptable.
 */
export const createIoredisClient = (options: RedisCacheOptions): Redis => {
  const client = new Redis(options.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    connectTimeout: 5_000,
    retryStrategy: (times: number): number => Math.min(times * 200, 2_000),
  });
  client.on("error", options.onError);
  return client;
};

interface GlobalWithRedis {
  __nukesaiPosIoredis?: Redis;
}

/** One client per runtime instance, survives Next.js dev HMR and, on Vercel
 * Fluid compute, is reused across invocations of the same instance. */
export const getSharedIoredisClient = (options: RedisCacheOptions): Redis => {
  const g = globalThis as GlobalWithRedis;
  g.__nukesaiPosIoredis ??= createIoredisClient(options);
  return g.__nukesaiPosIoredis;
};

export const createRedisCacheStore = (client: Redis): CacheStore => ({
  get: async (key: string): Promise<string | null> => client.get(key),

  set: async (
    key: string,
    envelopeJson: string,
    hardTtlSeconds: number,
    tags: readonly string[],
  ): Promise<void> => {
    if (tags.length === 0) {
      await client.set(key, envelopeJson, "EX", hardTtlSeconds);
      return;
    }
    const pipeline = client.pipeline();
    pipeline.set(key, envelopeJson, "EX", hardTtlSeconds);
    for (const tag of tags) {
      pipeline.sadd(tagSetKey(tag), key);
      // 'GT' (Redis >= 7.0): only extend, never shorten a longer-lived set.
      pipeline.expire(tagSetKey(tag), TAG_SET_TTL_SECONDS, "GT");
    }
    // pipeline.exec() resolves per-command errors instead of throwing — check.
    const results = await pipeline.exec();
    const firstError = results?.find(([err]) => err !== null)?.[0];
    if (firstError instanceof Error) throw firstError;
  },

  del: async (keys: readonly string[]): Promise<void> => {
    if (keys.length === 0) return;
    await client.unlink(...keys);
  },

  invalidateTags: async (tags: readonly string[]): Promise<void> => {
    for (const tag of tags) {
      const setKey = tagSetKey(tag);
      let cursor = "0";
      do {
        const [next, members]: [string, string[]] = await client.sscan(
          setKey,
          cursor,
          "COUNT",
          SSCAN_BATCH,
        );
        cursor = next;
        if (members.length > 0) await client.unlink(...members);
      } while (cursor !== "0");
      await client.unlink(setKey);
    }
  },

  close: async (): Promise<void> => {
    await client.quit();
    // The client is (usually) the globalThis-shared one that ALSO backs the
    // KvPort (auth secondary storage, rate limiting) — clear the memo so a
    // later bootstrap builds a fresh client instead of reusing a dead one.
    const g = globalThis as GlobalWithRedis;
    if (g.__nukesaiPosIoredis === client) delete g.__nukesaiPosIoredis;
  },
});

// ── KvPort over the same client (R14: two ports, one connection) ─────────────

import type { KvPort } from "../../ports/kv.js";

/** Lua: INCR, then EXPIRE only when the key was just created (fixed window). */
const INCR_WITH_TTL_LUA =
  "local n = redis.call('INCR', KEYS[1]) "
  + "if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end "
  + "return n";

export const createRedisKv = (client: Redis): KvPort => ({
  get: async (key: string): Promise<string | null> => client.get(key),
  set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    if (ttlSeconds !== undefined) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  },
  delete: async (key: string): Promise<void> => {
    await client.unlink(key);
  },
  getAndDelete: async (key: string): Promise<string | null> => client.getdel(key),
  incrementWithTtl: async (key: string, ttlSeconds: number): Promise<number> => {
    const result = await client.eval(INCR_WITH_TTL_LUA, 1, key, String(ttlSeconds));
    return Number(result);
  },
});
