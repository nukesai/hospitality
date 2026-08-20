import { sql } from "drizzle-orm";
import { index, numeric, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import type {
  BranchRef,
  CreatedAt,
  MoneyCol,
  PosTable,
  TextColD,
  UuidPk,
} from "./_column-types.js";
import { branchGuard, posApp, roleIn } from "./_policies.js";
import { branch } from "./auth.js";

/**
 * Template for every branch-scoped table: branch_id uuid NOT NULL leading every
 * index, four permissive RLS policies over the branchGuard InitPlan fragment,
 * DELETE role-gated to owner/admin (mirrors common's PERMISSION_MATRIX).
 * Status values are validated app-side against common's ORDER_STATUSES.
 */
export const orders: PosTable<
  "orders",
  {
    id: UuidPk<"orders">;
    branchId: BranchRef<"orders">;
    status: TextColD<"orders", "status">;
    total: MoneyCol<"orders", "total">;
    createdAt: CreatedAt<"orders">;
  }
> = pgTable(
  "orders",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // branch_id leads EVERY index; this one serves the keyset feed query exactly.
    index("orders_branch_created_id_idx").on(t.branchId, t.createdAt.desc(), t.id.desc()),
    pgPolicy("orders_select", {
      as: "permissive",
      for: "select",
      to: posApp,
      using: branchGuard(t.branchId),
    }),
    pgPolicy("orders_insert", {
      as: "permissive",
      for: "insert",
      to: posApp,
      withCheck: branchGuard(t.branchId),
    }),
    pgPolicy("orders_update", {
      as: "permissive",
      for: "update",
      to: posApp,
      using: branchGuard(t.branchId),
      withCheck: branchGuard(t.branchId),
    }),
    pgPolicy("orders_delete", {
      as: "permissive",
      for: "delete",
      to: posApp,
      using: sql`${branchGuard(t.branchId)} and ${roleIn(["owner", "admin"])}`,
    }),
  ],
).enableRLS();

export const orderInsertSchema: ReturnType<typeof createInsertSchema<typeof orders>> =
  createInsertSchema(orders);
export const orderSelectSchema: ReturnType<typeof createSelectSchema<typeof orders>> =
  createSelectSchema(orders);
