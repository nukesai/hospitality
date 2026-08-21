import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { detectProject, type ProjectInfo } from "../utils/detect.js";
import { assertCleanWorktree } from "../utils/git.js";
import { injectConsumerDependencies } from "../utils/deps.js";
import { ensureEnvExample } from "../utils/env-file.js";
import { writeGenerated, type WriteResult } from "../utils/generated.js";
import { createManifest, MANIFEST_NAME, readManifest, writeManifest } from "../utils/manifest.js";
import { patchNextConfig } from "../utils/patch.js";
import { planFiles, POS_FEATURES } from "../templates/plan.js";

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

const NPMRC_SCOPE_LINE = "@nukesai-pos:registry=https://registry.npmjs.org/";
const NPMRC_TEMPLATE = `# Authentication for @nukesai-pos restricted packages.
# Set NPM_TOKEN in your shell / CI secrets to a granular access token with
# READ-ONLY access to the @nukesai-pos scope. The literal \${NPM_TOKEN} below is
# expanded by npm/pnpm at read time and must NOT be replaced with the token.
${NPMRC_SCOPE_LINE}
//registry.npmjs.org/:_authToken=\${NPM_TOKEN}
`;

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

  // 1. Registry auth for the restricted scope (idempotent append).
  const npmrcPath = path.resolve(cwd, ".npmrc");
  if (existsSync(npmrcPath)) {
    const existing = await readFile(npmrcPath, "utf8");
    if (existing.includes(NPMRC_SCOPE_LINE)) {
      results.push({ path: ".npmrc", outcome: "skipped" });
    } else {
      if (!dryRun) await writeFile(npmrcPath, `${existing.trimEnd()}\n\n${NPMRC_TEMPLATE}`);
      results.push({ path: ".npmrc", outcome: "updated" });
    }
  } else {
    if (!dryRun) await writeFile(npmrcPath, NPMRC_TEMPLATE);
    results.push({ path: ".npmrc", outcome: "created" });
  }

  // 2. Dependencies (consumer package.json; existing entries win).
  const deps = await injectConsumerDependencies(cwd, version, dryRun);

  // 3. The scaffold itself.
  for (const file of plan) {
    results.push(await writeGenerated(cwd, file.path, file.body, dryRun));
  }

  // 4. next.config wrapped in withNukesPos (magicast, format-preserving).
  const nextConfigPatched = await patchNextConfig(project.nextConfigPath, dryRun);

  // 5. Env template.
  const envExampleTouched = await ensureEnvExample(cwd, dryRun);

  // 6. Manifest LAST — the ledger records what actually landed.
  const previous = await readManifest(cwd);
  const manifest = {
    ...(previous ?? createManifest(version)),
    version,
    // UNION, never replace: `add` records the extension file and its features
    // in the same ledger, and init is a documented repair/idempotent flow —
    // resetting the ledger would blind `doctor` to files that are still on
    // disk (the same invariant runUpgrade keeps).
    features: [...new Set([...features, ...(previous?.features ?? [])])],
    files: [...new Set([...plan.map((file) => file.path), ...(previous?.files ?? [])])],
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
