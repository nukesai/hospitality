import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { ENV_EXAMPLE_BLOCK } from "../templates/plan.js";

const MARKER = "# --- Nukes POS";

/** Appends the POS env block to .env.example (creates the file if absent). */
export async function ensureEnvExample(cwd: string, dryRun: boolean): Promise<boolean> {
  const file = path.resolve(cwd, ".env.example");
  if (!existsSync(file)) {
    if (!dryRun) await writeFile(file, ENV_EXAMPLE_BLOCK);
    return true;
  }
  const existing = await readFile(file, "utf8");
  if (existing.includes(MARKER)) return false;
  if (!dryRun) await writeFile(file, `${existing.trimEnd()}\n\n${ENV_EXAMPLE_BLOCK}`);
  return true;
}
