import { posApiPaths, type PosApiPaths } from "@nukesai-pos/common/constants";
import type { LoggerPort } from "@nukesai-pos/common";
import type { AnyTRPCRouter } from "@trpc/server";
import type { OpenApiRouter } from "trpc-to-openapi";

import type { PosTrpcContext } from "../trpc/init.js";
import {
  createDocsHandler,
  createOpenApiHandlers,
  createOpenApiJsonHandler,
  createTrpcHandlers,
  type ApiHandlerConfig,
  type PosRouteHandler,
} from "./handlers.js";

/**
 * The slice of `NukesPos` the API route needs — structural on purpose so unit
 * tests (and alternative bootstraps) can satisfy it without a database.
 * `createNukesPos()`'s return value is assignable as-is.
 */
export interface PosApiSource {
  readonly env: {
    readonly BETTER_AUTH_URL: string;
    readonly API_MAX_BODY_BYTES: number;
    readonly POS_API_BASE_PATH: string;
  };
  readonly auth: { readonly handler: (req: Request) => Promise<Response> };
  readonly logger: LoggerPort;
  readonly trpc: {
    readonly deps: { readonly trustedOrigins: readonly string[] };
    readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  };
}

/** Optional surfaces — flip off what a deployment does not expose. Auth and tRPC are always on. */
export interface PosApiSurfaces {
  readonly rest?: boolean;
  readonly openApiJson?: boolean;
  readonly docs?: boolean;
}

export interface CreatePosApiOptions {
  readonly surfaces?: PosApiSurfaces;
  readonly docs?: { readonly title?: string; readonly cdn?: string };
  /** Replaces the default logger-backed error sink for trpc/rest/docs. */
  readonly onError?: ApiHandlerConfig["onError"];
}

export interface PosApiRouteHandlers {
  readonly GET: PosRouteHandler;
  readonly POST: PosRouteHandler;
  readonly PUT: PosRouteHandler;
  readonly PATCH: PosRouteHandler;
  readonly DELETE: PosRouteHandler;
}

const METHOD_NOT_ALLOWED = (allow: string): Response =>
  new Response("Method Not Allowed", { status: 405, headers: { allow } });

const NOT_FOUND = (paths: PosApiPaths): Response =>
  Response.json(
    { error: "not_found", mount: paths.basePath },
    { status: 404, headers: { "x-pos-api": "nukes" } },
  );

/**
 * ONE route file serves the whole POS API. The consumer scaffolds
 * `app/api/pos/[[...pos]]/route.ts` (path = POS_API_BASE_PATH) with:
 *
 *   export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, appRouter);
 *
 * and every surface mounts under it, derived from the SAME `posApiPaths()`
 * contract the clients use:
 *
 *   {base}/auth/*        better-auth (basePath is wired by createNukesPos)
 *   {base}/trpc/*        tRPC fetch adapter
 *   {base}/rest/*        REST projection (trpc-to-openapi)
 *   {base}/openapi.json  OpenAPI 3.1 document
 *   {base}/docs          Scalar reference UI
 *   {base}               surface index (GET)
 *
 * No option here changes a path: the mount comes from env (POS_API_BASE_PATH)
 * so server and clients can never disagree.
 */
export function createPosApi(
  pos: PosApiSource,
  router: AnyTRPCRouter & OpenApiRouter,
  options: CreatePosApiOptions = {},
): PosApiRouteHandlers {
  const paths = posApiPaths(pos.env.POS_API_BASE_PATH);
  const surfaces: Required<PosApiSurfaces> = {
    rest: options.surfaces?.rest ?? true,
    // Scalar cannot render without the document — docs forces the json surface on.
    openApiJson: (options.surfaces?.openApiJson ?? true) || (options.surfaces?.docs ?? true),
    docs: options.surfaces?.docs ?? true,
  };

  const onError =
    options.onError
    ?? ((info: { path: string | undefined; code: string; message: string }) => {
      pos.logger.error("posApi.error", info);
    });

  const cfg: ApiHandlerConfig = {
    createContext: pos.trpc.createContext,
    trustedOrigins: pos.trpc.deps.trustedOrigins,
    maxBodyBytes: pos.env.API_MAX_BODY_BYTES,
    onError,
    // Resolved against the deployment origin — BETTER_AUTH_URL is already the
    // canonical public URL better-auth trusts, so OpenAPI servers match it.
    restBaseUrl: new URL(paths.rest, pos.env.BETTER_AUTH_URL).toString(),
    trpcEndpoint: paths.trpc,
    restEndpoint: paths.rest,
    docs: {
      ...(options.docs?.title !== undefined ? { title: options.docs.title } : {}),
      ...(options.docs?.cdn !== undefined ? { cdn: options.docs.cdn } : {}),
      openApiJsonUrl: paths.openApiJson,
    },
  };

  const trpc = createTrpcHandlers(router, cfg);
  const rest = createOpenApiHandlers(router, cfg);
  const openApiJson = createOpenApiJsonHandler(router, cfg);
  const docs = createDocsHandler(cfg);

  const index = (): Response =>
    Response.json({
      name: "@nukesai-pos api",
      surfaces: {
        auth: paths.auth,
        trpc: paths.trpc,
        ...(surfaces.rest ? { rest: paths.rest } : {}),
        ...(surfaces.openApiJson ? { openApiJson: paths.openApiJson } : {}),
        ...(surfaces.docs ? { docs: paths.docs } : {}),
      },
    });

  const dispatch = (method: keyof PosApiRouteHandlers): PosRouteHandler => {
    return async (req) => {
      const { pathname } = new URL(req.url);
      if (pathname !== paths.basePath && !pathname.startsWith(`${paths.basePath}/`)) {
        return NOT_FOUND(paths); // catch-all mounted somewhere else than POS_API_BASE_PATH
      }
      const sub = pathname.slice(paths.basePath.length);

      if (sub === "" || sub === "/") {
        return method === "GET" ? index() : METHOD_NOT_ALLOWED("GET");
      }
      if (sub === "/auth" || sub.startsWith("/auth/")) {
        // Every method passes through — better-auth's own Next wrapper maps
        // GET/POST/PUT/PATCH/DELETE to auth.handler (verified in 1.7.1 dist).
        return pos.auth.handler(req);
      }
      if (sub === "/trpc" || sub.startsWith("/trpc/")) {
        return method === "GET" || method === "POST"
          ? trpc.GET(req)
          : METHOD_NOT_ALLOWED("GET, POST");
      }
      if (surfaces.rest && (sub === "/rest" || sub.startsWith("/rest/"))) {
        return rest[method](req);
      }
      if (surfaces.openApiJson && sub === "/openapi.json") {
        return method === "GET" ? openApiJson(req) : METHOD_NOT_ALLOWED("GET");
      }
      if (surfaces.docs && sub === "/docs") {
        return method === "GET" ? docs() : METHOD_NOT_ALLOWED("GET");
      }
      return NOT_FOUND(paths);
    };
  };

  return {
    GET: dispatch("GET"),
    POST: dispatch("POST"),
    PUT: dispatch("PUT"),
    PATCH: dispatch("PATCH"),
    DELETE: dispatch("DELETE"),
  };
}
