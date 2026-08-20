import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as bodies from "./bodies.js";
import {
  CONSUMER_DEPENDENCIES,
  planFiles,
  POS_FEATURES,
  renderRoutersApp,
  ROUTER_MARKERS,
} from "./plan.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** Mirror of scripts/sync-cli-templates.mjs — the fixture map. */
const TEMPLATE_SOURCES: Readonly<Record<string, string>> = {
  routersApp: "apps/example/server/routers/_app.ts",
  routersHealth: "apps/example/server/routers/health.ts",
  routersOrders: "apps/example/server/routers/orders.ts",
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
  it("reproduces the fixture verbatim for the default feature set", () => {
    expect(renderRoutersApp(["orders"])).toBe(bodies.routersApp);
  });

  it("renders empty marker blocks with no features", () => {
    const rendered = renderRoutersApp([]);
    expect(rendered).not.toContain("ordersRouter");
    expect(rendered).toContain(`${ROUTER_MARKERS.importsOpen}\n${ROUTER_MARKERS.importsClose}`);
    expect(rendered).toContain(`${ROUTER_MARKERS.routersOpen}\n  ${ROUTER_MARKERS.routersClose}`);
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

  it("materializes registry features as managed files", () => {
    const plan = planFiles({ srcDir: false, i18nRouting: false, features: ["orders"] });
    const orders = plan.find((file) => file.feature === "orders");
    expect(orders?.path).toBe("server/routers/orders.ts");
    expect(orders?.body).toBe(POS_FEATURES.orders?.body);
  });
});
