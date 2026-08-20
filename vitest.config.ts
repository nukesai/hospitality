import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest 3.2 renamed `workspace` -> `projects`; Vitest 4 removed `workspace`.
    projects: ["packages/common", "packages/backend", "packages/frontend", "packages/cli"],

    // Root-only option: a repo-wide run that finds no tests must fail loudly.
    passWithNoTests: false,

    // COVERAGE IS ROOT-ONLY. `coverage` is in Vitest's NonProjectOptions union;
    // a `coverage` block inside packages/*/vitest.config.ts is SILENTLY IGNORED.
    coverage: {
      provider: "v8",

      // CRITICAL — `coverage.all` was REMOVED in Vitest 4. Without an explicit
      // `include`, only files a test already imported are reported, so a wholly
      // untested file is invisible and the run reports a fraudulent green 100%.
      include: ["packages/*/src/**/*.{ts,tsx}"],

      // `coverage.exclude` defaults to [] in Vitest 4 — every exclusion explicit.
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        // Pure re-export barrels ONLY (house rule: logic never lives in an index.ts).
        "**/index.ts",
        // CLI bin wiring (commander setup + parseAsync); commands/utils are covered.
        "packages/cli/src/main.ts",
        "**/dist/**",
      ],

      // `100: true` === statements/functions/branches/lines: 100, self-documenting.
      // perFile stops one big covered file from masking untested ones and names
      // the offending file in the error. autoUpdate deliberately omitted.
      thresholds: {
        100: true,
        perFile: true,
      },

      reportsDirectory: "./coverage",
      reporter: ["text-summary", "html", "lcov", "json"],
      reportOnFailure: true,
    },
  },
});
