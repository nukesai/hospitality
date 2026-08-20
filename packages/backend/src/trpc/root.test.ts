import { noopLogger } from "@nukesai-pos/common";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { CachePort } from "../ports/cache.js";
import type { PosSessionInfo, PosTrpcContext, PosTrpcDeps } from "./init.js";
import { branchProcedure, posTrpc, protectedProcedure, publicProcedure } from "./root.js";

interface CtxOptions {
  readonly session?: PosSessionInfo | null;
  readonly member?: { readonly role: string } | null;
  readonly cache?: Partial<CachePort>;
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
  } as unknown as PosTrpcDeps;
  return {
    session: options.session ?? null,
    requestedBranchId: null,
    requestHeaders: new Headers(),
    ip: null,
    requestId: "req-root",
    logger: noopLogger,
    t: { t: (key: string): string => key },
    deps,
  };
};

// The consumer shape, end to end: package root + package procedures, only the
// router assembly lives here (exactly what scaffolded apps do).
const appRouter = posTrpc.router({
  echo: publicProcedure.input(z.object({ n: z.number() })).query(({ input }) => input.n * 2),
  me: protectedProcedure.query(({ ctx }) => ctx.session?.userId ?? "none"),
  orders: posTrpc.router({
    whoami: branchProcedure({ resource: "orders", action: "read" }).query(
      ({ ctx }) => `${ctx.rls.userId}@${ctx.rls.branchId}:${ctx.rls.role}`,
    ),
    create: branchProcedure()
      .meta({ cacheInvalidates: ["orders"] })
      .input(z.object({ total: z.number() }))
      .mutation(({ input }) => ({ total: input.total })),
    undeclared: branchProcedure()
      .input(z.object({}))
      .mutation(() => "never"),
  }),
});

const caller = posTrpc.createCallerFactory(appRouter);

describe("package-owned tRPC root", () => {
  it("runs public procedures and remaps Zod failures to 422", async () => {
    await expect(caller(createCtx()).echo({ n: 21 })).resolves.toBe(42);
    await expect(
      caller(createCtx()).echo({ n: "nope" } as unknown as { n: number }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("guards protected procedures on the session", async () => {
    await expect(caller(createCtx()).me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const ctx = createCtx({ session: { userId: "u1", activeBranchId: null } });
    await expect(caller(ctx).me()).resolves.toBe("u1");
  });

  it("flows the typed rls context into branch resolvers", async () => {
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
    });
    await expect(caller(ctx).orders.whoami()).resolves.toBe("u1@b1:owner");
  });

  it("rejects branch access without membership", async () => {
    const ctx = createCtx({ session: { userId: "u1", activeBranchId: "b1" }, member: null });
    await expect(caller(ctx).orders.whoami()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("invalidates declared cache tags after successful mutations", async () => {
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
      cache: { invalidateTags },
    });
    await expect(caller(ctx).orders.create({ total: 5 })).resolves.toEqual({ total: 5 });
    expect(invalidateTags).toHaveBeenCalledWith(["pos:b1:orders"]);
  });

  it("refuses mutations that do not declare cacheInvalidates (the discipline)", async () => {
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
    });
    let caught: unknown;
    try {
      await caller(ctx).orders.undeclared({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).message).toBe("errors.internal");
  });
});
