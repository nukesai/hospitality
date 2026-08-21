import { DEFAULT_POS_API_BASE_PATH } from "@nukesai-pos/common/constants";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { definePosRouting, type PosRouting } from "../i18n/routing.js";

/**
 * Locale-negotiating proxy for apps on the WITH-routing mode. Consumer file:
 *
 *   // proxy.ts (Next 16 renamed middleware.ts; Node runtime)
 *   import { createPosProxy } from "@nukesai-pos/frontend/proxy";
 *   import { routing } from "./i18n/routing";
 *   export default createPosProxy(routing);
 *   export const config = { matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)" };
 *
 * The matcher MUST stay a literal in the consumer file — Next statically
 * analyzes it and ignores anything imported. POS_PROXY_MATCHER exists so
 * templates and docs share one source string. Apps WITHOUT locale URLs need
 * no proxy at all. NO server-only pill: the proxy graph runs without the
 * react-server condition.
 */
export const POS_PROXY_MATCHER = "/((?!api|trpc|_next|_vercel|.*\\..*).*)";

export interface PosProxyOptions {
  /**
   * Where the POS API is mounted (`POS_API_BASE_PATH`, default `/api/pos`).
   * Requests under it are passed straight through: the default matcher only
   * excludes `/api`, so a base path mounted anywhere else would otherwise be
   * locale-redirected and the API would 404 for every client.
   */
  readonly apiBasePath?: string;
}

export type PosProxy = (request: NextRequest) => Response | Promise<Response>;

export function createPosProxy(
  routing: PosRouting = definePosRouting(),
  options: PosProxyOptions = {},
): PosProxy {
  // PosRouting is structurally a RoutingConfig without domains/pathnames; the
  // cast keeps next-intl's five-generic type out of our public dts (R1-style).
  const intl = createIntlMiddleware(routing as Parameters<typeof createIntlMiddleware>[0]);
  const apiBasePath = options.apiBasePath ?? DEFAULT_POS_API_BASE_PATH;

  return (request: NextRequest) => {
    const { pathname } = request.nextUrl;
    if (pathname === apiBasePath || pathname.startsWith(`${apiBasePath}/`)) {
      return NextResponse.next();
    }
    return intl(request);
  };
}
