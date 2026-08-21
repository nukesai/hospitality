import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseJsonc } from "comment-json";
import { glob } from "tinyglobby";

export interface ProjectInfo {
  /** Absolute path to the app router directory. */
  readonly appDir: string;
  /** True when routes live under src/app rather than app. */
  readonly isSrcDir: boolean;
  readonly isTypeScript: boolean;
  /** Absolute path to next.config.{js,mjs,ts} (detect throws when absent). */
  readonly nextConfigPath: string;
  readonly nextVersion: string | null;
  /** Import alias prefix from tsconfig paths, e.g. "@" for "@/*". */
  readonly aliasPrefix: string | null;
}

const IGNORE = ["**/node_modules/**", "**/.next/**", "**/public/**", "**/dist/**", "**/build/**"];

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const [nextConfig] = await glob(["next.config.*"], {
    cwd,
    ignore: IGNORE,
    deep: 1,
    absolute: true,
  });
  if (nextConfig === undefined) {
    throw new Error("No next.config.* found. Run this inside a Next.js application.");
  }

  const isSrcDir = existsSync(path.resolve(cwd, "src", "app"));
  const appDir = isSrcDir ? path.resolve(cwd, "src", "app") : path.resolve(cwd, "app");
  if (!existsSync(appDir)) {
    throw new Error("No app/ or src/app/ directory found. Nukes POS requires the App Router.");
  }

  const tsconfigPath = path.resolve(cwd, "tsconfig.json");
  const isTypeScript = existsSync(tsconfigPath);

  let aliasPrefix: string | null = null;
  if (isTypeScript) {
    const raw = await readFile(tsconfigPath, "utf8");
    const tsconfig = parseJsonc(raw) as {
      compilerOptions?: { paths?: Record<string, readonly string[]> };
    };
    const paths = tsconfig.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(paths)) {
      const target = targets[0];
      if (target === "./*" || target === "./src/*" || target === "./app/*") {
        aliasPrefix = alias.replace(/\/\*$/, "");
        break;
      }
    }
  }

  const pkgRaw = await readFile(path.resolve(cwd, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string> };
  const nextVersion = pkg.dependencies?.next ?? null;

  return { appDir, isSrcDir, isTypeScript, nextConfigPath: nextConfig, nextVersion, aliasPrefix };
}
