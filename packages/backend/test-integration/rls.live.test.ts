import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { Pool } = pg;

/**
 * Live RLS contract against the Docker stack's TEST database. Covers the exact
 * failure modes research reproduced: fail-closed no-context, ''-GUC residue on
 * a max:1 pool (the 22P02 regression), cross-branch writes, role-gated DELETE,
 * InitPlan + index plan shape.
 */
const APP_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://pos_app:pos_app@localhost:5432/nukes_pos_test";
const OWNER_URL =
  process.env.TEST_MIGRATE_DATABASE_URL
  ?? "postgresql://pos_owner:pos_owner@localhost:5432/nukes_pos_test";

const BRANCH_A = "00000000-0000-4000-8000-00000000000a";
const BRANCH_B = "00000000-0000-4000-8000-00000000000b";

describe("RLS live contract (nukes_pos_test)", () => {
  // max:1 makes GUC residue between transactions observable — the regression pool.
  const app = new Pool({ connectionString: APP_URL, max: 1 });
  const owner = new Pool({ connectionString: OWNER_URL, max: 1 });

  beforeAll(async () => {
    const { runPosMigrations } = await import("../src/adapters/drizzle/migrate.js");
    await runPosMigrations({ connectionString: OWNER_URL });
    await owner.query(`delete from orders`);
    await owner.query(`delete from branch where id in ($1, $2)`, [BRANCH_A, BRANCH_B]);
    await owner.query(
      `insert into branch (id, name, slug, created_at) values
       ($1, 'A', 'live-a', now()), ($2, 'B', 'live-b', now())`,
      [BRANCH_A, BRANCH_B],
    );
    await owner.query(
      `insert into orders (branch_id, status, total) values ($1, 'pending', '1.00'), ($2, 'pending', '2.00')`,
      [BRANCH_A, BRANCH_B],
    );
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  const inBranch = async (
    branchId: string,
    role: string,
    query: string,
    params: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> => {
    const client = await app.connect();
    try {
      await client.query("begin");
      await client.query(
        `select set_config('app.branch_id', $1, true), set_config('app.role', $2, true)`,
        [branchId, role],
      );
      const result = await client.query(query, params);
      await client.query("commit");
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };

  it("fails closed with no branch context", async () => {
    const result = await app.query(`select count(*)::int as n from orders`);
    expect((result.rows[0] as { n: number }).n).toBe(0);
  });

  it("sees exactly its own branch", async () => {
    const { rows } = await inBranch(BRANCH_A, "waiter", `select count(*)::int as n from orders`);
    expect(rows[0]?.n).toBe(1);
  });

  it("stays fail-closed on the SAME pooled connection after a context transaction ('' residue regression)", async () => {
    await inBranch(BRANCH_A, "waiter", `select 1`);
    const result = await app.query(`select count(*)::int as n from orders`);
    expect((result.rows[0] as { n: number }).n).toBe(0);
  });

  it("rejects cross-branch INSERT", async () => {
    await expect(
      inBranch(BRANCH_A, "waiter", `insert into orders (branch_id) values ($1)`, [BRANCH_B]),
    ).rejects.toThrow(/row-level security/);
  });

  it("role-gates DELETE: waiter 0 rows, admin deletes", async () => {
    const waiter = await inBranch(BRANCH_A, "waiter", `delete from orders`);
    expect(waiter.rowCount).toBe(0);
    const admin = await inBranch(BRANCH_A, "admin", `delete from orders`);
    expect(admin.rowCount).toBe(1);
  });

  it("keeps the branch feed on the index with an InitPlan (perf contract)", async () => {
    const { rows } = await inBranch(
      BRANCH_B,
      "waiter",
      `explain (costs off) select * from orders where branch_id = $1 order by created_at desc, id desc limit 10`,
      [BRANCH_B],
    );
    const plan = rows.map((r) => String(r["QUERY PLAN"])).join("\n");
    expect(plan).toContain("InitPlan");
    expect(plan).toMatch(/orders_branch_created_id_idx/);
  });
});
