#!/usr/bin/env node
/**
 * The release orchestrator. One place that decides whether to publish, to which
 * channel, and whether it actually worked.
 *
 * IT MUST BE SAFE TO RUN WHEN THERE IS NOTHING TO DO. changesets/action runs
 * the publish script on EVERY main build that has no pending changesets:
 *
 *     No changesets found. Attempting to publish any unpublished packages to npm
 *     $ pnpm run release
 *
 * (observed on run 32561229909). The old shell chain put the fail-closed channel
 * guard first, so a docs-only merge would have exited 1 and turned the Release
 * workflow red for a build that simply had nothing to publish. The registry
 * probe below is what makes "nothing to do" a success instead of a failure —
 * without weakening the guard, which still runs whenever a publish is real.
 *
 * Order matters:
 *   1. probe    — already on the registry at this version? then exit 0, quietly
 *   2. guard    — resolve the dist-tag from state, fail closed
 *   3. build
 *   4. publish  — with the resolved --tag
 *   5. verify   — the registry, not pnpm's output, decides success
 *
 * Usage: node scripts/release.mjs [--canary]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { fetchPackument, packageNames } from "./verify-published.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Child stdio is inherited, so a failing step has ALREADY printed its own
 * message. Re-throwing would bury that under a Node stack dump, so exit with
 * the child's status instead and let its message be the last thing in the log.
 */
const run = (command, args) => {
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: "inherit", encoding: "utf8" });
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 1;
    process.exit(status);
  }
};

const capture = (command, args) =>
  execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const currentVersion = () =>
  JSON.parse(readFileSync(path.join(ROOT, "packages/backend/package.json"), "utf8")).version;

/** True only when EVERY package in the fixed group already exists at `version`. */
const alreadyPublished = async (version) => {
  for (const name of packageNames()) {
    try {
      const doc = await fetchPackument(name);
      if (doc.versions?.[version] === undefined) return false;
    } catch {
      // Registry unreachable: do NOT claim "already published" and skip a real
      // release. Fall through and let the publish step surface the problem.
      return false;
    }
  }
  return true;
};

const main = async () => {
  const canary = process.argv.includes("--canary");

  if (canary) {
    // Stamps a fresh 0.0.0-canary-<utc>-<sha>, so it can never collide with an
    // already-published version and the probe below always falls through.
    run("node", ["scripts/stamp-canary-version.mjs"]);
  }

  const version = currentVersion();

  if (await alreadyPublished(version)) {
    process.stderr.write(
      `  ${version} is already on the registry for every package — nothing to publish.\n`,
    );
    return;
  }

  run("node", ["scripts/resolve-release-channel.mjs", "--assert"]);
  const tag = capture("node", ["scripts/resolve-release-channel.mjs"]).trim();

  run("pnpm", ["turbo", "run", "build"]);
  run("pnpm", [
    "publish",
    "-r",
    "--no-git-checks",
    "--access",
    "public",
    "--report-summary",
    "--tag",
    tag,
  ]);

  // pnpm prints "Published" for packages the registry 404s (run 32808766986),
  // so the registry gets the last word.
  run("node", ["scripts/verify-published.mjs", "--version", version, "--tag", tag]);
};

await main();
