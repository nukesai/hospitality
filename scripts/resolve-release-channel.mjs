#!/usr/bin/env node
/**
 * Resolves the npm dist-tag for a publish. Fails closed.
 *
 * THE BRANCH IS THE CHANNEL. Nothing else selects it — not a flag, not a
 * human, not `.changeset/pre.json`. A merge into `development` publishes a
 * canary, a merge into `staging` publishes a beta, a merge into `main`
 * publishes production. There is no default channel and no branch that
 * "probably" means production.
 *
 * Why this exists rather than `publishConfig.tag`: pnpm does not read that
 * field. Its bundle references publishConfig.directory, .executableFiles,
 * .registry and .linkDirectory — never .tag — and `pnpm publish --help` states
 * "By default, the 'latest' tag is used." So a `publishConfig.tag` of "beta"
 * would be silently ignored and the package would land on the production
 * channel. The tag MUST arrive as an explicit `--tag` argument, and this script
 * is what computes it.
 *
 * WHY PRE MODE IS NOW A REFUSAL RATHER THAN A CHANNEL. Two reasons, both fatal:
 *
 *   1. It cannot advance its counter without committed state. The `-beta.N`
 *      counter is read off the version already on disk
 *      (@changesets/assemble-release-plan dist/index.mjs:235-239), so a branch
 *      that stamps without committing recomputes `-beta.0` forever — and npm
 *      rejects the second publish of a version.
 *   2. A `pre.json` that reaches `main` makes production publish to the beta
 *      tag EVEN WITH RELEASE_ALLOW_LATEST=1. That was this file's own previous
 *      behaviour ("pre mode outranks the opt-in"), and it is exactly the kind
 *      of silent mis-channelling this guard exists to prevent.
 *
 * Its mere presence is therefore a hard refusal.
 *
 * Usage:
 *   node scripts/resolve-release-channel.mjs            # prints the tag, nothing else
 *   node scripts/resolve-release-channel.mjs --assert   # validates, explains, exit 0/1
 *
 * stdout carries ONLY the tag so `--tag "$(...)"` is safe. Everything else
 * goes to stderr.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The fixed version group (.changeset/config.json `fixed`). */
const PUBLISHED = ["common", "backend", "frontend", "cli"];

/**
 * The whole policy, in one table. A branch not named here cannot publish.
 *
 * The shapes are not decoration: they are what catches a stamper that did not
 * run, or ran for a different channel. `main` publishing a `-beta.` version
 * would put an unfinished build on `latest` with every other check green.
 */
export const CHANNELS = {
  development: { tag: "canary", shape: /^0\.0\.0-canary-\d{14}-[0-9a-f]{7,40}$/ },
  staging: { tag: "beta", shape: /^\d+\.\d+\.\d+-beta\.\d{14}\.sha-[0-9a-f]{7,40}$/ },
  main: { tag: "latest", shape: /^\d+\.\d+\.\d+$/ },
};

export class ChannelError extends Error {}

const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));

/** Every published package's version, keyed by package name. */
export const packageVersions = () =>
  PUBLISHED.map((dir) => {
    const pkg = readJson(`packages/${dir}/package.json`);
    return { name: pkg.name, version: pkg.version };
  });

/** `.changeset/pre.json` if changesets is in (or has just exited) pre mode. */
export const preState = () => {
  const file = path.join(ROOT, ".changeset", "pre.json");
  if (!existsSync(file)) return null;
  return readJson(".changeset/pre.json");
};

/**
 * The branch being published. `RELEASE_BRANCH` is for local verification only;
 * in CI `GITHUB_REF_NAME` is authoritative. When neither is set and git cannot
 * answer, we refuse rather than guess — an undeterminable branch must never
 * fall through to a channel.
 */
