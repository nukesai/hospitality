import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CONSUMER_DEPENDENCIES } from "../templates/plan.js";

export interface DependencyReport {
  readonly added: readonly string[];
  readonly kept: readonly string[];
}

/**
 * The range written into a scaffolded app for the three @nukesai-pos packages.
 *
 * A caret on a canary is a dead end. `^0.0.0-canary-<ts>-<sha>` expands to
 * `>=0.0.0-canary-<ts>-<sha> <0.0.1-0`, which can never resolve a stable
 * release and floats onto every future snapshot — so an app scaffolded from a
 * canary would silently track canaries forever. Pin those exactly.
 *
 * Beta and stable keep the caret, and that is the point of the channel design:
 * `^1.2.0-beta.<ts>.sha-<sha>` graduates a scaffolded app onto the 1.2.0 GA and
 * on to 1.3.0 without the consumer editing a file they did not write.
 *
 * This is why the first release of the branch-based pipeline is 1.0.0 and not
 * 0.2.0. At 0.x a caret cannot cross a minor —
 * `semver.satisfies("0.2.0", "^0.1.0") === false` — so every app scaffolded at
 * 0.1.0 is frozen there. At 1.x carets work.
 */
export const posRange = (cliVersion: string): string =>
  cliVersion.startsWith("0.0.0-") ? cliVersion : `^${cliVersion}`;

/**
 * Adds every dependency the scaffold needs to the consumer package.json.
 * A package already declared in ANY dependency section is never touched (the
 * consumer's resolution wins); the
 * three @nukesai-pos packages ride the CLI's version — the fixed version
 * group guarantees they exist at that version together.
 */
export async function injectConsumerDependencies(
  cwd: string,
  cliVersion: string,
  dryRun: boolean,
): Promise<DependencyReport> {
  const manifestPath = path.resolve(cwd, "package.json");
  const raw = await readFile(manifestPath, "utf8");
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  pkg.dependencies ??= {};
  // "The consumer's resolution wins" means ANY section: an entry that only
  // exists in devDependencies is still what their code resolves, so adding a
  // second (different-major) entry under dependencies would silently switch it.
  const declared = new Set([
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  const range = posRange(cliVersion);
  const wanted: Record<string, string> = {
    "@nukesai-pos/backend": range,
    "@nukesai-pos/common": range,
    "@nukesai-pos/frontend": range,
    ...CONSUMER_DEPENDENCIES,
  };

  const added: string[] = [];
  const kept: string[] = [];
  for (const [name, version] of Object.entries(wanted)) {
    if (!declared.has(name)) {
      pkg.dependencies[name] = version;
      added.push(name);
    } else {
      kept.push(name);
    }
  }

  if (added.length > 0 && !dryRun) {
    const sorted = Object.fromEntries(
      Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
    );
    pkg.dependencies = sorted;
    await writeFile(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return { added, kept };
}
