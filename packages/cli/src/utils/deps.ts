import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CONSUMER_DEPENDENCIES } from "../templates/plan.js";

export interface DependencyReport {
  readonly added: readonly string[];
  readonly kept: readonly string[];
}

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

  const wanted: Record<string, string> = {
    "@nukesai-pos/backend": `^${cliVersion}`,
    "@nukesai-pos/common": `^${cliVersion}`,
    "@nukesai-pos/frontend": `^${cliVersion}`,
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
