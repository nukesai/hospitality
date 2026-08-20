import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import type { PosEnv } from "../../env.js";
import type * as schema from "./schema/index.js";

const { Pool } = pg;

export type PosSchema = typeof schema;
export type PosDatabase = NodePgDatabase<PosSchema>;

export interface PosDbConfig {
  readonly connectionString: string;
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly connectionTimeoutMillis: number;
  readonly maxUses: number; // 0 = unlimited
  readonly allowExitOnIdle: boolean;
  readonly ssl: boolean;
  readonly onPoolError: (error: Error) => void; // MANDATORY: idle-client errors crash node otherwise
}

export function dbConfigFromEnv(env: PosEnv, onPoolError: (e: Error) => void): PosDbConfig {
  const vercel = env.BACKEND_RUNTIME === "vercel";
  return {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
    maxUses: env.DATABASE_POOL_MAX_USES > 0 ? env.DATABASE_POOL_MAX_USES : vercel ? 7_500 : 0,
    allowExitOnIdle: vercel,
    ssl: env.DATABASE_SSL,
    onPoolError,
  };
}

export interface PosDb {
  readonly db: PosDatabase;
  readonly pool: pg.Pool;
  /** Idempotent. After resolve, totalCount === 0. */
  readonly close: () => Promise<void>;
}

interface DbGlobal {
  instance?: PosDb;
  closing?: Promise<void>;
}

// Symbol.for + globalThis: one pool per process — survives Next dev HMR and Fluid reuse.
const GLOBAL_KEY = Symbol.for("@nukesai-pos/backend:drizzle-pool");
const globalStore = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DbGlobal };

export type PoolFactory = (options: pg.PoolConfig) => pg.Pool; // test seam

export function createPosDb(
  config: PosDbConfig,
  schemaModule: PosSchema,
  poolFactory: PoolFactory = (o) => new Pool(o),
): PosDb {
  const store: DbGlobal = (globalStore[GLOBAL_KEY] ??= {});
  if (store.instance !== undefined) return store.instance;

  const pool = poolFactory({
    connectionString: config.connectionString,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    maxUses: config.maxUses === 0 ? Infinity : config.maxUses,
    allowExitOnIdle: config.allowExitOnIdle,
    keepAlive: true,
    application_name: "nukesai-pos-backend", // pool-level; requestId travels in log fields (R11)
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
  });
  pool.on("error", config.onPoolError);

  const db: PosDatabase = drizzle({ client: pool, schema: schemaModule });

  const close = (): Promise<void> => {
    store.closing ??= pool.end().finally(() => {
      delete store.instance;
      delete store.closing;
    });
    return store.closing;
  };

  store.instance = { db, pool, close };
  return store.instance;
}
