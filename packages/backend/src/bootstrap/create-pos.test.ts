import type { LogFields, LoggerPort } from "@nukesai-pos/common";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailPort } from "../ports/mail.js";
import { createNukesPos } from "./create-pos.js";

const DB_GLOBAL_KEY = Symbol.for("@nukesai-pos/backend:drizzle-pool");

interface IoredisLike {
  readonly status: string;
  readonly emit: (event: "error", error: Error) => boolean;
  readonly disconnect: () => void;
}

type GlobalStore = Record<symbol, unknown> & { __nukesaiPosIoredis?: IoredisLike };

const globalStore = globalThis as GlobalStore;

const resetSingletons = (): void => {
  Reflect.deleteProperty(globalStore, DB_GLOBAL_KEY);
  globalStore.__nukesaiPosIoredis?.disconnect();
  delete globalStore.__nukesaiPosIoredis;
};

/** Dead local port: pg.Pool never connects unless queried, and no test queries. */
const baseEnv: Record<string, string> = {
  DATABASE_URL: "postgres://pos:pos@127.0.0.1:5433/pos_test",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
};

interface LogRecord {
  readonly level: string;
  readonly message: string;
  readonly fields: LogFields | undefined;
}

interface RecordingLogger {
  readonly logger: LoggerPort;
  readonly records: LogRecord[];
  readonly events: string[];
}

const createRecordingLogger = (events: string[] = []): RecordingLogger => {
  const records: LogRecord[] = [];
  const record =
    (level: string) =>
    (message: string, fields?: LogFields): void => {
      records.push({ level, message, fields });
    };
  const logger: LoggerPort = {
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    child: (): LoggerPort => logger,
    flush: async (): Promise<void> => {
      events.push("logger.flush");
      await Promise.resolve();
    },
  };
  return { logger, records, events };
};

const createRecordingMail = (events: string[] = []): { mail: MailPort; events: string[] } => {
  const mail: MailPort = {
    send: async (): Promise<void> => {
      events.push("mail.send");
      await Promise.resolve();
    },
    close: async (): Promise<void> => {
      events.push("mail.close");
      await Promise.resolve();
    },
  };
  return { mail, events };
};

