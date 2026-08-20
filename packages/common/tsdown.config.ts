import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  name: "@nukesai-pos/common",
  // Every module is an entry: dist/ mirrors src/ exactly (per-module chunks,
  // maximal tree-shaking; the hand-written exports map points into it).
  entry: ["src/**/*.ts", "!src/**/*.test.*"],
  // Pins the dist layout so the hand-written exports map cannot drift.
  root: "src",
  format: "esm",
  // Isomorphic: must not assume Node builtins.
  platform: "neutral",
  target: "es2022",
  // Force the stable oxc generator; never fall back to the experimental tsgo
  // one that tsdown auto-selects when typescript@7 is installed.
  dts: { generator: "oxc", sourcemap: true },
  // Mirrors src/ into dist/ -> per-module tree-shaking and lazy import()
  // splitting in the consumer app.
  unbundle: true,
  // tsdown defaults hash:true; stable filenames are required by the exports map.
  hash: false,
  // `"type": "module"` + plain .js, not .mjs.
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  // Never inline anything from node_modules into a library.
  // (`external`/`noExternal` are deprecated in tsdown 0.22.x.)
  deps: { neverBundle: true },
  // Exports map is hand-written and reviewed; tsdown must not rewrite
  // package.json (its generator omits `types` conditions).
  exports: false,
  publint: true,
  // Exact literal is 'esm-only' (hyphenated); 'esmOnly' silently no-ops.
  attw: { profile: "esm-only", level: "error" },
  report: true,
  failOnWarn: "ci-only",
});

export default config;
