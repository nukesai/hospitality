import { noopLogger } from "@nukesai-pos/common";
import { TRPCError, type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMemoryCacheStore } from "../adapters/cache/memory.js";
import { createCache } from "../cache/create-cache.js";
import type { CachePort } from "../ports/cache.js";
import type { PosSessionInfo, PosTrpcContext, PosTrpcDeps } from "./init.js";
import { branchProcedure, posTrpc, protectedProcedure, publicProcedure } from "./root.js";
import { healthRouter, ordersRouter, posCoreRouter } from "./routers.js";

interface CtxOptions {
  readonly session?: PosSessionInfo | null;
  readonly member?: { readonly role: string } | null;
  readonly cache?: Partial<CachePort>;
  readonly db?: unknown;
}

const createCtx = (options: CtxOptions = {}): PosTrpcContext => {
  const deps = {
    auth: {
      api: {
        getActiveMember: async (): Promise<{ readonly role: string } | null> =>
          Promise.resolve(options.member ?? null),
      },
    },
    kv: null,
    cache: options.cache ?? {},
    db: options.db,
  } as unknown as PosTrpcDeps;
  return {
    session: options.session ?? null,
    requestedBranchId: null,
    requestHeaders: new Headers(),
    ip: null,
    requestId: "req-routers",
    logger: noopLogger,
    t: { t: (key: string): string => key },
    deps,
  };
};

const coreCaller = posTrpc.createCallerFactory(posCoreRouter);

