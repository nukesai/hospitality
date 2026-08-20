import type { SecondaryStorage } from "better-auth";

import type { KvPort } from "../../ports/kv.js";

/**
 * KvPort -> better-auth 1.7 SecondaryStorage. FIVE methods including
 * increment(key, ttl) and getAndDelete — most published examples miss two of
 * them and do not compile (verified against @better-auth/core d.ts).
 */
export function createSecondaryStorage(kv: KvPort, prefix: string): SecondaryStorage {
  return {
    get: async (key) => kv.get(`${prefix}${key}`),
    set: async (key, value, ttl) => {
      await kv.set(`${prefix}${key}`, value, ttl);
    },
    delete: async (key) => {
      await kv.delete(`${prefix}${key}`);
    },
    getAndDelete: async (key) => kv.getAndDelete(`${prefix}${key}`),
    increment: async (key, ttl) => kv.incrementWithTtl(`${prefix}${key}`, ttl),
  };
}
