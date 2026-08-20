// Proves the 100% coverage gate is real. Writes a deliberately untested source
// file, asserts `vitest run --coverage` FAILS, then removes it. Catches the
// Vitest 4 trap where a missing `coverage.include` yields a fraudulent 100%.
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const canary = "packages/common/src/money/__coverage_canary__.ts";
writeFileSync(canary, 'export const canary = (): string => "untested";\n');

let failedAsExpected = false;
try {
  execSync("pnpm exec vitest run --coverage", { stdio: "ignore" });
} catch {
  failedAsExpected = true;
} finally {
  rmSync(canary, { force: true });
}

if (!failedAsExpected) {
  console.error(
    "COVERAGE GATE IS BROKEN: an untested file did not fail the build.\n"
      + "Most likely `coverage.include` is missing from the root vitest.config.ts.",
  );
  process.exit(1);
}
console.log("Coverage gate verified: untested code fails the build.");
