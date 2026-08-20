import { defineConfig, type ViteUserConfig } from "vitest/config";

// NOTE: no `coverage` key here by design — it would be silently ignored.
// Coverage lives only in the root vitest.config.ts.
const config: ViteUserConfig = defineConfig({
  test: {
    name: "common",
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});

export default config;
