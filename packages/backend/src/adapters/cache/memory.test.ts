import { describe, expect, it } from "vitest";

import { createMemoryCacheStore, createMemoryKv } from "./memory.js";

interface ManualClock {
  readonly clock: () => number;
  readonly advance: (ms: number) => void;
}

const manualClock = (start = 0): ManualClock => {
  let now = start;
  return {
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("createMemoryCacheStore", () => {
  it("stores and returns values with the default clock and maxEntries", async () => {
    const store = createMemoryCacheStore();
    await store.set("k", "payload", 60, []);
    await expect(store.get("k")).resolves.toBe("payload");
    await expect(store.get("missing")).resolves.toBeNull();
  });

  it("expires entries at exactly expiresAt via the injected clock", async () => {
    const { clock, advance } = manualClock();
    const store = createMemoryCacheStore({ clock });
    await store.set("k", "payload", 10, ["t"]);
    advance(9_999);
    await expect(store.get("k")).resolves.toBe("payload");
    advance(1);
    await expect(store.get("k")).resolves.toBeNull();
    await expect(store.get("k")).resolves.toBeNull();
    // The expired entry was detached from its tag set, not merely hidden:
    await store.set("k2", "other", 10, ["t"]);
    await store.invalidateTags(["t"]);
    await expect(store.get("k2")).resolves.toBeNull();
  });

  it("evicts the least recently used entry when maxEntries is reached", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ maxEntries: 2, clock });
    await store.set("a", "1", 60, []);
    await store.set("b", "2", 60, []);
    await store.set("c", "3", 60, []);
    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toBe("2");
    await expect(store.get("c")).resolves.toBe("3");
  });

  it("refreshes recency on get so a read entry survives eviction", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ maxEntries: 2, clock });
    await store.set("a", "1", 60, []);
    await store.set("b", "2", 60, []);
    await expect(store.get("a")).resolves.toBe("1"); // a is now most recent
    await store.set("c", "3", 60, []);
    await expect(store.get("b")).resolves.toBeNull();
    await expect(store.get("a")).resolves.toBe("1");
    await expect(store.get("c")).resolves.toBe("3");
  });

  it("re-setting an existing key replaces it without evicting others", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ maxEntries: 2, clock });
    await store.set("a", "1", 60, ["old-tag"]);
    await store.set("b", "2", 60, []);
    await store.set("a", "1-updated", 60, ["new-tag"]);
    await expect(store.get("a")).resolves.toBe("1-updated");
    await expect(store.get("b")).resolves.toBe("2");
    // The old tag membership was detached by the overwrite:
    await store.invalidateTags(["old-tag"]);
    await expect(store.get("a")).resolves.toBe("1-updated");
    await store.invalidateTags(["new-tag"]);
    await expect(store.get("a")).resolves.toBeNull();
  });

  it("detaches evicted entries from their tag sets", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ maxEntries: 1, clock });
    await store.set("a", "1", 60, ["shared"]);
    await store.set("b", "2", 60, ["shared"]); // evicts a
    await store.invalidateTags(["shared"]);
    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toBeNull();
  });

  it("tolerates a maxEntries bound of zero", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ maxEntries: 0, clock });
    await store.set("a", "1", 60, []);
    await expect(store.get("a")).resolves.toBe("1");
  });

  it("del removes listed keys, ignores unknown keys and detaches tags", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ clock });
    await store.set("a", "1", 60, ["shared"]);
    await store.set("b", "2", 60, ["shared"]);
    await store.del(["a", "unknown"]);
    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toBe("2");
    await store.invalidateTags(["shared"]);
    await expect(store.get("b")).resolves.toBeNull();
  });

  it("cleans up a tag set once its last member is detached (duplicate tags included)", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ clock });
    await store.set("a", "1", 60, ["t", "t"]);
    await store.del(["a"]);
    // Re-using the tag after cleanup behaves like a fresh tag:
    await store.set("b", "2", 60, ["t"]);
    await store.invalidateTags(["t"]);
    await expect(store.get("b")).resolves.toBeNull();
  });

  it("invalidateTags removes every member of each tag and ignores unknown tags", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ clock });
    await store.set("a", "1", 60, ["t1", "t2"]);
    await store.set("b", "2", 60, ["t1"]);
    await store.set("c", "3", 60, ["t3"]);
    await store.invalidateTags(["t1", "unknown"]);
    await expect(store.get("a")).resolves.toBeNull();
    await expect(store.get("b")).resolves.toBeNull();
    await expect(store.get("c")).resolves.toBe("3");
  });

  it("close clears entries and the tag index", async () => {
    const { clock } = manualClock();
    const store = createMemoryCacheStore({ clock });
    await store.set("a", "1", 60, ["t"]);
    await store.close();
    await expect(store.get("a")).resolves.toBeNull();
    await store.invalidateTags(["t"]); // no-op after close
    await expect(store.get("a")).resolves.toBeNull();
  });
});

