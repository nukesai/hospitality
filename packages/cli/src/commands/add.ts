import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { assertCleanWorktree } from "../utils/git.js";
import { readManifest, writeManifest, type Manifest } from "../utils/manifest.js";
import {
  POS_FEATURES,
  renderRoutersApp,
  ROUTER_MARKER_ORDER,
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
  /** Ledgered path of the app-local composition file, when one is managed. */
  readonly extensionFile?: string;
  /** True when this run materialized that file (the consumer must repoint the
   *  route import at its `appRouter`). */
  readonly extensionCreated?: boolean;
}

const occurrences = (source: string, marker: string): number => source.split(marker).length - 1;

const markerFault = (detail: string): Error =>
  new Error(
    `server/routers/_app.ts ${detail} — restore the marker blocks (or delete the file and re-run \`nukes-pos add\`) so features can be managed.`,
  );

/** Splices the composition blocks (core + features, PACKAGE imports) into the
 *  marker blocks of _app.ts, leaving everything outside them untouched.
 *  Every marker must appear EXACTLY once, in order: the splice is index-based,
 *  so a duplicated block (a both-sides merge resolution) would emit duplicate
 *  imports and an inverted pair would silently delete the code between the
 *  blocks — the user's own procedures. */
export const spliceRouters = (
  source: string,
  features: readonly string[],
  registry: Readonly<Record<string, PosFeatureTemplate>> = POS_FEATURES,
): string => {
  const { importsOpen, importsClose, routersOpen, routersClose } = ROUTER_MARKERS;
  for (const marker of ROUTER_MARKER_ORDER) {
    const count = occurrences(source, marker);
    if (count === 0) throw markerFault(`is missing the "${marker}" marker`);
    if (count > 1) throw markerFault(`has ${String(count)} "${marker}" markers, expected one`);
  }
  let previous = -1;
  for (const marker of ROUTER_MARKER_ORDER) {
    const at = source.indexOf(marker);
    if (at < previous) throw markerFault("has its marker blocks out of order");
    previous = at;
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

/**
 * Wires features into the app-local composition file. Routers are PACKAGE code,
 * so `add` never materializes a router — it materializes (once) the single
 * `server/routers/_app.ts` that composes them next to the app's own procedures,
 * re-splices its marker blocks, and records everything in the ledger.
 */
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
  const nextFeatures = [...manifest.features, ...added];

  const srcDir = manifest.files.some((file) => file.startsWith("src/"));
  const prefix = srcDir ? "src/" : "";
  const appRelative = `${prefix}server/routers/_app.ts`;
  const appPath = path.resolve(options.cwd, appRelative);

  // `add` is ALSO the command that materializes the extension file: the default
  // scaffold has NO server/ directory (route.ts consumes posCoreRouter), so an
  // app that wants its own procedures runs `nukes-pos add` — with or without a
  // new feature name. Gating the write on "the feature set changed" made that
  // documented flow unreachable for every default install.
  const extensionCreated = !existsSync(appPath);
  if (extensionCreated) {
    if (!options.dryRun) {
      await mkdir(path.dirname(appPath), { recursive: true });
      await writeFile(appPath, renderRoutersApp(nextFeatures, registry));
    }
  } else {
    const source = await readFile(appPath, "utf8");
    const spliced = spliceRouters(source, nextFeatures, registry);
    if (!options.dryRun && spliced !== source) await writeFile(appPath, spliced);
  }

  const next: Manifest = {
    ...manifest,
    features: nextFeatures,
    files: [...new Set([...manifest.files, appRelative])],
  };
  if (!options.dryRun) await writeManifest(options.cwd, next);

  return {
    added,
    alreadyPresent,
    unknown: [],
    extensionFile: appRelative,
    extensionCreated,
  };
}
