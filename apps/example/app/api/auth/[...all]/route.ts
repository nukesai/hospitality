import { createAuthRouteHandlers } from "@nukesai-pos/backend/next";

import { getPos } from "../../../../lib/pos.server";

const pos = await getPos();

export const { GET, POST } = createAuthRouteHandlers(pos.auth);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
