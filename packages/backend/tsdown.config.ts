import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  name: "@nukesai-pos/backend",
  entry: {
    index: "src/index.ts",
    "ports/index": "src/ports/index.ts",
    "adapters/demo/index": "src/adapters/demo/index.ts",
    // Throws on import; wired into guarded exports via the "browser" condition.
    _browser_guard: "src/internal/browser-guard.ts",
  },
  root: "src",
  format: "esm",
  platform: "node",
  target: "es2022",
  dts: { generator: "oxc", sourcemap: true },
  // Keeps the adapter/port boundary 1:1 with dist so a driver can be swapped
  // later, and preserves the `import "server-only"` lines per file.
  unbundle: true,
  hash: false,
  // platform:'node' defaults fixedExtension to true (.mjs); we want plain .js.
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  // Keep `node:` prefixes explicit on builtins.
  nodeProtocol: true,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: { profile: "esm-only", level: "error" },
  report: true,
  failOnWarn: "ci-only",
});

export default config;
