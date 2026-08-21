import { noopLogger } from "@nukesai-pos/common";
import { initTRPC } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { PosTrpcContext, PosTrpcMeta } from "../trpc/init.js";
import {
  healthCheck,
  healthInput,
  healthOutput,
  type HealthResult,
} from "../trpc/services/health.js";
import { createPosApi, type PosApiSource } from "./create-pos-api.js";

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
  }),
});

const ORIGIN = "http://127.0.0.1:3100";

interface SourceOptions {
  readonly nodeEnv?: string;
  readonly basePath?: string;
  readonly authHandler?: (req: Request) => Promise<Response>;
}

const makeSource = (
  options: SourceOptions = {},
): { pos: PosApiSource; authCalls: Request[]; errors: ReturnType<typeof vi.fn> } => {
  const authCalls: Request[] = [];
  const errors = vi.fn();
  const pos: PosApiSource = {
    env: {
      BETTER_AUTH_URL: ORIGIN,
      API_MAX_BODY_BYTES: 1024,
      POS_API_BASE_PATH: options.basePath ?? "/api/pos",
      NODE_ENV: options.nodeEnv ?? "development",
    },
    auth: {
      handler:
        options.authHandler
        ?? (async (req) => {
          authCalls.push(req);
          return Promise.resolve(Response.json({ auth: true }));
        }),
    },
    logger: { ...noopLogger, error: errors },
    trpc: {
      deps: { trustedOrigins: [ORIGIN] },
      createContext: async () =>
        Promise.resolve({ requestId: "test-request" } as unknown as PosTrpcContext),
    },
  };
  return { pos, authCalls, errors };
};

const get = (path: string): Request => new Request(`${ORIGIN}${path}`);

