import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { PosDatabase } from "./client.js";
import { withBranchContext, type BranchContext, type PosTx } from "./rls.js";

const dialect = new PgDialect();

const ctx: BranchContext = { userId: "user-1", branchId: "branch-7", role: "manager" };

interface FakeDbHarness {
  readonly db: PosDatabase;
  readonly tx: PosTx;
  readonly execute: ReturnType<typeof vi.fn<(query: SQL) => Promise<unknown>>>;
  readonly transactionCalls: () => number;
}

const makeDb = (): FakeDbHarness => {
  const execute = vi.fn<(query: SQL) => Promise<unknown>>().mockResolvedValue([]);
  const tx = { execute } as unknown as PosTx;
  let calls = 0;
  const db = {
    transaction: async <T>(cb: (t: PosTx) => Promise<T>): Promise<T> => {
      calls += 1;
      const result = await cb(tx);
      return result;
    },
  } as unknown as PosDatabase;
  return { db, tx, execute, transactionCalls: () => calls };
};

describe("withBranchContext", () => {
  it("sets all three GUCs in a single parameterized set_config statement", async () => {
    const { db, execute, transactionCalls } = makeDb();
    await withBranchContext(db, ctx, async () => {
      await Promise.resolve();
      return undefined;
    });

    expect(transactionCalls()).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain("app.user_id");
    expect(query.sql).toContain("app.branch_id");
    expect(query.sql).toContain("app.role");
    expect(query.sql.match(/set_config/g)).toHaveLength(3);
    expect(query.params).toEqual(["user-1", "branch-7", "manager"]);
  });

  it("runs fn inside the transaction and propagates its return value", async () => {
    const { db, tx } = makeDb();
    const seen: PosTx[] = [];
    const result = await withBranchContext(db, ctx, async (t) => {
      seen.push(t);
      await Promise.resolve();
      return "receipt-42";
    });

    expect(result).toBe("receipt-42");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(tx);
  });

  it("propagates fn rejections so the transaction rolls back", async () => {
    const { db, execute } = makeDb();
    await expect(
      withBranchContext(db, ctx, async () => {
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // The context was set before fn ran — rollback happens in the driver.
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
