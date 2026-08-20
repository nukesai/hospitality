import path from "node:path";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
const config: ViteUserConfig = defineConfig({
  resolve: {
    alias: {
      // `server-only` throws under Node's `default` export condition. Tests run
      // in plain Node, so alias it to an empty stub; the dist boundary test
      // asserts the REAL import still ships in the published output.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    name: "backend",
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});

export default config;