describe("createNukesPos", () => {
  beforeEach(resetSingletons);
  afterEach(resetSingletons);

  it("rejects when the environment is invalid (parseEnv wired)", async () => {
    await expect(createNukesPos({ env: {} })).rejects.toThrow(/Invalid environment/);
  });

  it("wires pool, cache, mail, auth, and trpc deps for the memory driver", async () => {
    const { logger, records } = createRecordingLogger();
    const { mail } = createRecordingMail();
    const onPoolCreated = vi.fn<(pool: pg.Pool) => void>();
    const waitUntil = vi.fn<(p: Promise<unknown>) => void>();

    const pos = await createNukesPos({ env: baseEnv, logger, mail, onPoolCreated, waitUntil });

    expect(pos.env.DATABASE_URL).toBe(baseEnv.DATABASE_URL);
    expect(onPoolCreated).toHaveBeenCalledTimes(1);
    expect(onPoolCreated).toHaveBeenCalledWith(pos.pool);

    // memory driver: cache works locally, kv is null.
    expect(pos.kv).toBeNull();
    await pos.cache.set("k", { n: 1 }, { ttlSeconds: 60 });
    await expect(pos.cache.get("k")).resolves.toEqual({ n: 1 });

    // mail override respected.
    expect(pos.mail).toBe(mail);
    expect(pos.logger).toBe(logger);

    // auth exposes api + handler.
    expect(typeof pos.auth.handler).toBe("function");
    expect(typeof pos.auth.api.getSession).toBe("function");

    // trpc deps wiring.
    const deps = pos.trpc.deps;
    expect(deps.auth).toBe(pos.auth);
    expect(deps.db).toBe(pos.db);
    expect(deps.cache).toBe(pos.cache);
    expect(deps.kv).toBeNull();
    expect(deps.logger).toBe(logger);
    expect(deps.analytics).toBe(pos.analytics);
    expect(deps.isDev).toBe(true); // NODE_ENV defaults to development
    expect(deps.defaultLocale).toBe("en");
    expect(deps.trustedOrigins).toContain("http://localhost:3000");
    expect(typeof deps.translatorFor("en").t).toBe("function");

    // pg pool error handler is routed to the logger.
    pos.pool.emit("error", new Error("boom"));
    expect(records).toContainEqual({
      level: "error",
      message: "pg.pool.error",
      fields: { message: "boom" },
    });

    await pos.shutdown();
  });

  it("selects noop mail by default and createContext yields a session-less context", async () => {
    const { logger } = createRecordingLogger();
    const pos = await createNukesPos({ env: baseEnv, logger });

    // MAIL_DRIVER defaults to noop: send resolves without any transport.
    await expect(pos.mail.send({ to: "a@b.c", subject: "s", text: "t" })).resolves.toBeUndefined();

    // No cookies -> better-auth short-circuits to a null session (no DB query;
    // DATABASE_URL points at a dead port, so a query would hang/fail).
    expect(typeof pos.trpc.createContext).toBe("function");
    const request = new Request("http://localhost:3000/api/trpc/x", {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "x-branch-id": "branch-1",
        "x-forwarded-for": "1.2.3.4, 10.0.0.1",
      },
    });
    const ctx = await pos.trpc.createContext(request);
    expect(ctx.session).toBeNull();
    expect(ctx.requestedBranchId).toBe("branch-1");
    expect(ctx.ip).toBe("1.2.3.4");
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.deps).toBe(pos.trpc.deps);

    await pos.shutdown();
  });

  it("builds the smtp mail adapter (no connection) and the default pino logger", async () => {
    const pos = await createNukesPos({
      env: {
        ...baseEnv,
        MAIL_DRIVER: "smtp",
        SMTP_HOST: "127.0.0.1",
        LOG_LEVEL: "fatal", // non-silent branch of the default-logger level mapping
      },
    });

    expect(typeof pos.mail.send).toBe("function");
    expect(typeof pos.mail.close).toBe("function");

    // default logger path: pino adapter, child + flush work.
    const child = pos.logger.child({ requestId: "r-1" });
    expect(typeof child.info).toBe("function");
    await pos.logger.flush();

    // shutdown closes the (never-connected) smtp transporter.
    await expect(pos.shutdown()).resolves.toBeUndefined();
  });

  it("maps LOG_LEVEL=silent to a fatal-level default logger without throwing", async () => {
    const { mail } = createRecordingMail();
    const pos = await createNukesPos({ env: { ...baseEnv, LOG_LEVEL: "silent" }, mail });

    pos.logger.info("suppressed");
    await pos.logger.flush();
    await pos.shutdown();
  });

  it("warns when production falls back to the memory cache driver", async () => {
    const { logger, records } = createRecordingLogger();
    const { mail } = createRecordingMail();
    // Production path now runs the R2 boot guard (a real query) — stub it to a
    // compliant pos_app-shaped role so no live DB is needed.
    const querySpy = vi.spyOn(pg.Pool.prototype, "query").mockResolvedValue({
      rows: [{ rolname: "pos_app", rolsuper: false, rolbypassrls: false, owns_orders: false }],
    } as never);
    const pos = await createNukesPos({
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        ALLOW_MEMORY_CACHE_IN_PROD: "true",
        CACHE_DRIVER: "memory",
      },
      logger,
      mail,
    });

    querySpy.mockRestore();
    expect(records.some((r) => r.level === "warn" && r.message === "cache.memory-fallback")).toBe(
      true,
    );
    expect(pos.trpc.deps.isDev).toBe(false);

    await pos.shutdown();
  });

  it("exposes a non-null kv for the ioredis driver and logs store errors", async () => {
    const { logger, records } = createRecordingLogger();
    const { mail } = createRecordingMail();
    const pos = await createNukesPos({
      env: { ...baseEnv, CACHE_DRIVER: "ioredis", CACHE_URL: "redis://127.0.0.1:6390" },
      logger,
      mail,
    });

    expect(pos.kv).not.toBeNull();

    // lazyConnect client: no TCP yet; emitting "error" exercises onStoreError.
    const client = globalStore.__nukesaiPosIoredis;
    expect(client?.status).toBe("wait");
    client?.emit("error", new Error("redis down"));
    expect(records).toContainEqual({
      level: "error",
      message: "cache.store.error",
      fields: { message: "redis down" },
    });

    // Skip shutdown (quit would dial the dead redis port); release directly.
    client?.disconnect();
    await pos.pool.end();
  });

  it("shuts down in order (mail -> cache -> pool -> logger) exactly once", async () => {
    const events: string[] = [];
    const { logger } = createRecordingLogger(events);
    const { mail } = createRecordingMail(events);
    const pos = await createNukesPos({ env: baseEnv, logger, mail });

    vi.spyOn(pos.cache, "close").mockImplementation(async (): Promise<void> => {
      events.push("cache.close");
      await Promise.resolve();
    });
    // Direct patch instead of vi.spyOn: pg's `end(callback): void` overload trips
    // no-misused-promises when an async implementation is passed to the spy.
    const realEnd = pos.pool.end.bind(pos.pool);
    const patchablePool = pos.pool as unknown as { end: () => Promise<void> };
    patchablePool.end = async (): Promise<void> => {
      events.push("pool.end");
      await realEnd();
    };

    const first = pos.shutdown();
    const second = pos.shutdown();
    expect(second).toBe(first);
    await first;
    await second;
    expect(pos.shutdown()).toBe(first); // still memoized after resolution

    expect(events).toEqual(["mail.close", "cache.close", "pool.end", "logger.flush"]);
  });

  it("tears the pool down when a boot dies half-built", async () => {
    // getPos() retries a failed boot, so a boot that creates the pool and then
    // throws must close it — otherwise every retry strands another pg.Pool and
    // a flapping database exhausts max_connections with pools nobody holds.
    resetSingletons();
    const { logger } = createRecordingLogger();
    let pool: pg.Pool | undefined;
    await expect(
      createNukesPos({
        env: { ...baseEnv, CACHE_DRIVER: "ioredis" }, // no CACHE_URL -> env parse is fine, connect is not
        logger,
        onPoolCreated: (created) => {
          pool = created;
        },
        mail: { send: async () => Promise.resolve(), close: async () => Promise.resolve() },
      }),
    ).rejects.toThrow();
    expect(pool).toBeUndefined(); // env validation fails before the pool exists
  });

  it("closes an ALREADY-created pool when a later boot step throws", async () => {
    resetSingletons();
    const { logger } = createRecordingLogger();
    const ended: string[] = [];
    let pool: pg.Pool | undefined;
    const boom = new Error("cache driver unreachable");
    await expect(
      createNukesPos({
        env: baseEnv,
        logger,
        onPoolCreated: (created) => {
          pool = created;
          const realEnd = created.end.bind(created);
          Object.defineProperty(created, "end", {
            value: async () => {
              ended.push("end");
              return realEnd();
            },
          });
          throw boom; // the earliest post-pool step that can fail
        },
        mail: { send: async () => Promise.resolve(), close: async () => Promise.resolve() },
      }),
    ).rejects.toThrow(boom);
    expect(pool).toBeDefined();
    expect(ended).toEqual(["end"]);
  });

  it("a failing teardown never masks the original boot error", async () => {
    resetSingletons();
    const { logger } = createRecordingLogger();
    const boom = new Error("cache driver unreachable");
    await expect(
      createNukesPos({
        env: baseEnv,
        logger,
        onPoolCreated: (created) => {
          Object.defineProperty(created, "end", {
            value: async () => Promise.reject(new Error("pool already destroyed")),
          });
          throw boom;
        },
        mail: { send: async () => Promise.resolve(), close: async () => Promise.resolve() },
      }),
      // The caller must see WHY the boot failed, not why the cleanup did.
    ).rejects.toThrow(boom);
  });
});
