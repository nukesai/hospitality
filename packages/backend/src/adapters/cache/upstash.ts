import { Redis } from "@upstash/redis";
import type { CacheStore } from "../../ports/cache.js";

const TAG_SET_TTL_SECONDS = 86_400;
const SSCAN_BATCH = 500;
const tagSetKey = (tag: string): string => `pos:tagset:{${tag}}`;

export interface UpstashCacheOptions {
  readonly url: string;
  readonly token: string;
}

/**
 * HTTP client — stateless, no sockets, no reconnect logic, nothing to leak.
 * automaticDeserialization is DISABLED so both Redis adapters store the same
 * raw envelope JSON string: adapters are swappable byte-for-byte.
 */
export const createUpstashCacheStore = (options: UpstashCacheOptions): CacheStore => {
  const client = new Redis({
    url: options.url,
    token: options.token,
    automaticDeserialization: false,
  });
  return {
    get: async (key: string): Promise<string | null> => client.get<string>(key),

    set: async (
      key: string,
      envelopeJson: string,
      hardTtlSeconds: number,
      tags: readonly string[],
    ): Promise<void> => {
      if (tags.length === 0) {
        await client.set(key, envelopeJson, { ex: hardTtlSeconds });
        return;
      }
      const pipeline = client.pipeline();
      pipeline.set(key, envelopeJson, { ex: hardTtlSeconds });
      for (const tag of tags) {
        pipeline.sadd(tagSetKey(tag), key);
        pipeline.expire(tagSetKey(tag), TAG_SET_TTL_SECONDS, "GT");
      }
      await pipeline.exec();
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
          const [next, members] = await client.sscan(setKey, cursor, { count: SSCAN_BATCH });
          cursor = typeof next === "number" ? next.toString() : next;
          if (members.length > 0)
            await client.unlink(...members.map((m) => (typeof m === "number" ? m.toString() : m)));
        } while (cursor !== "0");
        await client.unlink(setKey);
      }
    },

    close: async (): Promise<void> => {
      // HTTP client: nothing to release.
    },
  };
};

// ── KvPort over an Upstash client (R14: two ports, one client) ───────────────

import type { KvPort } from "../../ports/kv.js";

export const createUpstashKvClient = (options: UpstashCacheOptions): Redis =>
  new Redis({ url: options.url, token: options.token, automaticDeserialization: false });

export const createUpstashKv = (client: Redis): KvPort => ({
  get: async (key: string): Promise<string | null> => client.get<string>(key),
  set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    if (ttlSeconds !== undefined) {
      await client.set(key, value, { ex: ttlSeconds });
    } else {
      await client.set(key, value);
    }
  },
  delete: async (key: string): Promise<void> => {
    await client.unlink(key);
  },
  getAndDelete: async (key: string): Promise<string | null> => client.getdel<string>(key),
  incrementWithTtl: async (key: string, ttlSeconds: number): Promise<number> => {
    const value = await client.incr(key);
    if (value === 1) await client.expire(key, ttlSeconds, "NX");
    return value;
  },
});
