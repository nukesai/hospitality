import { AppError, type LoggerPort } from "@nukesai-pos/common";
import type { Translator } from "@nukesai-pos/common/i18n";
import { TRPCError, type TRPCDefaultErrorShape } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { resolveLocale } from "../i18n/resolve-locale.js";
import { createTRPCContext, posErrorFormatter } from "./init.js";
import type { PosTrpcContext, PosTrpcDeps } from "./init.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface SessionShape {
  readonly user: { readonly id: string };
  readonly session: { readonly activeOrganizationId?: string | null };
}

interface Harness {
  readonly deps: PosTrpcDeps;
  readonly childBindings: Parameters<LoggerPort["child"]>[0][];
  readonly translatorCalls: string[];
  readonly translator: Translator;
}

const createHarness = (raw: SessionShape | null): Harness => {
  const childBindings: Parameters<LoggerPort["child"]>[0][] = [];
  const translatorCalls: string[] = [];
  const translator: Translator = { t: (key: string): string => key };
  const logger: LoggerPort = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    child: (bindings): LoggerPort => {
      childBindings.push(bindings);
      return logger;
    },
    flush: async (): Promise<void> => Promise.resolve(),
  };
  const deps: PosTrpcDeps = {
    auth: {
      api: { getSession: async (): Promise<SessionShape | null> => Promise.resolve(raw) },
    } as unknown as PosTrpcDeps["auth"],
    db: {} as unknown as PosTrpcDeps["db"],
    cache: {} as unknown as PosTrpcDeps["cache"],
    kv: null,
    logger,
    analytics: {} as unknown as PosTrpcDeps["analytics"],
    isDev: false,
    trustedOrigins: [],
    defaultLocale: "en",
    resolveLocale: (acceptLanguage: string | null): string =>
      resolveLocale(
        { defaultLocale: "en", messagesByLocale: { en: {}, ne: {} } },
        undefined,
        acceptLanguage,
      ),
    translatorFor: (locale: string): Translator => {
      translatorCalls.push(locale);
      return translator;
    },
  };
  return { deps, childBindings, translatorCalls, translator };
};

describe("createTRPCContext", () => {
  it("builds an anonymous context when getSession returns null", async () => {
    const harness = createHarness(null);
    const req = new Request("http://localhost/api/trpc");
    const ctx = await createTRPCContext(req, harness.deps);
    expect(ctx.session).toBeNull();
    expect(ctx.requestedBranchId).toBeNull();
    expect(ctx.ip).toBeNull();
    expect(ctx.requestId).toMatch(UUID_RE);
    expect(ctx.requestHeaders).toBe(req.headers);
    expect(ctx.deps).toBe(harness.deps);
    expect(ctx.logger).toBe(harness.deps.logger);
    expect(harness.childBindings).toEqual([{ requestId: ctx.requestId, userId: "anon" }]);
    expect(harness.translatorCalls).toEqual(["en"]);
    expect(ctx.t).toBe(harness.translator);
  });

  it("maps a populated session and parses branch, forwarded ip and locale headers", async () => {
    const harness = createHarness({
      user: { id: "user-1" },
      session: { activeOrganizationId: "branch-1" },
    });
    const req = new Request("http://localhost/api/trpc", {
      headers: {
        "x-branch-id": "branch-1",
        "x-forwarded-for": " 203.0.113.9 , 10.0.0.1",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    const ctx = await createTRPCContext(req, harness.deps);
    expect(ctx.session).toEqual({ userId: "user-1", activeBranchId: "branch-1" });
    expect(ctx.requestedBranchId).toBe("branch-1");
    expect(ctx.ip).toBe("203.0.113.9");
    // fr is unsupported; proper negotiation walks the chain to the first
    // SUPPORTED tag (en) instead of blindly taking the first tag.
    expect(harness.translatorCalls).toEqual(["en"]);
    expect(harness.childBindings).toEqual([{ requestId: ctx.requestId, userId: "user-1" }]);
  });

  it("normalises a missing activeOrganizationId to a null active branch", async () => {
    const harness = createHarness({ user: { id: "user-2" }, session: {} });
    const req = new Request("http://localhost/api/trpc", {
      headers: { "accept-language": "de" },
    });
    const ctx = await createTRPCContext(req, harness.deps);
    expect(ctx.session).toEqual({ userId: "user-2", activeBranchId: null });
    // de is not in the catalog: negotiation falls back to the default locale.
    expect(harness.translatorCalls).toEqual(["en"]);
  });
});

const makeZodError = (): z.ZodError => {
  const parsed = z.object({ name: z.string() }).safeParse({});
  if (parsed.success) throw new Error("expected a zod failure");
  return parsed.error;
};

// tRPC hands the formatter its DEFAULT shape; the POS fields are what the
// formatter ADDS.
const makeShape = (): TRPCDefaultErrorShape => ({
  message: "errors.internal",
  code: -32603,
  data: {
    code: "INTERNAL_SERVER_ERROR",
    httpStatus: 500,
    path: "orders.list",
    stack: "secret-stack",
  },
});

const formatterCtx = (isDev: boolean): PosTrpcContext =>
  ({ requestId: "req-42", deps: { isDev } }) as unknown as PosTrpcContext;

describe("posErrorFormatter", () => {
  it("flattens a ZodError cause and strips the stack outside dev", () => {
    const zodError = makeZodError();
    const error = new TRPCError({ code: "BAD_REQUEST", cause: zodError });
    const result = posErrorFormatter({ shape: makeShape(), error, ctx: formatterCtx(false) });
    expect(result.message).toBe("errors.internal");
    expect(result.code).toBe(-32603);
    expect(result.data.zod).toEqual(z.flattenError(zodError));
    expect(result.data.appCode).toBeNull();
    expect(result.data.requestId).toBe("req-42");
    expect(result.data).not.toHaveProperty("stack");
    expect(result.data.path).toBe("orders.list");
  });

  it("surfaces the AppError code from the cause", () => {
    const error = new TRPCError({ code: "FORBIDDEN", cause: new AppError("ROLE_FORBIDDEN") });
    const result = posErrorFormatter({ shape: makeShape(), error, ctx: formatterCtx(false) });
    expect(result.data.appCode).toBe("ROLE_FORBIDDEN");
    expect(result.data.zod).toBeNull();
  });

  it("keeps the stack when isDev is true", () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const result = posErrorFormatter({ shape: makeShape(), error, ctx: formatterCtx(true) });
    expect(result.data.stack).toBe("secret-stack");
  });

  it("returns nulls for a plain error without ctx", () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: new Error("boom") });
    const result = posErrorFormatter({ shape: makeShape(), error, ctx: undefined });
    expect(result.data.zod).toBeNull();
    expect(result.data.appCode).toBeNull();
    expect(result.data.requestId).toBeUndefined();
    expect(result.data).not.toHaveProperty("stack");
  });
});
