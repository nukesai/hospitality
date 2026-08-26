import type { AnalyticsPort, LoggerPort } from "@nukesai-pos/common";
import { AppError } from "@nukesai-pos/common";
import type { Translator } from "@nukesai-pos/common/i18n";
import type {
  TRPCDefaultErrorData,
  TRPCDefaultErrorShape,
  TRPCError,
  TRPCErrorShape,
  TRPC_ERROR_CODE_NUMBER,
} from "@trpc/server";
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
  /** Always present — memory-backed without Redis. See createCacheFromEnv. */
  readonly kv: KvPort;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly isDev: boolean;
  readonly trustedOrigins: readonly string[];
  readonly defaultLocale: string;
  /** Proper Accept-Language negotiation (first SUPPORTED tag wins) — wired by
   *  createNukesPos over the common catalogs; single source of truth. */
  readonly resolveLocale: (acceptLanguage: string | null) => string;
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
  const locale = deps.resolveLocale(req.headers.get("accept-language"));
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

/** `z.flattenError` output, declared locally so the public dts never reaches
 *  into zod internals. */
export interface PosFlattenedZodError {
  readonly formErrors: readonly string[];
  readonly fieldErrors: Readonly<Record<string, readonly string[] | undefined>>;
}

/** tRPC's default error data PLUS the POS contract every client can rely on. */
export interface PosErrorData extends TRPCDefaultErrorData {
  /** Flattened validation issues on a 422, null otherwise. */
  readonly zod: PosFlattenedZodError | null;
  /** `AppError.code` when the failure was a domain error, null otherwise. */
  readonly appCode: string | null;
  /** Correlates the client error with the server log line. */
  readonly requestId: string | undefined;
}

/**
 * The shipped error shape. `code` MUST stay tRPC's literal-union type: widening
 * it to `number` breaks the `TShape extends TRPCErrorShape` constraint, and
 * initTRPC then silently falls back to DefaultErrorShape — dropping zod/appCode/
 * requestId from every client's `error.data` type (shipped broken until
 * 2026-08-21; the compile contract in routers.test.ts pins it).
 */
export interface PosErrorShape extends TRPCErrorShape<PosErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}

/** Passed by the scaffold into initTRPC's create({ errorFormatter: posErrorFormatter }). */
export function posErrorFormatter(opts: {
  /** tRPC always hands the formatter its DEFAULT shape. */
  readonly shape: TRPCDefaultErrorShape;
  readonly error: TRPCError;
  readonly ctx: PosTrpcContext | undefined;
}): PosErrorShape {
  const { shape, error, ctx } = opts;
  // ONLY input validation may surface its issues: validation422Middleware
  // remaps those to UNPROCESSABLE_CONTENT. An OUTPUT-schema failure arrives as
  // INTERNAL_SERVER_ERROR with a ZodError cause, and shipping it would leak the
  // internal DTO shape (field paths, uuid/datetime regex sources) to any client.
  const zod =
    error.code === "UNPROCESSABLE_CONTENT" && error.cause instanceof ZodError
      ? z.flattenError(error.cause)
      : null;
  const appError = error.cause instanceof AppError ? error.cause : null;
  const { stack: _stack, ...data } = shape.data;
  // tRPC copies cause.message onto unknown thrown errors — NEVER ship internals:
  // outside dev, anything that is not an AppError/ZodError collapses to the
  // generic safe key (the original is logged by the onError hook).
  const safeMessage =
    ctx?.deps.isDev === true || appError !== null || zod !== null
      ? shape.message
      : "errors.internal";
  return {
    ...shape,
    message: safeMessage,
    data: {
      ...data,
      ...(ctx?.deps.isDev === true ? { stack: _stack } : {}), // never leak stacks in prod
      zod,
      appCode: appError?.code ?? null,
      requestId: ctx?.requestId,
    },
  };
}
