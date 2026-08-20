import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEnv, type PosEnv } from "../env.js";
import { createCacheFromEnv } from "./from-env.js";

import type { Redis } from "ioredis";

const makeEnv = (extra: Readonly<Record<string, string>> = {}): PosEnv =>
  parseEnv({
    DATABASE_URL: "postgres://localhost:5432/pos",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    BETTER_AUTH_URL: "http://localhost:3000",
    ...extra,
  });

interface GlobalWithRedis {
  __nukesaiPosIoredis?: Redis;
}

afterEach(() => {
  const g = globalThis as GlobalWithRedis;
  g.__nukesaiPosIoredis?.disconnect();
  delete g.__nukesaiPosIoredis;
});

describe("createCacheFromEnv", () => {
  it("memory driver returns a cache with a null kv", async () => {
    const onStoreError = vi.fn<(error: Error) => void>();
    const { cache, kv } = await createCacheFromEnv(makeEnv(), { onStoreError });
    expect(kv).toBeNull();
    expect(typeof cache.getOrSet).toBe("function");
    await cache.set("pos:loc:entity:k", { a: 1 }, { ttlSeconds: 60 });
    await expect(cache.get("pos:loc:entity:k")).resolves.toEqual({ a: 1 });
    await cache.close();
  });

  it("fires the production fallback warning when memory is used in production", async () => {
    const onMemoryFallbackInProduction = vi.fn<() => void>();
    const { kv } = await createCacheFromEnv(
      makeEnv({ NODE_ENV: "production", ALLOW_MEMORY_CACHE_IN_PROD: "true" }),
      {
        onStoreError: vi.fn<(error: Error) => void>(),
        onMemoryFallbackInProduction,
      },
    );
    expect(kv).toBeNull();
    expect(onMemoryFallbackInProduction).toHaveBeenCalledTimes(1);
  });

  it("tolerates a missing fallback warning callback in production", async () => {
    const { kv } = await createCacheFromEnv(
      makeEnv({ NODE_ENV: "production", ALLOW_MEMORY_CACHE_IN_PROD: "true" }),
      {
        onStoreError: vi.fn<(error: Error) => void>(),
      },
    );
    expect(kv).toBeNull();
  });

  it("does not fire the fallback warning outside production", async () => {
    const onMemoryFallbackInProduction = vi.fn<() => void>();
    await createCacheFromEnv(makeEnv({ NODE_ENV: "development" }), {
      onStoreError: vi.fn<(error: Error) => void>(),
      onMemoryFallbackInProduction,
    });
    expect(onMemoryFallbackInProduction).not.toHaveBeenCalled();
  });

  it("ioredis driver builds the shared lazy client from CACHE_URL and returns a kv", async () => {
    const onStoreError = vi.fn<(error: Error) => void>();
    const { cache, kv } = await createCacheFromEnv(
      makeEnv({ CACHE_DRIVER: "ioredis", CACHE_URL: "redis://127.0.0.1:6399" }),
      { onStoreError },
    );
    expect(kv).not.toBeNull();
    expect(typeof cache.getOrSet).toBe("function");
    const shared = (globalThis as GlobalWithRedis).__nukesaiPosIoredis;
    expect(shared).toBeDefined();
    // The onStoreError dep is wired as the client's 'error' listener.
    shared?.emit("error", new Error("redis down"));
    expect(onStoreError).toHaveBeenCalledTimes(1);
  });

  it("upstash driver builds an HTTP store and kv from the REST env vars", async () => {
    const { cache, kv } = await createCacheFromEnv(
      makeEnv({
        CACHE_DRIVER: "upstash",
        UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "secret-token",
      }),
      { onStoreError: vi.fn<(error: Error) => void>() },
    );
    expect(kv).not.toBeNull();
    expect(typeof cache.getOrSet).toBe("function");
    await cache.close();
  });
});
