/**
 * Dev/CI migration runner. Plain Node >= 24 (type stripping); invoked as:
 *   node --env-file-if-exists=../../.env scripts/db-migrate.ts
 * Uses MIGRATE_DATABASE_URL (pos_owner, DIRECT — never a transaction pooler),
 * falling back to DATABASE_URL. Retries while the Docker stack boots.
 */
import { runPosMigrations } from "../src/adapters/drizzle/migrate.ts";

const connectionString = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (connectionString === undefined) {
  process.stderr.write("MIGRATE_DATABASE_URL or DATABASE_URL is required\n");
  process.exit(1);
}

const MAX_ATTEMPTS = 10;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    await runPosMigrations({
      connectionString,
      migrationsFolder: new URL("../migrations", import.meta.url).pathname,
    });
    process.stdout.write("migrations applied\n");
    process.exit(0);
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) throw error;
    process.stdout.write(`db not ready (attempt ${String(attempt)}), retrying...\n`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
