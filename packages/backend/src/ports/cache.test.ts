import { toLocationId } from "@nukesai-pos/common";
import { describe, expect, it } from "vitest";

import { buildCacheKey, buildCacheTag, hashDiscriminator } from "./cache.js";

const LOCATION = toLocationId("branch-1");

describe("buildCacheKey", () => {
  it("builds the branch-scoped pos:{location}:{entity}:{discriminator} shape", () => {
    expect(buildCacheKey(LOCATION, "orders", "abc123")).toBe("pos:branch-1:orders:abc123");
  });
});

describe("buildCacheTag", () => {
  it("builds the branch-scoped pos:{location}:{entity} shape", () => {
    expect(buildCacheTag(LOCATION, "menu")).toBe("pos:branch-1:menu");
  });
});

describe("hashDiscriminator", () => {
  it("is stable across object key order, including nested objects", () => {
    expect(hashDiscriminator({ a: 1, b: { y: 2, x: 1 } })).toBe(
      hashDiscriminator({ b: { x: 1, y: 2 }, a: 1 }),
    );
  });

  it("is deterministic for the same input", () => {
    expect(hashDiscriminator({ page: 2, status: "ready" })).toBe(
      hashDiscriminator({ status: "ready", page: 2 }),
    );
  });

  it("produces distinct hashes for different inputs", () => {
    expect(hashDiscriminator({ a: 1 })).not.toBe(hashDiscriminator({ a: 2 }));
    expect(hashDiscriminator("a")).not.toBe(hashDiscriminator("b"));
  });

  it("handles arrays, null and primitives without sorting them", () => {
    expect(hashDiscriminator([2, 1])).not.toBe(hashDiscriminator([1, 2]));
    expect(hashDiscriminator(null)).toBe(hashDiscriminator(null));
    expect(hashDiscriminator({ list: [1, { b: 2, a: 1 }], none: null, s: "x" })).toBe(
      hashDiscriminator({ s: "x", none: null, list: [1, { a: 1, b: 2 }] }),
    );
  });

  it("returns a compact base36 token", () => {
    expect(hashDiscriminator({ a: 1 })).toMatch(/^[0-9a-z]+$/);
  });
});
