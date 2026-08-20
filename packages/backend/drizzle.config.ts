import { defineConfig, type Config } from "drizzle-kit";

// Dev-time only (drizzle-kit is a devDependency, never shipped).
//   db:generate => drizzle-kit generate --name=<change>          (no env/DB needed — verified)
//   db:custom   => drizzle-kit generate --custom --name=<change> (hand-written SQL, e.g. 0000 roles)
//   db:check    => drizzle-kit check                             (CI journal/snapshot gate)
// Committed output: migrations/NNNN_*.sql + migrations/meta/**  (files allowlist gains "migrations")
const config: Config = defineConfig({
  dialect: "postgresql",
  schema: "./src/adapters/drizzle/schema/index.ts",
  out: "./migrations",
  // Applies to `drizzle-kit migrate` only; the programmatic migrator repeats it (verified split).
  migrations: { table: "nukesai_pos_migrations", schema: "public" },
  strict: true,
  verbose: true,
});

export default config;
