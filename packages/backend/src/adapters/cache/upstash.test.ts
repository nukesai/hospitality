import { afterEach, describe, expect, it, vi } from "vitest";

import { createUpstashCacheStore, createUpstashKv, createUpstashKvClient } from "./upstash.js";

import type { Redis } from "@upstash/redis";

const { instances, FakeUpstashRedis } = vi.hoisted(() => {
  class FakeUpstashPipeline {
    readonly commands: (readonly unknown[])[] = [];
    execCount = 0;

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

    async exec(): Promise<unknown[]> {
      this.execCount += 1;
      return Promise.resolve(this.commands.map(() => "OK"));
    }
  }

  /** Hand-rolled @upstash/redis stand-in: records config and every command. */
  class FakeUpstashRedis {
    static readonly created: FakeUpstashRedis[] = [];
    readonly config: Readonly<Record<string, unknown>>;
    readonly calls: (readonly unknown[])[] = [];
    readonly pipelines: FakeUpstashPipeline[] = [];
    sscanPages: [string | number, (string | number)[]][] = [];
    getResult: string | null = null;
    getdelResult: string | null = null;
    incrResult = 1;

    constructor(config: Readonly<Record<string, unknown>>) {
      this.config = config;
      FakeUpstashRedis.created.push(this);
    }

    async get(key: string): Promise<string | null> {
      this.calls.push(["get", key]);
      return Promise.resolve(this.getResult);
    }

    async set(...args: unknown[]): Promise<string> {
      this.calls.push(["set", ...args]);
      return Promise.resolve("OK");
    }

    async unlink(...keys: unknown[]): Promise<number> {
      this.calls.push(["unlink", ...keys]);
      return Promise.resolve(keys.length);
    }

    async sscan(...args: unknown[]): Promise<[string | number, (string | number)[]]> {
      this.calls.push(["sscan", ...args]);
      return Promise.resolve(this.sscanPages.shift() ?? ["0", []]);
    }

    async getdel(key: string): Promise<string | null> {
      this.calls.push(["getdel", key]);
      return Promise.resolve(this.getdelResult);
    }

    async incr(key: string): Promise<number> {
      this.calls.push(["incr", key]);
      return Promise.resolve(this.incrResult);
    }

    async expire(...args: unknown[]): Promise<number> {
      this.calls.push(["expire", ...args]);
      return Promise.resolve(1);
    }

    pipeline(): FakeUpstashPipeline {
      const pipeline = new FakeUpstashPipeline();
      this.pipelines.push(pipeline);
      return pipeline;
    }
  }

  return { instances: FakeUpstashRedis.created, FakeUpstashRedis };
});

vi.mock("@upstash/redis", () => ({ Redis: FakeUpstashRedis }));

const OPTIONS = { url: "https://fake.upstash.io", token: "secret-token" } as const;

const lastInstance = (): InstanceType<typeof FakeUpstashRedis> => {
  const instance = instances.at(-1);
  if (instance === undefined) throw new Error("no FakeUpstashRedis constructed");
  return instance;
};

afterEach(() => {
  instances.length = 0;
});

