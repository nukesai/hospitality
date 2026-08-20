import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

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

export type PosProxy = (request: NextRequest) => Response | Promise<Response>;

export function createPosProxy(routing: PosRouting = definePosRouting()): PosProxy {
  // PosRouting is structurally a RoutingConfig without domains/pathnames; the
  // cast keeps next-intl's five-generic type out of our public dts (R1-style).
  return createIntlMiddleware(routing as Parameters<typeof createIntlMiddleware>[0]);
}
