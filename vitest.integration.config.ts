import { defineConfig, type ViteUserConfig } from "vitest/config";

// Opt-in integration suite: requires `pnpm stack:up && pnpm db:migrate`.
// Deliberately OUTSIDE the coverage gate (non-hermetic — live PG/Redis).
const config: ViteUserConfig = defineConfig({
  test: {
    name: "integration",
    environment: "node",
    globals: false,
    include: ["packages/backend/test-integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

export default config;
