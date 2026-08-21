import { detectProject, type ProjectInfo } from "../utils/detect.js";
import { assertCleanWorktree } from "../utils/git.js";
import { injectConsumerDependencies } from "../utils/deps.js";
import { ensureEnvExample } from "../utils/env-file.js";
import { writeGenerated, type WriteResult } from "../utils/generated.js";
import { createManifest, MANIFEST_NAME, readManifest, writeManifest } from "../utils/manifest.js";
import { patchNextConfig } from "../utils/patch.js";
import { isExtensionFile, planFiles, POS_FEATURES } from "../templates/plan.js";

export interface InitOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly version: string;
  /** Locale-prefixed URLs (proxy.ts + [locale] tree). Default: cookie mode. */
  readonly i18nRouting?: boolean;
  /** Features to scaffold routers for; every entry must exist in POS_FEATURES. */
  readonly features?: readonly string[];
}

export interface InitReport {
  readonly project: ProjectInfo;
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly skipped: readonly string[];
  readonly conflicted: readonly string[];
  readonly dependenciesAdded: readonly string[];
  readonly nextConfigPatched: boolean;
  readonly envExampleTouched: boolean;
}

/**
 * THE assembler: scaffolds the complete Nukes POS integration into an existing
 * Next.js App Router application — api catch-all, admin route, i18n request
 * config (+ proxy/[locale] tree when opted in), tRPC root, feature routers,
 * dependency injection, env template, next.config wrapper — every file
 * stamped, ledgered in nukes-pos.json, and upgradable. Idempotent; never
 * clobbers a hand-edited file (writes `<file>.new` instead).
 */
export async function runInit(options: InitOptions): Promise<InitReport> {
  const { cwd, dryRun, force, version } = options;
  const features = [...(options.features ?? ["orders"])];
  // Object.hasOwn, never `in`: the prototype chain would accept "constructor"
  // and "__proto__" as feature names and splice garbage into the customer's
  // router file (verified).
  const unknown = features.filter((feature) => !Object.hasOwn(POS_FEATURES, feature));
  if (unknown.length > 0) {
    throw new Error(`Unknown feature(s): ${unknown.join(", ")}`);
  }

  const project = await detectProject(cwd);
  assertCleanWorktree(cwd, force || dryRun);

  // PREFLIGHT: the next.config wrapper is the one step that can refuse an app
  // outright (CommonJS / non-wrappable default export). Validating it in
  // dry-run mode BEFORE anything is written keeps a refusal from leaving a
  // half-installed repo with no manifest to repair from.
  await patchNextConfig(project.nextConfigPath, true);

  const results: WriteResult[] = [];
  const plan = planFiles({
    srcDir: project.isSrcDir,
    i18nRouting: options.i18nRouting ?? false,
    features,
  });

  // 1. Dependencies (consumer package.json; existing entries win).
  const deps = await injectConsumerDependencies(cwd, version, dryRun);

  // 2. The scaffold itself.
  for (const file of plan) {
    results.push(await writeGenerated(cwd, file.path, file.body, dryRun));
  }

  // 3. next.config wrapped in withNukesPos (magicast, format-preserving).
  const nextConfigPatched = await patchNextConfig(project.nextConfigPath, dryRun);

  // 4. Env template.
  const envExampleTouched = await ensureEnvExample(cwd, dryRun);

  // 5. Manifest LAST — the ledger records what actually landed.
  const previous = await readManifest(cwd);
  const manifest = {
    ...(previous ?? createManifest(version)),
    version,
    // `--features` stays AUTHORITATIVE (unioning made the set grow monotonically
    // and re-added features the user had removed).
    features,
    // Plan-owned paths are REPLACED so switching i18n modes actually switches
    // (a union pinned the old mode's `[locale]` paths in the ledger forever,
    // and upgrade re-derives the mode from them). Only what `add` owns is
    // carried over — dropping that would blind `doctor` to a file on disk.
    files: [
      ...new Set([
        ...plan.map((file) => file.path),
        ...(previous?.files ?? []).filter(isExtensionFile),
      ]),
    ],
  };
  if (!dryRun) await writeManifest(cwd, manifest);
  results.push({
    path: MANIFEST_NAME,
    outcome: previous === null ? "created" : "updated",
  });

  const byOutcome = (outcome: WriteResult["outcome"]): string[] =>
    results.filter((r) => r.outcome === outcome).map((r) => r.path);

  return {
    project,
    created: byOutcome("created"),
    updated: byOutcome("updated"),
    skipped: byOutcome("skipped"),
    conflicted: byOutcome("conflicted"),
    dependenciesAdded: deps.added,
    nextConfigPatched,
    envExampleTouched,
  };
}
