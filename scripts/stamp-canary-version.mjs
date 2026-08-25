#!/usr/bin/env node
/**
 * Stamps a throwaway canary version into the four published manifests.
 *
 * WHY NOT `changeset version --snapshot`: changesets refuses to snapshot while
 * in pre mode —
 *
 *     $ changeset version --snapshot canary
 *     To resolve this exit the pre mode by running changeset pre exit.
 *     Exited with code 1
 *
 * — so a beta train would switch canary off for its whole duration. It also
 * exits 1 when no changesets are pending, which would fail a docs-only merge,
 * and it CONSUMES the pending changeset files, which is destructive in CI.
 *
 * A canary does not need changesets. It needs a version nothing can resolve by
 * accident. `0.0.0-canary-*` is exactly that: verified with semver@7.8.5, it is
 * matched by no ordinary range — not `^0.2.0`, not `*`, not `>=0.0.0` — so it
 * is reachable only by an exact pin or `npm i pkg@canary`.
 *
 * MUTATES THE WORKING TREE AND MUST NEVER BE COMMITTED. It runs in CI on a
 * disposable checkout, immediately before `pnpm publish`.
 *
 * Usage: node scripts/stamp-canary-version.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The fixed version group (.changeset/config.json `fixed`). */
const PUBLISHED = ["common", "backend", "frontend", "cli"];

/** UTC yyyymmddhhmmss — monotonic, so canaries sort in publication order. */
const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

const shortSha = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Detached/shallow/no-git: the timestamp alone still makes it unique.
    return "nogit";
  }
};

/**
 * `canary-<ts>-<sha>` is ONE semver pre-release identifier. It stays
 * alphanumeric (never all-digits), so the "no leading zeroes in a numeric
 * identifier" rule cannot bite.
 */
export const canaryVersion = (ts, sha) => `0.0.0-canary-${ts}-${sha}`;

const main = () => {
  const dryRun = process.argv.includes("--dry-run");
  const version = canaryVersion(stamp(), shortSha());

  for (const dir of PUBLISHED) {
    const file = path.join(ROOT, "packages", dir, "package.json");
    const raw = readFileSync(file, "utf8");
    const pkg = JSON.parse(raw);
    pkg.version = version;
    if (!dryRun) writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    process.stderr.write(`  ${pkg.name} -> ${version}\n`);
  }

  // Sibling deps use `workspace:^`; pnpm rewrites them at pack time from the
  // version now in the workspace, so the tarballs get `^0.0.0-canary-<...>`
  // pointing at their own canary siblings. Verified with `pnpm pack`.
  process.stderr.write(
    dryRun
      ? "  (dry run — nothing written)\n"
      : "  stamped. DO NOT COMMIT: this checkout is disposable.\n",
  );
  process.stdout.write(version);
};

if (process.argv[1] === import.meta.filename) main();
