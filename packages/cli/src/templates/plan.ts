import * as bodies from "./bodies.js";

/**
 * The scaffold PLAN: which files `init`/`add` materialize, where, and with
 * what body. Bodies for the routed variant are byte-copies of apps/example
 * (bodies.ts is generated from the fixture; templates.test.ts enforces sync),
 * so the example app IS the CLI's output. Zero behavior lives in consumer
 * files — they are thin bindings over the packages.
 */
export interface TemplateContext {
  /** Routes live under src/app instead of app. */
  readonly srcDir: boolean;
  /** Locale-prefixed URLs (proxy.ts + [locale] tree). Default OFF: the
   *  cookie-negotiated mode never touches the host app's route structure. */
  readonly i18nRouting: boolean;
  /** Features to materialize routers for (validated against POS_FEATURES). */
  readonly features: readonly string[];
}

export interface PlannedFile {
  readonly path: string;
  readonly body: string;
  /** Feature files are managed by `add`; scaffold files by `init`/`upgrade`. */
  readonly feature?: string;
}

export interface PosFeatureTemplate {
  readonly name: string;
  /** Path under the project root (src/ prefix applied by the planner). */
  readonly routerFile: string;
  readonly routerExport: string;
  readonly body: string;
}

/** Feature registry — `add` refuses anything not listed here. */
export const POS_FEATURES: Readonly<Record<string, PosFeatureTemplate>> = {
  orders: {
    name: "orders",
    routerFile: "server/routers/orders.ts",
    routerExport: "ordersRouter",
    body: bodies.routersOrders,
  },
};

/** Consumer package.json additions. The three @nukesai-pos packages ride the
 *  CLI's own version (fixed version group); third-party pins mirror the
 *  workspace catalog — versions.test.ts keeps them in lockstep. */
export const CONSUMER_DEPENDENCIES: Readonly<Record<string, string>> = {
  "@tanstack/react-query": "^5.101.4",
  "@trpc/client": "^11.18.0",
  "@trpc/server": "^11.18.0",
  "better-auth": "^1.7.1",
  "next-intl": "^4.13.7",
  "server-only": "^0.0.1",
  superjson: "^2.2.6",
  zod: "^4.4.3",
};

export const ENV_EXAMPLE_BLOCK = `# --- Nukes POS (see @nukesai-pos/backend env schema for every option) ---
DATABASE_URL=postgres://pos_app:change-me@localhost:5432/pos
BETTER_AUTH_SECRET=change-me-to-a-random-string-of-32-plus-chars
BETTER_AUTH_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=http://localhost:3000
# CACHE_DRIVER=ioredis
# CACHE_URL=redis://localhost:6379
# MAIL_DRIVER=smtp
# SMTP_HOST=localhost
# POS_API_BASE_PATH=/api/pos
`;

/** Without-routing bodies (the non-invasive default). The routed twins live in
 *  apps/example and arrive via bodies.ts. */
const requestConfigNoRouting = `// Wired by withNukesPos() -> createNextIntlPlugin (aliases next-intl/config here).
// Cookie-negotiated locale (no URL prefixes, no proxy): explicit >
// resolveLocale > NEXT_LOCALE cookie > default. See @nukesai-pos/frontend/server.
import { createPosRequestConfig } from "@nukesai-pos/frontend/server";

export default createPosRequestConfig();
`;

const globalDtsNoRouting = `// Consumer-owned next-intl augmentation (the library must NOT ship it — two
// AppConfig declarations with different Messages types would conflict).
import type { PosLocale } from "@nukesai-pos/frontend/i18n";
import type { PosEnResources } from "@nukesai-pos/frontend/locales/en";

declare module "next-intl" {
  interface AppConfig {
    Locale: PosLocale;
    Messages: PosEnResources;
  }
}
`;

const groupLayout = `// Route-group layout: nests inside YOUR root layout and only adds the POS
// intl provider around the admin surface. Your app's chrome stays untouched.
import { PosIntl } from "@nukesai-pos/frontend/server";
import type { ReactElement, ReactNode } from "react";

export default function NukesPosLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <PosIntl>{children}</PosIntl>;
}
`;

const adminPageNoRouting = `// THE admin route: one file, the frontend package handles everything inside.
import { PosAdminShell } from "@nukesai-pos/frontend/server";
import { getLocale } from "next-intl/server";
import type { ReactElement } from "react";

export default async function AdminPage({
  params,
}: {
  readonly params: Promise<{ readonly admin?: readonly string[] }>;
}): Promise<ReactElement> {
  const [{ admin }, locale] = await Promise.all([params, getLocale()]);
  return <PosAdminShell locale={locale} segments={admin ?? []} basePath="/admin" />;
}
`;

