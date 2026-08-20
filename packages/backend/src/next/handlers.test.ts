import { initTRPC } from "@trpc/server";
import type { OpenApiRouter } from "trpc-to-openapi";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { PosTrpcContext, PosTrpcMeta } from "../trpc/init.js";
import {
  healthCheck,
  healthInput,
  healthOutput,
  type HealthResult,
} from "../trpc/services/health.js";
import {
  createDocsHandler,
  createOpenApiHandlers,
  createOpenApiJsonHandler,
  createTrpcHandlers,
  type ApiHandlerConfig,
} from "./handlers.js";

// Risk-#1 composition proof: a REAL tRPC v11 router built with the package's
// own context/meta types and the shipped healthCheck service, fed through the
// shipped Next.js handlers.
const t = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create();

const router = t.router({
  health: t.router({
    check: t.procedure
      .meta({ openapi: { method: "GET", path: "/health" } })
      .input(healthInput)
      .output(healthOutput)
      .query(({ input }): HealthResult => healthCheck(input)),
    boom: t.procedure.input(z.object({})).query((): HealthResult => {
      throw new Error("kaboom");
    }),
    ping: t.procedure
      .input(z.object({ n: z.number() }))
      .mutation(({ input }): { pong: number } => ({ pong: input.n })),
  }),
});

const TRUSTED = "http://localhost:3000";

interface Harness {
  readonly cfg: ApiHandlerConfig;
  readonly onError: ReturnType<
    typeof vi.fn<(info: { path: string | undefined; code: string; message: string }) => void>
  >;
  readonly contextRequests: Request[];
}

const makeCfg = (overrides: Partial<ApiHandlerConfig> = {}): Harness => {
  const contextRequests: Request[] = [];
  const onError =
    vi.fn<(info: { path: string | undefined; code: string; message: string }) => void>();
  const cfg: ApiHandlerConfig = {
    createContext: async (req: Request): Promise<PosTrpcContext> => {
      contextRequests.push(req);
      await Promise.resolve();
      return { requestId: "test-request" } as unknown as PosTrpcContext;
    },
    trustedOrigins: [TRUSTED],
    maxBodyBytes: 1024,
    onError,
    restBaseUrl: `${TRUSTED}/api/rest`,
    ...overrides,
  };
  return { cfg, onError, contextRequests };
};

const trpcUrl = (path: string, input: unknown): string =>
  `${TRUSTED}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;

describe("createTrpcHandlers", () => {
  it("GET serves a query through the real router and creates context from the request", async () => {
    const { cfg, contextRequests } = makeCfg();
    const { GET } = createTrpcHandlers(router, cfg);
    const request = new Request(trpcUrl("health.check", { echo: "hi" }), {
      headers: { origin: "http://evil.example" }, // origin is ignored on GET
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { data: { ok: true, service: "nukesai-pos-backend", echo: "hi" } },
    });
    expect(contextRequests).toEqual([request]);
  });

  it("POST serves a mutation when the origin is trusted", async () => {
    const { cfg } = makeCfg();
    const { POST } = createTrpcHandlers(router, cfg);
    const response = await POST(
      new Request(`${TRUSTED}/api/trpc/health.ping`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TRUSTED },
        body: JSON.stringify({ n: 7 }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { data: { pong: 7 } } });
  });

  it("POST serves a mutation when no origin header is present", async () => {
    const { cfg } = makeCfg();
    const { POST } = createTrpcHandlers(router, cfg);
    const response = await POST(
      new Request(`${TRUSTED}/api/trpc/health.ping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: 1 }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects POST from an untrusted origin with 403", async () => {
    const { cfg, onError } = makeCfg();
    const { POST } = createTrpcHandlers(router, cfg);
    const response = await POST(
      new Request(`${TRUSTED}/api/trpc/health.ping`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.example" },
        body: JSON.stringify({ n: 1 }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Forbidden origin");
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects POST whose declared content-length exceeds maxBodyBytes with 413", async () => {
    const { cfg } = makeCfg();
    const { POST } = createTrpcHandlers(router, cfg);
    const response = await POST(
      new Request(`${TRUSTED}/api/trpc/health.ping`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: TRUSTED,
          "content-length": "4096",
        },
        body: JSON.stringify({ n: 1 }),
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toBe("Payload too large");
  });

  it("HEAD skips the origin guard entirely", async () => {
    const { cfg } = makeCfg();
    const { GET } = createTrpcHandlers(router, cfg);
    const response = await GET(
      new Request(trpcUrl("health.check", {}), {
        method: "HEAD",
        headers: { origin: "http://evil.example" },
      }),
    );
    expect(response.status).not.toBe(403);
  });

  it("invokes onError with path, code and message when a procedure throws", async () => {
    const { cfg, onError } = makeCfg();
    const { GET } = createTrpcHandlers(router, cfg);
    const response = await GET(new Request(trpcUrl("health.boom", {})));
    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledExactlyOnceWith({
      path: "health.boom",
      code: "INTERNAL_SERVER_ERROR",
      message: "kaboom",
    });
  });
});

