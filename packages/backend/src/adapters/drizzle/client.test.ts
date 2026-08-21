import pg from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PosEnv } from "../../env.js";
import {
  assertRlsEnforcedRole,
  createPosDb,
  dbConfigFromEnv,
  type PoolFactory,
  type PosDbConfig,
  type PosSchema,
} from "./client.js";

const { Pool } = pg;

const GLOBAL_KEY = Symbol.for("@nukesai-pos/backend:drizzle-pool");

// Empty schema module: drizzle() accepts it and no schema code is exercised here.
const fakeSchema = {} as PosSchema;

const noopOnPoolError = (): void => undefined;

const makeEnv = (overrides: Partial<PosEnv> = {}): PosEnv => ({
  NODE_ENV: "test",
  BACKEND_RUNTIME: "server",
  DATABASE_URL: "postgresql://pos:secret@127.0.0.1:5432/pos",
  DATABASE_POOL_MAX: 10,
  DATABASE_POOL_IDLE_TIMEOUT_MS: 30_000,
  DATABASE_CONNECT_TIMEOUT_MS: 10_000,
  DATABASE_POOL_MAX_USES: 0,
  DATABASE_SSL: false,
  CACHE_DRIVER: "memory",
  CACHE_KEY_PREFIX: "pos",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_TRUSTED_ORIGINS: "",
  MAIL_DRIVER: "noop",
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  MAIL_FROM: "no-reply@localhost",
  LOG_LEVEL: "silent",
  ANALYTICS_DRIVER: "noop",
  API_MAX_BODY_BYTES: 1_048_576,
  DEFAULT_LOCALE: "en",
  ALLOW_MEMORY_CACHE_IN_PROD: false,
  POS_API_BASE_PATH: "/api/pos",
  ...overrides,
});

const baseConfig = (overrides: Partial<PosDbConfig> = {}): PosDbConfig => ({
  connectionString: "postgresql://pos:secret@127.0.0.1:5432/pos",
  max: 5,
  idleTimeoutMillis: 1_000,
  connectionTimeoutMillis: 2_000,
  maxUses: 0,
  allowExitOnIdle: false,
  ssl: false,
  onPoolError: noopOnPoolError,
  ...overrides,
});

interface FakePoolHarness {
  readonly factory: PoolFactory;
  readonly options: pg.PoolConfig[];
  readonly on: ReturnType<typeof vi.fn<(event: string, listener: (e: Error) => void) => void>>;
  readonly end: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

const makeFakePool = (): FakePoolHarness => {
  const options: pg.PoolConfig[] = [];
  const on = vi.fn<(event: string, listener: (e: Error) => void) => void>();
  const end = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const factory: PoolFactory = (o) => {
    options.push(o);
    return { on, end } as unknown as pg.Pool;
  };
  return { factory, options, on, end };
};

beforeEach(() => {
  Reflect.deleteProperty(globalThis, GLOBAL_KEY);
});

describe("dbConfigFromEnv", () => {
  it("maps env values one-to-one for the server runtime", () => {
    const env = makeEnv();
    const config = dbConfigFromEnv(env, noopOnPoolError);
    expect(config).toEqual({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      maxUses: 0,
      allowExitOnIdle: false,
      ssl: false,
      onPoolError: noopOnPoolError,
    });
  });

  it("applies the vercel presets: maxUses 7500 and allowExitOnIdle", () => {
    const config = dbConfigFromEnv(makeEnv({ BACKEND_RUNTIME: "vercel" }), noopOnPoolError);
    expect(config.maxUses).toBe(7_500);
    expect(config.allowExitOnIdle).toBe(true);
  });

  it("lets DATABASE_POOL_MAX_USES > 0 override the vercel preset and passes ssl through", () => {
    const config = dbConfigFromEnv(
      makeEnv({ BACKEND_RUNTIME: "vercel", DATABASE_POOL_MAX_USES: 42, DATABASE_SSL: true }),
      noopOnPoolError,
    );
    expect(config.maxUses).toBe(42);
    expect(config.ssl).toBe(true);
  });
});

describe("createPosDb", () => {
  it("maps the config onto the pool, translating maxUses 0 to Infinity and ssl false to undefined", () => {
    const { factory, options } = makeFakePool();
    createPosDb(baseConfig(), fakeSchema, factory);
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      connectionString: "postgresql://pos:secret@127.0.0.1:5432/pos",
      max: 5,
      idleTimeoutMillis: 1_000,
      connectionTimeoutMillis: 2_000,
      maxUses: Infinity,
      allowExitOnIdle: false,
      keepAlive: true,
      application_name: "nukesai-pos-backend",
      ssl: undefined,
    });
  });

