import type { AnalyticsPort, LoggerPort } from "@nukesai-pos/common";
import { AppError } from "@nukesai-pos/common";
import type { Translator } from "@nukesai-pos/common/i18n";
import type { TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import { z, ZodError } from "zod";

import type { PosDatabase } from "../adapters/drizzle/client.js";
import type { PosAuth } from "../auth/index.js";
import type { CachePort } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";

export const CACHE_ENTITIES = [
  "orders",
  "tables",
  "menu",
  "reservations",
  "reports",
  "branches",
] as const;
export type CacheEntity = (typeof CACHE_ENTITIES)[number];

/** Every MUTATION must declare cacheInvalidates (entities or "none") — enforced by middleware. */
export interface PosTrpcMeta extends OpenApiMeta {
  readonly cacheInvalidates?: readonly CacheEntity[] | "none";
}

export interface PosTrpcDeps {
  readonly auth: PosAuth;
  readonly db: PosDatabase;
  readonly cache: CachePort;
  readonly kv: KvPort | null;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly isDev: boolean;
  readonly trustedOrigins: readonly string[];
  readonly defaultLocale: string;
  readonly translatorFor: (locale: string) => Translator;
}

export interface PosSessionInfo {
  readonly userId: string;
  readonly activeBranchId: string | null; // session.activeOrganizationId
}

export interface PosTrpcContext {
  readonly session: PosSessionInfo | null;
  readonly requestedBranchId: string | null; // x-branch-id header (must equal active branch, R7)
  readonly requestHeaders: Headers;
  readonly ip: string | null;
  readonly requestId: string;
  readonly logger: LoggerPort;
  readonly t: Translator;
  readonly deps: PosTrpcDeps;
}

export async function createTRPCContext(req: Request, deps: PosTrpcDeps): Promise<PosTrpcContext> {
  const raw = await deps.auth.api.getSession({ headers: req.headers });
  const session: PosSessionInfo | null = raw
    ? { userId: raw.user.id, activeBranchId: raw.session.activeOrganizationId ?? null }
    : null;
  const requestId = globalThis.crypto.randomUUID();
  const locale =
    req.headers.get("accept-language")?.split(",")[0]?.split("-")[0] ?? deps.defaultLocale;
  return {
    session,
    requestedBranchId: req.headers.get("x-branch-id"),
    requestHeaders: req.headers,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    requestId,
    logger: deps.logger.child({ requestId, userId: session?.userId ?? "anon" }),
    t: deps.translatorFor(locale),
    deps,
  };
}

export interface PosErrorShape {
  readonly message: string;
  readonly code: number;
  readonly data: Record<string, unknown>;
}

/** Passed by the scaffold into initTRPC's create({ errorFormatter: posErrorFormatter }). */
export function posErrorFormatter(opts: {
  readonly shape: PosErrorShape;
  readonly error: TRPCError;
  readonly ctx: PosTrpcContext | undefined;
}): PosErrorShape {
  const { shape, error, ctx } = opts;
  const zod = error.cause instanceof ZodError ? z.flattenError(error.cause) : null;
  const appError = error.cause instanceof AppError ? error.cause : null;
  const { stack: _stack, ...data } = shape.data;
  return {
    ...shape,
    data: {
      ...data,
      ...(ctx?.deps.isDev === true ? { stack: _stack } : {}), // never leak stacks in prod
      zod,
      appCode: appError?.code ?? null,
      requestId: ctx?.requestId,
    },
  };
}
