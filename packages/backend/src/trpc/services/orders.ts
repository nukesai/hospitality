import { ORDER_STATUSES } from "@nukesai-pos/common/types";
import type { LocationId } from "@nukesai-pos/common/types";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { PosDatabase } from "../../adapters/drizzle/client.js";
import { withBranchContext, type BranchContext } from "../../adapters/drizzle/rls.js";
import { orders } from "../../adapters/drizzle/schema/orders.js";
import { buildCacheKey, hashDiscriminator, type CachePort } from "../../ports/cache.js";

/**
 * Order services: the business logic the consumer's routers bind (R1).
 * Every query runs inside withBranchContext (RLS) AND repeats the branch filter
 * in SQL (defense in depth, R2). Pagination is keyset-only — no OFFSET.
 */

export const listOrdersInput: z.ZodType<{
  readonly status?: (typeof ORDER_STATUSES)[number] | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: { readonly createdAt: string; readonly id: string } | undefined;
}> = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).optional(),
});

export interface OrderDto {
  readonly id: string;
  readonly branchId: string;
  readonly status: string;
  readonly total: string;
  /** ISO string — wire-safe for the OpenAPI surface. */
  readonly createdAt: string;
}

export interface OrderPage {
  readonly items: readonly OrderDto[];
  readonly nextCursor: { readonly createdAt: string; readonly id: string } | null;
}

export const orderDtoOutput: z.ZodType<OrderDto> = z.object({
  id: z.uuid(),
  branchId: z.uuid(),
  status: z.string(),
  total: z.string(),
  createdAt: z.iso.datetime(),
});

export const orderPageOutput: z.ZodType<OrderPage> = z.object({
  items: z.array(orderDtoOutput),
  nextCursor: z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).nullable(),
});

const toDto = (row: typeof orders.$inferSelect): OrderDto => ({
  id: row.id,
  branchId: row.branchId,
  status: row.status,
  total: row.total,
  createdAt: row.createdAt.toISOString(),
});

export interface OrderServiceDeps {
  readonly db: PosDatabase;
  readonly cache: CachePort;
}

const LIST_TTL_SECONDS = 15;
const LIST_STALE_SECONDS = 30;

export async function listOrders(
  deps: OrderServiceDeps,
  rls: BranchContext,
  input: z.infer<typeof listOrdersInput>,
): Promise<OrderPage> {
  const limit = input.limit ?? 20;
  const key = buildCacheKey(
    rls.branchId as LocationId,
    "orders",
    hashDiscriminator({ status: input.status ?? null, limit, cursor: input.cursor ?? null }),
  );
  return deps.cache.getOrSet(
    key,
    {
      ttlSeconds: LIST_TTL_SECONDS,
      staleTtlSeconds: LIST_STALE_SECONDS,
      tags: [`pos:${rls.branchId}:orders`],
    },
    async () =>
      withBranchContext(deps.db, rls, async (tx) => {
        const conditions = [eq(orders.branchId, rls.branchId)]; // defense in depth
        if (input.status !== undefined) conditions.push(eq(orders.status, input.status));
        if (input.cursor !== undefined) {
          const cursorDate = new Date(input.cursor.createdAt);
          const cursorCondition = or(
            lt(orders.createdAt, cursorDate),
            and(eq(orders.createdAt, cursorDate), lt(orders.id, input.cursor.id)),
          );
          /* v8 ignore next -- or() only returns undefined for zero args; kept as a type guard */
          if (cursorCondition !== undefined) conditions.push(cursorCondition);
        }
        const rows = await tx
          .select()
          .from(orders)
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt), desc(orders.id))
          .limit(limit + 1);
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map(toDto),
          nextCursor:
            rows.length > limit && last !== undefined
              ? { createdAt: last.createdAt.toISOString(), id: last.id }
              : null,
        };
      }),
  );
}

export const createOrderInput: z.ZodType<{ readonly total: string }> = z.object({
  // numeric(12,2) travels as a string — never a float.
  total: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
});

export async function createOrder(
  deps: OrderServiceDeps,
  rls: BranchContext,
  input: { readonly total: string },
): Promise<OrderDto> {
  return withBranchContext(deps.db, rls, async (tx) => {
    const [row] = await tx
      .insert(orders)
      .values({ branchId: rls.branchId, status: "pending", total: input.total })
      .returning();
    if (row === undefined) throw new Error("insert returned no row");
    return toDto(row);
  });
}

export const updateOrderStatusInput: z.ZodType<{
  readonly orderId: string;
  readonly status: (typeof ORDER_STATUSES)[number];
}> = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
});

export async function updateOrderStatus(
  deps: OrderServiceDeps,
  rls: BranchContext,
  input: { readonly orderId: string; readonly status: string },
): Promise<OrderDto | null> {
  return withBranchContext(deps.db, rls, async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ status: input.status })
      .where(and(eq(orders.branchId, rls.branchId), eq(orders.id, input.orderId)))
      .returning();
    return row === undefined ? null : toDto(row);
  });
}

/** Used by integration tests to prove the InitPlan-shaped policy stays on the index. */
export const ORDERS_FEED_EXPLAIN: ReturnType<typeof sql> =
  sql`explain (costs off) select * from ${orders}`;
