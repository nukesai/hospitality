import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  name: "@nukesai-pos/cli",
  entry: {
    main: "src/main.ts",
  },
  root: "src",
  format: "esm",
  platform: "node",
  target: "es2022",
  dts: { generator: "oxc", sourcemap: true },
  unbundle: true,
  hash: false,
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  nodeProtocol: true,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: { profile: "esm-only", level: "error" },
  report: true,
  failOnWarn: "ci-only",
});

export default config;
