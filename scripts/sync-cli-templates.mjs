// Regenerates packages/cli/src/templates/bodies.ts from apps/example — the
// example app is the single source of truth for every scaffolded file.
// templates.test.ts fails CI whenever this was forgotten.
import { readFileSync, writeFileSync } from "node:fs";

export const TEMPLATE_SOURCES = {
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

const esc = (s) => s.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");

const header = `/**
 * Consumer file bodies. GENERATED-FROM-FIXTURE contract: every body below must
 * stay byte-identical to its counterpart in apps/example — templates.test.ts
 * enforces it, so the example app IS the CLI's output (zero drift by
 * construction). Regenerate with \`node scripts/sync-cli-templates.mjs\` after
 * editing the example.
 */
`;

if (process.argv[1] && process.argv[1].endsWith("sync-cli-templates.mjs")) {
  const parts = [header];
  for (const [name, path] of Object.entries(TEMPLATE_SOURCES)) {
    parts.push(`export const ${name} = \`${esc(readFileSync(path, "utf8"))}\`;\n`);
  }
  writeFileSync("packages/cli/src/templates/bodies.ts", parts.join("\n"));
  console.log("bodies.ts regenerated from apps/example");
}
