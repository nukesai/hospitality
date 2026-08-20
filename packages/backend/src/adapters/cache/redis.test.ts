import { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIoredisClient,
  createRedisCacheStore,
  createRedisKv,
  getSharedIoredisClient,
} from "./redis.js";

type ExecResults = [Error | null, unknown][] | null;

class FakeRedisPipeline {
  readonly commands: (readonly unknown[])[] = [];
  private readonly execResults: ExecResults | "auto";

  constructor(execResults: ExecResults | "auto") {
    this.execResults = execResults;
  }

  set(...args: unknown[]): this {
    this.commands.push(["set", ...args]);
    return this;
  }

  sadd(...args: unknown[]): this {
    this.commands.push(["sadd", ...args]);
    return this;
  }

  expire(...args: unknown[]): this {
    this.commands.push(["expire", ...args]);
    return this;
  }

  async exec(): Promise<ExecResults> {
    return Promise.resolve(
      this.execResults === "auto"
        ? this.commands.map((): [Error | null, unknown] => [null, "OK"])
        : this.execResults,
    );
  }
}

/** Hand-rolled ioredis stand-in: records every command, replies from fixtures. */
class FakeRedisClient {
  execResults: ExecResults | "auto" = "auto";
  sscanPages: [string, string[]][] = [];
  getResult: string | null = null;
  getdelResult: string | null = null;
  evalResult: unknown = 1;
  readonly calls: (readonly unknown[])[] = [];
  readonly pipelines: FakeRedisPipeline[] = [];

  async get(key: string): Promise<string | null> {
    this.calls.push(["get", key]);
    return Promise.resolve(this.getResult);
  }

  async set(...args: unknown[]): Promise<"OK"> {
    this.calls.push(["set", ...args]);
    return Promise.resolve("OK" as const);
  }

  async unlink(...keys: string[]): Promise<number> {
    this.calls.push(["unlink", ...keys]);
    return Promise.resolve(keys.length);
  }

  async sscan(...args: unknown[]): Promise<[string, string[]]> {
    this.calls.push(["sscan", ...args]);
    return Promise.resolve(this.sscanPages.shift() ?? ["0", []]);
  }

  async getdel(key: string): Promise<string | null> {
    this.calls.push(["getdel", key]);
    return Promise.resolve(this.getdelResult);
  }

  async eval(...args: unknown[]): Promise<unknown> {
    this.calls.push(["eval", ...args]);
    return Promise.resolve(this.evalResult);
  }

  async quit(): Promise<"OK"> {
    this.calls.push(["quit"]);
    return Promise.resolve("OK" as const);
  }

  pipeline(): FakeRedisPipeline {
    const pipeline = new FakeRedisPipeline(this.execResults);
    this.pipelines.push(pipeline);
    return pipeline;
  }
}

const asRedis = (fake: FakeRedisClient): Redis => fake as unknown as Redis;

interface GlobalWithRedis {
  __nukesaiPosIoredis?: Redis;
}

const disconnectSharedClient = (): void => {
  const g = globalThis as GlobalWithRedis;
  g.__nukesaiPosIoredis?.disconnect();
  delete g.__nukesaiPosIoredis;
};

describe("createIoredisClient", () => {
  it("builds a lazy client with one error listener and bounded retry backoff", () => {
    const onError = vi.fn<(error: Error) => void>();
    const client = createIoredisClient({ url: "redis://127.0.0.1:6399", onError });
    try {
      expect(client).toBeInstanceOf(Redis);
      expect(client.listenerCount("error")).toBe(1);
      expect(client.options.lazyConnect).toBe(true);
      expect(client.options.maxRetriesPerRequest).toBe(2);
      expect(client.options.enableAutoPipelining).toBe(true);
      const retry = client.options.retryStrategy;
      expect(retry?.(1)).toBe(200);
      expect(retry?.(100)).toBe(2_000);
      client.emit("error", new Error("boom"));
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      client.disconnect();
    }
  });
});

describe("getSharedIoredisClient", () => {
  afterEach(() => {
    disconnectSharedClient();
  });

  it("creates the client once and reuses the globalThis singleton", () => {
    const onError = vi.fn<(error: Error) => void>();
    const first = getSharedIoredisClient({ url: "redis://127.0.0.1:6399", onError });
    const second = getSharedIoredisClient({ url: "redis://other-host:1234", onError });
    expect(first).toBeInstanceOf(Redis);
    expect(second).toBe(first);
    expect((globalThis as GlobalWithRedis).__nukesaiPosIoredis).toBe(first);
  });
});

