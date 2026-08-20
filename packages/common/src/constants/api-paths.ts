/**
 * The ONE place the POS API mount layout is defined. Server (route dispatch,
 * OpenAPI baseUrl, auth basePath) and client (tRPC link URL, auth client
 * baseURL) both derive from these — change the base path in env
 * (POS_API_BASE_PATH) and every surface follows. Isomorphic: pure strings.
 */
export const DEFAULT_POS_API_BASE_PATH = "/api/pos";

/** Absolute URL path — the leading slash is part of the type. */
export type AbsolutePath = `/${string}`;

export interface PosApiPaths {
  /** Mount root, e.g. `/api/pos`. Never ends with `/`. */
  readonly basePath: AbsolutePath;
  /** better-auth handler mount (its `basePath` option). */
  readonly auth: AbsolutePath;
  /** tRPC fetch adapter endpoint. */
  readonly trpc: AbsolutePath;
  /** REST (trpc-to-openapi) endpoint — the OpenAPI document's server URL path. */
  readonly rest: AbsolutePath;
  /** OpenAPI 3.1 JSON document. */
  readonly openApiJson: AbsolutePath;
  /** Scalar API reference UI. */
  readonly docs: AbsolutePath;
}

/**
 * Normalizes and fans a base path out into every mounted surface.
 * Accepts `/api/pos` or `/api/pos/` (trailing slash dropped); the base path
 * must be absolute (start with `/`) and not be the bare root.
 */
export const posApiPaths = (basePath: string = DEFAULT_POS_API_BASE_PATH): PosApiPaths => {
  const raw = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (!raw.startsWith("/") || raw === "") {
    throw new Error(`POS API base path must start with "/" and not be "/": got "${basePath}"`);
  }
  const trimmed = raw as AbsolutePath; // runtime-validated one line above
  return {
    basePath: trimmed,
    auth: `${trimmed}/auth`,
    trpc: `${trimmed}/trpc`,
    rest: `${trimmed}/rest`,
    openApiJson: `${trimmed}/openapi.json`,
    docs: `${trimmed}/docs`,
  };
};
