import { createTrpcHandlers } from "@nukesai-pos/backend/next";

import { getPos } from "../../../../lib/pos.server";
import { appRouter } from "../../../../server/routers/_app";

const pos = await getPos();

export const { GET, POST } = createTrpcHandlers(appRouter, {
  createContext: pos.trpc.createContext,
  trustedOrigins: pos.trpc.deps.trustedOrigins,
  maxBodyBytes: pos.env.API_MAX_BODY_BYTES,
  restBaseUrl: `${pos.env.BETTER_AUTH_URL}/api/rest`,
  onError: (e) => {
    pos.logger.error("trpc.error", e);
  },
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
