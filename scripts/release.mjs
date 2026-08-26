#!/usr/bin/env node
/**
 * The release orchestrator. One place that decides whether to publish, to which
 * channel, and whether it actually worked.
 *
 * THE BRANCH IS THE CHANNEL — see scripts/resolve-release-channel.mjs. This
 * script is told which channel it is on so it knows which stamper to run; the
 * guard then independently re-derives the channel from the branch and refuses
 * if the two disagree. Passing `--channel latest` from `development` does not
 * publish to production, it fails.
 *
 * IT MUST BE SAFE TO RUN WHEN THERE IS NOTHING TO DO. A docs-only merge reaches
 * every one of these workflows with an empty changeset queue, and that is a
 * success, not a failure. Two things make that true: the beta stamper prints
 * nothing on an empty queue, and the registry probe below turns an
 * already-published version into a quiet exit 0.
 *
 * Order matters:
 *   1. stamp    — canary/beta only; main's versions were committed by CI already
 *   2. probe    — already on the registry at this version? then exit 0, quietly
 *   3. guard    — resolve the dist-tag from the BRANCH, fail closed
 *   4. build
 *   5. publish  — with the resolved --tag, retried up to 3 rounds
 *   6. verify   — the registry, not pnpm's output, decides success
 *   7. graduate — on production only, move `beta` up to the GA version
 *
 * Usage: node scripts/release.mjs --channel <canary|beta|latest>
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

/**
 * Like run(), but hands the child's exit code BACK instead of exiting.
 *
 * run() ends in `process.exit(status)`, which is right for a step that must
 * abort the release — and fatal for one that is meant to be retried. The
 * publish retry loop below called run() and so could never reach round 2: the
 * moment `pnpm publish` exited non-zero the process was gone. The loop only
 * ever covered "pnpm exited 0 and the registry disagreed", which is the failure
 * we had actually seen, so it worked — but it was one bad exit code away from
 * not working at all.
 *
 * That distinction stops being academic under trusted publishing, where
 * authentication is exchanged PER PACKAGE. A credential that fails at package
 * three leaves the fixed group split across the registry, and a retry is the
 * only thing that closes it.
 */
const runStatus = (command, args) => {
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: "inherit", encoding: "utf8" });
    return 0;
  } catch (error) {
    return typeof error?.status === "number" ? error.status : 1;
  }
};

/** Same guard as run(): a stamper's refusal must not surface as a stack dump. */
const capture = (command, args) => {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 1;
    process.exit(status);
  }
};

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
  const channel = process.argv[process.argv.indexOf("--channel") + 1];

  if (channel === "canary") {
    // Stamps a fresh 0.0.0-canary-<utc>-<sha>, so it can never collide with an
    // already-published version and the probe below always falls through.
    run("node", ["scripts/stamp-canary-version.mjs"]);
  } else if (channel === "beta") {
    // Prints nothing when the queue is empty or bumps nothing. That is the
    // no-op path, and it must stay green.
    if (
      capture("node", ["scripts/stamp-prerelease-version.mjs", "--channel", "beta"]).trim() === ""
    ) {
      process.stderr.write("  nothing to publish on this channel.\n");
      return;
    }
  } else if (channel !== "latest") {
    // `latest` needs no stamper: the version was committed by the production
    // workflow's version step before this ran.
    process.stderr.write("usage: release.mjs --channel <canary|beta|latest>\n");
    process.exit(1);
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

  // RETRY THE PUBLISH, NOT JUST THE VERIFICATION.
  //
  // `pnpm publish` reports success for a package npm never actually stores.
  // Observed repeatedly on @nukesai-pos/cli — the only package here with a
  // `bin` field, which puts it through extra npm-side processing:
  //
  //     0.0.0-canary-20260825042544  stored ~3m   after publish
  //     0.0.0-canary-20260825054851  stored ~5m30 after publish
  //     0.0.0-canary-20260825065241  stored ~1m30 after publish
  //     0.0.0-canary-20260825070712  stored ~2m30 after publish
  //     0.0.0-canary-20260825072957  NEVER STORED
  //
  // The other three land in about a second, every time, and npm reported
  // "All Systems Operational" throughout. So waiting longer is not the fix: no
  // timeout covers "never". Re-publishing is, because publishing a version that
  // already exists is a no-op — the packages that landed are untouched and only
  // the missing one is retried.
  const publishOnce = () =>
    runStatus("pnpm", [
      "publish",
      "-r",
      "--no-git-checks",
      "--access",
      "public",
      "--report-summary",
      "--tag",
      tag,
    ]);

  /** Verify without exiting, so a miss can trigger another publish round. */
  const verified = () => {
    try {
      execFileSync("node", ["scripts/verify-published.mjs", "--version", version, "--tag", tag], {
        cwd: ROOT,
        stdio: "inherit",
        encoding: "utf8",
      });
      return true;
    } catch {
      return false;
    }
  };

  const ROUNDS = 3;
  let landed = false;
  for (let round = 1; round <= ROUNDS && !landed; round += 1) {
    if (round > 1) {
      process.stderr.write(
        `\n  round ${String(round)}/${String(ROUNDS)}: re-publishing what the registry is missing.\n`
          + "  (publishing an already-published version is a no-op)\n\n",
      );
    }
    const status = publishOnce();
    if (status !== 0) {
      process.stderr.write(`  pnpm publish exited ${String(status)} on round ${String(round)}.\n`);
    }
    landed = verified();
  }

  if (!landed) {
    process.stderr.write(
      `\nRELEASE FAILED: ${version} is still not fully on the registry after ${String(ROUNDS)} `
        + "publish rounds.\n"
        + "  This is past what npm's own processing delay explains. Check\n"
        + "  https://status.npmjs.org and the packument directly before re-running:\n"
        + `    curl -s https://registry.npmjs.org/@nukesai-pos%2fcli | jq '.versions["${version}"] != null'\n`
        + "  See RELEASING.md > When a release goes red.\n\n",
    );
    process.exit(1);
  }

  if (tag === "latest") {
    // Graduate the QA channel onto the GA build. Without this, `beta` keeps
    // pointing at the last pre-release — which is BELOW `latest` — so
    // `npm i @nukesai-pos/cli@beta` would downgrade a QA box every time
    // staging's queue happened to be empty.
    //
    // `canary` is deliberately left alone: it must keep pointing at a
    // 0.0.0-canary-* build, which is what makes it unreachable by any ordinary
    // semver range and therefore installable only on purpose.
    for (const name of packageNames()) {
      run("npm", ["dist-tag", "add", `${name}@${version}`, "beta"]);
    }
    run("node", ["scripts/verify-published.mjs", "--version", version, "--tag", "beta"]);
  }
};

await main();
