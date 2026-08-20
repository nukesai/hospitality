import { describe, expect, it, vi } from "vitest";

import type { CacheMetrics, CacheStore } from "../ports/cache.js";
import { createCache } from "./create-cache.js";

const makeStore = (overrides: Partial<CacheStore> = {}): CacheStore => ({
  get: vi.fn<CacheStore["get"]>().mockResolvedValue(null),
  set: vi.fn<CacheStore["set"]>().mockResolvedValue(undefined),
  del: vi.fn<CacheStore["del"]>().mockResolvedValue(undefined),
  invalidateTags: vi.fn<CacheStore["invalidateTags"]>().mockResolvedValue(undefined),
  close: vi.fn<CacheStore["close"]>().mockResolvedValue(undefined),
  ...overrides,
});

const makeMetrics = (): {
  readonly onHit: ReturnType<typeof vi.fn<NonNullable<CacheMetrics["onHit"]>>>;
  readonly onMiss: ReturnType<typeof vi.fn<NonNullable<CacheMetrics["onMiss"]>>>;
  readonly onStale: ReturnType<typeof vi.fn<NonNullable<CacheMetrics["onStale"]>>>;
  readonly onError: ReturnType<typeof vi.fn<NonNullable<CacheMetrics["onError"]>>>;
} => ({
  onHit: vi.fn<NonNullable<CacheMetrics["onHit"]>>(),
  onMiss: vi.fn<NonNullable<CacheMetrics["onMiss"]>>(),
  onStale: vi.fn<NonNullable<CacheMetrics["onStale"]>>(),
  onError: vi.fn<NonNullable<CacheMetrics["onError"]>>(),
});

