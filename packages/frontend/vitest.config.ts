import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
const config: ViteUserConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` throws under Node's `default` export condition. Tests run
      // outside an RSC bundler, so alias it to an empty stub; the dist boundary
      // test asserts the REAL import still ships in the published output.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    name: "frontend",
    environment: "jsdom",
    // globals:false keeps published-library discipline (explicit imports, no
    // ambient types). Consequence: RTL's auto-cleanup registers only
    // `if (typeof afterEach === 'function')`, which is FALSE here — so
    // vitest.setup.ts MUST call cleanup() itself (verified: omitting it leaks
    // the DOM across tests).
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});

export default config;