describe("packaged routers", () => {
  it("health.check answers through the core composition", async () => {
    const result = await coreCaller(createCtx()).health.check({ echo: "hi" });
    expect(result).toEqual({ ok: true, service: "nukesai-pos-backend", echo: "hi" });
  });

  it("standalone healthRouter equals the composed one", async () => {
    const caller = posTrpc.createCallerFactory(healthRouter);
    await expect(caller(createCtx()).check({})).resolves.toMatchObject({ ok: true });
  });

  it("orders procedures enforce auth before touching the db", async () => {
    await expect(coreCaller(createCtx()).orders.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const noMember = createCtx({ session: { userId: "u1", activeBranchId: "b1" } });
    await expect(coreCaller(noMember).orders.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("orders.updateStatus maps a vanished row to NOT_FOUND and invalidates nothing", async () => {
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    interface ChainTx {
      update: () => ChainTx;
      set: () => ChainTx;
      where: () => ChainTx;
      returning: () => Promise<never[]>;
      execute: () => Promise<undefined>;
    }
    const tx: ChainTx = {
      update: () => tx,
      set: () => tx,
      where: () => tx,
      returning: async () => Promise.resolve([]),
      execute: async () => Promise.resolve(undefined),
    };
    const db = {
      transaction: async (fn: (t: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
    };
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
      cache: { invalidateTags },
      db,
    });
    await expect(
      coreCaller(ctx).orders.updateStatus({
        orderId: "3b241101-e2bb-4255-8caf-4136c566a962",
        status: "ready",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "errors.resourceNotFound" });
    expect(invalidateTags).not.toHaveBeenCalled(); // failed mutations never invalidate
  });

  it("runs the full success paths: list, create (+invalidation), updateStatus", async () => {
    const row = {
      id: "3b241101-e2bb-4255-8caf-4136c566a962",
      branchId: "9b2e4d0a-6c1f-4b8e-9a3d-2f5c8e7a1b09",
      status: "pending",
      total: "12.50",
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    };
    const tx = {
      execute: async (): Promise<unknown> => Promise.resolve([]),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async (): Promise<(typeof row)[]> => Promise.resolve([row]) }),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({ returning: async (): Promise<(typeof row)[]> => Promise.resolve([row]) }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async (): Promise<(typeof row)[]> => Promise.resolve([row]),
          }),
        }),
      }),
    };
    const db = {
      transaction: async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => fn(tx),
    };
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    const realCache = createCache(createMemoryCacheStore());
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
      cache: { ...realCache, invalidateTags },
      db,
    });
    const caller = coreCaller(ctx);

    const page = await caller.orders.list({});
    expect(page.items[0]).toMatchObject({ id: row.id, total: "12.50" });

    const created = await caller.orders.create({ total: "12.50" });
    expect(created.createdAt).toBe("2026-08-21T00:00:00.000Z");
    expect(invalidateTags).toHaveBeenCalledWith(["pos:b1:orders"]);

    const updated = await caller.orders.updateStatus({ orderId: row.id, status: "ready" });
    expect(updated.status).toBe("pending"); // fake tx echoes the row
  });

  it("exposes the composed record shape the consumer file relies on", () => {
    expect(Object.keys(posCoreRouter._def.record).sort()).toEqual(["health", "orders"]);
    expect(typeof ordersRouter.create).toBe("function");
  });

  it("cache-discipline canary: an UNDECLARED mutation on the packaged root throws", async () => {
    const canary = posTrpc.router({
      dev: branchProcedure()
        .input(z.object({}))
        .mutation(() => "never"),
    });
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
    });
    let caught: unknown;
    try {
      await posTrpc.createCallerFactory(canary)(ctx).dev({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).message).toBe("errors.internal");
  });

  it("public/protected procedures behave on the packaged root", async () => {
    const mini = posTrpc.router({
      echo: publicProcedure.input(z.object({ n: z.number() })).query(({ input }) => input.n * 2),
      me: protectedProcedure.query(({ ctx }) => ctx.session?.userId ?? "none"),
    });
    const caller = posTrpc.createCallerFactory(mini);
    await expect(caller(createCtx()).echo({ n: 21 })).resolves.toBe(42);
    await expect(
      caller(createCtx()).echo({ n: "x" } as unknown as { n: number }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    await expect(caller(createCtx()).me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

/* ------------------------------------------------------------------------ */
/* COMPILE-TIME CONTRACT — precise client inference (zero consumer mapping). */
/* Requires: schemas annotated z.ZodType<Output, Input> (single-param leaves */
/* Input=unknown — shipped broken session 2 -> 2026-08-21) AND the routers'  */
/* cast-free hand annotations staying in sync. An "unused" @ts-expect-error  */
/* below = client typing broke again.                                        */
/* ------------------------------------------------------------------------ */
type CoreInputs = inferRouterInputs<typeof posCoreRouter>;
type CoreOutputs = inferRouterOutputs<typeof posCoreRouter>;

// @ts-expect-error -- total is required and a string: input must never widen to unknown
const badCreate: CoreInputs["orders"]["create"] = { total: 12.5 };
const goodCreate: CoreInputs["orders"]["create"] = { total: "12.50" };
const badStatusIn: CoreInputs["orders"]["updateStatus"] = {
  orderId: "id",
  // @ts-expect-error -- status is the ORDER_STATUSES union on the input side
  status: "not-a-status",
};
// @ts-expect-error -- outputs are wire DTOs: total is a string, never a number
const badTotalOut: CoreOutputs["orders"]["create"]["total"] = 12.5;

// The EXTENSION path consumers get from `nukes-pos add`: app-local procedures
// merge with the packaged core on the SAME root, fully typed.
const contractCustom = posTrpc.router({
  local: publicProcedure.input(z.object({ q: z.string() })).query(({ input }) => input.q),
});
const contractMerged = posTrpc.mergeRouters(posCoreRouter, contractCustom);
type MergedIn = inferRouterInputs<typeof contractMerged>;
// @ts-expect-error -- q is required on the app-local procedure
const badLocal: MergedIn["local"] = {};
const goodBoth: [MergedIn["local"], MergedIn["health"]["check"]] = [{ q: "x" }, { echo: "hi" }];
void [badCreate, goodCreate, badStatusIn, badTotalOut, badLocal, goodBoth, contractMerged];
