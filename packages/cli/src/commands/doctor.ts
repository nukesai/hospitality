import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { detectProject } from "../utils/detect.js";
import { errorMessage } from "../utils/messages.js";
import { readManifest } from "../utils/manifest.js";
import { inspect } from "../utils/stamp.js";
import { ROUTER_MARKER_ORDER } from "../templates/plan.js";

export interface DoctorOptions {
  readonly cwd: string;
}

export interface DoctorReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const REQUIRED_ENV = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

/**
 * Effective env as Next.js resolves it: `.env.local` OVERRIDES `.env`, and
 * commented-out lines set nothing. Concatenating the files and grepping the
 * first match validated the shadowed value in both directions — a committed
 * placeholder in `.env` failing a real secret in `.env.local`, and vice versa.
 */
const readEnvFiles = async (cwd: string): Promise<Map<string, string>> => {
  const values = new Map<string, string>();
  for (const name of [".env", ".env.local"]) {
    const file = path.resolve(cwd, name);
    if (!existsSync(file)) continue;
    for (const raw of (await readFile(file, "utf8")).split("\n")) {
      const line = raw.trim();
      if (line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return values;
};

/** The segments a proxy.ts matcher literal excludes from locale handling. */
const matcherExclusions = (source: string): readonly string[] => {
  const captured = /matcher:\s*["'`]\/\(\(\?!([^)]*)\)/.exec(source)?.[1];
  return captured === undefined ? [] : captured.split("|");
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

  let proxyExclusions: readonly string[] | null = null;
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
      if (file.endsWith("proxy.ts")) proxyExclusions = matcherExclusions(source);
      if (file.endsWith("server/routers/_app.ts")) {
        // `add` splices between ALL FOUR markers, each exactly once and in
        // order — checking only the opening routers marker let a corrupted
        // file pass and fail mid-write later.
        const faults = ROUTER_MARKER_ORDER.filter((marker) => source.split(marker).length !== 2);
        if (faults.length > 0) {
          errors.push(
            `${file} lost its marker blocks (${faults.join(", ")}) — \`nukes-pos add\` cannot manage features.`,
          );
        }
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
    const value = env.get(name);
    if (value === undefined || value === "") {
      warnings.push(`${name} is not set in .env/.env.local — the backend will refuse to boot.`);
    }
  }
  const secret = env.get("BETTER_AUTH_SECRET");
  if (secret !== undefined && secret.length > 0 && secret.length < 32) {
    errors.push("BETTER_AUTH_SECRET is shorter than 32 characters.");
  }

  // The proxy matcher is a LITERAL in the consumer's proxy.ts (Next analyses it
  // statically), and the shipped one only excludes /api — a POS API mounted
  // elsewhere would be locale-redirected by the i18n proxy.
  const apiSegment = (env.get("POS_API_BASE_PATH") ?? "").split("/")[1] ?? "";
  if (apiSegment !== "" && proxyExclusions !== null && !proxyExclusions.includes(apiSegment)) {
    warnings.push(
      `POS_API_BASE_PATH is mounted under /${apiSegment}, which the proxy matcher does not exclude — add "${apiSegment}" to the matcher literal and pass { apiBasePath } to createPosProxy().`,
    );
  }

  return { errors, warnings };
}