describe("createRedisCacheStore", () => {
  it("get delegates to the client", async () => {
    const fake = new FakeRedisClient();
    fake.getResult = "envelope";
    const store = createRedisCacheStore(asRedis(fake));
    await expect(store.get("k1")).resolves.toBe("envelope");
    expect(fake.calls).toEqual([["get", "k1"]]);
  });

  it("set without tags issues a single SET with EX", async () => {
    const fake = new FakeRedisClient();
    const store = createRedisCacheStore(asRedis(fake));
    await store.set("k1", '{"v":1}', 60, []);
    expect(fake.calls).toEqual([["set", "k1", '{"v":1}', "EX", 60]]);
    expect(fake.pipelines).toHaveLength(0);
  });

  it("set with tags pipelines SET, SADD and EXPIRE GT per tag", async () => {
    const fake = new FakeRedisClient();
    const store = createRedisCacheStore(asRedis(fake));
    await store.set("k1", '{"v":1}', 60, ["t1", "t2"]);
    expect(fake.pipelines).toHaveLength(1);
    expect(fake.pipelines[0]?.commands).toEqual([
      ["set", "k1", '{"v":1}', "EX", 60],
      ["sadd", "pos:tagset:{t1}", "k1"],
      ["expire", "pos:tagset:{t1}", 86_400, "GT"],
      ["sadd", "pos:tagset:{t2}", "k1"],
      ["expire", "pos:tagset:{t2}", 86_400, "GT"],
    ]);
  });

  it("set surfaces the first per-command pipeline error as a throw", async () => {
    const fake = new FakeRedisClient();
    fake.execResults = [
      [null, "OK"],
      [new Error("SADD failed"), null],
      [null, 1],
    ];
    const store = createRedisCacheStore(asRedis(fake));
    await expect(store.set("k1", "{}", 60, ["t1"])).rejects.toThrow("SADD failed");
  });

  it("set tolerates a null pipeline.exec() result", async () => {
    const fake = new FakeRedisClient();
    fake.execResults = null;
    const store = createRedisCacheStore(asRedis(fake));
    await expect(store.set("k1", "{}", 60, ["t1"])).resolves.toBeUndefined();
  });

  it("del short-circuits on an empty key list", async () => {
    const fake = new FakeRedisClient();
    const store = createRedisCacheStore(asRedis(fake));
    await store.del([]);
    expect(fake.calls).toEqual([]);
  });

  it("del unlinks all given keys", async () => {
    const fake = new FakeRedisClient();
    const store = createRedisCacheStore(asRedis(fake));
    await store.del(["a", "b"]);
    expect(fake.calls).toEqual([["unlink", "a", "b"]]);
  });

  it("invalidateTags walks SSCAN cursor pages, unlinks members then the set", async () => {
    const fake = new FakeRedisClient();
    fake.sscanPages = [
      ["7", ["k1", "k2"]],
      ["0", []],
    ];
    const store = createRedisCacheStore(asRedis(fake));
    await store.invalidateTags(["t1"]);
    expect(fake.calls).toEqual([
      ["sscan", "pos:tagset:{t1}", "0", "COUNT", 500],
      ["unlink", "k1", "k2"],
      ["sscan", "pos:tagset:{t1}", "7", "COUNT", 500],
      ["unlink", "pos:tagset:{t1}"],
    ]);
  });

  it("invalidateTags processes every tag independently", async () => {
    const fake = new FakeRedisClient();
    fake.sscanPages = [
      ["0", ["a"]],
      ["0", ["b"]],
    ];
    const store = createRedisCacheStore(asRedis(fake));
    await store.invalidateTags(["t1", "t2"]);
    expect(fake.calls).toEqual([
      ["sscan", "pos:tagset:{t1}", "0", "COUNT", 500],
      ["unlink", "a"],
      ["unlink", "pos:tagset:{t1}"],
      ["sscan", "pos:tagset:{t2}", "0", "COUNT", 500],
      ["unlink", "b"],
      ["unlink", "pos:tagset:{t2}"],
    ]);
  });

  it("close quits the client", async () => {
    const fake = new FakeRedisClient();
    const store = createRedisCacheStore(asRedis(fake));
    await store.close();
    expect(fake.calls).toEqual([["quit"]]);
  });
});

describe("createRedisKv", () => {
  it("get delegates to the client", async () => {
    const fake = new FakeRedisClient();
    fake.getResult = "value";
    const kv = createRedisKv(asRedis(fake));
    await expect(kv.get("k")).resolves.toBe("value");
    expect(fake.calls).toEqual([["get", "k"]]);
  });

  it("set with a ttl issues SET EX", async () => {
    const fake = new FakeRedisClient();
    const kv = createRedisKv(asRedis(fake));
    await kv.set("k", "v", 30);
    expect(fake.calls).toEqual([["set", "k", "v", "EX", 30]]);
  });

  it("set without a ttl issues a plain SET", async () => {
    const fake = new FakeRedisClient();
    const kv = createRedisKv(asRedis(fake));
    await kv.set("k", "v");
    expect(fake.calls).toEqual([["set", "k", "v"]]);
  });

  it("delete unlinks the key", async () => {
    const fake = new FakeRedisClient();
    const kv = createRedisKv(asRedis(fake));
    await kv.delete("k");
    expect(fake.calls).toEqual([["unlink", "k"]]);
  });

  it("getAndDelete uses GETDEL", async () => {
    const fake = new FakeRedisClient();
    fake.getdelResult = "gone";
    const kv = createRedisKv(asRedis(fake));
    await expect(kv.getAndDelete("k")).resolves.toBe("gone");
    expect(fake.calls).toEqual([["getdel", "k"]]);
  });

  it("incrementWithTtl runs the INCR+EXPIRE Lua script with a string ttl arg", async () => {
    const fake = new FakeRedisClient();
    fake.evalResult = 3;
    const kv = createRedisKv(asRedis(fake));
    await expect(kv.incrementWithTtl("counter", 45)).resolves.toBe(3);
    expect(fake.calls).toHaveLength(1);
    const [cmd, script, numKeys, key, ttlArg] = fake.calls[0] ?? [];
    expect(cmd).toBe("eval");
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");
    expect(numKeys).toBe(1);
    expect(key).toBe("counter");
    expect(ttlArg).toBe("45");
  });
});
