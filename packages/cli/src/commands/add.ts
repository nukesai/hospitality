import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { assertCleanWorktree } from "../utils/git.js";
import { readManifest, writeManifest, type Manifest } from "../utils/manifest.js";
import {
  POS_FEATURES,
  renderRoutersApp,
  ROUTER_MARKERS,
  routerBlocks,
  type PosFeatureTemplate,
} from "../templates/plan.js";

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

/** Splices the composition blocks (core + features, PACKAGE imports) into the
 *  marker blocks of _app.ts, leaving everything outside them untouched. */
export const spliceRouters = (
  source: string,
  features: readonly string[],
  registry: Readonly<Record<string, PosFeatureTemplate>> = POS_FEATURES,
): string => {
  const { importsOpen, importsClose, routersOpen, routersClose } = ROUTER_MARKERS;
  for (const marker of [importsOpen, importsClose, routersOpen, routersClose]) {
    if (!source.includes(marker)) {
      throw new Error(
        `server/routers/_app.ts is missing the "${marker}" marker — restore it (or re-run \`nukes-pos init\`) so features can be managed.`,
      );
    }
  }
  const { importsBlock, bindingsBlock } = routerBlocks(features, registry);
  const beforeImports = source.slice(0, source.indexOf(importsOpen));
  const betweenBlocks = source.slice(
    source.indexOf(importsClose) + importsClose.length,
    source.indexOf(routersOpen),
  );
  const after = source.slice(source.indexOf(routersClose) + routersClose.length);
  return `${beforeImports}${importsBlock}${betweenBlocks}${bindingsBlock}${after}`;
};

/** Wires features in: routers are PACKAGE code, so `add` only re-splices the
 *  composition markers and records the feature — no files materialized. */
export async function runAdd(
  features: readonly string[],
  options: AddOptions,
  registry: Readonly<Record<string, PosFeatureTemplate>> = POS_FEATURES,
): Promise<AddReport> {
  // Same contract as init: never write into a dirty customer worktree.
  assertCleanWorktree(options.cwd, options.force || options.dryRun);

  const manifest = await readManifest(options.cwd);
  if (manifest === null) {
    throw new Error("No nukes-pos.json found. Run `nukes-pos init` first.");
  }

  const unknown = features.filter((feature) => !(feature in registry));
  if (unknown.length > 0) {
    return { added: [], alreadyPresent: [], unknown };
  }

  const alreadyPresent = features.filter((feature) => manifest.features.includes(feature));
  const added = features.filter((feature) => !manifest.features.includes(feature));

  if (added.length > 0) {
    const nextFeatures = [...manifest.features, ...added];
    const srcDir = manifest.files.some((file) => file.startsWith("src/"));
    const prefix = srcDir ? "src/" : "";

    // The default scaffold has NO server dir (route.ts consumes posCoreRouter);
    // the extension file materializes the first time features are managed.
    const appRelative = `${prefix}server/routers/_app.ts`;
    const appPath = path.resolve(options.cwd, appRelative);
    if (existsSync(appPath)) {
      const source = await readFile(appPath, "utf8");
      const spliced = spliceRouters(source, nextFeatures, registry);
      if (!options.dryRun && spliced !== source) await writeFile(appPath, spliced);
    } else if (!options.dryRun) {
      await mkdir(path.dirname(appPath), { recursive: true });
      await writeFile(appPath, renderRoutersApp(nextFeatures, registry));
    }

    const next: Manifest = {
      ...manifest,
      features: nextFeatures,
      files: [...new Set([...manifest.files, appRelative])],
    };
    if (!options.dryRun) await writeManifest(options.cwd, next);
  }

  return { added, alreadyPresent, unknown: [] };
}
