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

/**
 * Every ban that must be present in the effective config of a given file.
 *
 * `selectors` covers `no-restricted-syntax`, which is subject to the exact same
 * wholesale-replacement failure as `no-restricted-imports`. It is asserted here
 * because the RLS branch-context ban lives in that rule: an unproven ban is the
 * defect class this script exists to catch.
 */
const EXPECTED = [
  {
    package: "packages/common",
    file: "src/index.ts",
    names: ["i18next", "react-i18next", "next-intl", "use-intl"],
    groups: ["@nukesai-pos/backend", "@nukesai-pos/frontend", "server-only", "client-only"],
    selectors: ["TSEnumDeclaration"],
  },
  {
    package: "packages/backend",
    file: "src/env.ts",
    names: ["react", "react-dom", "i18next", "react-i18next", "next-intl", "use-intl"],
    groups: ["@nukesai-pos/frontend", "client-only", "**/client"],
    // The RLS bans must reach ordinary backend server files...
    selectors: [
      "TSEnumDeclaration",
      "ImportExpression > Literal[value=/client/]",
      "CallExpression[callee.property.name='transaction']",
      "TemplateElement[value.raw=/set_config/]",
    ],
  },
  {
    package: "packages/backend",
    file: "src/adapters/drizzle/rls.ts",
    names: ["react", "react-dom"],
    groups: ["@nukesai-pos/frontend"],
    // ...and must NOT reach the one file sanctioned to use them, which still
    // keeps every other server ban.
    selectors: ["TSEnumDeclaration", "ImportExpression > Literal[value=/client/]"],
    forbiddenSelectors: [
      "CallExpression[callee.property.name='transaction']",
      "TemplateElement[value.raw=/set_config/]",
    ],
  },
  {
    package: "packages/frontend",
    file: "src/client/trpc.ts",
    names: [],
    // The frontend MAY use next-intl; what it may never do is reach for the backend.
    groups: ["@nukesai-pos/backend", "server-only"],
    selectors: ["TSEnumDeclaration"],
  },
];

const effectiveRule = (pkg, file) => {
  const raw = execFileSync("npx", ["eslint", "--print-config", file], {
    cwd: path.join(ROOT, pkg),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const rules = JSON.parse(raw).rules;

  const imports = rules["no-restricted-imports"];
  const options = Array.isArray(imports) && typeof imports[1] === "object" ? imports[1] : {};

  const syntax = rules["no-restricted-syntax"];
  const selectors = Array.isArray(syntax)
    ? syntax
        .slice(1)
        .map((entry) => (typeof entry === "string" ? entry : entry?.selector))
        .filter(Boolean)
    : [];

  return {
    names: new Set((options.paths ?? []).map((entry) => entry.name)),
    groups: new Set((options.patterns ?? []).flatMap((entry) => entry.group ?? [])),
    selectors: new Set(selectors),
  };
};

let failed = false;
for (const expectation of EXPECTED) {
  const actual = effectiveRule(expectation.package, expectation.file);
  const missingNames = expectation.names.filter((name) => !actual.names.has(name));
  const missingGroups = expectation.groups.filter((group) => !actual.groups.has(group));
  const missingSelectors = (expectation.selectors ?? []).filter(
    (selector) => !actual.selectors.has(selector),
  );
  if (missingNames.length > 0 || missingGroups.length > 0 || missingSelectors.length > 0) {
    failed = true;
    console.error(
      `BAN LOST in ${expectation.package} (${expectation.file}):`,
      [...missingNames, ...missingGroups, ...missingSelectors].join(", "),
    );
  }
  // An exemption that stopped exempting is just as silent a failure: rls.ts
  // would start failing lint on the very syntax it owns.
  const leaked = (expectation.forbiddenSelectors ?? []).filter((selector) =>
    actual.selectors.has(selector),
  );
  if (leaked.length > 0) {
    failed = true;
    console.error(
      `EXEMPTION LOST in ${expectation.package} (${expectation.file}): still banned:`,
      leaked.join(", "),
    );
  }
}

if (failed) {
  console.error(
    "\nA config block replaced `no-restricted-imports` or `no-restricted-syntax`\n"
      + "instead of merging it. Fold the missing bans back in with withI18nFrameworkBan,\n"
      + "or by restating the zone patterns / spreading SERVER_SYNTAX_BANS — see\n"
      + "packages/eslint-config/boundaries.js.\n\n"
      + 'Note: a rule set to severity ALONE (`["error"]`) keeps the inherited options.\n'
      + 'Only supplying new options (`["error", {...}]`) replaces them wholesale — that\n'
      + "is the shape to look for in the offending block.",
  );
  process.exit(1);
}
console.log("Boundary bans verified: every zone keeps the bans it declares.");
