// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer API wiring needed.
import { getPos } from "@nukesai-pos/backend/bootstrap";
import { createPosApi } from "@nukesai-pos/backend/next";

import { appRouter } from "../../../../server/routers/_app";

const pos = await getPos();

export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, appRouter, {
  docs: { title: "Nukes AI POS API" },
});

// No `dynamic`/`runtime` segment exports: route handlers are dynamic on the
// Node runtime by default, and `dynamic` is REMOVED under cacheComponents.
