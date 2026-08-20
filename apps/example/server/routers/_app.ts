// Router composition — the ONLY consumer-owned tRPC file (R1: built routers
// cannot ship from the package; assembling them HERE is what gives the app
// its precise AppRouter type and its extension point for custom procedures).
// `nukes-pos add <feature>` manages the marked blocks; everything outside
// them is yours.
import { posTrpc } from "@nukesai-pos/backend/trpc";

import { healthRouter } from "./health";
// <nukes-pos:router-imports>
import { ordersRouter } from "./orders";
// </nukes-pos:router-imports>

export const appRouter = posTrpc.router({
  health: healthRouter,
  // <nukes-pos:routers>
  orders: ordersRouter,
  // </nukes-pos:routers>
});

export type AppRouter = typeof appRouter;
