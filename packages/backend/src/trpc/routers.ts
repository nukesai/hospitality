import {
  TRPCError,
  type TRPCBuiltRouter,
  type TRPCDefaultErrorShape,
  type TRPCMutationProcedure,
  type TRPCQueryProcedure,
} from "@trpc/server";

import type { PosTrpcContext, PosTrpcMeta } from "./init.js";
import { branchProcedure, posTrpc, publicProcedure } from "./root.js";
import {
  healthCheck,
  healthInput,
  healthOutput,
  type HealthInput,
  type HealthResult,
} from "./services/health.js";
import {
  createOrder,
  createOrderInput,
  listOrders,
  listOrdersInput,
  orderDtoOutput,
  orderPageOutput,
  updateOrderStatus,
  updateOrderStatusInput,
  type CreateOrderInput,
  type ListOrdersInput,
  type OrderDto,
  type OrderPage,
  type UpdateOrderStatusInput,
} from "./services/orders.js";

/**
 * PRE-BUILT feature routers — the answer to "why do consumers define routes?"
 * They don't: every router ships from here with a CHECKED (cast-free) hand
 * annotation over tRPC's public generics, which isolatedDeclarations accepts
 * and which keeps client inference byte-precise (proven by the consumer-side
 * type probes in apps/example/server/routers/router-types.type-test.ts).
 * The consumer's single remaining file composes these (plus their own
 * procedures) on the SAME posTrpc instance — no cross-instance hazards.
 */

interface PosRootTypes {
  ctx: PosTrpcContext;
  meta: PosTrpcMeta;
  errorShape: TRPCDefaultErrorShape;
  transformer: true;
}

export type PosHealthRouter = TRPCBuiltRouter<
  PosRootTypes,
  {
    check: TRPCQueryProcedure<{ input: HealthInput; output: HealthResult; meta: PosTrpcMeta }>;
  }
>;

export const healthRouter: PosHealthRouter = posTrpc.router({
  check: publicProcedure
    .meta({ openapi: { method: "GET", path: "/health", tags: ["system"] } })
    .input(healthInput)
    .output(healthOutput)
    .query(({ input }) => healthCheck(input)),
});

/* ------------------------------------------------------------------ orders */
export type PosOrdersRouter = TRPCBuiltRouter<
  PosRootTypes,
  {
    list: TRPCQueryProcedure<{ input: ListOrdersInput; output: OrderPage; meta: PosTrpcMeta }>;
    create: TRPCMutationProcedure<{
      input: CreateOrderInput;
      output: OrderDto;
      meta: PosTrpcMeta;
    }>;
    updateStatus: TRPCMutationProcedure<{
      input: UpdateOrderStatusInput;
      output: OrderDto;
      meta: PosTrpcMeta;
    }>;
  }
>;

export const ordersRouter: PosOrdersRouter = posTrpc.router({
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
});

/* -------------------------------------------------------------------- core */
/** Every packaged feature router under its namespace — the consumer's default. */
export type PosCoreRouter = TRPCBuiltRouter<
  PosRootTypes,
  {
    health: {
      check: TRPCQueryProcedure<{ input: HealthInput; output: HealthResult; meta: PosTrpcMeta }>;
    };
    orders: {
      list: TRPCQueryProcedure<{ input: ListOrdersInput; output: OrderPage; meta: PosTrpcMeta }>;
      create: TRPCMutationProcedure<{
        input: CreateOrderInput;
        output: OrderDto;
        meta: PosTrpcMeta;
      }>;
      updateStatus: TRPCMutationProcedure<{
        input: UpdateOrderStatusInput;
        output: OrderDto;
        meta: PosTrpcMeta;
      }>;
    };
  }
>;

export const posCoreRouter: PosCoreRouter = posTrpc.router({
  health: healthRouter,
  orders: ordersRouter,
});
