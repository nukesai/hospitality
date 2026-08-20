import { assertCleanWorktree } from "../utils/git.js";
import { readManifest, writeManifest, type Manifest } from "../utils/manifest.js";

export interface AddOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly force: boolean;
}

export interface AddReport {
  readonly added: readonly string[];
  readonly alreadyPresent: readonly string[];
  readonly unknown: readonly string[];
}

/**
 * Feature registry. Deliberately EMPTY in the foundation release: surfaces
 * (orders, kitchen display, reports, …) register here as they ship. `add`
 * already validates, dedupes and persists so the workflow is stable from day
 * one.
 */
export const KNOWN_FEATURES: readonly string[] = [];

export async function runAdd(
  features: readonly string[],
  options: AddOptions,
  registry: readonly string[] = KNOWN_FEATURES,
): Promise<AddReport> {
  // Same contract as init: never write into a dirty customer worktree.
  assertCleanWorktree(options.cwd, options.force || options.dryRun);

  const manifest = await readManifest(options.cwd);
  if (manifest === null) {
    throw new Error("No nukes-pos.json found. Run `nukes-pos init` first.");
  }

  const unknown = features.filter((feature) => !registry.includes(feature));
  if (unknown.length > 0) {
    return { added: [], alreadyPresent: [], unknown };
  }

  const alreadyPresent = features.filter((feature) => manifest.features.includes(feature));
  const added = features.filter((feature) => !manifest.features.includes(feature));

  if (added.length > 0 && !options.dryRun) {
    const next: Manifest = { ...manifest, features: [...manifest.features, ...added] };
    await writeManifest(options.cwd, next);
  }

  return { added, alreadyPresent, unknown: [] };
}
