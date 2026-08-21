#!/usr/bin/env node
/**
 * Proves the boundary bans SURVIVE into the effective ESLint config.
 *
 * ESLint flat config replaces rule options wholesale, so a later block that
 * touches `no-restricted-imports` silently deletes every ban declared before
 * it — and nothing fails, because a deleted ban simply never fires. That
 * happened once (the i18n ban wiped the leaf-package ban in common, and the
 * backend `no-ui` block wiped the i18n ban), so the guarantee AGENTS.md §2/§7
 * claims is asserted here rather than assumed.
 *
 * Run: node scripts/assert-lint-bans.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Every ban that must be present in the effective config of a given file. */
const EXPECTED = [
  {
    package: "packages/common",
    file: "src/index.ts",
    names: ["i18next", "react-i18next", "next-intl", "use-intl"],
    groups: ["@nukesai-pos/backend", "@nukesai-pos/frontend", "server-only", "client-only"],
  },
  {
    package: "packages/backend",
    file: "src/env.ts",
    names: ["react", "react-dom", "i18next", "react-i18next", "next-intl", "use-intl"],
    groups: ["@nukesai-pos/frontend", "client-only", "**/client"],
  },
  {
    package: "packages/frontend",
    file: "src/client/trpc.ts",
    names: [],
    // The frontend MAY use next-intl; what it may never do is reach for the backend.
    groups: ["@nukesai-pos/backend", "server-only"],
  },
];

const effectiveRule = (pkg, file) => {
  const raw = execFileSync("npx", ["eslint", "--print-config", file], {
    cwd: path.join(ROOT, pkg),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const rule = JSON.parse(raw).rules["no-restricted-imports"];
  const options = Array.isArray(rule) && typeof rule[1] === "object" ? rule[1] : {};
  return {
    names: new Set((options.paths ?? []).map((entry) => entry.name)),
    groups: new Set((options.patterns ?? []).flatMap((entry) => entry.group ?? [])),
  };
};

let failed = false;
for (const expectation of EXPECTED) {
  const actual = effectiveRule(expectation.package, expectation.file);
  const missingNames = expectation.names.filter((name) => !actual.names.has(name));
  const missingGroups = expectation.groups.filter((group) => !actual.groups.has(group));
  if (missingNames.length > 0 || missingGroups.length > 0) {
    failed = true;
    console.error(
      `BAN LOST in ${expectation.package} (${expectation.file}):`,
      [...missingNames, ...missingGroups].join(", "),
    );
  }
}

if (failed) {
  console.error(
    "\nA config block replaced `no-restricted-imports` instead of merging it.\n"
      + "Fold the missing bans back in with withI18nFrameworkBan / by restating the\n"
      + "zone patterns — see packages/eslint-config/boundaries.js.",
  );
  process.exit(1);
}
console.log("Boundary bans verified: every zone keeps the bans it declares.");
