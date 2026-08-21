import { ApiReference } from "@scalar/nextjs-api-reference";
import type { AnyTRPCRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import {
  createOpenApiFetchHandler,
  generateOpenApiDocument,
  type OpenApiRouter,
} from "trpc-to-openapi";

import type { PosTrpcContext } from "../trpc/init.js";

export interface ApiHandlerConfig {
  readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  readonly trustedOrigins: readonly string[];
  readonly maxBodyBytes: number; // createOpenApiFetchHandler has NO maxBodySize (verified)
  readonly onError: (info: { path: string | undefined; code: string; message: string }) => void;
  readonly restBaseUrl: string;
  /** Mount path of the tRPC handler; default keeps the classic split-route layout. */
  readonly trpcEndpoint?: `/${string}` | undefined;
  /** Mount path of the REST (trpc-to-openapi) handler. */
  readonly restEndpoint?: `/${string}` | undefined;
  readonly docs?:
    | {
        readonly cdn?: string;
        readonly title?: string;
        /** URL the Scalar UI fetches the OpenAPI document from. */
        readonly openApiJsonUrl?: string;
      }
    | undefined;
}

export type PosRouteHandler = (req: Request) => Promise<Response>;
type Handler = PosRouteHandler;

/**
 * Body-size half of the guard, exported because better-auth handles its own
 * origin checks but imposes NO size limit — and `/auth/*` is the only surface
 * reachable before a session exists, so it is the one that most needs a cap.
 */
export function guardBodySize(req: Request, cfg: ApiHandlerConfig): Response | null {
  if (req.method === "GET" || req.method === "HEAD" || req.body === null) return null;
  // A missing/invalid Content-Length (chunked transfer) would bypass a
  // header-based cap entirely — require a declared, parseable length.
  const rawLength = req.headers.get("content-length");
  if (rawLength === null || !/^\d+$/.test(rawLength)) {
    return new Response("Length Required", { status: 411 });
  }
  if (Number(rawLength) > cfg.maxBodyBytes) {
    return new Response("Payload too large", { status: 413 });
  }
  return null;
}

function guard(req: Request, cfg: ApiHandlerConfig): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin !== null && !cfg.trustedOrigins.includes(origin)) {
      return new Response("Forbidden origin", { status: 403 });
    }
  }
  return guardBodySize(req, cfg);
}

export function createTrpcHandlers(
  router: AnyTRPCRouter,
  cfg: ApiHandlerConfig,
): { GET: Handler; POST: Handler } {
  const handler: Handler = async (req) => {
    const rejected = guard(req, cfg);
    if (rejected !== null) return rejected;
    return fetchRequestHandler({
      endpoint: cfg.trpcEndpoint ?? "/api/trpc",
      req,
      router,
      createContext: async () => cfg.createContext(req),
      onError: ({ error, path }) => {
        cfg.onError({ path, code: error.code, message: error.message });
      },
    });
  };
  return { GET: handler, POST: handler };
}

export function createOpenApiHandlers(
  router: OpenApiRouter,
  cfg: ApiHandlerConfig,
): Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler> {
  const handler: Handler = async (req) => {
    const rejected = guard(req, cfg);
    if (rejected !== null) return rejected;
    return createOpenApiFetchHandler({
      endpoint: cfg.restEndpoint ?? "/api/rest",
      req,
      router,
      createContext: async ({ req: innerReq }: { req: Request }) => cfg.createContext(innerReq),
      onError: ({ error, path }) => {
        cfg.onError({ path, code: error.code, message: error.message });
      },
    });
  };
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

export function createOpenApiJsonHandler(router: OpenApiRouter, cfg: ApiHandlerConfig): Handler {
  let doc: ReturnType<typeof generateOpenApiDocument> | null = null;
  return async () => {
    await Promise.resolve();
    doc ??= generateOpenApiDocument(router, {
      title: cfg.docs?.title ?? "Nukes AI POS API",
      version: "1.0.0",
      baseUrl: cfg.restBaseUrl,
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    });
    return Response.json(doc, {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=86400" },
    });
  };
}

export function createDocsHandler(cfg: ApiHandlerConfig): () => Response | Promise<Response> {
  return ApiReference({
    url: cfg.docs?.openApiJsonUrl ?? "/api/openapi.json",
    ...(cfg.docs?.cdn !== undefined ? { cdn: cfg.docs.cdn } : {}),
  });
}
