import {
  createOrder,
  createOrderInput,
  healthCheck,
  healthInput,
  healthOutput,
  listOrders,
  listOrdersInput,
  orderDtoOutput,
  orderPageOutput,
  updateOrderStatus,
  updateOrderStatusInput,
} from "@nukesai-pos/backend/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { branchProcedure, publicProcedure, t } from "../trpc";

export const appRouter = t.router({
  health: t.router({
    check: publicProcedure
      .meta({ openapi: { method: "GET", path: "/health", tags: ["system"] } })
      .input(healthInput)
      .output(healthOutput) // .output() REQUIRED for OpenAPI procedures
      .query(({ input }) => healthCheck(input)),
  }),
  orders: t.router({
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
    // Deliberately-undeclared mutation would fail enforceCacheMeta at runtime;
    // the integration suite asserts that (invalidation discipline canary).
    _cacheCanary: branchProcedure()
      .input(z.object({}))
      .mutation(() => ({ ok: true }) as const),
  }),
});

export type AppRouter = typeof appRouter;