describe("createPosApi", () => {
  it("serves the surface index on GET {base} and 405s other methods", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router);
    const res = await api.GET(get("/api/pos"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "@nukesai-pos api",
      surfaces: {
        auth: "/api/pos/auth",
        trpc: "/api/pos/trpc",
        rest: "/api/pos/rest",
        openApiJson: "/api/pos/openapi.json",
        docs: "/api/pos/docs",
      },
    });
    const put = await api.PUT(new Request(`${ORIGIN}/api/pos/`, { method: "PUT" }));
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET");
  });

  it("routes every method's auth traffic to the better-auth handler untouched", async () => {
    const { pos, authCalls } = makeSource();
    const api = createPosApi(pos, router);
    expect((await api.GET(get("/api/pos/auth/session"))).status).toBe(200);
    const post = new Request(`${ORIGIN}/api/pos/auth/sign-in/email`, { method: "POST" });
    expect((await api.POST(post)).status).toBe(200);
    expect(authCalls).toHaveLength(2);
    expect(
      (await api.DELETE(new Request(`${ORIGIN}/api/pos/auth/x`, { method: "DELETE" }))).status,
    ).toBe(200);
    expect(authCalls).toHaveLength(3);
  });

  it("serves tRPC under {base}/trpc and 405s non-GET/POST", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router);
    const res = await api.GET(get("/api/pos/trpc/health.check?input=%7B%22json%22%3A%7B%7D%7D"));
    expect(res.status).toBe(200);
    // No transformer on this test router — data sits directly under result.data.
    const body = (await res.json()) as { result: { data: HealthResult } };
    expect(body.result.data.ok).toBe(true);
    expect(
      (await api.PATCH(new Request(`${ORIGIN}/api/pos/trpc/x`, { method: "PATCH" }))).status,
    ).toBe(405);
  });

  it("serves the REST projection and the OpenAPI document with derived URLs", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router);
    const rest = await api.GET(get("/api/pos/rest/health?echo=hi"));
    expect(rest.status).toBe(200);
    expect(((await rest.json()) as HealthResult).echo).toBe("hi");

    const doc = await api.GET(get("/api/pos/openapi.json"));
    expect(doc.status).toBe(200);
    const openapi = (await doc.json()) as { servers: { url: string }[] };
    expect(openapi.servers[0]?.url).toBe(`${ORIGIN}/api/pos/rest`);
    expect(
      (await api.POST(new Request(`${ORIGIN}/api/pos/openapi.json`, { method: "POST" }))).status,
    ).toBe(405);
  });

  it("serves the Scalar docs UI pointed at the mounted document", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router, { docs: { title: "Nukes AI POS API" } });
    const res = await api.GET(get("/api/pos/docs"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/api/pos/openapi.json");
    expect((await api.POST(new Request(`${ORIGIN}/api/pos/docs`, { method: "POST" }))).status).toBe(
      405,
    );
  });

  it("404s unknown subpaths and requests outside the mount", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router);
    expect((await api.GET(get("/api/pos/nope"))).status).toBe(404);
    expect((await api.GET(get("/api/other"))).status).toBe(404);
    // Prefix boundary: /api/possible must NOT match /api/pos.
    expect((await api.GET(get("/api/possible"))).status).toBe(404);
  });

  it("honors surface flags: rest off disappears, docs keeps the json surface alive", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router, {
      surfaces: { rest: false, openApiJson: false, docs: true },
    });
    expect((await api.GET(get("/api/pos/rest/health?echo=x"))).status).toBe(404);
    expect((await api.GET(get("/api/pos/openapi.json"))).status).toBe(200); // forced by docs
    const index = (await (await api.GET(get("/api/pos"))).json()) as {
      surfaces: Record<string, string>;
    };
    expect(index.surfaces).not.toHaveProperty("rest");
  });

  it("keeps openApiJson opt-out honest when docs are also off, and hides them from the index", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router, {
      surfaces: { rest: false, openApiJson: false, docs: false },
    });
    expect((await api.GET(get("/api/pos/openapi.json"))).status).toBe(404);
    expect((await api.GET(get("/api/pos/docs"))).status).toBe(404);
    const index = (await (await api.GET(get("/api/pos"))).json()) as {
      surfaces: Record<string, string>;
    };
    expect(Object.keys(index.surfaces).sort()).toEqual(["auth", "trpc"]);
  });

  it("keeps the json document on when only openApiJson is disabled (docs default on)", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router, { surfaces: { openApiJson: false } });
    expect((await api.GET(get("/api/pos/openapi.json"))).status).toBe(200);
  });

  it("forwards a custom Scalar cdn to the docs handler", async () => {
    const { pos } = makeSource();
    const api = createPosApi(pos, router, {
      docs: { cdn: "https://cdn.example/scalar.js" },
    });
    const html = await (await api.GET(get("/api/pos/docs"))).text();
    expect(html).toContain("https://cdn.example/scalar.js");
  });

  it("everything follows a custom POS_API_BASE_PATH", async () => {
    const { pos, authCalls } = makeSource({ basePath: "/internal/pos" });
    const api = createPosApi(pos, router);
    expect((await api.GET(get("/internal/pos/auth/session"))).status).toBe(200);
    expect(authCalls).toHaveLength(1);
    expect((await api.GET(get("/api/pos/trpc/health.check"))).status).toBe(404);
    const doc = (await (await api.GET(get("/internal/pos/openapi.json"))).json()) as {
      servers: { url: string }[];
    };
    expect(doc.servers[0]?.url).toBe(`${ORIGIN}/internal/pos/rest`);
  });

  it("logs handler errors through the pos logger by default and honors onError overrides", async () => {
    const { pos, errors } = makeSource();
    const api = createPosApi(pos, router);
    const res = await api.GET(get("/api/pos/trpc/health.boom?input=%7B%22json%22%3A%7B%7D%7D"));
    expect(res.status).toBe(500);
    expect(errors).toHaveBeenCalledWith(
      "posApi.error",
      expect.objectContaining({ path: "health.boom" }),
    );

    const onError = vi.fn();
    const custom = createPosApi(pos, router, { onError });
    await custom.GET(get("/api/pos/trpc/health.boom?input=%7B%22json%22%3A%7B%7D%7D"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ path: "health.boom" }));
  });

  it("applies the shared origin/body guard to trpc and rest but not to auth", async () => {
    const { pos, authCalls } = makeSource();
    const api = createPosApi(pos, router);
    const evil = { method: "POST", headers: { origin: "https://evil.example" } };
    expect((await api.POST(new Request(`${ORIGIN}/api/pos/trpc/x`, evil))).status).toBe(403);
    expect((await api.POST(new Request(`${ORIGIN}/api/pos/rest/x`, evil))).status).toBe(403);
    // better-auth does its own origin checking — the mount must not preempt it.
    expect((await api.POST(new Request(`${ORIGIN}/api/pos/auth/x`, evil))).status).toBe(200);
    expect(authCalls).toHaveLength(1);
    expect((await api.PUT(new Request(`${ORIGIN}/api/pos/auth/x`, { method: "PUT" }))).status).toBe(
      200,
    );
  });

  it("keeps the docs + openapi surfaces OFF in production unless asked", async () => {
    // The Scalar page is unauthenticated and loads its renderer from a CDN into
    // the app's own origin — publishing it must be a decision, not a default.
    const { pos } = makeSource({ nodeEnv: "production" });
    const api = createPosApi(pos, router);
    expect((await api.GET(get("/api/pos/docs"))).status).toBe(404);
    expect((await api.GET(get("/api/pos/openapi.json"))).status).toBe(404);
    const index = (await (await api.GET(get("/api/pos"))).json()) as {
      surfaces: Record<string, string>;
    };
    expect(index.surfaces).not.toHaveProperty("docs");
    expect(index.surfaces).not.toHaveProperty("openApiJson");

    // ...and an explicit opt-in still publishes them in production.
    const opted = createPosApi(pos, router, { surfaces: { docs: true } });
    expect((await opted.GET(get("/api/pos/docs"))).status).toBe(200);
    expect((await opted.GET(get("/api/pos/openapi.json"))).status).toBe(200);
  });

  it("caps the body on the pre-session auth surface", async () => {
    // better-auth enforces origins but no size limit, and /auth/* is reachable
    // without a session — an unbounded sign-up body would be buffered and parsed.
    const { pos, authCalls } = makeSource();
    const api = createPosApi(pos, router);
    const big = new Request(`${ORIGIN}/api/pos/auth/sign-up/email`, {
      method: "POST",
      body: "x".repeat(2048),
      headers: { origin: ORIGIN, "content-length": "2048" },
    });
    expect((await api.POST(big)).status).toBe(413);
    expect(authCalls).toHaveLength(0); // never reaches better-auth
  });
});
