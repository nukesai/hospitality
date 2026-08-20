import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runPosMigrations, type MigrateFn, type MigratePoolFactory } from "./migrate.js";

const { Pool } = pg;

const CONN = "postgresql://pos_owner:secret@127.0.0.1:5432/pos";

// Same relative resolution as the module under test (co-located file).
const SHIPPED_MIGRATIONS = fileURLToPath(new URL("../../../migrations", import.meta.url));

const queryResult = { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };

interface RecordedMigrateConfig {
  readonly migrationsFolder: string;
  readonly migrationsTable?: string;
  readonly migrationsSchema?: string;
}

interface MigrateHarness {
  readonly events: string[];
  readonly poolOptions: pg.PoolConfig[];
  readonly poolFactory: MigratePoolFactory;
  readonly migrateFn: MigrateFn;
  readonly migrateConfigs: RecordedMigrateConfig[];
}

const makeHarness = (options: { migrateRejects?: boolean } = {}): MigrateHarness => {
  const events: string[] = [];
  const poolOptions: pg.PoolConfig[] = [];
  const migrateConfigs: RecordedMigrateConfig[] = [];

  const query = vi.fn(async (config: { text: string }): Promise<typeof queryResult> => {
    await Promise.resolve();
    events.push(config.text.includes("pg_advisory_unlock") ? "unlock" : "lock");
    return queryResult;
  });
  const end = vi.fn(async (): Promise<void> => {
    await Promise.resolve();
    events.push("end");
  });
  const poolFactory: MigratePoolFactory = (o) => {
    poolOptions.push(o);
    return { query, end } as unknown as pg.Pool;
  };

  const migrateFn = (async (_db: unknown, config: RecordedMigrateConfig): Promise<void> => {
    await Promise.resolve();
    events.push("migrate");
    migrateConfigs.push(config);
    if (options.migrateRejects === true) throw new Error("migrate failed");
  }) as unknown as MigrateFn;

  return { events, poolOptions, poolFactory, migrateFn, migrateConfigs };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runPosMigrations", () => {
  it("locks before migrating, unlocks after, and always ends the single-connection pool", async () => {
    const h = makeHarness();
    await runPosMigrations(
      { connectionString: CONN, migrationsFolder: "/custom/migrations" },
      h.migrateFn,
      h.poolFactory,
    );

    expect(h.poolOptions).toEqual([{ connectionString: CONN, max: 1 }]);
    expect(h.events).toEqual(["lock", "migrate", "unlock", "end"]);
    expect(h.migrateConfigs).toEqual([
      {
        migrationsFolder: "/custom/migrations",
        migrationsTable: "nukesai_pos_migrations",
        migrationsSchema: "public",
      },
    ]);
  });

  it("defaults migrationsFolder to the shipped migrations directory", async () => {
    const h = makeHarness();
    await runPosMigrations({ connectionString: CONN }, h.migrateFn, h.poolFactory);
    expect(h.migrateConfigs[0]?.migrationsFolder).toBe(SHIPPED_MIGRATIONS);
  });

  it("still unlocks and ends the pool when migrateFn rejects", async () => {
    const h = makeHarness({ migrateRejects: true });
    await expect(
      runPosMigrations({ connectionString: CONN }, h.migrateFn, h.poolFactory),
    ).rejects.toThrow("migrate failed");
    expect(h.events).toEqual(["lock", "migrate", "unlock", "end"]);
  });

  it("builds a real single-use pg.Pool by default", async () => {
    // Stub the prototype so the real Pool never opens a socket.
    const proto = Pool.prototype as unknown as {
      query: (...args: readonly unknown[]) => Promise<unknown>;
      end: () => Promise<void>;
    };
    const querySpy = vi.spyOn(proto, "query").mockResolvedValue(queryResult);
    const endSpy = vi.spyOn(proto, "end").mockResolvedValue(undefined);

    const h = makeHarness();
    await runPosMigrations(
      { connectionString: CONN, migrationsFolder: "/custom/migrations" },
      h.migrateFn,
    );

    expect(querySpy).toHaveBeenCalledTimes(2); // lock + unlock
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(h.events).toEqual(["migrate"]);
  });
});
