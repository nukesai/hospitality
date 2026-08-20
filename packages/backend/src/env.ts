import { z } from "zod";

/**
 * The ONLY module in this package that interprets environment values. It never reads
 * process.env — the consumer passes a record into createNukesPos({ env: process.env }).
 * Deliberately NOT importing "server-only": scripts/db-migrate.ts runs this under plain
 * Node, where importing server-only throws (verified). The pill lives in entrypoints.
 */

const pgUrl = z.url({ protocol: /^postgres(ql)?$/ });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    BACKEND_RUNTIME: z.enum(["server", "vercel"]).default("server"),

    DATABASE_URL: pgUrl,
    MIGRATE_DATABASE_URL: pgUrl.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(1000).default(10),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
    DATABASE_POOL_MAX_USES: z.coerce.number().int().min(0).default(0),
    DATABASE_SSL: z.stringbool().default(false),

    CACHE_DRIVER: z.enum(["memory", "ioredis", "upstash"]).default("memory"),
    CACHE_URL: z.url({ protocol: /^rediss?$/ }).optional(),
    CACHE_KEY_PREFIX: z.string().min(1).default("pos"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    AUTH_TRUSTED_ORIGINS: z.string().default(""),
    AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),

    MAIL_DRIVER: z.enum(["smtp", "noop"]).default("noop"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    MAIL_FROM: z.email().default("no-reply@localhost"),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    ANALYTICS_DRIVER: z.enum(["noop", "webhook"]).default("noop"),
    ANALYTICS_WRITE_KEY: z.string().min(1).optional(),
    API_MAX_BODY_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
    DEFAULT_LOCALE: z.string().min(2).default("en"),
  })
  .refine((e) => e.CACHE_DRIVER !== "ioredis" || e.CACHE_URL !== undefined, {
    error: "CACHE_DRIVER=ioredis requires CACHE_URL",
    path: ["CACHE_URL"],
  })
  .refine(
    (e) =>
      e.CACHE_DRIVER !== "upstash"
      || (e.UPSTASH_REDIS_REST_URL !== undefined && e.UPSTASH_REDIS_REST_TOKEN !== undefined),
    {
      error: "CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
      path: ["UPSTASH_REDIS_REST_URL"],
    },
  )
  .refine((e) => e.MAIL_DRIVER !== "smtp" || e.SMTP_HOST !== undefined, {
    error: "MAIL_DRIVER=smtp requires SMTP_HOST",
    path: ["SMTP_HOST"],
  });

/**
 * Hand-written (NOT z.infer): inferring the exported type from the schema drags
 * the non-exported schema into the public API and fails isolatedDeclarations
 * (TS9010). env.test.ts locks schema/interface parity field by field.
 */
export interface PosEnv {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly BACKEND_RUNTIME: "server" | "vercel";
  readonly DATABASE_URL: string;
  readonly MIGRATE_DATABASE_URL?: string | undefined;
  readonly DATABASE_POOL_MAX: number;
  readonly DATABASE_POOL_IDLE_TIMEOUT_MS: number;
  readonly DATABASE_CONNECT_TIMEOUT_MS: number;
  readonly DATABASE_POOL_MAX_USES: number;
  readonly DATABASE_SSL: boolean;
  readonly CACHE_DRIVER: "memory" | "ioredis" | "upstash";
  readonly CACHE_URL?: string | undefined;
  readonly CACHE_KEY_PREFIX: string;
  readonly UPSTASH_REDIS_REST_URL?: string | undefined;
  readonly UPSTASH_REDIS_REST_TOKEN?: string | undefined;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly AUTH_COOKIE_DOMAIN?: string | undefined;
  readonly MAIL_DRIVER: "smtp" | "noop";
  readonly SMTP_HOST?: string | undefined;
  readonly SMTP_PORT: number;
  readonly SMTP_SECURE: boolean;
  readonly SMTP_USER?: string | undefined;
  readonly SMTP_PASS?: string | undefined;
  readonly MAIL_FROM: string;
  readonly LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly ANALYTICS_DRIVER: "noop" | "webhook";
  readonly ANALYTICS_WRITE_KEY?: string | undefined;
  readonly API_MAX_BODY_BYTES: number;
  readonly DEFAULT_LOCALE: string;
}

export type PosEnvSource = Readonly<Record<string, string | undefined>>;

export function parseEnv(source: PosEnvSource): PosEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `[@nukesai-pos/backend] Invalid environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function parseTrustedOrigins(env: PosEnv): readonly string[] {
  const fromCsv = env.AUTH_TRUSTED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const base = new URL(env.BETTER_AUTH_URL).origin;
  return [...new Set([base, ...fromCsv])];
}
