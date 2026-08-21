// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer API wiring needed.
// posCoreRouter ships every feature router pre-composed; new features arrive
// with the package version, zero edits here. (App-local procedures? See
// `nukes-pos add` — it scaffolds server/routers/_app.ts and you point the
// import below at it.)
import { getPos } from "@nukesai-pos/backend/bootstrap";
import { createPosApi } from "@nukesai-pos/backend/next";
import { posCoreRouter } from "@nukesai-pos/backend/trpc";

// `getPos` is passed as a FUNCTION, not awaited here: `next build` evaluates
// this module to collect the route's config, and booting at module scope would
// make every build require DATABASE_URL, the auth secrets and a reachable
// database. The boot happens on the first request instead, and is memoized.
export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(getPos, posCoreRouter, {
  // The Scalar page and the OpenAPI document default to DEVELOPMENT ONLY —
  // they are unauthenticated and Scalar pulls its renderer from a CDN into this
  // origin. This fixture publishes them deliberately; a real deployment should
  // decide, and pin `docs.cdn` if it says yes.
  surfaces: { docs: true },
  docs: { title: "Nukes AI POS API" },
});

// No `dynamic`/`runtime` segment exports: route handlers are dynamic on the
// Node runtime by default, and `dynamic` is REMOVED under cacheComponents.
