// Consumer-owned tRPC root (R1/R16): the library ships context types, guards,
// services and the error formatter; the app assembles procedures and routers.
import {
  appErrorToTRPCError,
  applyCacheInvalidation,
  checkRateLimit,
  enforceCacheMeta,
  posErrorFormatter,
  requireBranch,
  requireSession,
  type PermissionCheck,
  type PosTrpcContext,
  type PosTrpcMeta,
} from "@nukesai-pos/backend/trpc";
import { AppError, toAppError } from "@nukesai-pos/common/errors";
import type { BranchContext } from "@nukesai-pos/backend/adapters/drizzle";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

export const t = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create({
  transformer: superjson, // trpc-to-openapi ignores it: OpenAPI stays plain JSON (verified)
  errorFormatter: posErrorFormatter,
});

const rethrowAppError = (error: unknown): never => {
  throw error instanceof AppError ? appErrorToTRPCError(error) : error;
};

/** BAD_REQUEST+ZodError -> UNPROCESSABLE_CONTENT so the wire status is a true 422. */
const validation422 = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "BAD_REQUEST" && result.error.cause instanceof ZodError) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "errors.validationFailed",
      cause: result.error.cause,
    });
  }
  return result;
});

/** Discipline HALF 1 — enforce the declaration up-front (cheap, applies to all). */
const cacheEnforce = t.middleware(async ({ meta, type, path, next }) => {
  try {
    enforceCacheMeta(meta, type, path);
  } catch (error) {
    rethrowAppError(toAppError(error));
  }
  return next();
});

/**
 * Discipline HALF 2 — invalidate AFTER a successful mutation. MUST sit
 * downstream of branchGuard: middleware order is the ctx flow, and rls only
 * exists after the guard adds it (placing this earlier silently skips
 * invalidation — caught live: a created order never appeared in the list).
 */
const cacheInvalidate = t.middleware(async ({ ctx, meta, type, next }) => {
  const result = await next();
  if (result.ok && type === "mutation") {
    const rls = (ctx as { rls?: BranchContext }).rls;
    if (rls !== undefined) await applyCacheInvalidation(ctx.deps.cache, rls.branchId, meta);
  }
  return result;
});

const rateLimited = t.middleware(async ({ ctx, path, next }) => {
  try {
    await checkRateLimit(ctx, path, { bucket: "api", limit: 120, windowSeconds: 60 });
  } catch (error) {
    rethrowAppError(error);
  }
  return next();
});

export const publicProcedure = t.procedure.use(validation422).use(cacheEnforce);

export const protectedProcedure = publicProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    try {
      requireSession(ctx);
    } catch (error) {
      rethrowAppError(error);
    }
    return next();
  }),
);

/** Branch-scoped procedure: session -> active branch -> membership -> role -> rls ctx. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- the tRPC builder type is inferred by design; annotating it would freeze internal generics
export const branchProcedure = (check?: PermissionCheck) =>
  publicProcedure
    .use(rateLimited)
    .use(
      t.middleware(async ({ ctx, next }) => {
        try {
          const authorization = await requireBranch(ctx, check);
          return await next({ ctx: { rls: authorization.rls } });
        } catch (error) {
          return rethrowAppError(error);
        }
      }),
    )
    .use(cacheInvalidate);

export const createCallerFactory: typeof t.createCallerFactory = t.createCallerFactory;
