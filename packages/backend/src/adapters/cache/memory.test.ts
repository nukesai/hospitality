import { describe, expect, it } from "vitest";

import { createMemoryCacheStore } from "./memory.js";

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