export const currentBranch = () => {
  if (typeof process.env.RELEASE_BRANCH === "string" && process.env.RELEASE_BRANCH.length > 0) {
    return process.env.RELEASE_BRANCH;
  }
  if (typeof process.env.GITHUB_REF_NAME === "string" && process.env.GITHUB_REF_NAME.length > 0) {
    return process.env.GITHUB_REF_NAME;
  }
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

/**
 * Versioning is FIXED across the four published packages. Skew means a
 * half-applied `changeset version`; publishing it would split consumers across
 * versions, and every dist-tag move would then have to be applied per-package
 * to un-split them.
 */
const assertLockstep = (versions) => {
  const distinct = [...new Set(versions.map((v) => v.version))];
  if (distinct.length !== 1) {
    throw new ChannelError(
      `fixed version group is not in lockstep: ${versions
        .map((v) => `${v.name}@${v.version}`)
        .join(", ")}. A partial version bump must never be published.`,
    );
  }
  return distinct[0];
};

export const resolveChannel = ({ versions, pre, branch, allowLatest }) => {
  const notes = [];
  const version = assertLockstep(versions);

  if (pre !== null) {
    throw new ChannelError(
      ".changeset/pre.json exists. This pipeline derives the channel from the branch and "
        + "stamps pre-release versions directly; pre mode freezes the -beta.N counter and can "
        + "hijack the dist-tag on main. Delete it.",
    );
  }

  // Object.hasOwn, not `in`: AGENTS.md — `in` walks the prototype chain, so a
  // branch literally named `constructor` or `toString` would otherwise resolve
  // to a truthy value and reach the shape check with an undefined channel.
  const channel = Object.hasOwn(CHANNELS, branch) ? CHANNELS[branch] : undefined;
  if (channel === undefined) {
    throw new ChannelError(
      `refusing to publish from branch "${branch}": no release channel is defined for it.\n`
        + `  release branches: ${Object.keys(CHANNELS).join(", ")}\n`
        + "This is a fail-closed guard: there is no default channel.",
    );
  }

  if (!channel.shape.test(version)) {
    throw new ChannelError(
      `refusing to publish ${version} from "${branch}": wrong shape for the "${channel.tag}" `
        + `channel (${String(channel.shape)}). The stamper did not run, or ran for a different `
        + "channel.",
    );
  }

  if (channel.tag === "latest" && !allowLatest) {
    throw new ChannelError(
      'refusing to publish to "latest": RELEASE_ALLOW_LATEST is not set. It is a variable on '
        + "the `production` GitHub environment; a job outside that environment must never be "
        + "able to reach the production channel.",
    );
  }

  if (channel.tag !== "latest" && allowLatest) {
    throw new ChannelError(
      `refusing to publish ${version} from "${branch}": RELEASE_ALLOW_LATEST is set on a `
        + "pre-release channel. The environment restriction is misconfigured — only the "
        + "`production` environment may carry that variable.",
    );
  }

  notes.push(`branch "${branch}" -> channel "${channel.tag}"`);
  notes.push(`version ${version} matches the channel shape`);
  return { tag: channel.tag, version, notes };
};

const main = () => {
  const assert = process.argv.includes("--assert");
  const allowLatest = process.env.RELEASE_ALLOW_LATEST === "1";

  let resolved;
  try {
    resolved = resolveChannel({
      versions: packageVersions(),
      pre: preState(),
      branch: currentBranch(),
      allowLatest,
    });
  } catch (error) {
    process.stderr.write(
      `\nRELEASE CHANNEL GUARD: ${error instanceof Error ? error.message : String(error)}\n\n`,
    );
    process.exit(1);
  }

  if (assert) {
    for (const note of resolved.notes) process.stderr.write(`  ${note}\n`);
    process.stderr.write(`  -> publishing ${resolved.version} under dist-tag "${resolved.tag}"\n`);
    return;
  }
  // stdout is consumed by `--tag "$(...)"`: the tag and nothing else.
  process.stdout.write(resolved.tag);
};

// Importable for tests; only the CLI path touches process.
if (process.argv[1] === import.meta.filename) main();
