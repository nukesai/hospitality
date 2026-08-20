/**
 * Idempotent demo seed. Runs as pos_owner (RLS-exempt by ownership — the
 * sanctioned channel). Plain Node >= 24:
 *   node --env-file-if-exists=../../.env scripts/db-seed.ts
 */
import pg from "pg";

const { Client } = pg;

const connectionString = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (connectionString === undefined) {
  process.stderr.write("MIGRATE_DATABASE_URL or DATABASE_URL is required\n");
  process.exit(1);
}

const BRANCH_MAIN = "00000000-0000-4000-8000-000000000001";
const BRANCH_RIVERSIDE = "00000000-0000-4000-8000-000000000002";

const client = new Client({ connectionString });
try {
  await client.connect();
  await client.query(
    `insert into branch (id, name, slug, created_at)
     values ($1, 'Main Street', 'main-street', now()),
            ($2, 'Riverside', 'riverside', now())
     on conflict (id) do nothing`,
    [BRANCH_MAIN, BRANCH_RIVERSIDE],
  );
  await client.query(
    `insert into orders (branch_id, status, total)
     select $1::uuid, 'pending', '24.50'
     where not exists (select 1 from orders where branch_id = $1::uuid)`,
    [BRANCH_MAIN],
  );
  process.stdout.write("seed applied\n");
} finally {
  await client.end();
}
