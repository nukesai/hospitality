/**
 * Consumer file bodies. GENERATED-FROM-FIXTURE contract: every body below must
 * stay byte-identical to its counterpart in apps/example — templates.test.ts
 * enforces it, so the example app IS the CLI's output (zero drift by
 * construction). Regenerate with `node scripts/sync-cli-templates.mjs` after
 * editing the example.
 */

export const routersApp = `// Router composition — the ONLY consumer-owned tRPC file (R1: built routers
// cannot ship from the package; assembling them HERE is what gives the app
// its precise AppRouter type and its extension point for custom procedures).
// \`nukes-pos add <feature>\` manages the marked blocks; everything outside
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
`;

export const routersHealth = `import {
  healthCheck,
  healthInput,
  healthOutput,
  posTrpc,
  publicProcedure,
} from "@nukesai-pos/backend/trpc";

export const healthRouter = posTrpc.router({
  check: publicProcedure
    .meta({ openapi: { method: "GET", path: "/health", tags: ["system"] } })
    .input(healthInput)
    .output(healthOutput) // .output() REQUIRED for OpenAPI procedures
    .query(({ input }) => healthCheck(input)),
});
`;

export const routersOrders = `import {
  branchProcedure,
  createOrder,
  createOrderInput,
  listOrders,
  listOrdersInput,
  orderDtoOutput,
  orderPageOutput,
  posTrpc,
  updateOrderStatus,
  updateOrderStatusInput,
} from "@nukesai-pos/backend/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const ordersRouter = posTrpc.router({
  list: branchProcedure({ resource: "orders", action: "read" })
    .input(listOrdersInput)
    .output(orderPageOutput)
    .query(async ({ ctx, input }) =>
      listOrders({ db: ctx.deps.db, cache: ctx.deps.cache }, ctx.rls, input),
    ),
  create: branchProcedure({ resource: "orders", action: "create" })
    .meta({ cacheInvalidates: ["orders"] })
    .input(createOrderInput)
    .output(orderDtoOutput)
    .mutation(async ({ ctx, input }) =>
      createOrder({ db: ctx.deps.db, cache: ctx.deps.cache }, ctx.rls, input),
    ),
  updateStatus: branchProcedure({ resource: "orders", action: "update" })
    .meta({ cacheInvalidates: ["orders"] })
    .input(updateOrderStatusInput)
    .output(orderDtoOutput)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateOrderStatus(
        { db: ctx.deps.db, cache: ctx.deps.cache },
        ctx.rls,
        input,
      );
      if (updated === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "errors.resourceNotFound" });
      }
      return updated;
    }),
  // Deliberately-undeclared mutation proving enforceCacheMeta fires (the
  // invalidation-discipline canary). NEVER shipped to production.
  ...(process.env.NODE_ENV !== "production"
    ? {
        _cacheCanary: branchProcedure()
          .input(z.object({}))
          .mutation(() => ({ ok: true }) as const),
      }
    : {}),
});
`;

export const apiRoute = `// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer API wiring needed.
import { getPos } from "@nukesai-pos/backend/bootstrap";
import { createPosApi } from "@nukesai-pos/backend/next";

import { appRouter } from "../../../../server/routers/_app";

const pos = await getPos();

export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, appRouter, {
  docs: { title: "Nukes AI POS API" },
});

// No \`dynamic\`/\`runtime\` segment exports: route handlers are dynamic on the
// Node runtime by default, and \`dynamic\` is REMOVED under cacheComponents.
`;

export const localeLayout = `import { hasLocale } from "next-intl";
import { PosIntl } from "@nukesai-pos/frontend/server";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { routing } from "../../i18n/routing";

export const metadata = {
  title: "Nukes POS Example",
  description: "Consumer fixture for the @nukesai-pos packages.",
};

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Root layout lives under [locale] (next-intl routed mode). PosIntl inherits
 * locale+messages from the request config server-side and re-declares the POS
 * fallback behavior on the client — one tag, zero props.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        <PosIntl>{children}</PosIntl>
      </body>
    </html>
  );
}
`;

export const adminPage = `// THE admin route: one file, the frontend package handles everything inside.
import { PosAdminShell } from "@nukesai-pos/frontend/server";
import type { ReactElement } from "react";

import { routing } from "../../../../../i18n/routing";

export default async function AdminPage({
  params,
}: {
  readonly params: Promise<{ readonly locale: string; readonly admin?: readonly string[] }>;
}): Promise<ReactElement> {
  const { locale, admin } = await params;
  // as-needed prefixes: the default locale's admin lives at /admin, others at /{locale}/admin.
  const basePath = locale === routing.defaultLocale ? "/admin" : \`/\${locale}/admin\`;
  return <PosAdminShell locale={locale} segments={admin ?? []} basePath={basePath} />;
}
`;

export const proxy = `// Next 16 proxy (the middleware.ts successor): locale negotiation + redirects.
// The matcher MUST stay a literal here — Next statically analyzes it.
import { createPosProxy } from "@nukesai-pos/frontend/proxy";

import { routing } from "./i18n/routing";

export default createPosProxy(routing);

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\\\..*).*)",
};
`;

export const i18nRouting = `// Consumer-owned routing definition (one line) — proxy.ts, i18n/request.ts and
// global.d.ts all derive from this single object.
import { definePosRouting } from "@nukesai-pos/frontend/i18n";

export const routing = definePosRouting();
`;

export const i18nRequest = `// Wired by withNukesPos() -> createNextIntlPlugin (aliases next-intl/config here).
// Routed mode: the [locale] segment is forwarded by next-intl itself; no cookie
// read keeps static rendering possible.
import { createPosRequestConfig } from "@nukesai-pos/frontend/server";

export default createPosRequestConfig({ cookieName: false });
`;

export const globalDts = `// Consumer-owned next-intl augmentation (the library must NOT ship it — two
// AppConfig declarations with different Messages types would conflict).
import type { PosEnResources } from "@nukesai-pos/frontend/locales/en";

import type { routing } from "./i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: PosEnResources;
  }
}
`;

export const instrumentation = `export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerGlobalErrorHandlers } = await import("@nukesai-pos/backend");
    const { getPos } = await import("@nukesai-pos/backend/bootstrap");
    const pos = await getPos();
    registerGlobalErrorHandlers({ logger: pos.logger, runtime: pos.env.BACKEND_RUNTIME });
  }
}
`;
