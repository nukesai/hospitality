// Proves the 100% coverage gate is real. Writes a deliberately untested source
// file, asserts `vitest run --coverage` fails WITH A COVERAGE-THRESHOLD ERROR
// (any other failure mode does not count), then removes it. Catches the
// Vitest 4 trap where a missing `coverage.include` yields a fraudulent 100%.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const canary = "packages/common/src/money/__coverage_canary__.ts";
const cleanup = () => {
  rmSync(canary, { force: true });
};
// The coverage run takes seconds — make sure Ctrl-C never orphans the canary.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

writeFileSync(canary, 'export const canary = (): string => "untested";\n');

let result;
try {
  result = spawnSync("pnpm", ["exec", "vitest", "run", "--coverage"], { encoding: "utf8" });
} finally {
  cleanup();
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const failed = result.status !== 0;
const failedOnCoverage = /does not meet .* threshold/i.test(output);

if (failed && failedOnCoverage) {
  console.log("Coverage gate verified: untested code fails the build with a threshold error.");
  process.exit(0);
}
if (failed) {
  console.error("Canary run failed, but NOT with a coverage-threshold error — inspect the output:");
  console.error(output.slice(-4000));
  process.exit(1);
}
console.error(
  "COVERAGE GATE IS BROKEN: an untested file did not fail the build.\n"
    + "Most likely `coverage.include` is missing from the root vitest.config.ts.",
);
process.exit(1);
