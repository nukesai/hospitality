#!/usr/bin/env node
/**
 * Stamps the QA-channel (beta) version into the four published manifests.
 *
 * MUTATES THE WORKING TREE AND MUST NEVER BE COMMITTED. It runs in CI on a
 * disposable checkout, immediately before `pnpm publish`. Only `main` commits
 * version bumps; that is what keeps promotion merges conflict-free.
 *
 * WHY `changeset version` AND NOT `changeset status --output`:
 *
 * `status` resolves `config.baseBranch` as a BARE git ref
 * (cli/dist/versionablePackages.mjs:6 -> @changesets/git@4.0.0 dist/index.mjs:37,41,
 * `git merge-base main HEAD`). After `actions/checkout` only `refs/remotes/origin/main`
 * exists, so on a `staging` checkout it dies with:
 *
 *     Failed to find where HEAD diverged from "main". Does main exist?
 *
 * `--since=origin/main` is NOT the fix: status.mjs:20 passes `since` to
 * `readChangesets` as well, so changesets that already exist at the merge base are
 * silently dropped and the computed version comes out UNDER the truth (0.1.1 where
 * main will ship 0.2.0). Its plan also carries a 5th entry, `@nukesai-pos/example`
 * at type "none", which is not a member of the fixed group.
 *
 * `changeset version` touches NO git refs on the non-empty-queue path (cli/dist/
 * version.mjs uses git only for --snapshot's commit id and for git.add/git.commit,
 * which `config.commit: false` disables). Verified on a checkout where
 * `git rev-parse main` fails outright: exit 0, four packages 0.1.0 -> 0.2.0,
 * apps/example untouched at 0.0.0, working tree only.
 *
 * WHY NOT `changeset version --snapshot`: it exits 1 on an empty queue
 * (version.mjs:56 "No unreleased changesets found."), which would redden every
 * docs-only merge, and its snapshot options are global — a `useCalculatedVersion`
 * set for beta would give canary a real base version and destroy the channel
 * isolation that makes `0.0.0-canary-*` unreachable by any ordinary range.
 *
 * Usage:  node scripts/stamp-prerelease-version.mjs --channel beta
 * stdout: the stamped version, or NOTHING AT ALL when there is nothing to publish.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchPackument } from "./verify-published.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The fixed version group (.changeset/config.json `fixed`). */
const PUBLISHED = ["common", "backend", "frontend", "cli"];

const STABLE = /^\d+\.\d+\.\d+$/;

const manifest = (dir) => path.join(ROOT, "packages", dir, "package.json");
const readManifest = (dir) => JSON.parse(readFileSync(manifest(dir), "utf8"));

const die = (message) => {
  process.stderr.write(`\nPRERELEASE STAMP: ${message}\n\n`);
  process.exit(1);
};

/** UTC yyyymmddhhmmss — monotonic, so betas sort in publication order. */
const stamp = () => new Date().toISOString().replace(/[-:T]/gu, "").slice(0, 14);

/** The four current versions, asserted to be in lockstep. */
const lockstepVersion = () => {
  const entries = PUBLISHED.map((dir) => readManifest(dir));
  const distinct = [...new Set(entries.map((pkg) => pkg.version))];
  if (distinct.length !== 1) {
    die(
      `fixed version group is not in lockstep: ${entries
        .map((pkg) => `${pkg.name}@${pkg.version}`)
        .join(", ")}. Refusing to compute a release from a split group.`,
    );
  }
  return distinct[0];
};

/** Pending changeset files. `README.md` ships with the directory and is not one. */
const queueLength = () =>
  readdirSync(path.join(ROOT, ".changeset")).filter(
    (file) => file.endsWith(".md") && file !== "README.md",
  ).length;

/**
 * Compares two STABLE versions. Both sides are stable by construction here — the
 * registry side is a `latest` dist-tag and the local side is asserted above — so
 * a three-integer compare is exact and the pnpm catalog needs no `semver`
 * dependency (AGENTS.md: no dependencies outside the catalog).
 */
export const isGreater = (a, b) => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
};

/**
 * The one guard that catches a `staging` which never got back-merged after a
 * production release: its computed version would be at or below what is already
 * on `latest`, so the beta would be a downgrade for anyone tracking it.
 */
const assertNewerThanRegistry = async (version) => {
  for (const dir of PUBLISHED) {
    const { name } = readManifest(dir);
    let latest;
    try {
      latest = (await fetchPackument(name))["dist-tags"]?.latest;
    } catch (error) {
      die(
        `could not reach the registry to check ${name}: `
          + `${error instanceof Error ? error.message : String(error)}. `
          + "Refusing to stamp a beta that might be a downgrade.",
      );
    }
    if (latest === undefined) continue; // never published: anything is newer
    if (!STABLE.test(latest)) {
      die(`${name}@latest is ${latest}, which is not a stable version. Fix the registry first.`);
    }
    if (!isGreater(version, latest)) {
      die(
        `computed ${version}, but ${name}@latest is already ${latest}.\n`
          + "  A beta must be strictly newer than production, or it is a downgrade for\n"
          + "  everyone tracking the `beta` tag. This almost always means `staging` was\n"
          + "  never back-merged after the last production release. Merge `main` down\n"
          + "  into `staging` and re-run.",
      );
    }
  }
};

const shortSha = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Unlike a canary, a beta goes to pilot customers and must be traceable to
    // the commit that produced it. No git, no stamp.
    return die("git is unavailable, so this beta could not be traced to a commit.");
  }
};

const main = async () => {
  const channel = process.argv[process.argv.indexOf("--channel") + 1];
  if (channel !== "beta") {
    die(`usage: stamp-prerelease-version.mjs --channel beta (got ${String(channel)})`);
  }

  // Verified poison: with a pre.json present, changesets freezes the counter and
  // every run recomputes the same -beta.0, which npm rejects on the second publish.
  if (existsSync(path.join(ROOT, ".changeset", "pre.json"))) {
    die(".changeset/pre.json exists. Pre mode is abolished in this pipeline — delete it.");
  }

  const before = lockstepVersion();

  if (queueLength() === 0) {
    // A docs-only merge is a legitimate no-op, not a failure.
    process.stderr.write("  changeset queue is empty — nothing to publish.\n");
    return;
  }

  execFileSync("pnpm", ["exec", "changeset", "version"], {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });

  const after = lockstepVersion();

  if (after === before) {
    // A queue of `changeset add --empty` files consumes cleanly but bumps nothing.
    process.stderr.write(`  version is unchanged at ${after} — nothing to publish.\n`);
    return;
  }

  if (!STABLE.test(after)) {
    die(
      `computed ${after}, which is not a stable version. A pre-release base means the branch `
        + "carries drift or a leaked stamp; the beta suffix is added by this script alone.",
    );
  }

  await assertNewerThanRegistry(after);

  const version = `${after}-beta.${stamp()}.sha-${shortSha()}`;

  for (const dir of PUBLISHED) {
    const pkg = readManifest(dir);
    pkg.version = version;
    writeFileSync(manifest(dir), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    process.stderr.write(`  ${pkg.name} -> ${version}\n`);
  }

  // Sibling deps use `workspace:^`; pnpm rewrites them at pack time from the
  // version now in the workspace, so the tarballs pair beta with beta.
  process.stderr.write("  stamped. DO NOT COMMIT: this checkout is disposable.\n");
  process.stdout.write(version);
};

if (process.argv[1] === import.meta.filename) await main();
