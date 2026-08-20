import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as bodies from "./bodies.js";
import { CONSUMER_DEPENDENCIES, planFiles, POS_FEATURES, renderRoutersApp } from "./plan.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** Mirror of scripts/sync-cli-templates.mjs — the fixture map. */
const TEMPLATE_SOURCES: Readonly<Record<string, string>> = {
  apiRoute: "apps/example/app/api/pos/[[...pos]]/route.ts",
  localeLayout: "apps/example/app/[locale]/layout.tsx",
  adminPage: "apps/example/app/[locale]/(nukes-pos)/admin/[[...admin]]/page.tsx",
  proxy: "apps/example/proxy.ts",
  i18nRouting: "apps/example/i18n/routing.ts",
  i18nRequest: "apps/example/i18n/request.ts",
  globalDts: "apps/example/global.d.ts",
  instrumentation: "apps/example/instrumentation.ts",
};

describe("template fixture sync (the zero-drift contract)", () => {
  it("every body is byte-identical to its apps/example source", () => {
    for (const [name, source] of Object.entries(TEMPLATE_SOURCES)) {
      const fixture = readFileSync(path.join(REPO_ROOT, source), "utf8");
      const body = (bodies as Record<string, string>)[name];
      expect(body, `${name} drifted from ${source} — run node scripts/sync-cli-templates.mjs`).toBe(
        fixture,
      );
    }
  });

  it("covers every exported body (no orphan templates)", () => {
    expect(Object.keys(bodies).sort()).toEqual(Object.keys(TEMPLATE_SOURCES).sort());
  });

  it("consumer dependency pins mirror the workspace catalog", () => {
    const workspace = readFileSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
    for (const [name, range] of Object.entries(CONSUMER_DEPENDENCIES)) {
      const pinned = range.replace(/^\^/, "");
      const entry = new RegExp(`"?${name.replace("/", "\\/")}"?: ${pinned.replace(/\./g, "\\.")}`);
      expect(workspace, `${name}@${pinned} is not the catalog pin`).toMatch(entry);
    }
  });
});

describe("renderRoutersApp", () => {
  it("renders the extension file with core + selected features", () => {
    const rendered = renderRoutersApp(["orders"]);
    expect(rendered).toContain(
      'import { healthRouter, ordersRouter } from "@nukesai-pos/backend/trpc";',
    );
    expect(rendered).toContain("  health: healthRouter,");
    expect(rendered).toContain("  orders: ordersRouter,");
    expect(rendered).toContain("export type AppRouter = typeof appRouter;");
  });

  it("keeps the always-on core with no features selected", () => {
    const rendered = renderRoutersApp([]);
    expect(rendered).not.toContain("ordersRouter");
    expect(rendered).toContain('import { healthRouter } from "@nukesai-pos/backend/trpc";');
    expect(rendered).toContain("  health: healthRouter,");
  });
});

describe("planFiles", () => {
  it("prefixes every path with src/ for src-dir apps", () => {
    const plan = planFiles({ srcDir: true, i18nRouting: true, features: ["orders"] });
    expect(plan.every((file) => file.path.startsWith("src/"))).toBe(true);
  });

  it("keeps the two i18n modes mutually exclusive", () => {
    const routed = planFiles({ srcDir: false, i18nRouting: true, features: [] }).map((f) => f.path);
    const cookie = planFiles({ srcDir: false, i18nRouting: false, features: [] }).map(
      (f) => f.path,
    );
    expect(routed).toContain("proxy.ts");
    expect(cookie).not.toContain("proxy.ts");
    expect(cookie).toContain("app/(nukes-pos)/layout.tsx");
    expect(routed).not.toContain("app/(nukes-pos)/layout.tsx");
  });

  it("features are composition-only: no feature files are ever planned", () => {
    const plan = planFiles({ srcDir: false, i18nRouting: false, features: ["orders"] });
    expect(plan.some((file) => file.feature !== undefined)).toBe(false);
    expect(plan.some((file) => file.path.includes("orders.ts"))).toBe(false);
    expect(POS_FEATURES.orders?.routerExport).toBe("ordersRouter");
  });
});
