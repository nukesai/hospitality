#!/usr/bin/env node
/**
 * Proves the release-channel guard actually refuses.
 *
 * Same idiom as assert-lint-bans.mjs and assert-coverage-gate-fails.mjs: the
 * script IS the assertion. `scripts/` is outside vitest's `projects` and
 * outside `coverage.include` (root vitest.config.ts:19), so a unit test here
 * would never run. CI runs this instead, on every PR and before every publish.
 *
 * A guard nobody has watched fail is not a guard. Every REFUSE case below is
 * asserted to throw — an accidental `return "latest"` would fail this script,
 * not slip through green.
 *
 * THE BRANCH IS THE CHANNEL, so the branch is the first column of every case.
 *
 * Run: node scripts/assert-release-channel.mjs
 */
import { ChannelError, resolveChannel } from "./resolve-release-channel.mjs";

const v = (version) =>
  ["common", "backend", "frontend", "cli"].map((n) => ({ name: `@nukesai-pos/${n}`, version }));

const GA = "1.2.0";
const BETA = "1.2.0-beta.20260826120000.sha-9f3ab21";
const CANARY = "0.0.0-canary-20260826120000-9f3ab21";

/** [label, input, expected] where expected is a tag string or "REFUSE". */
const CASES = [
  // ---- production ---------------------------------------------------------
  [
    "main + GA + opt-in",
    { branch: "main", versions: v(GA), pre: null, allowLatest: true },
    "latest",
  ],
  [
    "main + GA but NO opt-in — the production variable is the second key",
    { branch: "main", versions: v(GA), pre: null, allowLatest: false },
    "REFUSE",
  ],
  [
    "main carrying a beta version — the stamper leaked into production",
    { branch: "main", versions: v(BETA), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    "main carrying a canary version",
    { branch: "main", versions: v(CANARY), pre: null, allowLatest: true },
    "REFUSE",
  ],

  // ---- QA -----------------------------------------------------------------
  [
    "staging + beta shape",
    { branch: "staging", versions: v(BETA), pre: null, allowLatest: false },
    "beta",
  ],
  [
    "staging carrying a stable version — the beta stamper never ran",
    { branch: "staging", versions: v(GA), pre: null, allowLatest: false },
    "REFUSE",
  ],
  [
    "staging with RELEASE_ALLOW_LATEST — the environment restriction is broken",
    { branch: "staging", versions: v(BETA), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    "staging carrying a canary version",
    { branch: "staging", versions: v(CANARY), pre: null, allowLatest: false },
    "REFUSE",
  ],

  // ---- canary -------------------------------------------------------------
  [
    "development + canary shape",
    { branch: "development", versions: v(CANARY), pre: null, allowLatest: false },
    "canary",
  ],
  [
    "development carrying a stable version",
    { branch: "development", versions: v(GA), pre: null, allowLatest: false },
    "REFUSE",
  ],
  [
    "development with RELEASE_ALLOW_LATEST — a canary can never be promoted",
    { branch: "development", versions: v(CANARY), pre: null, allowLatest: true },
    "REFUSE",
  ],

  // ---- branches with no channel -------------------------------------------
  [
    "a feature branch has no channel",
    { branch: "feat/refund-flow", versions: v(CANARY), pre: null, allowLatest: false },
    "REFUSE",
  ],
  [
    "a hotfix branch publishes only after it merges to main",
    { branch: "hotfix/broken-tax", versions: v(GA), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    "an undeterminable branch",
    { branch: "", versions: v(GA), pre: null, allowLatest: true },
    "REFUSE",
  ],

  // ---- prototype-chain lookups (AGENTS.md: `in` walks the prototype) -------
  [
    'a branch named "constructor" must not resolve',
    { branch: "constructor", versions: v(GA), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    'a branch named "__proto__" must not resolve',
    { branch: "__proto__", versions: v(GA), pre: null, allowLatest: true },
    "REFUSE",
  ],
  [
    'a branch named "toString" must not resolve',
    { branch: "toString", versions: v(GA), pre: null, allowLatest: true },
    "REFUSE",
  ],

  // ---- pre mode is abolished ----------------------------------------------
  [
    // THE verified poison case. Under the old design pre mode outranked the
    // opt-in, so a pre.json that reached main published production to the beta
    // tag with every other check green.
    "a pre.json on main is a hard refusal, opt-in or not",
    { branch: "main", versions: v(GA), pre: { mode: "pre", tag: "beta" }, allowLatest: true },
    "REFUSE",
  ],
  [
    "an EXITED pre.json is still a refusal — it must be deleted, not exited",
    {
      branch: "staging",
      versions: v(BETA),
      pre: { mode: "exit", tag: "beta" },
      allowLatest: false,
    },
    "REFUSE",
  ],

  // ---- the fixed group ----------------------------------------------------
  [
    "fixed group out of lockstep",
    {
      branch: "main",
      versions: [
        { name: "@nukesai-pos/common", version: "1.2.0" },
        { name: "@nukesai-pos/backend", version: "1.1.0" },
        { name: "@nukesai-pos/frontend", version: "1.2.0" },
        { name: "@nukesai-pos/cli", version: "1.2.0" },
      ],
      pre: null,
      allowLatest: true,
    },
    "REFUSE",
  ],
];

/**
 * A refusal must be a DELIBERATE refusal. Catching every throw as "REFUSE"
 * hides the difference between the guard saying no and the guard crashing, and
 * that difference is load-bearing here: swapping `Object.hasOwn` for `in` makes
 * `CHANNELS["constructor"]` resolve to `Object.prototype.constructor`, whose
 * `.shape` is undefined, so `.shape.test()` throws a TypeError. The outcome
 * still looks like a refusal while the prototype-chain guard is gone. Verified
 * by mutation: with a catch-all, that swap was caught by ZERO cases.
 */
let failed = 0;
for (const [label, input, expected] of CASES) {
  let actual;
  try {
    actual = resolveChannel(input).tag;
  } catch (error) {
    actual = error instanceof ChannelError ? "REFUSE" : `CRASH (${error.constructor.name})`;
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
      + "`latest`. Branch protection is not available on this plan, so this guard is one of\n"
      + "the four keys that keep production locked. See scripts/resolve-release-channel.mjs.",
  );
  process.exit(1);
}
console.log(`Release-channel guard verified: ${String(CASES.length)} states, every refusal fires.`);
