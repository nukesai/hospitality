import { createDocsHandler } from "@nukesai-pos/backend/next";

import { getPos } from "../../../lib/pos.server";

const pos = await getPos();

export const GET = createDocsHandler({
  createContext: pos.trpc.createContext,
  trustedOrigins: pos.trpc.deps.trustedOrigins,
  maxBodyBytes: pos.env.API_MAX_BODY_BYTES,
  restBaseUrl: `${pos.env.BETTER_AUTH_URL}/api/rest`,
  onError: (e) => {
    pos.logger.error("docs.error", e);
  },
  docs: { title: "Nukes AI POS API" },
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