describe("createMemoryKv", () => {
  it("round-trips a value and honours an explicit TTL", async () => {
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ clock });

    await kv.set("k", "v", 60);
    await expect(kv.get("k")).resolves.toBe("v");

    advance(59_999);
    await expect(kv.get("k")).resolves.toBe("v");
    advance(1);
    await expect(kv.get("k")).resolves.toBeNull();
  });

  it("keeps a value forever when no TTL is given", async () => {
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ clock });

    await kv.set("k", "v");
    advance(Number.MAX_SAFE_INTEGER);
    await expect(kv.get("k")).resolves.toBe("v");
  });

  it("returns null for a key that was never set", async () => {
    await expect(createMemoryKv().get("absent")).resolves.toBeNull();
  });

  it("deletes", async () => {
    const kv = createMemoryKv();
    await kv.set("k", "v");
    await kv.delete("k");
    await expect(kv.get("k")).resolves.toBeNull();
    // deleting an absent key is a no-op, not an error
    await expect(kv.delete("k")).resolves.toBeUndefined();
  });

  it("getAndDelete returns the value once, then null", async () => {
    const kv = createMemoryKv();
    await kv.set("k", "v");
    await expect(kv.getAndDelete("k")).resolves.toBe("v");
    await expect(kv.getAndDelete("k")).resolves.toBeNull();
  });

  it("getAndDelete on an expired key returns null and clears it", async () => {
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ clock });
    await kv.set("k", "v", 1);
    advance(1_000);
    await expect(kv.getAndDelete("k")).resolves.toBeNull();
  });

  it("increments within a fixed window and resets after it", async () => {
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ clock });

    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(1);
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(2);
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(3);

    advance(60_000);
    // window elapsed: the counter starts again, it does not keep climbing
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(1);
  });

  it("does NOT extend the window on later hits", async () => {
    // Matches the Redis adapters: TTL is applied only on creation. Extending it
    // per hit would let a steady stream hold the window open indefinitely and
    // never reset the count.
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ clock });

    await kv.incrementWithTtl("rl", 60);
    advance(30_000);
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(2);
    advance(30_000);
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(1);
  });

  it("evicts expired keys before the oldest when it hits the bound", async () => {
    const { clock, advance } = manualClock();
    const kv = createMemoryKv({ maxEntries: 3, clock });

    await kv.set("expired", "x", 1);
    await kv.set("keep-a", "a");
    advance(2_000); // "expired" is now stale, the untTL'd one is not
    await kv.set("keep-b", "b");
    await kv.set("keep-c", "c"); // forces reserve()

    await expect(kv.get("expired")).resolves.toBeNull();
    await expect(kv.get("keep-b")).resolves.toBe("b");
    await expect(kv.get("keep-c")).resolves.toBe("c");
  });

  it("evicts the oldest when nothing has expired, so it cannot leak", async () => {
    const kv = createMemoryKv({ maxEntries: 2 });
    await kv.set("one", "1");
    await kv.set("two", "2");
    await kv.set("three", "3");

    await expect(kv.get("one")).resolves.toBeNull();
    await expect(kv.get("three")).resolves.toBe("3");
  });

  it("bounds incrementWithTtl too", async () => {
    const kv = createMemoryKv({ maxEntries: 2 });
    await kv.incrementWithTtl("a", 60);
    await kv.incrementWithTtl("b", 60);
    await kv.incrementWithTtl("c", 60);
    await expect(kv.get("a")).resolves.toBeNull();
    await expect(kv.incrementWithTtl("c", 60)).resolves.toBe(2);
  });

  it("survives a zero bound instead of spinning forever", async () => {
    // maxEntries: 0 makes the eviction loop's guard reachable — `entries.size >= 0`
    // is always true, so without the break it would loop forever on an empty map.
    const kv = createMemoryKv({ maxEntries: 0 });
    await expect(kv.set("k", "v")).resolves.toBeUndefined();
    await expect(kv.incrementWithTtl("rl", 60)).resolves.toBe(1);
  });

  it("re-setting an existing key replaces it rather than duplicating", async () => {
    const kv = createMemoryKv({ maxEntries: 2 });
    await kv.set("k", "first");
    await kv.set("k", "second");
    await kv.set("other", "o");
    await expect(kv.get("k")).resolves.toBe("second");
    await expect(kv.get("other")).resolves.toBe("o");
  });
});
