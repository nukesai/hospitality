// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer wiring needed.
import { createPosApi } from "@nukesai-pos/backend/next";

import { getPos } from "../../../../lib/pos.server";
import { appRouter } from "../../../../server/routers/_app";

const pos = await getPos();

export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, appRouter, {
  docs: { title: "Nukes AI POS API" },
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
