import { defineConfig, type ViteUserConfig } from "vitest/config";

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
const config: ViteUserConfig = defineConfig({
  test: {
    name: "cli",
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});

export default config;
