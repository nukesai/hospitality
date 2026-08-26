import { noopLogger } from "@nukesai-pos/common";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z, type ZodError } from "zod";

import type { CachePort } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";
import type { PosSessionInfo, PosTrpcContext, PosTrpcDeps } from "./init.js";
import { createMemoryKv } from "../adapters/cache/memory.js";
import {
  cacheInvalidationMiddleware,
  cacheMetaMiddleware,
  createBranchGuardMiddleware,
  createRateLimitMiddleware,
  DEFAULT_API_RATE_LIMIT,
  rethrowAppError,
  sessionGuardMiddleware,
  validation422Middleware,
  type PosMiddlewareOpts,
  type PosMiddlewareResult,
} from "./middlewares.js";

interface CtxOptions {
  readonly session?: PosSessionInfo | null;
  readonly member?: { readonly role: string } | null;
  readonly kv?: KvPort | null;
  readonly cache?: Partial<CachePort>;
  readonly rls?: { readonly branchId: string } | undefined;
}

const createCtx = (options: CtxOptions = {}): PosTrpcContext => {
  const deps = {
    auth: {
      api: {
        getActiveMember: async (): Promise<{ readonly role: string } | null> =>
          Promise.resolve(options.member ?? null),
      },
    },
    kv: options.kv ?? createMemoryKv(),
    cache: options.cache ?? {},
  } as unknown as PosTrpcDeps;
  const ctx: PosTrpcContext = {
    session: options.session ?? null,
    requestedBranchId: null,
    requestHeaders: new Headers(),
    ip: null,
    requestId: "req-1",
    logger: noopLogger,
    t: { t: (key: string): string => key },
    deps,
  };
  return options.rls !== undefined ? ({ ...ctx, rls: options.rls } as PosTrpcContext) : ctx;
};

type Result = PosMiddlewareResult;

interface RunOptions {
  readonly ctx?: PosTrpcContext;
  readonly type?: "query" | "mutation" | "subscription";
  readonly path?: string;
  readonly meta?: PosMiddlewareOpts<Result>["meta"];
  readonly result?: Result;
}

/** Drives a middleware exactly like tRPC would; records next() ctx overrides. */
const run = (
  middleware: (opts: PosMiddlewareOpts<Result>) => Promise<Result>,
  options: RunOptions = {},
): { promise: Promise<Result>; overrides: object[] } => {
  const overrides: object[] = [];
  const result: Result = options.result ?? { ok: true };
  const next = (async (arg?: { ctx: object }): Promise<Result> => {
    if (arg !== undefined) overrides.push(arg.ctx);
    return Promise.resolve(result);
  }) as PosMiddlewareOpts<Result>["next"];
  const promise = middleware({
    ctx: options.ctx ?? createCtx(),
    type: options.type ?? "query",
    path: options.path ?? "orders.list",
    meta: options.meta,
    next,
  });
  return { promise, overrides };
};

const zodFailure = (): ZodError => {
  const parsed = z.object({ n: z.number() }).safeParse({ n: "nope" });
  if (parsed.success) throw new Error("expected failure");
  return parsed.error;
};