describe("createUpstashCacheStore", () => {
  it("constructs the HTTP client with automaticDeserialization disabled", () => {
    createUpstashCacheStore(OPTIONS);
    expect(lastInstance().config).toEqual({
      url: "https://fake.upstash.io",
      token: "secret-token",
      automaticDeserialization: false,
    });
  });

  it("get delegates to the client", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    fake.getResult = "envelope";
    await expect(store.get("k1")).resolves.toBe("envelope");
    expect(fake.calls).toEqual([["get", "k1"]]);
  });

  it("set without tags issues a single SET with ex", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    await store.set("k1", '{"v":1}', 60, []);
    expect(fake.calls).toEqual([["set", "k1", '{"v":1}', { ex: 60 }]]);
    expect(fake.pipelines).toHaveLength(0);
  });

  it("set with tags pipelines SET, SADD and EXPIRE GT per tag and execs once", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    await store.set("k1", '{"v":1}', 60, ["t1", "t2"]);
    expect(fake.pipelines).toHaveLength(1);
    expect(fake.pipelines[0]?.commands).toEqual([
      ["set", "k1", '{"v":1}', { ex: 60 }],
      ["sadd", "pos:tagset:{t1}", "k1"],
      ["expire", "pos:tagset:{t1}", 86_400, "GT"],
      ["sadd", "pos:tagset:{t2}", "k1"],
      ["expire", "pos:tagset:{t2}", 86_400, "GT"],
    ]);
    expect(fake.pipelines[0]?.execCount).toBe(1);
  });

  it("del short-circuits on an empty key list", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    await store.del([]);
    expect(fake.calls).toEqual([]);
  });

  it("del unlinks all given keys", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    await store.del(["a", "b"]);
    expect(fake.calls).toEqual([["unlink", "a", "b"]]);
  });

  it("invalidateTags walks cursor pages, stringifies numeric cursors and members", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    fake.sscanPages = [
      [7, ["k1", 42]],
      ["3", ["k2"]],
      [0, []],
    ];
    await store.invalidateTags(["t1"]);
    expect(fake.calls).toEqual([
      ["sscan", "pos:tagset:{t1}", "0", { count: 500 }],
      ["unlink", "k1", "42"],
      ["sscan", "pos:tagset:{t1}", "7", { count: 500 }],
      ["unlink", "k2"],
      ["sscan", "pos:tagset:{t1}", "3", { count: 500 }],
      ["unlink", "pos:tagset:{t1}"],
    ]);
  });

  it("close is a no-op for the HTTP client", async () => {
    const store = createUpstashCacheStore(OPTIONS);
    const fake = lastInstance();
    await expect(store.close()).resolves.toBeUndefined();
    expect(fake.calls).toEqual([]);
  });
});

describe("createUpstashKvClient", () => {
  it("builds a raw client with automaticDeserialization disabled", () => {
    createUpstashKvClient(OPTIONS);
    expect(lastInstance().config).toEqual({
      url: "https://fake.upstash.io",
      token: "secret-token",
      automaticDeserialization: false,
    });
  });
});

describe("createUpstashKv", () => {
  const makeKv = () => {
    const fake = new FakeUpstashRedis({});
    return { fake, kv: createUpstashKv(fake as unknown as Redis) };
  };

  it("get delegates to the client", async () => {
    const { fake, kv } = makeKv();
    fake.getResult = "value";
    await expect(kv.get("k")).resolves.toBe("value");
    expect(fake.calls).toEqual([["get", "k"]]);
  });

  it("set with a ttl passes ex", async () => {
    const { fake, kv } = makeKv();
    await kv.set("k", "v", 30);
    expect(fake.calls).toEqual([["set", "k", "v", { ex: 30 }]]);
  });

  it("set without a ttl issues a plain SET", async () => {
    const { fake, kv } = makeKv();
    await kv.set("k", "v");
    expect(fake.calls).toEqual([["set", "k", "v"]]);
  });

  it("delete unlinks the key", async () => {
    const { fake, kv } = makeKv();
    await kv.delete("k");
    expect(fake.calls).toEqual([["unlink", "k"]]);
  });

  it("getAndDelete uses GETDEL", async () => {
    const { fake, kv } = makeKv();
    fake.getdelResult = "gone";
    await expect(kv.getAndDelete("k")).resolves.toBe("gone");
    expect(fake.calls).toEqual([["getdel", "k"]]);
  });

  it("incrementWithTtl sets the TTL with EXPIRE NX only on key creation", async () => {
    const { fake, kv } = makeKv();
    fake.incrResult = 1;
    await expect(kv.incrementWithTtl("counter", 45)).resolves.toBe(1);
    expect(fake.calls).toEqual([
      ["incr", "counter"],
      ["expire", "counter", 45, "NX"],
    ]);
  });

  it("incrementWithTtl skips EXPIRE when the key already existed", async () => {
    const { fake, kv } = makeKv();
    fake.incrResult = 2;
    await expect(kv.incrementWithTtl("counter", 45)).resolves.toBe(2);
    expect(fake.calls).toEqual([["incr", "counter"]]);
  });
});
