import { toNextJsHandler } from "better-auth/next-js";

import type { PosAuth } from "../auth/index.js";

export interface AuthRouteHandlers {
  readonly GET: (request: Request) => Promise<Response>;
  readonly POST: (request: Request) => Promise<Response>;
}

/**
 * Consumer route file (app/api/auth/[...all]/route.ts):
 *   export const { GET, POST } = createAuthRouteHandlers(pos.auth);
 * RSC session read: auth.api.getSession({ headers: await headers() });
 * session.session.activeOrganizationId is the active BRANCH id.
 */
export function createAuthRouteHandlers(auth: PosAuth): AuthRouteHandlers {
  return toNextJsHandler(auth.handler);
}
