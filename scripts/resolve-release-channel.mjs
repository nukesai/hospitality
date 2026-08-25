#!/usr/bin/env node
/**
 * Resolves the npm dist-tag for a publish, from repository STATE rather than
 * from whoever typed the command. Fails closed.
 *
 * Why this exists rather than `publishConfig.tag`: pnpm does not read that
 * field. Its bundle references publishConfig.directory, .executableFiles,
 * .registry and .linkDirectory — never .tag — and `pnpm publish --help` states
 * "By default, the 'latest' tag is used." So a `publishConfig.tag` of "beta"
 * would be silently ignored and the package would land on the production
 * channel. The tag MUST arrive as an explicit `--tag` argument, and this script
 * is what computes it.
 *
 * Channels:
 *   canary  0.0.0-canary-<UTC>  every merge to main; unreachable by any semver
 *                               range, so it can only be installed on purpose
 *   beta    0.2.0-beta.N        changesets pre mode; `pre.json.tag` decides
 *   latest  0.2.0               production; requires RELEASE_ALLOW_LATEST=1
 *
 * Usage:
 *   node scripts/resolve-release-channel.mjs            # prints the tag, nothing else
 *   node scripts/resolve-release-channel.mjs --assert    # validates, explains, exit 0/1
 *
 * stdout carries ONLY the tag so `--tag "$(...)"` is safe. Everything else
 * goes to stderr.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The fixed version group (.changeset/config.json `fixed`). */
const PUBLISHED = ["common", "backend", "frontend", "cli"];

const CANARY_VERSION = /^0\.0\.0-canary-/;

class ChannelError extends Error {}

const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));

/** Every published package's version, keyed by package name. */
const packageVersions = () =>
  PUBLISHED.map((dir) => {
    const pkg = readJson(`packages/${dir}/package.json`);
    return { name: pkg.name, version: pkg.version };
  });

/** `.changeset/pre.json` if changesets is in (or has just exited) pre mode. */
const preState = () => {
  const file = path.join(ROOT, ".changeset", "pre.json");
  if (!existsSync(file)) return null;
  return readJson(".changeset/pre.json");
};

export const resolveChannel = ({ versions, pre, allowLatest }) => {
  const notes = [];

  // Versioning is FIXED across the four published packages. Skew means a
  // half-applied `changeset version`; publishing it would split consumers
  // across versions, and every dist-tag move would then have to be applied
  // per-package to un-split them.
  const distinct = [...new Set(versions.map((v) => v.version))];
  if (distinct.length !== 1) {
    throw new ChannelError(
      `fixed version group is not in lockstep: ${versions
        .map((v) => `${v.name}@${v.version}`)
        .join(", ")}. Re-run \`pnpm version-packages\`.`,
    );
  }
  const version = distinct[0];
  const isPrerelease = version.includes("-");

  // A snapshot build is self-identifying, so canary never depends on a human
  // remembering a flag.
  if (CANARY_VERSION.test(version)) {
    notes.push(`snapshot version ${version} detected`);
    if (allowLatest) {
      throw new ChannelError(
        `refusing to publish snapshot ${version}: RELEASE_ALLOW_LATEST is set, but a `
          + `0.0.0-canary-* build must never reach the production channel.`,
      );
    }
    return { tag: "canary", version, notes };
  }

  if (pre !== null && pre.mode === "pre") {
    if (typeof pre.tag !== "string" || pre.tag.length === 0) {
      throw new ChannelError(".changeset/pre.json is in pre mode but carries no tag.");
    }
    if (pre.tag === "latest") {
      throw new ChannelError(
        '.changeset/pre.json uses the tag "latest", which would publish a pre-release '
          + "onto the production channel. Use beta/next/rc.",
      );
    }
    notes.push(`changesets is in pre mode (tag "${pre.tag}")`);
    // Deliberately ignored rather than honoured: pre mode outranks the opt-in,
    // so a stale RELEASE_ALLOW_LATEST in the environment cannot promote a beta.
    if (allowLatest) {
      notes.push("RELEASE_ALLOW_LATEST is set but pre mode wins — publishing to the pre tag");
    }
    return { tag: pre.tag, version, notes };
  }

  if (!allowLatest) {
    throw new ChannelError(
      `refusing to publish ${version} with no channel selected.\n`
        + "  - for a pre-release train: `pnpm changeset pre enter beta` and commit .changeset/pre.json\n"
        + "  - for production: set RELEASE_ALLOW_LATEST=1 deliberately\n"
        + "This is a fail-closed guard: there is no default channel.",
    );
  }

  // Belt and braces for a forgotten `changeset pre exit`: pre.json would read
  // {"mode":"exit"} while the versions still carry -beta.N.
  if (isPrerelease) {
    throw new ChannelError(
      `refusing to publish pre-release ${version} to "latest". Run \`pnpm changeset pre exit\` `
        + "and `pnpm version-packages` so the versions become stable first.",
    );
  }

  notes.push("RELEASE_ALLOW_LATEST=1 — publishing to the production channel");
  return { tag: "latest", version, notes };
};

const main = () => {
  const assert = process.argv.includes("--assert");
  const allowLatest = process.env.RELEASE_ALLOW_LATEST === "1";

  let resolved;
  try {
    resolved = resolveChannel({ versions: packageVersions(), pre: preState(), allowLatest });
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
