import { AppError, isAppError } from "@nukesai-pos/common/errors";
import { describe, expect, it, vi } from "vitest";

import type { CachePort } from "../ports/cache.js";
import type { PosTrpcMeta } from "../trpc/init.js";
import { applyCacheInvalidation, enforceCacheMeta } from "./invalidation.js";

const makePort = (invalidateTags: CachePort["invalidateTags"]): CachePort => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  invalidateTags,
  getOrSet: vi.fn(),
  close: vi.fn(),
});

describe("enforceCacheMeta", () => {
  it("lets queries pass without any meta", () => {
    expect(() => {
      enforceCacheMeta(undefined, "query", "orders.list");
    }).not.toThrow();
  });

  it("lets subscriptions pass without any meta", () => {
    expect(() => {
      enforceCacheMeta(undefined, "subscription", "orders.watch");
    }).not.toThrow();
  });

  it("throws an INTERNAL AppError for a mutation without meta", () => {
    let caught: unknown;
    try {
      enforceCacheMeta(undefined, "mutation", "orders.create");
    } catch (error) {
      caught = error;
    }
    expect(isAppError(caught)).toBe(true);
    expect((caught as AppError).code).toBe("INTERNAL");
    expect((caught as AppError).message).toContain('Mutation "orders.create"');
  });

  it("throws for a mutation whose meta omits cacheInvalidates", () => {
    expect(() => {
      enforceCacheMeta({}, "mutation", "orders.create");
    }).toThrow(AppError);
  });

  it('accepts a mutation that declares "none"', () => {
    const meta: PosTrpcMeta = { cacheInvalidates: "none" };
    expect(() => {
      enforceCacheMeta(meta, "mutation", "orders.create");
    }).not.toThrow();
  });

  it("accepts a mutation that declares entities", () => {
    const meta: PosTrpcMeta = { cacheInvalidates: ["orders"] };
    expect(() => {
      enforceCacheMeta(meta, "mutation", "orders.create");
    }).not.toThrow();
  });
});

describe("applyCacheInvalidation", () => {
  it("does nothing when meta is undefined", async () => {
    const invalidateTags = vi.fn<CachePort["invalidateTags"]>().mockResolvedValue(undefined);
    await applyCacheInvalidation(makePort(invalidateTags), "branch-1", undefined);
    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it("does nothing when meta omits cacheInvalidates", async () => {
    const invalidateTags = vi.fn<CachePort["invalidateTags"]>().mockResolvedValue(undefined);
    await applyCacheInvalidation(makePort(invalidateTags), "branch-1", {});
    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it('does nothing when the mutation declared "none"', async () => {
    const invalidateTags = vi.fn<CachePort["invalidateTags"]>().mockResolvedValue(undefined);
    await applyCacheInvalidation(makePort(invalidateTags), "branch-1", {
      cacheInvalidates: "none",
    });
    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it("does nothing for an empty entity list", async () => {
    const invalidateTags = vi.fn<CachePort["invalidateTags"]>().mockResolvedValue(undefined);
    await applyCacheInvalidation(makePort(invalidateTags), "branch-1", { cacheInvalidates: [] });
    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it("invalidates one branch-scoped tag per declared entity", async () => {
    const invalidateTags = vi.fn<CachePort["invalidateTags"]>().mockResolvedValue(undefined);
    await applyCacheInvalidation(makePort(invalidateTags), "branch-1", {
      cacheInvalidates: ["orders", "tables"],
    });
    expect(invalidateTags).toHaveBeenCalledExactlyOnceWith([
      "pos:branch-1:orders",
      "pos:branch-1:tables",
    ]);
  });

  it("propagates invalidation failure to the caller (fail closed)", async () => {
    const invalidateTags = vi
      .fn<CachePort["invalidateTags"]>()
      .mockRejectedValue(new Error("redis down"));
    await expect(
      applyCacheInvalidation(makePort(invalidateTags), "branch-1", {
        cacheInvalidates: ["menu"],
      }),
    ).rejects.toThrow("redis down");
  });
});
