import type { CacheStore } from "../../ports/cache.js";

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
