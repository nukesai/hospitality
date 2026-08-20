import { readManifest, writeManifest } from "../utils/manifest.js";
import { writeGenerated, type WriteOutcome } from "../utils/generated.js";
import { planFiles } from "../templates/plan.js";

export interface UpgradeOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly version: string;
}

export interface UpgradeReport {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly plan: readonly { readonly file: string; readonly action: WriteOutcome }[];
}

/**
 * Regenerates every ledgered file for the installed CLI version: pristine
 * files are rewritten in place, hand-edited files get a `<file>.new` beside
 * them (never clobbered), and the manifest records the new version.
 */
export async function runUpgrade(options: UpgradeOptions): Promise<UpgradeReport> {
  const manifest = await readManifest(options.cwd);
  if (manifest === null) {
    throw new Error("No nukes-pos.json found. Run `nukes-pos init` first.");
  }

  const srcDir = manifest.files.some((file) => file.startsWith("src/"));
  const i18nRouting = manifest.files.some((file) => file.includes("[locale]"));
  const files = planFiles({ srcDir, i18nRouting, features: manifest.features });

  const plan: { file: string; action: WriteOutcome }[] = [];
  for (const file of files) {
    const result = await writeGenerated(options.cwd, file.path, file.body, options.dryRun);
    plan.push({ file: result.path, action: result.outcome });
  }

  if (!options.dryRun) {
    await writeManifest(options.cwd, {
      ...manifest,
      version: options.version,
      files: files.map((file) => file.path),
    });
  }

  return { fromVersion: manifest.version, toVersion: options.version, plan };
}
