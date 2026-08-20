import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";

import type { PosDatabase, PosSchema } from "./client.js";

export interface BranchContext {
  readonly userId: string;
  readonly branchId: string;
  readonly role: string; // PosRole — validated upstream by the better-auth session
}

export type PosTx = NodePgTransaction<PosSchema, ExtractTablesWithRelations<PosSchema>>;

/**
 * The ONLY sanctioned db entry point with request context (lint-enforced).
 * set_config(..., true) === SET LOCAL but parameterizable; live-verified to
 * revert on COMMIT and ROLLBACK — nothing leaks across pooled connections.
 * ctx MUST come from the better-auth session, never from request input.
 */
export async function withBranchContext<T>(
  db: PosDatabase,
  ctx: BranchContext,
  fn: (tx: PosTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.user_id',   ${ctx.userId},   true),
        set_config('app.branch_id', ${ctx.branchId}, true),
        set_config('app.role',      ${ctx.role},     true)
    `);
    return fn(tx);
  });
}
