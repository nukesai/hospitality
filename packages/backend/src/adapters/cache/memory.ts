import "server-only";

import type { CacheStore } from "../../ports/cache.js";
import type { KvPort } from "../../ports/kv.js";

interface MemoryEntry {
  readonly value: string;
  readonly expiresAt: number;
  readonly tags: readonly string[];
}

/** Simulated IO tick: keeps the in-memory adapter honest about the async port contract. */
const io = async (): Promise<void> => {
  await Promise.resolve();
};

export interface MemoryCacheOptions {
  /** Hard bound on entries — the adapter cannot leak by construction. */
  readonly maxEntries?: number;
  readonly clock?: () => number;
}

/**
 * Bounded LRU + tag index, for tests and local dev without Docker.
 * The Map's insertion order IS the recency order: reads re-insert.
 * Eviction removes the entry from every tag set it belongs to, and empty tag
 * sets are deleted, so the tag index is bounded by the entry bound.
 */
export const createMemoryCacheStore = (options: MemoryCacheOptions = {}): CacheStore => {
  const maxEntries: number = options.maxEntries ?? 1_000;
  const clock: () => number = options.clock ?? Date.now;
  const entries = new Map<string, MemoryEntry>();
  const tagIndex = new Map<string, Set<string>>();

  const detach = (key: string): void => {
    const entry = entries.get(key);
    if (entry === undefined) return;
    entries.delete(key);
    for (const tag of entry.tags) {
      const members = tagIndex.get(tag);
      if (members === undefined) continue;
      members.delete(key);
      if (members.size === 0) tagIndex.delete(tag);
    }
  };

  return {
    get: async (key: string): Promise<string | null> => {
      await io();
      const entry = entries.get(key);
      if (entry === undefined) return null;
      if (entry.expiresAt <= clock()) {
        detach(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry); // refresh recency
      return entry.value;
    },

    set: async (
      key: string,
      envelopeJson: string,
      hardTtlSeconds: number,
      tags: readonly string[],
    ): Promise<void> => {
      await io();
      detach(key);
      while (entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        detach(oldestKey);
      }
      entries.set(key, {
        value: envelopeJson,
        expiresAt: clock() + hardTtlSeconds * 1000,
        tags,
      });
      for (const tag of tags) {
        const members = tagIndex.get(tag) ?? new Set<string>();
        members.add(key);
        tagIndex.set(tag, members);
      }
    },

    del: async (keys: readonly string[]): Promise<void> => {
      await io();
      for (const key of keys) detach(key);
    },

    invalidateTags: async (tags: readonly string[]): Promise<void> => {
      await io();
      for (const tag of tags) {
        const members = tagIndex.get(tag);
        if (members === undefined) continue;
        for (const key of [...members]) detach(key);
        tagIndex.delete(tag);
      }
    },

    close: async (): Promise<void> => {
      await io();
      entries.clear();
      tagIndex.clear();
    },
  };
};

interface KvEntry {
  value: string;
  /** Epoch ms, or Infinity for "no TTL". */
  expiresAt: number;
}

export interface MemoryKvOptions {
  /** Hard bound on keys — the adapter cannot leak by construction. */
  readonly maxEntries?: number;
  readonly clock?: () => number;
}

/**
 * In-memory KvPort, so API rate limiting works WITHOUT Redis.
 *
 * `checkRateLimit` used to no-op whenever the KV was absent, which meant a
 * deployment on the default `CACHE_DRIVER=memory` had no rate limit on any tRPC
 * route at all. That is a security posture decided by an infrastructure choice,
 * which is the wrong way round. This makes the limit real on every deployment;
 * Redis upgrades it from per-process to shared, rather than from off to on.
 *
 * PER-PROCESS, and that is the whole caveat. N instances allow roughly N x the
 * configured limit, because each keeps its own counters. That is a bounded,
 * documented weakening — unlike no limit at all, which is unbounded.
 *
 * DELIBERATELY NOT USED FOR better-auth's SecondaryStorage. Sessions and
 * better-auth's own limiter fall back to Postgres, which is SHARED; swapping
 * that for a per-process store would make them less correct, not more. See
 * createCacheFromEnv's `sharedKv`.
 */
export const createMemoryKv = (options: MemoryKvOptions = {}): KvPort => {
  const maxEntries: number = options.maxEntries ?? 10_000;
  const clock: () => number = options.clock ?? Date.now;
  const entries = new Map<string, KvEntry>();

  /** Reads the entry, dropping it first if it has expired. */
  const live = (key: string): KvEntry | undefined => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= clock()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  /** Evicts expired keys first, then the oldest, so a burst cannot grow forever. */
  const reserve = (): void => {
    if (entries.size < maxEntries) return;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= clock()) entries.delete(key);
    }
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  };

  return {
    get: async (key: string): Promise<string | null> => {
      await io();
      return live(key)?.value ?? null;
    },

    set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
      await io();
      entries.delete(key);
      reserve();
      entries.set(key, {
        value,
        expiresAt:
          ttlSeconds === undefined ? Number.POSITIVE_INFINITY : clock() + ttlSeconds * 1000,
      });
    },

    delete: async (key: string): Promise<void> => {
      await io();
      entries.delete(key);
    },

    getAndDelete: async (key: string): Promise<string | null> => {
      await io();
      const value = live(key)?.value ?? null;
      entries.delete(key);
      return value;
    },

    /**
     * INCR with the TTL applied ONLY on creation, matching the Redis adapters:
     * a fixed window that starts at the first hit and is not extended by later
     * ones. Extending it per hit would let a steady stream hold the window open
     * forever and never reset the count.
     */
    incrementWithTtl: async (key: string, ttlSeconds: number): Promise<number> => {
      await io();
      const entry = live(key);
      if (entry === undefined) {
        reserve();
        entries.set(key, { value: "1", expiresAt: clock() + ttlSeconds * 1000 });
        return 1;
      }
      const next = Number(entry.value) + 1;
      entry.value = String(next);
      return next;
    },
  };
};