describe("rethrowAppError", () => {
  it("maps an AppError to a TRPCError", async () => {
    const { AppError } = await import("@nukesai-pos/common/errors");
    let caught: unknown;
    try {
      rethrowAppError(new AppError("UNAUTHENTICATED", { internalMessage: "x" }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe("UNAUTHORIZED");
  });

  it("rethrows anything else untouched", () => {
    const boom = new Error("boom");
    expect(() => {
      rethrowAppError(boom);
    }).toThrow(boom);
  });
});

describe("validation422Middleware", () => {
  it("passes successful results through", async () => {
    const { promise } = run(validation422Middleware);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("remaps BAD_REQUEST+ZodError to UNPROCESSABLE_CONTENT", async () => {
    const error = new TRPCError({ code: "BAD_REQUEST", cause: zodFailure() });
    const { promise } = run(validation422Middleware, { result: { ok: false, error } });
    await expect(promise).rejects.toMatchObject({
      code: "UNPROCESSABLE_CONTENT",
      message: "errors.validationFailed",
    });
  });

  it("leaves a BAD_REQUEST without a Zod cause alone", async () => {
    const error = new TRPCError({ code: "BAD_REQUEST" });
    const { promise } = run(validation422Middleware, { result: { ok: false, error } });
    await expect(promise).resolves.toEqual({ ok: false, error });
  });
});

describe("cacheMetaMiddleware", () => {
  it("lets a declared mutation through", async () => {
    const { promise } = run(cacheMetaMiddleware, {
      type: "mutation",
      meta: { cacheInvalidates: ["orders"] },
    });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("rejects an undeclared mutation with a TRPCError (AppError mapped)", async () => {
    const { promise } = run(cacheMetaMiddleware, { type: "mutation", path: "orders.create" });
    await expect(promise).rejects.toBeInstanceOf(TRPCError);
  });
});

describe("cacheInvalidationMiddleware", () => {
  it("invalidates declared tags after a successful branch-scoped mutation", async () => {
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    const ctx = createCtx({ cache: { invalidateTags }, rls: { branchId: "branch-1" } });
    const { promise } = run(cacheInvalidationMiddleware, {
      ctx,
      type: "mutation",
      meta: { cacheInvalidates: ["orders"] },
    });
    await expect(promise).resolves.toEqual({ ok: true });
    expect(invalidateTags).toHaveBeenCalledWith(["pos:branch-1:orders"]);
  });

  it("skips invalidation when the guard never attached rls", async () => {
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    const ctx = createCtx({ cache: { invalidateTags } });
    const { promise } = run(cacheInvalidationMiddleware, {
      ctx,
      type: "mutation",
      meta: { cacheInvalidates: ["orders"] },
    });
    await expect(promise).resolves.toEqual({ ok: true });
    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it("does nothing for queries", async () => {
    const invalidateTags = vi.fn(async (_tags: readonly string[]) => Promise.resolve());
    const ctx = createCtx({ cache: { invalidateTags }, rls: { branchId: "branch-1" } });
    const { promise } = run(cacheInvalidationMiddleware, { ctx, type: "query" });
    await expect(promise).resolves.toEqual({ ok: true });
    expect(invalidateTags).not.toHaveBeenCalled();
  });
});

describe("sessionGuardMiddleware", () => {
  it("maps a missing session to UNAUTHORIZED", async () => {
    const { promise } = run(sessionGuardMiddleware);
    await expect(promise).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("continues with a session", async () => {
    const ctx = createCtx({ session: { userId: "u1", activeBranchId: "b1" } });
    const { promise } = run(sessionGuardMiddleware, { ctx });
    await expect(promise).resolves.toEqual({ ok: true });
  });
});

describe("createRateLimitMiddleware", () => {
  it("exports the default budget the scaffold documents", () => {
    expect(DEFAULT_API_RATE_LIMIT).toEqual({ bucket: "api", limit: 120, windowSeconds: 60 });
  });

  it("enforces the limit on the default (memory) KV rather than failing open", async () => {
    // This test used to assert the opposite. A deployment on the default
    // CACHE_DRIVER=memory had NO rate limit on any tRPC route, which let an
    // infrastructure choice silently decide a security posture.
    const kv = createMemoryKv();
    const middleware = createRateLimitMiddleware({ bucket: "api", limit: 2, windowSeconds: 60 });
    const ctx = createCtx({ kv });

    await expect(run(middleware, { ctx }).promise).resolves.toEqual({ ok: true });
    await expect(run(middleware, { ctx }).promise).resolves.toEqual({ ok: true });
    await expect(run(middleware, { ctx }).promise).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("maps RATE_LIMITED to TOO_MANY_REQUESTS once over budget", async () => {
    const kv: KvPort = {
      get: async () => Promise.resolve(null),
      set: async () => Promise.resolve(),
      delete: async () => Promise.resolve(),
      getAndDelete: async () => Promise.resolve(null),
      incrementWithTtl: async () => Promise.resolve(2),
    };
    const middleware = createRateLimitMiddleware({ bucket: "api", limit: 1, windowSeconds: 60 });
    const { promise } = run(middleware, { ctx: createCtx({ kv }) });
    await expect(promise).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("createBranchGuardMiddleware", () => {
  it("attaches the rls context override on success", async () => {
    const ctx = createCtx({
      session: { userId: "u1", activeBranchId: "b1" },
      member: { role: "owner" },
    });
    const guarded = run(createBranchGuardMiddleware({ resource: "orders", action: "read" }), {
      ctx,
    });
    await expect(guarded.promise).resolves.toEqual({ ok: true });
    expect(guarded.overrides).toEqual([{ rls: { userId: "u1", branchId: "b1", role: "owner" } }]);
  });

  it("maps a missing session to UNAUTHORIZED", async () => {
    const { promise } = run(createBranchGuardMiddleware());
    await expect(promise).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
