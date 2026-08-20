import { describe, expect, it } from "vitest";

import type { KvPort } from "../../ports/kv.js";
import { createSecondaryStorage } from "./secondary-storage.js";

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

const makeKv = (): { kv: KvPort; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const kv: KvPort = {
    get: async (key) => {
      calls.push({ method: "get", args: [key] });
      return Promise.resolve("stored-value");
    },
    set: async (key, value, ttlSeconds) => {
      calls.push({ method: "set", args: [key, value, ttlSeconds] });
      return Promise.resolve();
    },
    delete: async (key) => {
      calls.push({ method: "delete", args: [key] });
      return Promise.resolve();
    },
    getAndDelete: async (key) => {
      calls.push({ method: "getAndDelete", args: [key] });
      return Promise.resolve("taken-value");
    },
    incrementWithTtl: async (key, ttlSeconds) => {
      calls.push({ method: "incrementWithTtl", args: [key, ttlSeconds] });
      return Promise.resolve(7);
    },
  };
  return { kv, calls };
};

describe("createSecondaryStorage", () => {
  it("get prefixes the key and returns the stored value", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "pos:");
    await expect(storage.get("session:1")).resolves.toBe("stored-value");
    expect(calls).toEqual([{ method: "get", args: ["pos:session:1"] }]);
  });

  it("set prefixes the key and forwards value and ttl", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "pos:");
    await expect(storage.set("session:1", "payload", 60)).resolves.toBeUndefined();
    expect(calls).toEqual([{ method: "set", args: ["pos:session:1", "payload", 60] }]);
  });

  it("set forwards an omitted ttl as undefined", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "pos:");
    await expect(storage.set("session:1", "payload")).resolves.toBeUndefined();
    expect(calls).toEqual([{ method: "set", args: ["pos:session:1", "payload", undefined] }]);
  });

  it("delete prefixes the key", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "pos:");
    await expect(storage.delete("session:1")).resolves.toBeUndefined();
    expect(calls).toEqual([{ method: "delete", args: ["pos:session:1"] }]);
  });

  it("getAndDelete prefixes the key and returns the taken value", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "pos:");
    await expect(storage.getAndDelete("otp:9")).resolves.toBe("taken-value");
    expect(calls).toEqual([{ method: "getAndDelete", args: ["pos:otp:9"] }]);
  });

  it("increment prefixes the key and returns the post-increment count", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "rl:");
    await expect(storage.increment("ip:1.2.3.4", 42)).resolves.toBe(7);
    expect(calls).toEqual([{ method: "incrementWithTtl", args: ["rl:ip:1.2.3.4", 42] }]);
  });

  it("uses the prefix verbatim (empty prefix leaves keys untouched)", async () => {
    const { kv, calls } = makeKv();
    const storage = createSecondaryStorage(kv, "");
    await expect(storage.get("bare")).resolves.toBe("stored-value");
    expect(calls).toEqual([{ method: "get", args: ["bare"] }]);
  });
});
