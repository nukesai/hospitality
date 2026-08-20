import type { PosRole } from "@nukesai-pos/common/auth";
import {
  initTRPC,
  type TRPCProcedureBuilder,
  type TRPCRootObject,
  type TRPCUnsetMarker,
} from "@trpc/server";
import superjson from "superjson";

import type { BranchContext } from "../adapters/drizzle/rls.js";
import type { PermissionCheck } from "./guards.js";
import { posErrorFormatter, type PosTrpcContext, type PosTrpcMeta } from "./init.js";
import {
  cacheInvalidationMiddleware,
  cacheMetaMiddleware,
  createBranchGuardMiddleware,
  createRateLimitMiddleware,
  sessionGuardMiddleware,
  validation422Middleware,
} from "./middlewares.js";

/**
 * THE tRPC root — package-owned. R1's real constraint is narrower than the
 * first implementation assumed: built ROUTERS cannot ship (their inferred
 * types are unspeakable under isolatedDeclarations), but the root object and
 * procedure BUILDERS annotate precisely with tRPC v11's public generic types
 * (compile-verified). Consumers therefore own ONLY their routers:
 *
 *   import { posTrpc, publicProcedure, branchProcedure } from "@nukesai-pos/backend/trpc";
 *   export const appRouter = posTrpc.router({ ... });
 *
 * `.router()` on the annotated root still infers the consumer's precise
 * AppRouter type — inference happens at THEIR call site, under THEIR tsconfig.
 */
interface PosRootOptions {
  transformer: typeof superjson;
  errorFormatter: typeof posErrorFormatter;
}

export type PosTrpcRoot = TRPCRootObject<PosTrpcContext, PosTrpcMeta, PosRootOptions>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- mirrors initTRPC's exact base instantiation ({} is what t.procedure carries)
interface NoOverrides {}

export type PosProcedure = TRPCProcedureBuilder<
  PosTrpcContext,
  PosTrpcMeta,
  NoOverrides,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  false
>;

/** What the branch guard adds to `ctx` — resolvers read `ctx.rls`. */
export interface PosRlsContext extends BranchContext {
  readonly role: PosRole;
}

export type PosBranchProcedure = TRPCProcedureBuilder<
  PosTrpcContext,
  PosTrpcMeta,
  { rls: PosRlsContext },
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  false
>;

export const posTrpc: PosTrpcRoot = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create({
  transformer: superjson, // trpc-to-openapi ignores it: OpenAPI stays plain JSON (verified)
  errorFormatter: posErrorFormatter,
});

/** 422 mapping + cache-declaration enforcement on EVERY procedure. */
export const publicProcedure: PosProcedure = posTrpc.procedure
  .use(posTrpc.middleware(validation422Middleware))
  .use(posTrpc.middleware(cacheMetaMiddleware));

/** 401 without a session; reads stay on `ctx.session`. */
export const protectedProcedure: PosProcedure = publicProcedure.use(
  posTrpc.middleware(sessionGuardMiddleware),
);

const rateLimited = posTrpc.middleware(createRateLimitMiddleware());

/**
 * Branch-scoped procedure: rate limit -> session -> active branch ->
 * membership -> role -> `ctx.rls`, cache invalidation AFTER the guard (order
 * is the ctx flow — caught live). The annotation DECLARES the `rls` override
 * the guard attaches at runtime; structural middleware types cannot carry the
 * override through `.use()` inference, which is exactly why the cast is here
 * and root.test.ts proves the runtime behind it.
 */
export const branchProcedure = (check?: PermissionCheck): PosBranchProcedure =>
  publicProcedure
    .use(rateLimited)
    .use(posTrpc.middleware(createBranchGuardMiddleware(check)))
    .use(posTrpc.middleware(cacheInvalidationMiddleware)) as PosBranchProcedure;
