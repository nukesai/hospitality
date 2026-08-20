import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { detectProject } from "../utils/detect.js";
import { errorMessage } from "../utils/messages.js";
import { readManifest } from "../utils/manifest.js";
import { inspect } from "../utils/stamp.js";
import { ROUTER_MARKERS } from "../templates/plan.js";

export interface DoctorOptions {
  readonly cwd: string;
}

export interface DoctorReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const REQUIRED_ENV = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

const readEnvFiles = async (cwd: string): Promise<string> => {
  let combined = "";
  for (const name of [".env", ".env.local"]) {
    const file = path.resolve(cwd, name);
    if (existsSync(file)) combined += `${await readFile(file, "utf8")}\n`;
  }
  return combined;
};

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
    const config = await readFile(project.nextConfigPath, "utf8");
    if (!config.includes("withNukesPos")) {
      errors.push(
        "next.config is not wrapped in withNukesPos() — the next-intl request config and serverExternalPackages are not wired.",
      );
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }

  const manifest = await readManifest(options.cwd);
  if (manifest === null) {
    errors.push("No nukes-pos.json manifest. Run `nukes-pos init` first.");
  } else {
    // Installed package version must match the scaffold that generated the files.
    const backendManifest = path.resolve(
      options.cwd,
      "node_modules/@nukesai-pos/backend/package.json",
    );
    if (existsSync(backendManifest)) {
      const pkg = JSON.parse(await readFile(backendManifest, "utf8")) as { version?: string };
      if (pkg.version !== undefined && pkg.version !== manifest.version) {
        warnings.push(
          `Installed @nukesai-pos/backend ${pkg.version} != scaffold version ${manifest.version} — run \`nukes-pos upgrade\`.`,
        );
      }
    } else {
      warnings.push("@nukesai-pos/backend is not installed yet — run your package manager.");
    }

    for (const file of manifest.files) {
      const absolute = path.resolve(options.cwd, file);
      if (!existsSync(absolute)) {
        errors.push(`Scaffolded file missing: ${file} (re-run \`nukes-pos init\`).`);
        continue;
      }
      const source = await readFile(absolute, "utf8");
      const state = inspect(source);
      if (state.kind === "modified") {
        warnings.push(`${file} was hand-edited — \`nukes-pos upgrade\` will write ${file}.new.`);
      }
      if (file.endsWith("server/routers/_app.ts") && !source.includes(ROUTER_MARKERS.routersOpen)) {
        errors.push(
          "server/routers/_app.ts lost its <nukes-pos:routers> markers — `nukes-pos add` cannot manage features.",
        );
      }
    }
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

  const env = await readEnvFiles(options.cwd);
  for (const name of REQUIRED_ENV) {
    if (!env.includes(`${name}=`)) {
      warnings.push(`${name} is not set in .env/.env.local — the backend will refuse to boot.`);
    }
  }
  const secret = /^BETTER_AUTH_SECRET=(.*)$/m.exec(env)?.[1];
  if (secret !== undefined && secret.trim().length > 0 && secret.trim().length < 32) {
    errors.push("BETTER_AUTH_SECRET is shorter than 32 characters.");
  }

  return { errors, warnings };
}
