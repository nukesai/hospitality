// Consumer-owned routing definition (one line) — proxy.ts, i18n/request.ts and
// global.d.ts all derive from this single object.
import { definePosRouting } from "@nukesai-pos/frontend/i18n";

export const routing = definePosRouting();