  it("keeps a positive maxUses and enables strict ssl when configured", () => {
    const { factory, options } = makeFakePool();
    createPosDb(
      baseConfig({ maxUses: 500, ssl: true, allowExitOnIdle: true }),
      fakeSchema,
      factory,
    );
    expect(options[0]?.maxUses).toBe(500);
    expect(options[0]?.ssl).toEqual({ rejectUnauthorized: true });
    expect(options[0]?.allowExitOnIdle).toBe(true);
  });

  it("registers the onPoolError listener exactly once", () => {
    const { factory, on } = makeFakePool();
    const onPoolError = (): void => undefined;
    createPosDb(baseConfig({ onPoolError }), fakeSchema, factory);
    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("error", onPoolError);
  });

  it("returns the same instance on a second call without building a second pool", () => {
    const { factory, options } = makeFakePool();
    const first = createPosDb(baseConfig(), fakeSchema, factory);
    const second = createPosDb(baseConfig(), fakeSchema, makeFakePool().factory);
    expect(second).toBe(first);
    expect(options).toHaveLength(1);
  });

  it("close is idempotent, ends the pool once, and clears the global for a fresh build", async () => {
    const { factory, end } = makeFakePool();
    const posDb = createPosDb(baseConfig(), fakeSchema, factory);
    const firstClose = posDb.close();
    const secondClose = posDb.close();
    expect(secondClose).toBe(firstClose);
    await firstClose;
    await secondClose;
    expect(end).toHaveBeenCalledTimes(1);

    const fresh = makeFakePool();
    const rebuilt = createPosDb(baseConfig(), fakeSchema, fresh.factory);
    expect(rebuilt).not.toBe(posDb);
    expect(fresh.options).toHaveLength(1);
  });

  it("builds a real pg.Pool by default", async () => {
    const posDb = createPosDb(baseConfig(), fakeSchema);
    expect(posDb.pool).toBeInstanceOf(Pool);
    // No client ever connected, so end() resolves without touching the network.
    await posDb.close();
    expect(posDb.pool.totalCount).toBe(0);
  });
});

describe("assertRlsEnforcedRole (R2 boot guard)", () => {
  const poolWith = (row: Record<string, unknown> | undefined) =>
    ({ query: async () => Promise.resolve({ rows: row === undefined ? [] : [row] }) }) as never;

  it("passes for a compliant runtime role", async () => {
    await expect(
      assertRlsEnforcedRole(
        poolWith({ rolname: "pos_app", rolsuper: false, rolbypassrls: false, owns_orders: false }),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["superuser", { rolname: "postgres", rolsuper: true, rolbypassrls: false, owns_orders: false }],
    ["bypassrls", { rolname: "svc", rolsuper: false, rolbypassrls: true, owns_orders: false }],
    [
      "table owner",
      { rolname: "pos_owner", rolsuper: false, rolbypassrls: false, owns_orders: true },
    ],
  ])("refuses to serve as %s", async (_label, row) => {
    await expect(assertRlsEnforcedRole(poolWith(row))).rejects.toThrow(/REFUSING TO SERVE/);
  });
});