const envelope = (v: unknown, sea: number): string => JSON.stringify({ v, sea });

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createCache", () => {
  describe("get", () => {
    it("returns the cached value and reports a hit", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue(envelope("cached", 10_000)),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics, clock: () => 1_000 });
      await expect(cache.get<string>("k")).resolves.toBe("cached");
      expect(metrics.onHit).toHaveBeenCalledWith("k");
      expect(metrics.onMiss).not.toHaveBeenCalled();
    });

    it("returns undefined and reports a miss when the store has no entry", async () => {
      const store = makeStore();
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics });
      await expect(cache.get("k")).resolves.toBeUndefined();
      expect(metrics.onMiss).toHaveBeenCalledWith("k");
      expect(metrics.onHit).not.toHaveBeenCalled();
    });

    it("fails open on a corrupt envelope: reports the error and a miss", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue("not-json{"),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics });
      await expect(cache.get("k")).resolves.toBeUndefined();
      expect(metrics.onError).toHaveBeenCalledWith("get", "k", expect.any(SyntaxError));
      expect(metrics.onMiss).toHaveBeenCalledWith("k");
    });

    it("fails open when the store read rejects", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockRejectedValue(new Error("redis down")),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics });
      await expect(cache.get("k")).resolves.toBeUndefined();
      expect(metrics.onError).toHaveBeenCalledWith("get", "k", new Error("redis down"));
    });
  });

  describe("set", () => {
    it("writes an envelope with soft expiry and hard TTL = ttl + stale", async () => {
      const store = makeStore();
      const cache = createCache(store, { clock: () => 1_000 });
      await cache.set("k", { a: 1 }, { ttlSeconds: 2, staleTtlSeconds: 3, tags: ["t1"] });
      expect(store.set).toHaveBeenCalledWith(
        "k",
        JSON.stringify({ v: { a: 1 }, sea: 1_000 + 2_000 }),
        5,
        ["t1"],
      );
    });

    it("defaults staleTtlSeconds to 0 and tags to []", async () => {
      const store = makeStore();
      const cache = createCache(store, { clock: () => 0 });
      await cache.set("k", "v", { ttlSeconds: 7 });
      expect(store.set).toHaveBeenCalledWith("k", JSON.stringify({ v: "v", sea: 7_000 }), 7, []);
    });

    it("swallows store write errors and routes them to onError", async () => {
      const store = makeStore({
        set: vi.fn<CacheStore["set"]>().mockRejectedValue(new Error("write failed")),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics });
      await expect(cache.set("k", "v", { ttlSeconds: 1 })).resolves.toBeUndefined();
      expect(metrics.onError).toHaveBeenCalledWith("set", "k", new Error("write failed"));
    });
  });

  describe("del", () => {
    it("delegates to the store", async () => {
      const store = makeStore();
      const cache = createCache(store);
      await cache.del(["a", "b"]);
      expect(store.del).toHaveBeenCalledWith(["a", "b"]);
    });

    it("swallows store delete errors and routes them to onError", async () => {
      const store = makeStore({
        del: vi.fn<CacheStore["del"]>().mockRejectedValue(new Error("del failed")),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics });
      await expect(cache.del(["a", "b"])).resolves.toBeUndefined();
      expect(metrics.onError).toHaveBeenCalledWith("del", "a,b", new Error("del failed"));
    });
  });

  describe("invalidateTags", () => {
    it("delegates to the store", async () => {
      const store = makeStore();
      const cache = createCache(store);
      await cache.invalidateTags(["t1", "t2"]);
      expect(store.invalidateTags).toHaveBeenCalledWith(["t1", "t2"]);
    });

    it("propagates store errors (fail closed)", async () => {
      const store = makeStore({
        invalidateTags: vi
          .fn<CacheStore["invalidateTags"]>()
          .mockRejectedValue(new Error("invalidate failed")),
      });
      const cache = createCache(store, { metrics: makeMetrics() });
      await expect(cache.invalidateTags(["t1"])).rejects.toThrow("invalidate failed");
    });
  });

  describe("getOrSet", () => {
    it("returns a fresh hit without calling the loader", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue(envelope("fresh", 2_000)),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics, clock: () => 1_000 });
      const load = vi.fn<() => Promise<string>>().mockResolvedValue("loaded");
      await expect(cache.getOrSet("k", { ttlSeconds: 1 }, load)).resolves.toBe("fresh");
      expect(load).not.toHaveBeenCalled();
      expect(metrics.onHit).toHaveBeenCalledWith("k");
      expect(store.set).not.toHaveBeenCalled();
    });

    it("loads and writes through on a miss", async () => {
      const store = makeStore();
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics, clock: () => 1_000 });
      const load = vi.fn<() => Promise<string>>().mockResolvedValue("loaded");
      await expect(cache.getOrSet("k", { ttlSeconds: 2, tags: ["t1"] }, load)).resolves.toBe(
        "loaded",
      );
      expect(load).toHaveBeenCalledTimes(1);
      expect(metrics.onMiss).toHaveBeenCalledWith("k");
      expect(store.set).toHaveBeenCalledWith("k", JSON.stringify({ v: "loaded", sea: 3_000 }), 2, [
        "t1",
      ]);
    });

    it("serves stale immediately with waitUntil and revalidates in the background", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue(envelope("stale", 500)),
      });
      const metrics = makeMetrics();
      const scheduled: Promise<unknown>[] = [];
      const cache = createCache(store, {
        metrics,
        clock: () => 1_000,
        waitUntil: (promise) => {
          scheduled.push(promise);
        },
      });
      const gate = deferred<string>();
      const load = vi.fn<() => Promise<string>>().mockReturnValue(gate.promise);
      await expect(cache.getOrSet("k", { ttlSeconds: 2 }, load)).resolves.toBe("stale");
      expect(metrics.onStale).toHaveBeenCalledWith("k");
      expect(load).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveLength(1);
      expect(store.set).not.toHaveBeenCalled();
      gate.resolve("refreshed");
      await scheduled[0];
      expect(store.set).toHaveBeenCalledWith(
        "k",
        JSON.stringify({ v: "refreshed", sea: 3_000 }),
        2,
        [],
      );
      expect(metrics.onError).not.toHaveBeenCalled();
    });

    it("routes a background refresh rejection to metrics.onError", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue(envelope("stale", 500)),
      });
      const metrics = makeMetrics();
      const scheduled: Promise<unknown>[] = [];
      const cache = createCache(store, {
        metrics,
        clock: () => 1_000,
        waitUntil: (promise) => {
          scheduled.push(promise);
        },
      });
      const load = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("db down"));
      await expect(cache.getOrSet("k", { ttlSeconds: 2 }, load)).resolves.toBe("stale");
      await scheduled[0];
      expect(metrics.onError).toHaveBeenCalledWith("set", "k", new Error("db down"));
    });

    it("awaits revalidation when no waitUntil scheduler is provided", async () => {
      const store = makeStore({
        get: vi.fn<CacheStore["get"]>().mockResolvedValue(envelope("stale", 500)),
      });
      const metrics = makeMetrics();
      const cache = createCache(store, { metrics, clock: () => 1_000 });
      const load = vi.fn<() => Promise<string>>().mockResolvedValue("refreshed");
      await expect(cache.getOrSet("k", { ttlSeconds: 2 }, load)).resolves.toBe("refreshed");
      expect(metrics.onStale).toHaveBeenCalledWith("k");
      expect(store.set).toHaveBeenCalledWith(
        "k",
        JSON.stringify({ v: "refreshed", sea: 3_000 }),
        2,
        [],
      );
    });

    it("single-flights 5 concurrent misses into 1 loader call", async () => {
      const store = makeStore();
      const cache = createCache(store, { clock: () => 1_000 });
      const gate = deferred<string>();
      const load = vi.fn<() => Promise<string>>().mockReturnValue(gate.promise);
      const calls = [
        cache.getOrSet("k", { ttlSeconds: 1 }, load),
        cache.getOrSet("k", { ttlSeconds: 1 }, load),
        cache.getOrSet("k", { ttlSeconds: 1 }, load),
        cache.getOrSet("k", { ttlSeconds: 1 }, load),
        cache.getOrSet("k", { ttlSeconds: 1 }, load),
      ];
      gate.resolve("once");
      await expect(Promise.all(calls)).resolves.toEqual(["once", "once", "once", "once", "once"]);
      expect(load).toHaveBeenCalledTimes(1);
      expect(store.set).toHaveBeenCalledTimes(1);
    });

    it("clears the in-flight slot after resolution so later misses reload", async () => {
      const store = makeStore();
      const cache = createCache(store, { clock: () => 1_000 });
      const load = vi.fn<() => Promise<string>>().mockResolvedValue("v");
      await cache.getOrSet("k", { ttlSeconds: 1 }, load);
      await cache.getOrSet("k", { ttlSeconds: 1 }, load);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("clears the in-flight slot after rejection so later misses retry", async () => {
      const store = makeStore();
      const cache = createCache(store, { clock: () => 1_000 });
      const load = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("first load failed"))
        .mockResolvedValueOnce("recovered");
      await expect(cache.getOrSet("k", { ttlSeconds: 1 }, load)).rejects.toThrow(
        "first load failed",
      );
      await expect(cache.getOrSet("k", { ttlSeconds: 1 }, load)).resolves.toBe("recovered");
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe("close", () => {
    it("delegates to the store", async () => {
      const store = makeStore();
      const cache = createCache(store);
      await cache.close();
      expect(store.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("without metrics and with the default clock", () => {
    it("get/set/del stay silent on hits, misses and errors", async () => {
      const store = makeStore({
        get: vi
          .fn<CacheStore["get"]>()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(envelope("hit", Number.MAX_SAFE_INTEGER))
          .mockResolvedValueOnce("corrupt{"),
        set: vi.fn<CacheStore["set"]>().mockRejectedValue(new Error("write failed")),
        del: vi.fn<CacheStore["del"]>().mockRejectedValue(new Error("del failed")),
      });
      const cache = createCache(store);
      await expect(cache.get("k")).resolves.toBeUndefined();
      await expect(cache.get<string>("k")).resolves.toBe("hit");
      await expect(cache.get("k")).resolves.toBeUndefined();
      await expect(cache.set("k", "v", { ttlSeconds: 1 })).resolves.toBeUndefined();
      await expect(cache.del(["k"])).resolves.toBeUndefined();
    });

    it("getOrSet covers hit, stale, miss and background rejection without metrics", async () => {
      const store = makeStore({
        get: vi
          .fn<CacheStore["get"]>()
          .mockResolvedValueOnce(envelope("fresh", 2_000))
          .mockResolvedValueOnce(envelope("stale", 500))
          .mockResolvedValueOnce(null),
      });
      const scheduled: Promise<unknown>[] = [];
      const cache = createCache(store, {
        clock: () => 1_000,
        waitUntil: (promise) => {
          scheduled.push(promise);
        },
      });
      const failingLoad = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("nope"));
      await expect(cache.getOrSet("k", { ttlSeconds: 1 }, failingLoad)).resolves.toBe("fresh");
      await expect(cache.getOrSet("k", { ttlSeconds: 1 }, failingLoad)).resolves.toBe("stale");
      await scheduled[0];
      const load = vi.fn<() => Promise<string>>().mockResolvedValue("loaded");
      await expect(cache.getOrSet("k2", { ttlSeconds: 1 }, load)).resolves.toBe("loaded");
    });
  });
});
