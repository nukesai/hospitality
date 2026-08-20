import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { assertCleanWorktree } from "../utils/git.js";
import { writeGenerated } from "../utils/generated.js";
import { readManifest, writeManifest, type Manifest } from "../utils/manifest.js";
import { POS_FEATURES, ROUTER_MARKERS, type PosFeatureTemplate } from "../templates/plan.js";

export interface AddOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly force: boolean;
}

export interface AddReport {
  readonly added: readonly string[];
  readonly alreadyPresent: readonly string[];
  readonly unknown: readonly string[];
  readonly conflicted: readonly string[];
}

/** Splices the feature imports/bindings into the marker blocks of _app.ts,
 *  leaving everything the consumer wrote outside the markers untouched. */
export const spliceRouters = (source: string, features: readonly PosFeatureTemplate[]): string => {
  const { importsOpen, importsClose, routersOpen, routersClose } = ROUTER_MARKERS;
  for (const marker of [importsOpen, importsClose, routersOpen, routersClose]) {
    if (!source.includes(marker)) {
      throw new Error(
        `server/routers/_app.ts is missing the "${marker}" marker — restore it (or re-run \`nukes-pos init\`) so features can be managed.`,
      );
    }
  }
  const imports = features
    .map((f) => `import { ${f.routerExport} } from "./${f.name}";`)
    .join("\n");
  const bindings = features.map((f) => `  ${f.name}: ${f.routerExport},`).join("\n");
  const importsBlock = `${importsOpen}\n${imports}${imports === "" ? "" : "\n"}${importsClose}`;
  const routersBlock = `${routersOpen}\n${bindings}${bindings === "" ? "" : "\n"}  ${routersClose}`;
  const beforeImports = source.slice(0, source.indexOf(importsOpen));
  const betweenBlocks = source.slice(
    source.indexOf(importsClose) + importsClose.length,
    source.indexOf(routersOpen),
  );
  const after = source.slice(source.indexOf(routersClose) + routersClose.length);
  return `${beforeImports}${importsBlock}${betweenBlocks}${routersBlock}${after}`;
};

/** Materializes feature routers: writes the router file from the registry and
 *  re-splices _app.ts. The registry is the only source — nothing hardcoded. */
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
    return { added: [], alreadyPresent: [], unknown, conflicted: [] };
  }

  const alreadyPresent = features.filter((feature) => manifest.features.includes(feature));
  const added = features.filter((feature) => !manifest.features.includes(feature));
  const conflicted: string[] = [];

  if (added.length > 0) {
    const nextFeatures = [...manifest.features, ...added];
    const srcDir = manifest.files.some((file) => file.startsWith("src/"));
    const prefix = srcDir ? "src/" : "";
    const active = nextFeatures
      .map((name) => registry[name])
      .filter((feature): feature is PosFeatureTemplate => feature !== undefined);

    const addedFeatures = added
      .map((name) => registry[name])
      .filter((feature): feature is PosFeatureTemplate => feature !== undefined);
    for (const feature of addedFeatures) {
      const result = await writeGenerated(
        options.cwd,
        `${prefix}${feature.routerFile}`,
        feature.body,
        options.dryRun,
      );
      if (result.outcome === "conflicted") conflicted.push(result.path);
    }

    const appPath = path.resolve(options.cwd, `${prefix}server/routers/_app.ts`);
    const source = await readFile(appPath, "utf8");
    const spliced = spliceRouters(source, active);
    if (!options.dryRun && spliced !== source) await writeFile(appPath, spliced);

    const next: Manifest = {
      ...manifest,
      features: nextFeatures,
      files: [
        ...new Set([...manifest.files, ...addedFeatures.map((f) => `${prefix}${f.routerFile}`)]),
      ],
    };
    if (!options.dryRun) await writeManifest(options.cwd, next);
  }

  return { added, alreadyPresent, unknown: [], conflicted };
}
