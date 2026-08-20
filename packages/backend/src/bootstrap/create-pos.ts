import "server-only";

import type { AnalyticsPort, LoggerPort } from "@nukesai-pos/common";
import { noopAnalytics } from "@nukesai-pos/common/observability";
import type pg from "pg";

import {
  assertRlsEnforcedRole,
  createPosDb,
  dbConfigFromEnv,
  type PosDatabase,
} from "../adapters/drizzle/client.js";
import * as schema from "../adapters/drizzle/schema/index.js";
import { createSecondaryStorage } from "../adapters/auth/secondary-storage.js";
import { createPinoLogger } from "../adapters/logging/pino.js";
import { createNodemailerMail } from "../adapters/mail/nodemailer.js";
import { createNoopMail } from "../adapters/mail/noop.js";
import { createAuth, type PosAuth } from "../auth/index.js";
import { createCacheFromEnv } from "../cache/from-env.js";
import { parseEnv, parseTrustedOrigins, type PosEnv, type PosEnvSource } from "../env.js";
import { createRequestTranslator, defaultLocaleConfig } from "../i18n/resolve-locale.js";
import type { CachePort } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";
import type { MailPort } from "../ports/mail.js";
import { createTRPCContext, type PosTrpcContext, type PosTrpcDeps } from "../trpc/init.js";

export interface CreateNukesPosOptions {
  readonly env: PosEnvSource;
  /** Vercel Fluid: pass attachDatabasePool from @vercel/functions (verdict-mandated —
   *  SIGTERM hooks do NOT cover instance SUSPENSION). Kept a hook: backend has no Vercel dep. */
  readonly onPoolCreated?: ((pool: pg.Pool) => void) | undefined;
  /** Vercel: waitUntil from @vercel/functions — SWR background refresh scheduler. */
  readonly waitUntil?: ((p: Promise<unknown>) => void) | undefined;
  readonly mail?: MailPort | undefined; // test override
  readonly logger?: LoggerPort | undefined; // test override; default: pino adapter from env
}

export interface NukesPos {
  readonly env: PosEnv;
  readonly pool: pg.Pool;
  readonly db: PosDatabase;
  readonly auth: PosAuth;
  readonly cache: CachePort;
  readonly kv: KvPort | null;
  readonly mail: MailPort;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly trpc: {
    readonly deps: PosTrpcDeps;
    readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  };
  /** Single leak choke-point: mail.close -> cache.close -> pool.end -> logger.flush. Idempotent. */
  readonly shutdown: () => Promise<void>;
}

export async function createNukesPos(options: CreateNukesPosOptions): Promise<NukesPos> {
  const env = parseEnv(options.env);
  const logger =
    options.logger
    ?? createPinoLogger({
      level: env.LOG_LEVEL === "silent" ? "fatal" : env.LOG_LEVEL,
      runtime: env.BACKEND_RUNTIME,
      redactPaths: ["*.password", "*.token", "*.secret", "user.email"],
      base: { service: "nukesai-pos-backend", env: env.NODE_ENV },
    });

  const posDb = createPosDb(
    dbConfigFromEnv(env, (error) => {
      logger.error("pg.pool.error", { message: error.message });
    }),
    schema,
  );
  options.onPoolCreated?.(posDb.pool);
  // R2 boot guard: in production, refuse to serve on an RLS-exempt role.
  if (env.NODE_ENV === "production") await assertRlsEnforcedRole(posDb.pool);

  const { cache, kv } = await createCacheFromEnv(env, {
    onStoreError: (error) => {
      logger.error("cache.store.error", { message: error.message });
    },
    onMemoryFallbackInProduction: () => {
      logger.warn("cache.memory-fallback", {
        message:
          "CACHE_DRIVER=memory in production: no shared invalidation across instances AND API rate limiting is disabled (kv unavailable)",
      });
    },
    ...(options.waitUntil !== undefined ? { waitUntil: options.waitUntil } : {}),
  });

  const mail: MailPort =
    options.mail ?? (env.MAIL_DRIVER === "smtp" ? createNodemailerMail(env) : createNoopMail());

  const trustedOrigins = parseTrustedOrigins(env);
  const auth = createAuth({
    env: {
      secret: env.BETTER_AUTH_SECRET,
      baseUrl: env.BETTER_AUTH_URL,
      trustedOrigins,
      cookieDomain: env.AUTH_COOKIE_DOMAIN,
      appName: "Nukes AI POS",
    },
    db: posDb.db,
    schema,
    secondaryStorage: kv === null ? undefined : createSecondaryStorage(kv, "ba:"),
    mailer: mail,
  });

  const analytics: AnalyticsPort = noopAnalytics; // webhook adapter arrives in a later phase
  const localeConfig = defaultLocaleConfig(env.DEFAULT_LOCALE);

  const deps: PosTrpcDeps = {
    auth,
    db: posDb.db,
    cache,
    kv,
    logger,
    analytics,
    isDev: env.NODE_ENV === "development",
    trustedOrigins,
    defaultLocale: env.DEFAULT_LOCALE,
    translatorFor: (locale) => createRequestTranslator(localeConfig, locale),
  };

  let closing: Promise<void> | undefined;
  // NOT async on purpose: shutdown() must return the SAME memoized promise
  // (identity idempotency contract); async would wrap it per call.
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      await mail.close();
      await cache.close();
      await posDb.close();
      await logger.flush();
    })();
    return closing;
  };

  return {
    env,
    pool: posDb.pool,
    db: posDb.db,
    auth,
    cache,
    kv,
    mail,
    logger,
    analytics,
    trpc: { deps, createContext: async (req) => createTRPCContext(req, deps) },
    shutdown,
  };
}
