#!/usr/bin/env node
/**
 * Refuses a changeset that covers only part of the fixed version group.
 *
 * WHY THIS EXISTS. Versioning is FIXED across the four published packages, so a
 * changeset naming only `@nukesai-pos/backend` still bumps all four. The three
 * it did not name get a bare heading with nothing under it. Reproduced on this
 * repo — a backend+cli changeset left `packages/common/CHANGELOG.md` as:
 *
 *     # @nukesai-pos/common
 *
 *     ## 0.2.0
 *
 *     ## 0.1.0
 *
 *     ### Minor Changes
 *     ...
 *
 * A consumer reading that changelog sees a released version with no notes and
 * no way to find out what changed. The release note is the whole reason this
 * repo is on changesets rather than deriving versions from commit messages, so
 * an empty one is a defect, not a cosmetic issue.
 *
 * It also enforces the rule that a PRIVATE package must never appear in a
 * changeset — `@nukesai-pos/eslint-config` slipped into one once, and a private
 * package in the queue makes `changeset version` try to version something that
 * is never published.
 *
 * Same idiom as assert-lint-bans.mjs and assert-release-channel.mjs: the script
 * IS the assertion. `scripts/` is outside vitest's `projects` and outside
 * `coverage.include` (root vitest.config.ts:19), so a unit test here would
 * never run. CI runs this on every PR.
 *
 * Run: node scripts/assert-changeset-covers-group.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHANGESET_DIR = path.join(ROOT, ".changeset");

const config = JSON.parse(readFileSync(path.join(CHANGESET_DIR, "config.json"), "utf8"));

/**
 * The fixed group, read from the config rather than hard-coded, so adding a
 * fifth published package cannot leave this check silently one short.
 */
const FIXED_GROUP = (config.fixed ?? []).flat();

if (FIXED_GROUP.length === 0) {
  process.stderr.write(
    "\nCHANGESET GROUP GUARD: .changeset/config.json declares no `fixed` group.\n\n",
  );
  process.exit(1);
}

/**
 * Frontmatter is a YAML block between the first two `---` fences, one
 * `"name": bump` per line. Parsed directly rather than via a YAML dependency:
 * AGENTS.md forbids dependencies outside the pnpm catalog, and the shape here
 * is fixed by changesets itself.
 */
const namesIn = (source) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  if (match === null) return null;
  return match[1]
    .split("\n")
    .map((line) => /^\s*["']?(?<name>[^"':]+)["']?\s*:/u.exec(line)?.groups?.name?.trim())
    .filter((name) => name !== undefined);
};

const files = readdirSync(CHANGESET_DIR).filter(
  (file) => file.endsWith(".md") && file !== "README.md",
);

const problems = [];

for (const file of files) {
  const source = readFileSync(path.join(CHANGESET_DIR, file), "utf8");
  const names = namesIn(source);

  if (names === null) {
    problems.push(`${file}: no frontmatter block — this is not a valid changeset.`);
    continue;
  }

  // An `--empty` changeset names nothing and bumps nothing. Legitimate.
  if (names.length === 0) continue;

  const inGroup = names.filter((name) => FIXED_GROUP.includes(name));
  const outsideGroup = names.filter((name) => !FIXED_GROUP.includes(name));

  if (outsideGroup.length > 0) {
    problems.push(
      `${file}: names ${outsideGroup.join(", ")}, which is not a published package. `
        + "Private packages must never appear in a changeset.",
    );
  }

  if (inGroup.length > 0 && inGroup.length !== FIXED_GROUP.length) {
    const missing = FIXED_GROUP.filter((name) => !names.includes(name));
    problems.push(
      `${file}: names ${inGroup.length} of ${FIXED_GROUP.length} packages in the fixed group.\n`
        + `      missing: ${missing.join(", ")}\n`
        + "      Versioning is FIXED, so these are released at the same version anyway —\n"
        + "      naming only some of them leaves the rest with an empty CHANGELOG section.",
    );
  }
}

if (problems.length > 0) {
  process.stderr.write("\nCHANGESET GROUP GUARD:\n");
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.stderr.write(
    "\nFix: re-run `pnpm changeset` and select ALL of:\n"
      + FIXED_GROUP.map((name) => `  ${name}\n`).join("")
      + "or edit the changeset frontmatter directly.\n\n",
  );
  process.exit(1);
}

process.stdout.write(
  files.length === 0
    ? "Changeset group guard: queue is empty.\n"
    : `Changeset group guard: ${String(files.length)} changeset(s), all cover the fixed group.\n`,
);
