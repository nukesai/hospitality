import { describe, expect, it } from "vitest";

import { parseEnv, parseTrustedOrigins, type PosEnv, type PosEnvSource } from "./env.js";

const BASE: Readonly<Record<string, string>> = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/pos",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://auth.example.com",
};

const source = (overrides: Record<string, string | undefined> = {}): PosEnvSource => ({
  ...BASE,
  ...overrides,
});

describe("parseEnv", () => {
  it("parses a minimal environment and applies every default", () => {
    const env = parseEnv(source());
    expect(env).toMatchObject({
      NODE_ENV: "development",
      BACKEND_RUNTIME: "server",
      DATABASE_URL: BASE.DATABASE_URL,
      DATABASE_POOL_MAX: 10,
      DATABASE_POOL_IDLE_TIMEOUT_MS: 30_000,
      DATABASE_CONNECT_TIMEOUT_MS: 10_000,
      DATABASE_POOL_MAX_USES: 0,
      DATABASE_SSL: false,
      CACHE_DRIVER: "memory",
      CACHE_KEY_PREFIX: "pos",
      AUTH_TRUSTED_ORIGINS: "",
      MAIL_DRIVER: "noop",
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: "no-reply@localhost",
      LOG_LEVEL: "info",
      ANALYTICS_DRIVER: "noop",
      API_MAX_BODY_BYTES: 1_048_576,
      DEFAULT_LOCALE: "en",
    });
    expect(env.MIGRATE_DATABASE_URL).toBeUndefined();
    expect(env.CACHE_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
    expect(env.AUTH_COOKIE_DOMAIN).toBeUndefined();
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.ANALYTICS_WRITE_KEY).toBeUndefined();
  });

  it("coerces numeric strings and stringbool values", () => {
    const env = parseEnv(
      source({
        DATABASE_POOL_MAX: "25",
        DATABASE_POOL_IDLE_TIMEOUT_MS: "0",
        DATABASE_CONNECT_TIMEOUT_MS: "5000",
        DATABASE_POOL_MAX_USES: "7500",
        DATABASE_SSL: "true",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        API_MAX_BODY_BYTES: "2048",
      }),
    );
    expect(env.DATABASE_POOL_MAX).toBe(25);
    expect(env.DATABASE_POOL_IDLE_TIMEOUT_MS).toBe(0);
    expect(env.DATABASE_CONNECT_TIMEOUT_MS).toBe(5000);
    expect(env.DATABASE_POOL_MAX_USES).toBe(7500);
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.API_MAX_BODY_BYTES).toBe(2048);
  });

  it("accepts explicit enum values and the postgresql:// protocol", () => {
    const env = parseEnv(
      source({
        NODE_ENV: "production",
        BACKEND_RUNTIME: "vercel",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/pos",
        MIGRATE_DATABASE_URL: "postgresql://admin:pass@db.internal:5432/pos",
        LOG_LEVEL: "silent",
        ANALYTICS_DRIVER: "webhook",
        ANALYTICS_WRITE_KEY: "wk-1",
        AUTH_COOKIE_DOMAIN: ".example.com",
        DEFAULT_LOCALE: "ne",
      }),
    );
    expect(env.NODE_ENV).toBe("production");
    expect(env.BACKEND_RUNTIME).toBe("vercel");
    expect(env.MIGRATE_DATABASE_URL).toBe("postgresql://admin:pass@db.internal:5432/pos");
    expect(env.LOG_LEVEL).toBe("silent");
    expect(env.ANALYTICS_DRIVER).toBe("webhook");
    expect(env.ANALYTICS_WRITE_KEY).toBe("wk-1");
    expect(env.AUTH_COOKIE_DOMAIN).toBe(".example.com");
    expect(env.DEFAULT_LOCALE).toBe("ne");
  });

  it("rejects CACHE_DRIVER=ioredis without CACHE_URL", () => {
    expect(() => parseEnv(source({ CACHE_DRIVER: "ioredis" }))).toThrow(
      "CACHE_DRIVER=ioredis requires CACHE_URL",
    );
  });

  it("accepts CACHE_DRIVER=ioredis with a rediss:// CACHE_URL", () => {
    const env = parseEnv(
      source({ CACHE_DRIVER: "ioredis", CACHE_URL: "rediss://cache.example.com:6379" }),
    );
    expect(env.CACHE_DRIVER).toBe("ioredis");
    expect(env.CACHE_URL).toBe("rediss://cache.example.com:6379");
  });

  it("rejects CACHE_DRIVER=upstash with neither REST variable", () => {
    expect(() => parseEnv(source({ CACHE_DRIVER: "upstash" }))).toThrow(
      "CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
    );
  });

  it("rejects CACHE_DRIVER=upstash with the URL but no token", () => {
    expect(() =>
      parseEnv(
        source({
          CACHE_DRIVER: "upstash",
          UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
        }),
      ),
    ).toThrow("CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  });

  it("accepts CACHE_DRIVER=upstash with both REST variables", () => {
    const env = parseEnv(
      source({
        CACHE_DRIVER: "upstash",
        UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
        UPSTASH_REDIS_REST_TOKEN: "token-1",
      }),
    );
    expect(env.UPSTASH_REDIS_REST_URL).toBe("https://upstash.example.com");
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token-1");
  });

  it("rejects MAIL_DRIVER=smtp without SMTP_HOST", () => {
    expect(() => parseEnv(source({ MAIL_DRIVER: "smtp" }))).toThrow(
      "MAIL_DRIVER=smtp requires SMTP_HOST",
    );
  });

  it("accepts MAIL_DRIVER=smtp with a full SMTP configuration", () => {
    const env = parseEnv(
      source({
        MAIL_DRIVER: "smtp",
        SMTP_HOST: "mail.example.com",
        SMTP_USER: "mailer",
        SMTP_PASS: "hunter2",
        MAIL_FROM: "pos@example.com",
      }),
    );
    expect(env.MAIL_DRIVER).toBe("smtp");
    expect(env.SMTP_HOST).toBe("mail.example.com");
    expect(env.SMTP_USER).toBe("mailer");
    expect(env.SMTP_PASS).toBe("hunter2");
    expect(env.MAIL_FROM).toBe("pos@example.com");
  });

  it("rejects a DATABASE_URL with a non-postgres protocol", () => {
    expect(() =>
      parseEnv(source({ DATABASE_URL: "mysql://user:pass@localhost:3306/pos" })),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a CACHE_URL with a non-redis protocol even when the driver is memory", () => {
    expect(() => parseEnv(source({ CACHE_URL: "http://cache.example.com" }))).toThrow(/CACHE_URL/);
  });

  it("throws a prefixed error whose message contains the prettified issues", () => {
    let caught: unknown;
    try {
      parseEnv({ BETTER_AUTH_URL: "not-a-url" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("[@nukesai-pos/backend] Invalid environment:");
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).toContain("BETTER_AUTH_URL");
  });
});

describe("parseTrustedOrigins", () => {
  const envWith = (origins: string): PosEnv => parseEnv(source({ AUTH_TRUSTED_ORIGINS: origins }));

  it("returns only the BETTER_AUTH_URL origin for an empty csv", () => {
    expect(parseTrustedOrigins(envWith(""))).toEqual(["https://auth.example.com"]);
  });

  it("parses the csv, trimming entries and dropping empty segments", () => {
    const origins = parseTrustedOrigins(
      envWith(" https://a.example.com , https://b.example.com ,, "),
    );
    expect(origins).toEqual([
      "https://auth.example.com",
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("dedupes csv entries against each other and the base origin", () => {
    const origins = parseTrustedOrigins(
      envWith("https://auth.example.com,https://a.example.com,https://a.example.com"),
    );
    expect(origins).toEqual(["https://auth.example.com", "https://a.example.com"]);
  });

  it("normalizes BETTER_AUTH_URL to its origin (path stripped)", () => {
    const env = parseEnv(
      source({ BETTER_AUTH_URL: "https://auth.example.com/api/auth", AUTH_TRUSTED_ORIGINS: "" }),
    );
    expect(parseTrustedOrigins(env)).toEqual(["https://auth.example.com"]);
  });
});
