// Consumer-owned tRPC root (R1/R16): the library ships the context types, the
// middleware bodies, the guards and the services — this file only assembles
// them into procedures (and stays the extension point for app-local ones).
import {
  cacheInvalidationMiddleware,
  cacheMetaMiddleware,
  createRateLimitMiddleware,
  posErrorFormatter,
  requireBranch,
  rethrowAppError,
  sessionGuardMiddleware,
  validation422Middleware,
  type PermissionCheck,
  type PosTrpcContext,
  type PosTrpcMeta,
} from "@nukesai-pos/backend/trpc";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export const t = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create({
  transformer: superjson, // trpc-to-openapi ignores it: OpenAPI stays plain JSON (verified)
  errorFormatter: posErrorFormatter,
});

const rateLimited = t.middleware(createRateLimitMiddleware());

export const publicProcedure = t.procedure
  .use(t.middleware(validation422Middleware))
  .use(t.middleware(cacheMetaMiddleware));

export const protectedProcedure = publicProcedure.use(t.middleware(sessionGuardMiddleware));

/** Branch-scoped procedure: session -> active branch -> membership -> role -> rls ctx.
 *  The `rls` override stays INLINE so its type reaches every resolver as
 *  `ctx.rls`. Order contract: cache invalidation sits AFTER the guard. */
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
    .use(t.middleware(cacheInvalidationMiddleware));

export const createCallerFactory: typeof t.createCallerFactory = t.createCallerFactory;
