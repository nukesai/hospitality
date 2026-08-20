import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { detectProject } from "../utils/detect.js";
import { errorMessage } from "../utils/messages.js";
import { readManifest } from "../utils/manifest.js";

export interface DoctorOptions {
  readonly cwd: string;
}

export interface DoctorReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Read-only diagnosis of a Nukes POS installation. Never writes anything. */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const project = await detectProject(options.cwd);
    if (!project.isTypeScript) {
      warnings.push("No tsconfig.json found — Nukes POS templates are TypeScript-first.");
    }
    if (project.nextVersion === null) {
      warnings.push('"next" is not in dependencies of package.json.');
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }

  if ((await readManifest(options.cwd)) === null) {
    errors.push("No nukes-pos.json manifest. Run `nukes-pos init` first.");
  }

  const npmrcPath = path.resolve(options.cwd, ".npmrc");
  if (!existsSync(npmrcPath)) {
    errors.push(".npmrc is missing — @nukesai-pos packages will fail to install.");
  } else {
    const npmrc = await readFile(npmrcPath, "utf8");
    if (!npmrc.includes("@nukesai-pos:registry=")) {
      errors.push(".npmrc has no @nukesai-pos registry entry.");
    }
  }

  return { errors, warnings };
}
