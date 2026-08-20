import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { detectProject, type ProjectInfo } from "../utils/detect.js";
import { assertCleanWorktree } from "../utils/git.js";
import { createManifest, MANIFEST_NAME, readManifest, writeManifest } from "../utils/manifest.js";

export interface InitOptions {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly version: string;
}

export interface InitReport {
  readonly project: ProjectInfo;
  readonly created: readonly string[];
  readonly skipped: readonly string[];
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
 * Scaffold Nukes POS into an existing Next.js App Router application:
 * a persisted-answers manifest, registry auth for the restricted scope, and an
 * isolated `(nukes-pos)` route group that later `add` calls populate.
 * Idempotent: re-running skips everything that already exists.
 */
export async function runInit(options: InitOptions): Promise<InitReport> {
  const { cwd, dryRun, force, version } = options;

  const project = await detectProject(cwd);
  assertCleanWorktree(cwd, force || dryRun);

  const created: string[] = [];
  const skipped: string[] = [];

  // 1. Manifest — persisted answers, the upgrade anchor.
  if ((await readManifest(cwd)) === null) {
    if (!dryRun) await writeManifest(cwd, createManifest(version));
    created.push(MANIFEST_NAME);
  } else {
    skipped.push(MANIFEST_NAME);
  }

  // 2. Registry auth for the restricted scope (idempotent append).
  const npmrcPath = path.resolve(cwd, ".npmrc");
  if (existsSync(npmrcPath)) {
    const existing = await readFile(npmrcPath, "utf8");
    if (existing.includes(NPMRC_SCOPE_LINE)) {
      skipped.push(".npmrc");
    } else {
      if (!dryRun) await writeFile(npmrcPath, `${existing.trimEnd()}\n\n${NPMRC_TEMPLATE}`);
      created.push(".npmrc");
    }
  } else {
    if (!dryRun) await writeFile(npmrcPath, NPMRC_TEMPLATE);
    created.push(".npmrc");
  }

  // 3. Route-group isolation (Payload pattern): everything Nukes POS scaffolds
  //    lives under (nukes-pos) so it never collides with the host app's routes.
  const routeGroup = path.join(project.appDir, "(nukes-pos)");
  if (existsSync(routeGroup)) {
    skipped.push(routeGroupRelative(cwd, routeGroup));
  } else {
    if (!dryRun) {
      await mkdir(routeGroup, { recursive: true });
      await writeFile(path.join(routeGroup, ".gitkeep"), "");
    }
    created.push(routeGroupRelative(cwd, routeGroup));
  }

  return { project, created, skipped };
}

const routeGroupRelative = (cwd: string, absolute: string): string => path.relative(cwd, absolute);
