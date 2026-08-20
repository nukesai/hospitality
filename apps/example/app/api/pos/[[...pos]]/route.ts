// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer API wiring needed.
// posCoreRouter ships every feature router pre-composed; new features arrive
// with the package version, zero edits here. (App-local procedures? See
// `nukes-pos add` — it scaffolds server/routers/_app.ts and you point the
// import below at it.)
import { getPos } from "@nukesai-pos/backend/bootstrap";
import { createPosApi } from "@nukesai-pos/backend/next";
import { posCoreRouter } from "@nukesai-pos/backend/trpc";

const pos = await getPos();

export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, posCoreRouter, {
  docs: { title: "Nukes AI POS API" },
});

// No `dynamic`/`runtime` segment exports: route handlers are dynamic on the
// Node runtime by default, and `dynamic` is REMOVED under cacheComponents.
