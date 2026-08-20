import {
  branchProcedure,
  createOrder,
  createOrderInput,
  listOrders,
  listOrdersInput,
  orderDtoOutput,
  orderPageOutput,
  posTrpc,
  updateOrderStatus,
  updateOrderStatusInput,
} from "@nukesai-pos/backend/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const ordersRouter = posTrpc.router({
  list: branchProcedure({ resource: "orders", action: "read" })
    .input(listOrdersInput)
    .output(orderPageOutput)
    .query(async ({ ctx, input }) =>
      listOrders({ db: ctx.deps.db, cache: ctx.deps.cache }, ctx.rls, input),
    ),
  create: branchProcedure({ resource: "orders", action: "create" })
    .meta({ cacheInvalidates: ["orders"] })
    .input(createOrderInput)
    .output(orderDtoOutput)
    .mutation(async ({ ctx, input }) =>
      createOrder({ db: ctx.deps.db, cache: ctx.deps.cache }, ctx.rls, input),
    ),
  updateStatus: branchProcedure({ resource: "orders", action: "update" })
    .meta({ cacheInvalidates: ["orders"] })
    .input(updateOrderStatusInput)
    .output(orderDtoOutput)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateOrderStatus(
        { db: ctx.deps.db, cache: ctx.deps.cache },
        ctx.rls,
        input,
      );
      if (updated === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "errors.resourceNotFound" });
      }
      return updated;
    }),
  // Deliberately-undeclared mutation proving enforceCacheMeta fires (the
  // invalidation-discipline canary). NEVER shipped to production.
  ...(process.env.NODE_ENV !== "production"
    ? {
        _cacheCanary: branchProcedure()
          .input(z.object({}))
          .mutation(() => ({ ok: true }) as const),
      }
    : {}),
});