describe("createOpenApiHandlers", () => {
  const openApiRouter = router as unknown as OpenApiRouter;

  it("GET /api/rest/health serves the openapi-mapped procedure", async () => {
    const { cfg, contextRequests } = makeCfg();
    const handlers = createOpenApiHandlers(openApiRouter, cfg);
    const response = await handlers.GET(new Request(`${TRUSTED}/api/rest/health?echo=rest`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "nukesai-pos-backend",
      echo: "rest",
    });
    expect(contextRequests).toHaveLength(1);
  });

  it("exposes the same guarded handler for all five methods", async () => {
    const { cfg } = makeCfg();
    const handlers = createOpenApiHandlers(openApiRouter, cfg);
    expect(Object.keys(handlers).sort()).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
    const forbidden = await handlers.PUT(
      new Request(`${TRUSTED}/api/rest/health`, {
        method: "PUT",
        headers: { origin: "http://evil.example" },
      }),
    );
    expect(forbidden.status).toBe(403);
    const tooLarge = await handlers.POST(
      new Request(`${TRUSTED}/api/rest/health`, {
        method: "POST",
        headers: { origin: TRUSTED, "content-length": "4096" },
        body: "x",
      }),
    );
    expect(tooLarge.status).toBe(413);
  });

  it("reports procedure errors through onError", async () => {
    const { cfg, onError } = makeCfg();
    const handlers = createOpenApiHandlers(openApiRouter, cfg);
    const response = await handlers.GET(new Request(`${TRUSTED}/api/rest/nowhere`));
    expect(response.status).toBe(404);
    expect(onError).toHaveBeenCalledExactlyOnceWith({
      path: undefined,
      code: "NOT_FOUND",
      message: "Not found",
    });
  });
});

describe("createOpenApiJsonHandler", () => {
  const openApiRouter = router as unknown as OpenApiRouter;

  it("generates the document once with defaults and caches it", async () => {
    const { cfg } = makeCfg();
    const handler = createOpenApiJsonHandler(openApiRouter, cfg);
    const first = await handler(new Request(`${TRUSTED}/api/openapi.json`));
    const second = await handler(new Request(`${TRUSTED}/api/openapi.json`));
    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
    const firstDoc = (await first.json()) as Record<string, unknown>;
    const secondDoc = (await second.json()) as Record<string, unknown>;
    expect(secondDoc).toEqual(firstDoc);
    expect(firstDoc.info).toEqual({ title: "Nukes AI POS API", version: "1.0.0" });
    expect(firstDoc.components).toMatchObject({
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    });
    expect(firstDoc.paths).toHaveProperty("/health");
  });

  it("uses the configured docs title when provided", async () => {
    const { cfg } = makeCfg({ docs: { title: "Custom API" } });
    const handler = createOpenApiJsonHandler(openApiRouter, cfg);
    const response = await handler(new Request(`${TRUSTED}/api/openapi.json`));
    const doc = (await response.json()) as { info: { title: string } };
    expect(doc.info.title).toBe("Custom API");
  });
});

describe("createDocsHandler", () => {
  it("returns an HTML page referencing the openapi document", async () => {
    const { cfg } = makeCfg();
    const handler = createDocsHandler(cfg);
    const response = await handler();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("/api/openapi.json");
  });

  it("threads a custom cdn through to the page", async () => {
    const { cfg } = makeCfg({ docs: { cdn: "https://cdn.example/scalar.js" } });
    const handler = createDocsHandler(cfg);
    const response = await handler();
    const html = await response.text();
    expect(html).toContain("https://cdn.example/scalar.js");
  });
});
