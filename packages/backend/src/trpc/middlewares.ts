import { AppError, toAppError } from "@nukesai-pos/common/errors";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import type { BranchContext } from "../adapters/drizzle/rls.js";
import { applyCacheInvalidation, enforceCacheMeta } from "../cache/invalidation.js";
import { appErrorToTRPCError } from "../internal/trpc/error-mapping.js";
import {
  checkRateLimit,
  requireBranch,
  requireSession,
  type PermissionCheck,
  type RateLimitOptions,
} from "./guards.js";
import type { PosTrpcContext, PosTrpcMeta } from "./init.js";

/**
 * Middleware bodies as PLAIN structurally-typed functions (R16): the consumer
 * scaffold only wraps each in `t.middleware(...)`. tRPC's own MiddlewareFunction
 * type is internal (unstable-core-do-not-import), so these hand-written types
 * mirror it structurally — the result generic `R` binds to tRPC's
 * MiddlewareResult, whose context parameter is phantom, which keeps every
 * binding compatible (compile-verified against @trpc/server 11.18).
 */
export type PosMiddlewareResult =
  { readonly ok: true } | { readonly ok: false; readonly error: TRPCError };

export interface PosMiddlewareNext<R> {
  (): Promise<R>;
  <C extends object>(opts: { readonly ctx: C }): Promise<R>;
}

export interface PosMiddlewareOpts<R> {
  readonly ctx: PosTrpcContext;
  readonly type: "query" | "mutation" | "subscription";
  readonly path: string;
  readonly meta: PosTrpcMeta | undefined;
  readonly next: PosMiddlewareNext<R>;
}

export type PosMiddleware = <R extends PosMiddlewareResult>(
  opts: PosMiddlewareOpts<R>,
) => Promise<R>;

/** AppError -> TRPCError at the boundary; anything else re-throws untouched. */
export const rethrowAppError = (error: unknown): never => {
  throw error instanceof AppError ? appErrorToTRPCError(error) : error;
};

/** BAD_REQUEST+ZodError -> UNPROCESSABLE_CONTENT so the wire status is a true 422. */
export const validation422Middleware: PosMiddleware = async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "BAD_REQUEST" && result.error.cause instanceof ZodError) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "errors.validationFailed",
      cause: result.error.cause,
    });
  }
  return result;
};

/** Discipline HALF 1 — enforce the `cacheInvalidates` declaration up-front (cheap, all procedures). */
export const cacheMetaMiddleware: PosMiddleware = async ({ meta, type, path, next }) => {
  try {
    enforceCacheMeta(meta, type, path);
  } catch (error) {
    rethrowAppError(toAppError(error));
  }
  return next();
};

/**
 * Discipline HALF 2 — invalidate AFTER a successful mutation. MUST sit
 * downstream of the branch guard: middleware order is the ctx flow, and `rls`
 * only exists after the guard adds it (placing this earlier silently skips
 * invalidation — caught live: a created order never appeared in the list).
 */
export const cacheInvalidationMiddleware: PosMiddleware = async ({ ctx, meta, type, next }) => {
  const result = await next();
  if (result.ok && type === "mutation") {
    const rls = (ctx as { rls?: BranchContext }).rls;
    if (rls !== undefined) await applyCacheInvalidation(ctx.deps.cache, rls.branchId, meta);
  }
  return result;
};

/** 401 without a session; adds nothing to ctx (reads stay on `ctx.session`). */
export const sessionGuardMiddleware: PosMiddleware = async ({ ctx, next }) => {
  try {
    requireSession(ctx);
  } catch (error) {
    rethrowAppError(error);
  }
  return next();
};

export const DEFAULT_API_RATE_LIMIT: RateLimitOptions = {
  bucket: "api",
  limit: 120,
  windowSeconds: 60,
};

export const createRateLimitMiddleware = (
  options: RateLimitOptions = DEFAULT_API_RATE_LIMIT,
): PosMiddleware => {
  return async ({ ctx, path, next }) => {
    try {
      await checkRateLimit(ctx, path, options);
    } catch (error) {
      rethrowAppError(error);
    }
    return next();
  };
};

/** Branch-scoped: session -> active branch -> membership -> role -> `ctx.rls`. */
export const createBranchGuardMiddleware = (check?: PermissionCheck): PosMiddleware => {
  return async ({ ctx, next }) => {
    try {
      const authorization = await requireBranch(ctx, check);
      return await next({ ctx: { rls: authorization.rls } });
    } catch (error) {
      return rethrowAppError(error);
    }
  };
};
