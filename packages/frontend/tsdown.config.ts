import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  name: "@nukesai-pos/frontend",
  entry: {
    "server/index": "src/server/index.ts",
    "client/index": "src/client/index.ts",
  },
  root: "src",
  format: "esm",
  // Runs in the RSC layer (node) AND in the browser -> no runtime assumptions.
  platform: "neutral",
  target: "es2022",
  dts: { generator: "oxc", sourcemap: true },

  // ---------------------------------------------------------------------------
  // MANDATORY. rolldown preserves `"use client"` / `"use server"` ONLY in
  // unbundle mode. With unbundle:false the directive is silently dropped and
  // the CONSUMER's `next build` fails with:
  //   "You're importing a module that depends on useState into a
  //    React Server Component module."
  // There is NO `preserveDirectives` option in tsdown/rolldown.
  // Enforced post-build by test/boundary.dist.test.ts.
  // ---------------------------------------------------------------------------
  unbundle: true,

  hash: false,
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: {
    profile: "esm-only",
    level: "error",
    // attw reports "No resolution" for non-JS subpaths like ./styles.css.
    excludeEntrypoints: [/\.css$/],
  },
  report: true,
  failOnWarn: "ci-only",
});

export default config;
