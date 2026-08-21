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
  guardBodySize,
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
    readonly NODE_ENV: string;
  };
  readonly auth: { readonly handler: (req: Request) => Promise<Response> };
  readonly logger: LoggerPort;
  readonly trpc: {
    readonly deps: { readonly trustedOrigins: readonly string[] };
    readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  };
}

/**
 * What `createPosApi` accepts: a booted instance, or — preferably — the FACTORY
 * that boots one. The factory form is what keeps `next build` from needing
 * runtime secrets, because nothing boots until the first request.
 */
export type PosApiSourceInput = PosApiSource | (() => Promise<PosApiSource>);

/**
 * Optional surfaces — flip off what a deployment does not expose. Auth and tRPC
 * are always on. `docs` and `openApiJson` default to DEVELOPMENT ONLY: the
 * Scalar page is unauthenticated and loads its renderer from a third-party CDN
 * into the app's own origin, so it must be an explicit decision to publish it
 * (pass `surfaces: { docs: true }`, ideally with a pinned `docs.cdn`).
 */
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
  source: PosApiSourceInput,
  router: AnyTRPCRouter & OpenApiRouter,
  options: CreatePosApiOptions = {},
): PosApiRouteHandlers {
  // LAZY on purpose. `next build` evaluates route modules to collect their
  // config, so anything booted at module scope must succeed with only the
  // BUILD environment — and a POS boot needs DATABASE_URL, auth secrets and a
  // reachable database. Passing `getPos` (the function) keeps the build free of
  // runtime secrets; the boot happens on the first request and is memoized.
  let ready: Promise<Dispatcher> | undefined;
  // NOT async on purpose: every caller must share the SAME memoized promise, so
  // concurrent first requests boot once rather than racing (async would wrap it
  // in a fresh promise per call).
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const dispatcher = (): Promise<Dispatcher> => {
    ready ??= (async () => build(await resolve(source), router, options))();
    return ready;
  };

  const route =
    (method: keyof PosApiRouteHandlers): PosRouteHandler =>
    async (req) =>
      (await dispatcher())(method, req);

  return {
    GET: route("GET"),
    POST: route("POST"),
    PUT: route("PUT"),
    PATCH: route("PATCH"),
    DELETE: route("DELETE"),
  };
}

type Dispatcher = (method: keyof PosApiRouteHandlers, req: Request) => Promise<Response>;

const resolve = async (source: PosApiSourceInput): Promise<PosApiSource> =>
  typeof source === "function" ? source() : Promise.resolve(source);

function build(
  pos: PosApiSource,
  router: AnyTRPCRouter & OpenApiRouter,
  options: CreatePosApiOptions,
): Dispatcher {
  const paths = posApiPaths(pos.env.POS_API_BASE_PATH);
  const publicByDefault = pos.env.NODE_ENV !== "production";
  const docs_ = options.surfaces?.docs ?? publicByDefault;
  const surfaces: Required<PosApiSurfaces> = {
    rest: options.surfaces?.rest ?? true,
    // Scalar cannot render without the document — docs forces the json surface on.
    openApiJson: (options.surfaces?.openApiJson ?? publicByDefault) || docs_,
    docs: docs_,
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

  return async (method, req) => {
    {
      const { pathname } = new URL(req.url);
      if (pathname !== paths.basePath && !pathname.startsWith(`${paths.basePath}/`)) {
        return NOT_FOUND(paths); // catch-all mounted somewhere else than POS_API_BASE_PATH
      }
      const sub = pathname.slice(paths.basePath.length);

      if (sub === "" || sub === "/") {
        return method === "GET" ? index() : METHOD_NOT_ALLOWED("GET");
      }
      if (sub === "/auth" || sub.startsWith("/auth/")) {
        // better-auth enforces its own trusted origins but no body cap, and
        // this is the only pre-session surface — apply the size guard here.
        const tooBig = guardBodySize(req, cfg);
        if (tooBig !== null) return tooBig;
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
    }
  };
}
