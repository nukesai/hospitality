// Next 16 proxy (the middleware.ts successor): locale negotiation + redirects.
// The matcher MUST stay a literal here — Next statically analyzes it.
import { createPosProxy } from "@nukesai-pos/frontend/proxy";

import { routing } from "./i18n/routing";

export default createPosProxy(routing);

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
