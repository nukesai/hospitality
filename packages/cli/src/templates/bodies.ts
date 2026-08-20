/**
 * Consumer file bodies. GENERATED-FROM-FIXTURE contract: every body below must
 * stay byte-identical to its counterpart in apps/example — templates.test.ts
 * enforces it, so the example app IS the CLI's output (zero drift by
 * construction). Regenerate with `node scripts/sync-cli-templates.mjs` after
 * editing the example.
 */

export const apiRoute = `// THE api route: every POS surface (auth/trpc/rest/openapi.json/docs) mounts
// under POS_API_BASE_PATH — this file is the only consumer API wiring needed.
// posCoreRouter ships every feature router pre-composed; new features arrive
// with the package version, zero edits here. (App-local procedures? See
// \`nukes-pos add\` — it scaffolds server/routers/_app.ts and you point the
// import below at it.)
import { getPos } from "@nukesai-pos/backend/bootstrap";
import { createPosApi } from "@nukesai-pos/backend/next";
import { posCoreRouter } from "@nukesai-pos/backend/trpc";

const pos = await getPos();

export const { GET, POST, PUT, PATCH, DELETE } = createPosApi(pos, posCoreRouter, {
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
