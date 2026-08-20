import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

// dist/adapters/drizzle/migrate.js -> ../../../migrations (same depth from src/ in tests).
const SHIPPED_MIGRATIONS: string = fileURLToPath(new URL("../../../migrations", import.meta.url));

export interface MigrateOptions {
  /** DIRECT connection (never transaction-pooled) with DDL rights (pos_owner). */
  readonly connectionString: string;
  readonly migrationsFolder?: string;
}

export type MigrateFn = typeof migrate; // test seam
export type MigratePoolFactory = (options: pg.PoolConfig) => pg.Pool; // test seam

export async function runPosMigrations(
  options: MigrateOptions,
  migrateFn: MigrateFn = migrate,
  poolFactory: MigratePoolFactory = (o) => new Pool(o),
): Promise<void> {
  const pool = poolFactory({ connectionString: options.connectionString, max: 1 });
  try {
    const db: NodePgDatabase = drizzle({ client: pool });
    // Serialize deploy fan-out; drizzle's migrator has no cross-instance lock of its own.
    await db.execute(sql`select pg_advisory_lock(hashtext('nukesai_pos_migrations'))`);
    try {
      await migrateFn(db, {
        migrationsFolder: options.migrationsFolder ?? SHIPPED_MIGRATIONS,
        // BOTH required: default schema is 'drizzle', and drizzle.config.ts does NOT apply
        // to the programmatic migrator (live-verified 42P01 without these).
        migrationsTable: "nukesai_pos_migrations",
        migrationsSchema: "public",
      });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(hashtext('nukesai_pos_migrations'))`);
    }
  } finally {
    await pool.end();
  }
}
