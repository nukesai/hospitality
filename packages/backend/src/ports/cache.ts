import type { LocationId } from "@nukesai-pos/common/types";

/**
 * Cache port. Business logic depends ONLY on this interface; adapters live in
 * src/adapters/cache/ and are exposed as export subpaths.
 *
 * Values MUST be JSON-serializable. Keys follow the convention
 * `pos:{locationId}:{entity}:{discriminator}` (see buildCacheKey) so branch
 * isolation is structural: invalidating a branch never touches another branch.
 */
export interface CacheEntryOptions {
  /** Fresh window in seconds. After it the entry is stale (SWR) but servable. */
  readonly ttlSeconds: number;
  /**
   * Extra stale-while-revalidate window in seconds (default 0 = no SWR).
   * Hard Redis TTL = ttlSeconds + staleTtlSeconds, so expiry is bounded by
   * construction — nothing lives forever even if invalidation is missed.
   */
  readonly staleTtlSeconds?: number;
  /** Tags this entry belongs to; invalidateTags() deletes every member key. */
  readonly tags?: readonly string[];
}

/** Wire envelope stored in the backing store. `sea` = soft-expires-at, epoch ms. */
export interface CacheEnvelope<T> {
  readonly v: T;
  readonly sea: number;
}

/**
 * Low-level store contract each adapter (ioredis / upstash / memory)
 * implements. Single-flight, SWR, metrics and error policy are implemented
 * ONCE in createCache() on top of this.
 */
export interface CacheStore {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (
    key: string,
    envelopeJson: string,
    hardTtlSeconds: number,
    tags: readonly string[],
  ) => Promise<void>;
  readonly del: (keys: readonly string[]) => Promise<void>;
  readonly invalidateTags: (tags: readonly string[]) => Promise<void>;
  /** Release sockets/timers. MUST be awaited on shutdown — leak-free lifecycle. */
  readonly close: () => Promise<void>;
}

/** Hit/miss/error hooks; wire them to the logger/analytics ports. */
export interface CacheMetrics {
  readonly onHit?: (key: string) => void;
  readonly onMiss?: (key: string) => void;
  readonly onStale?: (key: string) => void;
  readonly onError?: (
    op: "get" | "set" | "del" | "invalidate",
    key: string,
    error: unknown,
  ) => void;
}

/** High-level port consumed by routers/services. */
export interface CachePort {
  readonly get: <T>(key: string) => Promise<T | undefined>;
  readonly set: <T>(key: string, value: T, options: CacheEntryOptions) => Promise<void>;
  readonly del: (keys: readonly string[]) => Promise<void>;
  readonly invalidateTags: (tags: readonly string[]) => Promise<void>;
  /**
   * Read-through with per-instance single-flight and stale-while-revalidate.
   * Store failures degrade to calling `load` — the cache can never 500 a read.
   */
  readonly getOrSet: <T>(
    key: string,
    options: CacheEntryOptions,
    load: () => Promise<T>,
  ) => Promise<T>;
  readonly close: () => Promise<void>;
}

/** `pos:{locationId}:{entity}:{discriminator}` — branch scope is mandatory. */
export const buildCacheKey = (
  locationId: LocationId,
  entity: string,
  discriminator: string,
): string => `pos:${locationId}:${entity}:${discriminator}`;

/** Tag names share the same branch scoping: `pos:{locationId}:{entity}`. */
export const buildCacheTag = (locationId: LocationId, entity: string): string =>
  `pos:${locationId}:${entity}`;

/** Stable FNV-1a hash of arbitrary JSON-able input for key discriminators. */
export const hashDiscriminator = (input: unknown): string => {
  const json = JSON.stringify(input, (_k, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      return Object.keys(rec)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = rec[k];
          return acc;
        }, {});
    }
    return value;
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};