const ROUTER_IMPORTS_OPEN = "// <nukes-pos:router-imports>";
const ROUTER_IMPORTS_CLOSE = "// </nukes-pos:router-imports>";
const ROUTERS_OPEN = "// <nukes-pos:routers>";
const ROUTERS_CLOSE = "// </nukes-pos:routers>";

export interface RouterMarkers {
  readonly importsOpen: string;
  readonly importsClose: string;
  readonly routersOpen: string;
  readonly routersClose: string;
}

export const ROUTER_MARKERS: RouterMarkers = {
  importsOpen: ROUTER_IMPORTS_OPEN,
  importsClose: ROUTER_IMPORTS_CLOSE,
  routersOpen: ROUTERS_OPEN,
  routersClose: ROUTERS_CLOSE,
};

/** Renders _app.ts with the marker blocks filled for the given features. */
export const renderRoutersApp = (features: readonly string[]): string => {
  const active = features
    .map((name) => POS_FEATURES[name])
    .filter((feature): feature is PosFeatureTemplate => feature !== undefined);
  const imports = active.map((f) => `import { ${f.routerExport} } from "./${f.name}";`).join("\n");
  const bindings = active.map((f) => `  ${f.name}: ${f.routerExport},`).join("\n");
  return bodies.routersApp
    .replace(
      `${ROUTER_IMPORTS_OPEN}\nimport { ordersRouter } from "./orders";\n${ROUTER_IMPORTS_CLOSE}`,
      `${ROUTER_IMPORTS_OPEN}\n${imports}${imports === "" ? "" : "\n"}${ROUTER_IMPORTS_CLOSE}`,
    )
    .replace(
      `${ROUTERS_OPEN}\n  orders: ordersRouter,\n  ${ROUTERS_CLOSE}`,
      `${ROUTERS_OPEN}\n${bindings}${bindings === "" ? "" : "\n"}  ${ROUTERS_CLOSE}`,
    );
};

const prefix = (ctx: TemplateContext, path: string): string => (ctx.srcDir ? `src/${path}` : path);

/** Every file `init` materializes for the given context (feature files included). */
export const planFiles = (ctx: TemplateContext): readonly PlannedFile[] => {
  const files: PlannedFile[] = [
    { path: prefix(ctx, "server/routers/_app.ts"), body: renderRoutersApp(ctx.features) },
    { path: prefix(ctx, "server/routers/health.ts"), body: bodies.routersHealth },
    { path: prefix(ctx, "app/api/pos/[[...pos]]/route.ts"), body: bodies.apiRoute },
    { path: prefix(ctx, "instrumentation.ts"), body: bodies.instrumentation },
  ];

  if (ctx.i18nRouting) {
    files.push(
      { path: prefix(ctx, "proxy.ts"), body: bodies.proxy },
      { path: prefix(ctx, "i18n/routing.ts"), body: bodies.i18nRouting },
      { path: prefix(ctx, "i18n/request.ts"), body: bodies.i18nRequest },
      { path: prefix(ctx, "global.d.ts"), body: bodies.globalDts },
      { path: prefix(ctx, "app/[locale]/layout.tsx"), body: bodies.localeLayout },
      {
        path: prefix(ctx, "app/[locale]/(nukes-pos)/admin/[[...admin]]/page.tsx"),
        body: bodies.adminPage,
      },
    );
  } else {
    files.push(
      { path: prefix(ctx, "i18n/request.ts"), body: requestConfigNoRouting },
      { path: prefix(ctx, "global.d.ts"), body: globalDtsNoRouting },
      { path: prefix(ctx, "app/(nukes-pos)/layout.tsx"), body: groupLayout },
      {
        path: prefix(ctx, "app/(nukes-pos)/admin/[[...admin]]/page.tsx"),
        body: adminPageNoRouting,
      },
    );
  }

  const activeFeatures = ctx.features
    .map((name) => POS_FEATURES[name])
    .filter((feature): feature is PosFeatureTemplate => feature !== undefined);
  for (const feature of activeFeatures) {
    files.push({
      path: prefix(ctx, feature.routerFile),
      body: feature.body,
      feature: feature.name,
    });
  }

  return files;
};
