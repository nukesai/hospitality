import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { readManifest } from "../utils/manifest.js";
import { inspect } from "../utils/stamp.js";

export interface UpgradeOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
}

/** @public Part of the UpgradeReport surface. */
export interface UpgradePlanEntry {
  readonly file: string;
  readonly action: "regenerate" | "preserve-and-diff" | "missing" | "unstamped";
}

export interface UpgradeReport {
  readonly fromVersion: string;
  readonly plan: readonly UpgradePlanEntry[];
}

/**
 * Plan (and later apply) regeneration of every stamped file the manifest
 * tracks. Hash-stamp aware: pristine files regenerate silently, edited files
 * are preserved and get a `.new` sidecar + diff. Defaults to dry-run — the
 * CLI never rewrites a customer repo unprompted.
 */
export async function runUpgrade(options: UpgradeOptions): Promise<UpgradeReport> {
  const manifest = await readManifest(options.cwd);
  if (manifest === null) {
    throw new Error("No nukes-pos.json found. Run `nukes-pos init` first.");
  }

  const plan: UpgradePlanEntry[] = [];
  for (const file of manifest.files) {
    const absolute = path.resolve(options.cwd, file);
    if (!existsSync(absolute)) {
      plan.push({ file, action: "missing" });
      continue;
    }
    const state = inspect(await readFile(absolute, "utf8"));
    switch (state.kind) {
      case "absent":
        plan.push({ file, action: "unstamped" });
        break;
      case "pristine":
        plan.push({ file, action: "regenerate" });
        break;
      case "modified":
        plan.push({ file, action: "preserve-and-diff" });
        break;
    }
  }

  return { fromVersion: manifest.version, plan };
}
