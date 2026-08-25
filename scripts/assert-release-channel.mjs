#!/usr/bin/env node
/**
 * Proves the release-channel guard actually refuses.
 *
 * Same idiom as assert-lint-bans.mjs and assert-coverage-gate-fails.mjs: the
 * script IS the assertion. `scripts/` is outside vitest's `projects` and
 * outside `coverage.include` (root vitest.config.ts:19), so a unit test here
 * would never run. CI runs this instead.
 *
 * A guard nobody has watched fail is not a guard. Every REFUSE case below is
 * asserted to throw — an accidental `return "latest"` would fail this script,
 * not slip through green.
 *
 * Run: node scripts/assert-release-channel.mjs
 */
import { resolveChannel } from "./resolve-release-channel.mjs";

const v = (version) =>
  ["common", "backend", "frontend", "cli"].map((n) => ({ name: `@nukesai-pos/${n}`, version }));

const PRE_BETA = { mode: "pre", tag: "beta" };
const PRE_EXIT = { mode: "exit", tag: "beta" };

/** [label, input, expected] where expected is a tag string or "REFUSE". */
const CASES = [
  ["no pre.json, no opt-in", { versions: v("0.1.0"), pre: null, allowLatest: false }, "REFUSE"],
  ["exited pre, no opt-in", { versions: v("0.2.0"), pre: PRE_EXIT, allowLatest: false }, "REFUSE"],
  ["opt-in on a stable version", { versions: v("0.2.0"), pre: null, allowLatest: true }, "latest"],
  [
    "opt-in but versions still pre-release (forgotten `pre exit`)",
    { versions: v("0.2.0-beta.3"), pre: PRE_EXIT, allowLatest: true },
    "REFUSE",
  ],
  ["pre mode", { versions: v("0.2.0-beta.0"), pre: PRE_BETA, allowLatest: false }, "beta"],
  [
    "pre mode WINS over a stale RELEASE_ALLOW_LATEST",
    { versions: v("0.2.0-beta.0"), pre: PRE_BETA, allowLatest: true },
    "beta",
  ],
  [
    'pre.json claiming tag "latest"',
    { versions: v("0.2.0-beta.0"), pre: { mode: "pre", tag: "latest" }, allowLatest: false },
    "REFUSE",
  ],
  [
    "pre mode with no tag",
    { versions: v("0.2.0-beta.0"), pre: { mode: "pre" }, allowLatest: false },
    "REFUSE",
  ],
  [
    "snapshot build is self-identifying",
    { versions: v("0.0.0-canary-20260824062507"), pre: null, allowLatest: false },
    "canary",
  ],
  [
    "snapshot build can never be promoted to production",
    { versions: v("0.0.0-canary-20260824062507"), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    // THE case the stamp design exists for. `changeset version --snapshot` is
    // refused in pre mode, which would switch canary off for a whole beta
    // train; stamping the version directly keeps both channels live. If this
    // ever returns "beta", canary has silently stopped working mid-train.
    "canary DURING a beta train — both channels stay live",
    { versions: v("0.0.0-canary-20260824062507"), pre: PRE_BETA, allowLatest: false },
    "canary",
  ],
  [
    "canary during a beta train still cannot be promoted",
    { versions: v("0.0.0-canary-20260824062507"), pre: PRE_BETA, allowLatest: true },
    "REFUSE",
  ],
  [
    "fixed group out of lockstep",
    {
      versions: [
        { name: "@nukesai-pos/common", version: "0.2.0" },
        { name: "@nukesai-pos/backend", version: "0.1.0" },
        { name: "@nukesai-pos/frontend", version: "0.2.0" },
        { name: "@nukesai-pos/cli", version: "0.2.0" },
      ],
      pre: null,
      allowLatest: true,
    },
    "REFUSE",
  ],
];

let failed = 0;
for (const [label, input, expected] of CASES) {
  let actual;
  try {
    actual = resolveChannel(input).tag;
  } catch {
    actual = "REFUSE";
  }
  if (actual === expected) {
    console.log(`  ok    ${expected.padEnd(7)} ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  expected ${expected}, got ${actual} — ${label}`);
  }
}

if (failed > 0) {
  console.error(
    `\n${String(failed)} release-channel guard case(s) regressed. The guard decides which npm\n`
      + "dist-tag a publish lands on; a wrong answer here ships unfinished packages to\n"
      + "`latest`. See scripts/resolve-release-channel.mjs.",
  );
  process.exit(1);
}
console.log(`Release-channel guard verified: ${String(CASES.length)} states, every refusal fires.`);
